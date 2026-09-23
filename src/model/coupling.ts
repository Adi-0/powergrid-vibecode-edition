import { Complex } from '../physics/complex';
import { cloneCase, type PFCase } from '../physics/pf/case';
import type { Grid } from './grid';
import { S_BASE } from './grid';
import type { IntervalDispatch } from './dispatch';
import { operate, type OperateOptions, type OperatingPoint } from './operate';
import { solveFeeder, type Feeder, type FeederState } from './feeder';

/**
 * Transmission ↔ distribution coupling at the Evergreen 60 kV bus.
 *
 * The transmission model (positive sequence, balanced) sees the Evergreen 60 kV bus
 * as one load. Part of that load is the Evergreen substation, which the distribution
 * model solves phase by phase. They are made to agree by iteration:
 *   1. solve transmission with the substation's current demand estimate;
 *   2. take the 60 kV bus voltage (magnitude and angle) as the substation's source;
 *   3. solve the substation and feeder; its total three-phase demand plus losses is
 *      the new demand at the bus;
 *   4. repeat until the demand and the voltage stop changing.
 * Energy then closes across the boundary: what the transmission network delivers
 * into the substation equals what every meter uses plus every loss in between.
 */
export const COUPLING_BUS = 'EVERGREEN-60';

export interface CoupledPoint {
  op: OperatingPoint;
  feeder: FeederState;
  iterations: number;
  /** Change in substation demand on the last iteration, VA. */
  lastChangeVA: number;
  /** Substation demand the transmission bus carries (the value both sides agree on), W + j var. */
  boundaryS: Complex;
  history: Array<{ vPu: number; angleDeg: number; sMW: number; qMVAr: number }>;
}

export function coupledSolve(
  grid: Grid,
  step: IntervalDispatch,
  base: PFCase,
  feeder: Feeder,
  opts: OperateOptions,
): CoupledPoint {
  const busIdx = grid.bus(COUPLING_BUS).index;
  const hour = step.iv.midHour;
  // First pass: the transmission bus carries the area's load as dispatched.
  let op = operate(grid, step, base, opts);
  // The dispatched load at the bus, before any substitution (the anchor every
  // iteration substitutes into).
  const anchorP = op.pf.buses[busIdx]!.pd;
  const anchorQ = op.pf.buses[busIdx]!.qd;
  let fs: FeederState | null = null;
  let prevS: Complex | null = null;
  let ltc = 0;
  const history: CoupledPoint['history'] = [];
  let it = 0;
  let change = Infinity;
  for (; it < 12; it++) {
    // the bus must be energised by a solved island; otherwise the feeder has no source
    if (!op.result.energized[busIdx]) break;
    const v = op.result.vm[busIdx]!;
    const a = op.result.va[busIdx]!;
    fs = solveFeeder(feeder, hour, v, a, ltc, opts.feederOpen);
    ltc = fs.ltcStep;
    const sD = fs.substationS;
    history.push({ vPu: v, angleDeg: (a * 180) / Math.PI, sMW: sD.re / 1e6, qMVAr: sD.im / 1e6 });
    change = prevS ? sD.sub(prevS).abs() : Infinity;
    if (change < 1) break; // 1 VA
    prevS = sD;
    // Replace the substation's share of the bus load with the detailed demand.
    const pf = cloneCase(base);
    const dispatchedSub = fs.nominalS; // what the area load record assumed for the substation
    const pd = anchorP - dispatchedSub.re / 1e6 / S_BASE + sD.re / 1e6 / S_BASE;
    const qd = anchorQ - dispatchedSub.im / 1e6 / S_BASE + sD.im / 1e6 / S_BASE;
    op = operateWithBusLoad(grid, step, pf, opts, busIdx, pd, qd, op);
  }
  if (!fs) {
    // no source at the boundary: the substation and feeder are dark
    fs = solveFeeder(feeder, hour, 0, 0, ltc, opts.feederOpen);
    history.push({ vPu: 0, angleDeg: 0, sMW: 0, qMVAr: 0 });
    change = 0;
  }
  return {
    op,
    feeder: fs,
    iterations: it + 1,
    lastChangeVA: change,
    boundaryS: fs ? fs.substationS : Complex.ZERO,
    history,
  };
}

/**
 * Operate with one bus's load overridden. The dispatch's own load at that bus is
 * swapped out after operate() has built the case, so the override is exact.
 */
function operateWithBusLoad(
  grid: Grid,
  step: IntervalDispatch,
  base: PFCase,
  opts: OperateOptions,
  bus: number,
  pd: number,
  qd: number,
  prev: OperatingPoint,
): OperatingPoint {
  const b = cloneCase(base);
  // operate() adds the dispatch loads on top of the base case; pre-compensate so the
  // bus ends with exactly (pd, qd).
  const l = grid.loads.findIndex((x) => x.bus.index === bus);
  const addedP = l >= 0 ? (step.av.grossMW[l]! - step.av.btmMW[l]!) / S_BASE : 0;
  const addedQ = l >= 0 ? step.av.grossMVAr[l]! / S_BASE : 0;
  b.buses[bus]!.pd = pd - addedP;
  b.buses[bus]!.qd = qd - addedQ;
  return operate(grid, step, b, { ...opts, warm: prev.result, shuntSteps: prev.shuntSteps });
}
