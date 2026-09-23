import type { Grid } from './grid';
import { S_BASE } from './grid';
import type { OperatingPoint } from './operate';
import { feederTransferables, type FeederSnap } from './feederSnapshot';

/**
 * A compact, transferable picture of one solved interval: everything the views and
 * readouts display, as typed arrays in engineering units (MW, MVAr, pu, radians).
 * Every array is a solver output; the display layer tags each shown value with the
 * key it came from (e.g. "solver:t76.branch.12.pf").
 */
/** An island other than the main one, as the display needs it. */
export interface IslandSummary {
  status: string;
  buses: number[];
  loadMW: number;
  reason: string;
}

export interface Snapshot {
  t: number;
  startHour: number;
  /** Request this solve answered (0: the day's own sequence). */
  seq: number;
  /** Branches out of service in this scenario, sorted ("" key when none). */
  outages: number[];
  /** Plants tripped in this scenario (ids, sorted). */
  plantOutages: string[];
  /** Excitation changed from schedule: [generator index, voltage set-point pu]. */
  vset: Array<[number, number]>;
  /** Solver status: the worst island's. */
  status: string;
  /**
   * What the display reports. 'solved': every energised island converged.
   * 'partial': the main island (the one carrying most demand) converged, but some
   * buses are dark — cut off from every source, or in an island with no operating
   * point. 'none': the main island has no steady-state operating point.
   */
  outcome: 'solved' | 'partial' | 'none';
  /** Islands other than the main one that are dark or failed. */
  darkIslands: IslandSummary[];
  /** Demand in dark islands, MW (unserved). */
  unservedMW: number;
  reason: string;
  iterations: number;
  maxMismatchPu: number;
  vm: Float64Array;
  va: Float64Array;
  energized: Uint8Array;
  /** Branch flows at each end, MW / MVAr (positive into the branch), loading (fraction of normal rating). */
  pf: Float64Array;
  qf: Float64Array;
  pt: Float64Array;
  qt: Float64Array;
  loading: Float64Array;
  inService: Uint8Array;
  pg: Float64Array;
  qg: Float64Array;
  genOnline: Uint8Array;
  /** Bus demand as solved (load, HVDC transfers), MW / MVAr, and shunt MVAr supplied. */
  pd: Float64Array;
  qd: Float64Array;
  shuntMVAr: Float64Array;
  lossesMW: number;
  lossesMVAr: number;
  genMW: number;
  loadMW: number;
  residualMW: number;
  grossMW: number;
  btmMW: number;
  netLoadMW: number;
  solarMW: number;
  windMW: number;
  curtailedMW: number;
  reserveMW: number;
  shortfallMW: number;
  marginalPlant: string;
  energyPrice: number;
  lmp: Float64Array;
  congestion: Array<{ branch: number; shadow: number; flowMW: number; limitMW: number }>;
  participation: string;
  /** The Evergreen substation and feeder, when the solve was coupled to them. */
  feeder?: FeederSnap;
}

export function snapshot(grid: Grid, op: OperatingPoint, seq = 0, outages: number[] = [], scenario: { plantOutages?: string[]; vset?: Array<[number, number]> } = {}): Snapshot {
  const nb = grid.branches.length;
  const pf = new Float64Array(nb);
  const qf = new Float64Array(nb);
  const pt = new Float64Array(nb);
  const qt = new Float64Array(nb);
  const loading = new Float64Array(nb);
  const inService = new Uint8Array(nb);
  op.flows.forEach((f, k) => {
    pf[k] = f.Sf.re * S_BASE;
    qf[k] = f.Sf.im * S_BASE;
    pt[k] = f.St.re * S_BASE;
    qt[k] = f.St.im * S_BASE;
    loading[k] = f.loading;
    inService[k] = f.inService ? 1 : 0;
  });
  const ng = grid.gens.length;
  const pg = new Float64Array(ng);
  const qg = new Float64Array(ng);
  const genOnline = new Uint8Array(ng);
  grid.gens.forEach((_, i) => {
    pg[i] = op.result.pg[i]! * S_BASE;
    qg[i] = op.result.qg[i]! * S_BASE;
    genOnline[i] = op.pf.gens[i]!.inService ? 1 : 0;
  });
  const n = grid.buses.length;
  const pd = new Float64Array(n);
  const qd = new Float64Array(n);
  const sh = new Float64Array(n);
  op.pf.buses.forEach((b, i) => {
    pd[i] = b.pd * S_BASE;
    qd[i] = b.qd * S_BASE;
    sh[i] = b.bs * S_BASE * op.result.vm[i]! ** 2;
  });
  const s = op.step;
  const bal = op.balance;
  // islands: the main one carries the most demand
  const islands = op.result.islands.map((isl) => ({
    status: isl.status as string,
    buses: isl.buses,
    loadMW: isl.buses.reduce((a, b) => a + Math.max(0, pd[b]!), 0),
    reason: isl.reason ?? '',
  }));
  const main = islands.reduce((m, x) => (x.loadMW > m.loadMW || (x.loadMW === m.loadMW && x.buses.length > m.buses.length) ? x : m), islands[0]!);
  const darkIslands = islands.filter((x) => x !== main && x.buses.some((b) => !op.result.energized[b]));
  const unservedMW = darkIslands.reduce((a, x) => a + x.loadMW, 0);
  const outcome: Snapshot['outcome'] = main.status !== 'converged' ? 'none' : darkIslands.some((x) => x.loadMW > 1e-6) ? 'partial' : 'solved';
  const iters = op.result.islands.reduce((a, i) => a + i.newtonIterations, 0);
  return {
    t: s.iv.index,
    startHour: s.iv.startHour,
    seq,
    outages,
    plantOutages: scenario.plantOutages ?? [],
    vset: scenario.vset ?? [],
    status: op.status,
    outcome,
    darkIslands,
    unservedMW,
    reason: outcome === 'none' ? main.reason : (darkIslands.find((x) => x.reason)?.reason ?? ''),
    iterations: iters,
    maxMismatchPu: op.result.maxMismatch,
    vm: op.result.vm.slice(),
    va: op.result.va.slice(),
    energized: op.result.energized.slice(),
    pf,
    qf,
    pt,
    qt,
    loading,
    inService,
    pg,
    qg,
    genOnline,
    pd,
    qd,
    shuntMVAr: sh,
    lossesMW: op.lossesMW,
    lossesMVAr: bal ? bal.losses.im * S_BASE : NaN,
    genMW: bal ? bal.gen.re * S_BASE : NaN,
    loadMW: bal ? bal.load.re * S_BASE : NaN,
    residualMW: bal ? bal.residual.re * S_BASE : NaN,
    grossMW: s.grossLoadMW,
    btmMW: s.btmMW,
    netLoadMW: s.netLoadMW,
    solarMW: s.solarMW,
    windMW: s.windMW,
    curtailedMW: s.curtailedMW,
    reserveMW: s.reserveMW,
    shortfallMW: s.shortfallMW,
    marginalPlant: s.marginal?.plantId ?? '',
    energyPrice: s.energyPrice,
    lmp: s.lmp.slice(),
    congestion: s.congestion,
    participation: op.participation,
  };
}

/** Transferable buffers for postMessage. */
export function transferables(s: Snapshot): ArrayBuffer[] {
  const own = [s.vm, s.va, s.energized, s.pf, s.qf, s.pt, s.qt, s.loading, s.inService, s.pg, s.qg, s.genOnline, s.pd, s.qd, s.shuntMVAr, s.lmp].map(
    (a) => a.buffer as ArrayBuffer,
  );
  return s.feeder ? [...own, ...feederTransferables(s.feeder)] : own;
}
