import type { Grid } from './grid';
import type { Snapshot } from './snapshot';
import { COMPONENTS } from '../data/components';

/**
 * A circuit breaker as a component: the circuit it switches, at one end, and what it
 * carries in a solved interval. The breaker level, its inspector, its chart and its
 * math panel all read it from here.
 */
export interface BreakerState {
  t: number;
  /** The circuit is in service (its breakers closed). */
  closed: boolean;
  /** The bus on this side has a source. */
  energized: boolean;
  /** Power into the circuit at this end (leaving the bus through the breaker), 3φ. */
  p: number;
  q: number;
  /** Bus voltage: per unit, kV line-to-line, angle in degrees. */
  vpu: number;
  vkV: number;
  vDeg: number;
  /** Current through each pole, A RMS, and phase a's angle, degrees. */
  amps: number;
  iDeg: number;
  prov: { p: string; q: string; v: string; va: string };
}

export function breakerState(grid: Grid, s: Snapshot, k: number, siteId: string): BreakerState | null {
  if (s.outcome === 'none') return null;
  const br = grid.branches[k]!;
  const atFrom = br.from.site.id === siteId;
  const bus = atFrom ? br.from : br.to;
  const t = s.t;
  const closed = !!s.inService[k];
  const energized = s.energized[bus.index] === 1;
  const on = closed && energized;
  const p = on ? (atFrom ? s.pf[k]! : s.pt[k]!) : 0;
  const q = on ? (atFrom ? s.qf[k]! : s.qt[k]!) : 0;
  const vpu = energized ? s.vm[bus.index]! : 0;
  const vkV = vpu * bus.kv;
  const vDeg = (s.va[bus.index]! * 180) / Math.PI;
  const amps = on && vkV > 0 ? (Math.hypot(p, q) / (Math.sqrt(3) * vkV)) * 1000 : 0;
  // S = 3 V_a I_a*, so I_a lags V_a by the angle of S
  const iDeg = vDeg - (Math.atan2(q, p) * 180) / Math.PI;
  const end = atFrom ? 'f' : 't';
  return {
    t,
    closed,
    energized,
    p,
    q,
    vpu,
    vkV,
    vDeg,
    amps,
    iDeg,
    prov: { p: `solver:t${t}.branch.${br.id}.p${end}`, q: `solver:t${t}.branch.${br.id}.q${end}`, v: `solver:t${t}.bus.${bus.id}.vm`, va: `solver:t${t}.bus.${bus.id}.va` },
  };
}

/**
 * The opening, as the chart and the drawing show it: the trip command at t = 0 (drawn
 * as the reference voltage crosses zero rising), the contacts parting, and each phase
 * clearing at its first current zero once the arc is long enough to put out. Times in
 * ms; the three phases' currents are √2·I·sin(ωt + θ), a third of a cycle apart.
 */
export interface Interruption {
  partMs: number;
  fullMs: number;
  /** When each phase (a, b, c) clears. */
  clearMs: [number, number, number];
  /** Each phase's current angle at t = 0, degrees. */
  thetaDeg: [number, number, number];
  peakA: number;
}

export function interruption(st: BreakerState): Interruption {
  const B = COMPONENTS.breaker;
  const w = (2 * Math.PI * COMPONENTS.fHz) / 1000; // rad per ms
  const th = [0, 1, 2].map((p) => st.iDeg - 120 * p) as [number, number, number];
  const after = B.partMs + B.minArcMs;
  const clearMs = th.map((d) => {
    // sin(ωt + θ) = 0 at ωt = kπ − θ; the first such t after `after`
    const th0 = (d * Math.PI) / 180;
    const k = Math.ceil((w * after + th0) / Math.PI);
    return (k * Math.PI - th0) / w;
  }) as [number, number, number];
  return { partMs: B.partMs, fullMs: B.fullMs, clearMs, thetaDeg: th, peakA: Math.SQRT2 * st.amps };
}
