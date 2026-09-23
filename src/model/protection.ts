import { C37_112, PROTECTION, type CurveId, type TocSetting } from '../data/dist/protection';

/**
 * Time-current characteristics and the sequence of operations after a fault.
 *
 * The sequence is simulated in small time steps, not scripted: each device integrates
 * its own characteristic while current flows through it (a relay's travel toward
 * operation is Σ Δt / t(M), IEEE C37.112's integrating form; a fuse's melting is
 * Σ Δt / t_mm(I)); current flows only while every device between the source and the
 * fault is closed; a temporary fault goes out when the current through it is
 * interrupted; the recloser recloses on its schedule. Loads are neglected, so every
 * device on the path carries the same fault current.
 */
export function tocTime(s: TocSetting, I: number): number {
  const c = C37_112[s.curve];
  const M = I / s.pickup;
  if (M <= 1) return Infinity;
  return s.tds * (c.A / (M ** c.p - 1) + c.B);
}

export function tocReset(curve: CurveId, tds: number, I: number, pickup: number): number {
  const M = I / pickup;
  if (M >= 1) return Infinity;
  return (tds * C37_112[curve].tr) / (1 - M * M);
}

const FU = PROTECTION.fuse;
export const FUSE_IM = FU.rating * FU.imOverRating;

/** Fuse minimum-melting time, s. */
export function fuseMelt(I: number): number {
  const x = I / FUSE_IM;
  if (x <= 1) return Infinity;
  return FU.K / (x * x - 1);
}

/** Fuse total-clearing time, s. */
export function fuseClear(I: number): number {
  const m = fuseMelt(I);
  return Number.isFinite(m) ? FU.clearFactor * m + FU.arcS : Infinity;
}

const RC = PROTECTION.recloser;
const CB = PROTECTION.breaker;

/** The recloser's delayed-curve time for phase and residual currents (the faster element), s. */
export function recloserSlow(Iph: number, Ires: number): number {
  const p = tocTime({ curve: RC.slow.curve, pickup: RC.phaseMin, tds: RC.slow.tds }, Iph);
  const n = tocTime({ curve: RC.slow.curve, pickup: RC.groundMin, tds: RC.slow.tds }, Ires);
  return Math.min(p, n) + RC.interruptS;
}

/** The breaker relay's time to operate (50/51, 50N/51N, the fastest element) plus the breaker's opening, s. */
export function breakerTime(Iph: number, Ires: number): { t: number; element: string } {
  const opts: Array<{ t: number; element: string }> = [
    { t: tocTime(CB.p51, Iph), element: '51' },
    { t: tocTime(CB.n51, Ires), element: '51N' },
    { t: Iph > CB.p50 ? CB.instS : Infinity, element: '50' },
    { t: Ires > CB.n50 ? CB.instS : Infinity, element: '50N' },
  ];
  const best = opts.reduce((a, b) => (b.t < a.t ? b : a));
  return { t: best.t + CB.openS, element: best.element };
}

export type ProtWhat = 'fault' | 'trip' | 'open' | 'reclose' | 'melt' | 'clear' | 'lockout' | 'out';

export interface ProtEvent {
  t: number;
  device: string;
  what: ProtWhat;
  /** The element or curve that acted (C37.2 number, "fast", "delayed"). */
  how?: string;
}

export interface ProtResult {
  events: ProtEvent[];
  /** Devices open at the end, and devices that opened and closed again (a momentary outage beyond them). */
  open: string[];
  momentary: string[];
  /** When the fault current finally stopped, s. */
  clearedAt: number;
  /** Seconds of current per device (for the timeline). */
  conducting: Array<[number, number]>;
}

export interface ProtCase {
  /** Devices between the source and the fault, nearest the source first. */
  devices: string[];
  /** Largest phase current and residual 3I₀ at the fault, A. */
  Iph: number;
  Ires: number;
  /** Current in the fused lateral's phase, A. */
  Ifuse: number;
  permanent: boolean;
}

