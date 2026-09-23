import { cloneCase, type PFCase } from '../physics/pf/case';
import { solveAC, type PFResult, type PFStatus } from '../physics/pf/acpf';
import { branchFlows, powerBalance, type Balance, type BranchFlow } from '../physics/pf/flows';
import type { Grid } from './grid';
import { S_BASE } from './grid';
import type { IntervalDispatch } from './dispatch';

/**
 * One operating point: an interval's dispatch put through the AC power flow.
 *
 * Who covers the mismatch between the dispatch (which estimated losses) and the
 * network's actual losses — or a sudden change such as a plant trip — depends on
 * the time scale being modelled:
 *   'agc'      minutes later, automatic generation control has moved dispatchable
 *              California units (in proportion to how fast they can ramp) and held
 *              interchange with neighbours at schedule;
 *   'governor' seconds later, every unit with a governor has responded in
 *              proportion to its rating over its droop — including the rest of the
 *              western interconnection behind the AC ties — and frequency sits a
 *              little below 60 Hz until AGC acts.
 */
export type Participation = 'agc' | 'governor';

export interface OperateOptions {
  participation: Participation;
  /** Branch indices out of service. */
  branchOutages?: ReadonlySet<number>;
  /** Plant ids forced offline (their output lost). */
  plantOutages?: ReadonlySet<string>;
  /** Voltage set-points changed from the schedule (excitation), per generator index, pu. */
  vset?: ReadonlyMap<number, number>;
  /** Start from this solution (speeds up a sequence of intervals). */
  warm?: PFResult;
  /** Shunt steps in service at start (per grid shunt). */
  shuntSteps?: Int32Array;
  record?: boolean;
}

export interface OperatingPoint {
  step: IntervalDispatch;
  pf: PFCase;
  result: PFResult;
  status: PFStatus;
  flows: BranchFlow[];
  balance: Balance | null;
  shuntSteps: Int32Array;
  /** Generation actually delivered, per generator, MW (after the slack settled). */
  genMW: Float64Array;
  lossesMW: number;
  participation: Participation;
}

const GOVERNED = new Set(['gas_ccgt', 'gas_ct', 'gas_cogen', 'gas_recip', 'hydro', 'pumped_storage']);

export function operate(grid: Grid, step: IntervalDispatch, base: PFCase, opts: OperateOptions): OperatingPoint {
  const first = operateOnce(grid, step, base, opts);
  if (first.status === 'converged' || !opts.shuntSteps) return first;
  // The banks as they were left may not suit this condition. Automatic voltage
  // control re-positions them from scratch before we conclude there is no solution.
  const { shuntSteps: _s, warm: _w, ...rest } = opts;
  void _s;
  void _w;
  const retry = operateOnce(grid, step, base, rest);
  return retry.status === 'converged' ? retry : first;
}

