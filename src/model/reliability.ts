import type { Snapshot } from './snapshot';
import type { Feeder } from './feeder';
import { faultOnFeeder, type FeederSource } from './feederFault';
import { simulateProtection } from './protection';
import type { FeederFaultKind } from '../physics/dist/fault';

/**
 * Distribution reliability indices, IEEE 1366's definitions:
 *   SAIFI = Σ N_i / N_T                 sustained interruptions per customer served
 *   SAIDI = Σ r_i N_i / N_T              minutes without supply per customer served
 *   CAIDI = SAIDI / SAIFI                minutes per interruption, for those interrupted
 *   MAIFI_E = Σ IM_E N_mi / N_T          momentary events per customer (a reclosing
 *                                        sequence counts once, however many operations)
 *   ASAI = 1 − SAIDI / minutes in the year
 * A major event day is one whose SAIDI exceeds T_MED = exp(α + 2.5β), with α and β the
 * mean and standard deviation of the natural logarithms of the daily SAIDI values
 * (days with none left out) — the "2.5 beta" method.
 */
export interface Interruption {
  /** Customers who lost supply, and for how long, minutes (sustained: more than five minutes). */
  customers: number;
  minutes: number;
}

export interface Momentary {
  /** Customers who saw a momentary event (a reclosing sequence). */
  customers: number;
}

export interface Indices {
  saifi: number;
  saidi: number;
  caidi: number;
  maifiE: number;
  asai: number;
}

export function indices(total: number, sustained: Interruption[], momentary: Momentary[], years = 1): Indices {
  const ci = sustained.reduce((a, x) => a + x.customers, 0);
  const cmi = sustained.reduce((a, x) => a + x.customers * x.minutes, 0);
  const cm = momentary.reduce((a, x) => a + x.customers, 0);
  const saifi = ci / total / years;
  const saidi = cmi / total / years;
  return { saifi, saidi, caidi: saifi > 0 ? saidi / saifi : 0, maifiE: cm / total / years, asai: 1 - saidi / (365 * 24 * 60) };
}

/** The major-event-day threshold from daily SAIDI values, minutes (2.5β method). */
export function tMed(dailySaidi: number[]): number {
  const logs = dailySaidi.filter((x) => x > 0).map(Math.log);
  const a = logs.reduce((s, x) => s + x, 0) / logs.length;
  const b = Math.sqrt(logs.reduce((s, x) => s + (x - a) ** 2, 0) / (logs.length - 1));
  return Math.exp(a + 2.5 * b);
}

/** Failure and repair data for an overhead feeder (estimates, typical of the class). */
export const RELIABILITY = {
  /** Faults per kilometre of overhead primary per year. */
  faultsPerKmYear: 0.15,
  /** Share of faults that are temporary (they clear once the current is interrupted). */
  temporaryShare: 0.8,
  /** Of the faults, the share involving ground on one phase (the rest line-to-line or three-phase). */
  groundShare: 0.8,
  /** Minutes to repair a permanent fault; to replace a fuse blown by a temporary one. */
  repairMin: 180,
  refuseMin: 90,
  years: 20,
  seed: 1366,
  src: 'estimate' as const,
};

/** A small, seeded generator, so the simulated years are the same on every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ReliabilityRun extends Indices {
  years: number;
  faults: number;
  customers: number;
  /** The same years with every fault treated as fuse-blowing (no recloser fast trips): what fuse saving buys. */
  fuseBlowing: Indices;
}

/**
 * Simulated years on feeder 1105: faults placed at random along the primary by length,
 * each run through the protection sequence with this interval's fault currents; the
 * customers beyond whatever ends open lose supply until repair, and those beyond a
 * recloser that operated see a momentary event.
 */
export function simulateYears(fd: Feeder, s: Snapshot, src: FeederSource): ReliabilityRun {
  const R = RELIABILITY;
  const rand = rng(R.seed);
  const net = fd.base;
  const lines = net.branches.filter((b) => b.kind === 'line' && net.nodes.get(b.to)?.kind === 'primary' && !b.to.startsWith('EV-') && !b.to.endsWith('-480'));
  const lengthKm = lines.map((b) => (b.kind === 'line' ? b.lengthFt * 0.0003048 : 0));
  const totalKm = lengthKm.reduce((a, x) => a + x, 0);
  const parent = new Map(net.branches.map((b) => [b.to, b.from]));
  const homesBeyond = (dev: string): number => {
    const b = net.branches.find((x) => x.id === dev);
    if (!b) return 0;
    const below = (node: string): boolean => {
      for (let x: string | undefined = node; x !== undefined; x = parent.get(x)) if (x === b.to) return true;
      return false;
    };
    return fd.layout.homes.filter((h) => below(h.meter)).length;
  };
  const customers = fd.layout.homes.length;
  const beyond = new Map<string, number>();
  const count = (d: string) => {
    if (!beyond.has(d)) beyond.set(d, homesBeyond(d));
    return beyond.get(d)!;
  };
  const sustained: Interruption[] = [];
  const momentary: Momentary[] = [];
  const sustainedFB: Interruption[] = [];
  let faults = 0;
  const years = R.years;
  // Poisson arrivals: exponential gaps in years
  for (let t = -Math.log(1 - rand()) / (R.faultsPerKmYear * totalKm); t < years; t += -Math.log(1 - rand()) / (R.faultsPerKmYear * totalKm)) {
    faults++;
    // where: a span chosen by length; its far pole faulted
    let u = rand() * totalKm;
    let k = 0;
    while (k < lines.length - 1 && u > lengthKm[k]!) u -= lengthKm[k++]!;
    const node = lines[k]!.to;
    const nPh = net.nodes.get(node)!.phases.length;
    const kind: FeederFaultKind = rand() < R.groundShare || nPh < 2 ? 'slg' : nPh === 3 && rand() < 0.5 ? '3ph' : 'll';
    const permanent = rand() >= R.temporaryShare;
    const f = faultOnFeeder(fd, s, src, node, kind);
    if (!f) continue;
    const mags = f.I.map((x) => x.abs());
    const lat = fd.layout.laterals.find((l) => l.nodes.includes(node));
    const prot = simulateProtection({ devices: f.devices, Iph: Math.max(...mags), Ires: f.residual.abs(), Ifuse: lat ? mags[lat.phase]! : 0, permanent });
    const out = prot.open.reduce((a, d) => Math.max(a, count(d)), 0);
    if (out > 0) sustained.push({ customers: out, minutes: permanent ? R.repairMin : R.refuseMin });
    const mom = prot.momentary.reduce((a, d) => Math.max(a, count(d)), 0) - out;
    if (mom > 0) momentary.push({ customers: mom });
    // without fuse saving: a lateral fault always blows its fuse
    const fuse = f.devices.find((d) => d.startsWith('FU-'));
    if (fuse) sustainedFB.push({ customers: count(fuse), minutes: permanent ? R.repairMin : R.refuseMin });
    else if (out > 0) sustainedFB.push({ customers: out, minutes: permanent ? R.repairMin : R.refuseMin });
  }
  const main = indices(customers, sustained, momentary, years);
  return { ...main, years, faults, customers, fuseBlowing: indices(customers, sustainedFB, [], years) };
}
