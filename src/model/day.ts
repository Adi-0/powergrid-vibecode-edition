import type { Grid } from './grid';
import { dispatchDay, type DaySchedule, type DispatchOptions } from './dispatch';
import { operate, type OperatingPoint, type OperateOptions } from './operate';

/**
 * The quasi-static day: dispatch every interval, then solve the AC power flow for
 * each in sequence (each warm-started from the previous one, shunt banks carried
 * over as an operator would leave them). A second dispatch pass uses the losses
 * the first power flows actually found, so the governors/AGC only cover a small
 * residual.
 */
export interface DayRun {
  schedule: DaySchedule;
  points: OperatingPoint[];
}

export function runDay(grid: Grid, dopts: DispatchOptions = {}, oopts: Partial<OperateOptions> = {}): DayRun {
  const base = grid.baseCase();
  const solveAll = (s: DaySchedule): OperatingPoint[] => {
    const pts: OperatingPoint[] = [];
    let prev: OperatingPoint | undefined;
    for (const step of s.steps) {
      const op = operate(grid, step, base, {
        participation: 'agc',
        ...oopts,
        ...(prev && prev.status === 'converged' ? { warm: prev.result, shuntSteps: prev.shuntSteps } : {}),
      });
      pts.push(op);
      prev = op;
    }
    return pts;
  };
  const first = dispatchDay(grid, dopts);
  const pts1 = solveAll(first);
  const hvdcLoss = grid.hvdc.reduce((s, h) => s + h.rec.scheduleMW * h.rec.lossFrac, 0);
  const lossMW = Float64Array.from(pts1.map((p, t) => (p.status === 'converged' ? p.lossesMW : first.steps[t]!.lossEstimateMW)));
  void hvdcLoss;
  const schedule = dispatchDay(grid, { ...dopts, lossMW });
  return { schedule, points: solveAll(schedule) };
}