function operateOnce(grid: Grid, step: IntervalDispatch, base: PFCase, opts: OperateOptions): OperatingPoint {
  const pf = cloneCase(base);
  // loads: customer demand net of rooftop solar; reactive demand is the gross load's
  grid.loads.forEach((l, i) => {
    const b = pf.buses[l.bus.index]!;
    b.pd += (step.av.grossMW[i]! - step.av.btmMW[i]!) / S_BASE;
    b.qd += step.av.grossMVAr[i]! / S_BASE;
  });
  // HVDC links: fixed transfers set by converter controls
  for (const h of grid.hvdc) {
    pf.buses[h.from.index]!.pd += h.rec.scheduleMW / S_BASE;
    pf.buses[h.to.index]!.pd -= (h.rec.scheduleMW * (1 - h.rec.lossFrac)) / S_BASE;
  }
  // generators
  grid.gens.forEach((g, i) => {
    const pg = pf.gens[i]!;
    const mw = step.genMW[i]!;
    const plantOut = opts.plantOutages?.has(g.plant.id) ?? false;
    const thermal = g.tech.id.startsWith('gas') || g.tech.id.startsWith('import');
    const online = !plantOut && (!thermal || step.committed.get(g.plant.id) === true);
    pg.inService = online;
    pg.pg = online ? mw / S_BASE : 0;
    // A unit scheduled below its minimum (storage charging, hydro at a low level)
    // keeps its scheduled point as the floor of what the slack may push it to.
    pg.pmin = Math.min(pg.pmin, pg.pg);
    pg.pmax = Math.max(pg.pmax, pg.pg);
    pg.participation = online ? participationOf(g, opts.participation) : 0;
  });
  if (opts.branchOutages) for (const k of opts.branchOutages) pf.branches[k]!.inService = false;
  if (opts.vset) for (const [i, v] of opts.vset) pf.gens[i]!.vg = v;

  // Switched shunts: a voltage-band controller steps banks in and out between solves.
  // Without a previous position, start the banks where an operator would have them
  // for this much load: capacitors in with demand, reactors in when demand is low.
  const steps = opts.shuntSteps ? opts.shuntSteps.slice() : initialShuntSteps(grid, step);
  const applyShunts = () => {
    for (const b of pf.buses) b.bs = 0;
    grid.shunts.forEach((s, k) => {
      const bus = pf.buses[s.bus.index]!;
      bus.bs += (steps[k]! * s.stepMVAr) / S_BASE;
    });
  };
  let res: PFResult | null = null;
  let warm = opts.warm;
  // Stage 1 (reactive limits relaxed) lets the shunt controller find its banks from
  // any starting position; stage 2 then holds every generator to its capability.
  // An operator's banks are already near the right position, so with a warm start
  // stage 2 is usually all that runs.
  const relaxedFirst = !opts.shuntSteps;
  for (let round = 0; round < 24; round++) {
    applyShunts();
    const relaxed = relaxedFirst && round < 12;
    res = solveAC(pf, {
      slack: 'distributed',
      start: 'dc',
      enforceQLimits: !relaxed,
      ...(warm ? { initial: warm } : {}),
      record: opts.record ?? false,
    });
    if (res.status !== 'converged') {
      if (relaxed) break;
      break;
    }
    let changed = false;
    // Dynamic reactive reserve: where a region's voltage-controlling units are held at
    // their reactive maximum, step capacitors in (below the band's top) so the
    // machines are relieved and keep reserve for a contingency — as operators do.
    const starved = new Set<string>();
    for (const isl of res.islands)
      for (const i of isl.pinnedQ) {
        const g = grid.gens[i]!;
        if (res.qg[i]! * S_BASE >= g.qmaxMVAr - 1e-3) starved.add(g.bus.site.region);
      }
    grid.shunts.forEach((s, k) => {
      const v = res!.vm[s.bus.index]!;
      if (!res!.energized[s.bus.index]) return;
      const cap = s.stepMVAr > 0;
      if (cap && starved.has(s.bus.site.region) && v < s.vHigh - 0.01 && steps[k]! < s.steps) {
        steps[k] = steps[k]! + 1;
        changed = true;
        return;
      }
      if (v < s.vLow) {
        if (cap && steps[k]! < s.steps) (steps[k] = steps[k]! + 1), (changed = true);
        if (!cap && steps[k]! > 0) (steps[k] = steps[k]! - 1), (changed = true);
      } else if (v > s.vHigh) {
        if (cap && steps[k]! > 0) (steps[k] = steps[k]! - 1), (changed = true);
        if (!cap && steps[k]! < s.steps) (steps[k] = steps[k]! + 1), (changed = true);
      }
    });
    warm = res;
    if (!changed) {
      if (relaxed) {
        round = 11; // move on to stage 2 with these banks
        continue;
      }
      break;
    }
  }
  const result = res!;
  const flows = branchFlows(pf, result);
  // Islands without an operating point are dark (not energised), so the balance over
  // energised buses is the balance of everything that has a solution.
  const balance = result.energized.some((e) => e === 1) ? powerBalance(pf, result, flows) : null;
  const genMW = new Float64Array(grid.gens.length);
  grid.gens.forEach((_, i) => (genMW[i] = result.pg[i]! * S_BASE));
  let losses = 0;
  for (const f of flows) losses += f.loss.re * S_BASE;
  return {
    step,
    pf,
    result,
    status: result.status,
    flows,
    balance,
    shuntSteps: steps,
    genMW,
    lossesMW: losses,
    participation: opts.participation,
  };
}

function participationOf(g: Grid['gens'][number], mode: Participation): number {
  const t = g.tech;
  if (mode === 'agc') {
    // AGC moves dispatchable units in proportion to how fast they ramp; interchange
    // with neighbours takes a small share (inadvertent flow until the next schedule).
    if (t.id === 'import_ac' || t.id === 'import_dc') return 0.1 * t.rampPerMin * g.pmaxMW;
    if (!GOVERNED.has(t.id) && t.id !== 'battery') return 0;
    // a combined cycle's steam turbine follows its gas turbines; they take its share
    if (!g.governor) return 0;
    return t.rampPerMin * g.pmaxMW;
  }
  if (t.droop === null || !g.governor) return 0;
  if (g.plant.externalMW) return g.plant.externalMW / t.droop;
  return g.pmaxMW / t.droop;
}

function initialShuntSteps(grid: Grid, step: IntervalDispatch): Int32Array {
  const peak = grid.loads.reduce((a, l) => a + l.rec.peakMW, 0);
  const f = Math.min(1, step.grossLoadMW / peak);
  return Int32Array.from(grid.shunts, (s) => Math.round(s.steps * (s.stepMVAr > 0 ? f * f : Math.max(0, 1.4 - f))));
}