export function simulateProtection(c: ProtCase, dt = 0.0005, tEnd = 20): ProtResult {
  const events: ProtEvent[] = [{ t: 0, device: 'fault', what: 'fault' }];
  const hasR = c.devices.includes(RC.id);
  const fuse = c.devices.find((d) => d.startsWith('FU-')) ?? null;
  let faultOn = true;
  // breaker relay
  let acc51 = 0;
  let acc51N = 0;
  let inst = 0;
  let cbOpenAt = Infinity;
  let cbOpen = false;
  // recloser
  let shot = 0; // trips so far
  let rOpen = false;
  let rTimer = 0;
  let rAccP = 0;
  let rAccN = 0;
  let rOpenAt = Infinity;
  let rCloseAt = Infinity;
  let rLockout = false;
  // fuse
  let melt = 0;
  let fuseClearAt = Infinity;
  let fuseBlown = false;
  const opened = new Set<string>();
  const conducting: Array<[number, number]> = [];
  let segStart: number | null = null;
  let clearedAt = 0;
  const interrupted = (t: number) => {
    if (segStart !== null) conducting.push([segStart, t]);
    segStart = null;
    if (faultOn && !c.permanent) {
      faultOn = false;
      events.push({ t, device: 'fault', what: 'out' });
    }
    clearedAt = t;
  };
  for (let k = 0; k * dt <= tEnd; k++) {
    const t = k * dt;
    // scheduled openings and reclosings
    if (t >= cbOpenAt && !cbOpen) {
      cbOpen = true;
      opened.add(CB.id);
      events.push({ t, device: CB.id, what: 'open' });
      if (segStart !== null) interrupted(t);
    }
    if (hasR && t >= rOpenAt && !rOpen) {
      rOpen = true;
      rOpenAt = Infinity;
      opened.add(RC.id);
      events.push({ t, device: RC.id, what: 'open' });
      if (segStart !== null) interrupted(t);
      if (shot >= RC.sequence.length) {
        rLockout = true;
        events.push({ t, device: RC.id, what: 'lockout' });
      } else rCloseAt = t + RC.reclosesS[shot - 1]!;
    }
    if (hasR && t >= rCloseAt && rOpen && !rLockout) {
      rOpen = false;
      rCloseAt = Infinity;
      rTimer = 0;
      rAccP = 0;
      rAccN = 0;
      events.push({ t, device: RC.id, what: 'reclose' });
    }
    if (fuse && t >= fuseClearAt && !fuseBlown) {
      fuseBlown = true;
      opened.add(fuse);
      events.push({ t, device: fuse, what: 'clear' });
      if (segStart !== null) interrupted(t);
    }
    const flows = faultOn && !cbOpen && !(hasR && rOpen) && !fuseBlown;
    if (flows && segStart === null) segStart = t;
    if (flows) {
      // breaker relay (C37.112 integration), unless it has already operated
      if (cbOpenAt === Infinity) {
        const el = c.Iph > CB.p50 ? '50' : c.Ires > CB.n50 ? '50N' : null;
        if (el) inst += dt;
        if (el && inst >= CB.instS - 1e-12) {
          // an instantaneous element operates once the current has persisted its operating time
          cbOpenAt = t + CB.openS;
          events.push({ t, device: CB.id, what: 'trip', how: el });
        } else {
          acc51 += dt / tocTime(CB.p51, c.Iph);
          acc51N += dt / tocTime(CB.n51, c.Ires);
          if (acc51 >= 1 || acc51N >= 1) {
            cbOpenAt = t + CB.openS;
            events.push({ t, device: CB.id, what: 'trip', how: acc51 >= 1 ? '51' : '51N' });
          }
        }
      }
      // recloser
      if (hasR && rOpenAt === Infinity && (c.Iph > RC.phaseMin || c.Ires > RC.groundMin)) {
        const mode = RC.sequence[shot]!;
        if (mode === 'fast') {
          rTimer += dt;
          if (rTimer >= RC.fastS - 1e-12) {
            shot++;
            rOpenAt = t;
            events.push({ t, device: RC.id, what: 'trip', how: 'fast' });
          }
        } else {
          rAccP += dt / (tocTime({ curve: RC.slow.curve, pickup: RC.phaseMin, tds: RC.slow.tds }, c.Iph) || Infinity);
          rAccN += dt / (tocTime({ curve: RC.slow.curve, pickup: RC.groundMin, tds: RC.slow.tds }, c.Ires) || Infinity);
          if (rAccP >= 1 || rAccN >= 1) {
            shot++;
            rOpenAt = t + RC.interruptS;
            events.push({ t, device: RC.id, what: 'trip', how: 'delayed' });
          }
        }
      }
      // fuse
      if (fuse && fuseClearAt === Infinity) {
        melt += dt / fuseMelt(c.Ifuse);
        if (melt >= 1) {
          events.push({ t, device: fuse, what: 'melt' });
          fuseClearAt = t + (fuseClear(c.Ifuse) - fuseMelt(c.Ifuse));
        }
      }
    } else {
      // no current: the breaker relay resets — instantly, or along C37.112's reset characteristic
      inst = 0;
      if (CB.reset === 'instantaneous') {
        acc51 = 0;
        acc51N = 0;
      } else {
        if (acc51 > 0) acc51 = Math.max(0, acc51 - dt / tocReset(CB.p51.curve, CB.p51.tds, 0, CB.p51.pickup));
        if (acc51N > 0) acc51N = Math.max(0, acc51N - dt / tocReset(CB.n51.curve, CB.n51.tds, 0, CB.n51.pickup));
      }
      const pending = rCloseAt < Infinity || rOpenAt < Infinity || cbOpenAt < Infinity || fuseClearAt < Infinity;
      if (!faultOn && !pending) break;
      if (faultOn && (cbOpen || rLockout || fuseBlown) && !pending) break;
    }
  }
  if (segStart !== null) conducting.push([segStart, tEnd]);
  const open = [...opened].filter((d) => (d === RC.id ? rOpen : true));
  const momentary = [...opened].filter((d) => !open.includes(d));
  events.sort((a, b) => a.t - b.t);
  return { events, open, momentary, clearedAt, conducting };
}
