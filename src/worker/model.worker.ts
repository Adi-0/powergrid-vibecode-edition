/// <reference lib="webworker" />
import { Grid } from '../model/grid';
import { dispatchDay, type DaySchedule } from '../model/dispatch';
import { operate, type OperatingPoint } from '../model/operate';
import { snapshot, transferables, type Snapshot } from '../model/snapshot';
import type { PFCase } from '../physics/pf/case';
import { coupledSolve } from '../model/coupling';
import { makeFeeder, type Feeder } from '../model/feeder';
import { feederSnap } from '../model/feederSnapshot';

/**
 * The solver thread. It owns the model and the solvers so the drawing thread never
 * waits on arithmetic.
 *
 * At start it dispatches the day and solves the evening peak first (so the map has
 * flows within a moment), then every interval in order, twice: the first pass finds
 * the losses, the second dispatches with them. Between intervals it answers `solve`
 * requests — a time of day and a set of tripped branches — with a fresh power flow,
 * so whatever the reader scrubs to or trips is solved when asked, never looked up.
 */
export type ToWorker =
  | { type: 'init'; focus: number }
  /** `detail`: also solve the Evergreen substation and feeder, coupled at its 60 kV bus. */
  | { type: 'solve'; t: number; outages: number[]; seq: number; detail?: boolean; plantOutages?: string[]; vset?: Array<[number, number]> };

/** The day as dispatched: what the time strip draws. MW per interval. */
export interface DaySummary {
  pass: 1 | 2;
  startHour: Float64Array;
  grossMW: Float64Array;
  btmMW: Float64Array;
  /** Demand seen by the grid (gross − rooftop solar). */
  netLoadMW: Float64Array;
  solarMW: Float64Array;
  windMW: Float64Array;
  /** Grid demand less utility solar and wind: what the rest of the fleet must follow. */
  residualMW: Float64Array;
  energyPrice: Float64Array;
}

export type FromWorker =
  | { type: 'progress'; stage: string; done: number; total: number }
  | { type: 'schedule'; day: DaySummary }
  | { type: 'interval'; snap: Snapshot }
  | { type: 'solved'; snap: Snapshot; ms: number }
  | { type: 'day-done'; ms: number };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let grid: Grid;
let base: PFCase;
let schedule: DaySchedule | null = null;
/** Base-case solutions of the current schedule (warm starts for requests). */
let baseOps: Array<OperatingPoint | undefined> = [];
let pending: Extract<ToWorker, { type: 'solve' }> | null = null;
let feeder: Feeder | null = null;

ctx.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type === 'init') void runDay(msg.focus);
  else if (msg.type === 'solve') {
    pending = msg; // only the latest request matters
    if (schedule) answer();
  }
};

function post(m: FromWorker, transfer: Transferable[] = []): void {
  ctx.postMessage(m, transfer);
}

/** Let queued messages in (a macrotask boundary). */
const yieldToMessages = () => new Promise<void>((r) => setTimeout(r, 0));

function answer(): void {
  const req = pending;
  if (!req || !schedule) return;
  pending = null;
  const t0 = performance.now();
  const step = schedule.steps[req.t]!;
  const warm = baseOps[req.t];
  const outages = [...new Set(req.outages)].sort((a, b) => a - b);
  const plantOutages = [...new Set(req.plantOutages ?? [])].sort();
  const vset = req.vset ?? [];
  const scenario = { plantOutages, vset };
  // With something tripped this is the moment after: the dispatch stays as planned
  // and governors (droop) cover the change. See docs/simplifications.md.
  const opts = {
    participation: outages.length || plantOutages.length ? ('governor' as const) : ('agc' as const),
    branchOutages: new Set(outages),
    plantOutages: new Set(plantOutages),
    vset: new Map(vset),
    ...(warm && warm.status === 'converged' ? { warm: warm.result, shuntSteps: warm.shuntSteps } : {}),
  };
  let s: Snapshot;
  if (req.detail) {
    // the substation and feeder, solved phase by phase and iterated with the
    // transmission solution until both agree at the 60 kV bus
    feeder ??= makeFeeder();
    const cp = coupledSolve(grid, step, base, feeder, opts);
    s = snapshot(grid, cp.op, req.seq, outages, scenario);
    s.feeder = feederSnap(cp);
  } else {
    s = snapshot(grid, operate(grid, step, base, opts), req.seq, outages, scenario);
  }
  post({ type: 'solved', snap: s, ms: performance.now() - t0 }, transferables(s));
}

function summary(s: DaySchedule, pass: 1 | 2): DaySummary {
  const f = (g: (i: number) => number) => Float64Array.from(s.steps.map((_, i) => g(i)));
  const st = s.steps;
  return {
    pass,
    startHour: f((i) => st[i]!.iv.startHour),
    grossMW: f((i) => st[i]!.grossLoadMW),
    btmMW: f((i) => st[i]!.btmMW),
    netLoadMW: f((i) => st[i]!.netLoadMW),
    solarMW: f((i) => st[i]!.solarMW),
    windMW: f((i) => st[i]!.windMW),
    residualMW: f((i) => st[i]!.netLoadMW - st[i]!.solarMW - st[i]!.windMW),
    energyPrice: f((i) => st[i]!.energyPrice),
  };
}

async function runDay(focus: number): Promise<void> {
  const t0 = performance.now();
  grid = new Grid();
  base = grid.baseCase();
  post({ type: 'progress', stage: 'dispatch', done: 0, total: 1 });
  // first pass: dispatch with estimated losses, and the focus interval straight away
  const first = dispatchDay(grid);
  schedule = first;
  baseOps = [];
  post({ type: 'schedule', day: summary(first, 1) });
  const focusOp = operate(grid, first.steps[focus]!, base, { participation: 'agc' });
  baseOps[focus] = focusOp;
  sendSnap(focusOp);
  answer();
  const total = first.steps.length * 2;
  // full sequence for losses, then the final dispatch and its solutions
  const pts1: OperatingPoint[] = [];
  let prev: OperatingPoint | undefined;
  for (const step of first.steps) {
    const op = operate(grid, step, base, {
      participation: 'agc',
      ...(prev && prev.status === 'converged' ? { warm: prev.result, shuntSteps: prev.shuntSteps } : {}),
    });
    pts1.push(op);
    baseOps[step.iv.index] = op;
    prev = op;
    post({ type: 'progress', stage: 'losses', done: pts1.length, total });
    await yieldToMessages();
    answer();
  }
  const lossMW = Float64Array.from(pts1.map((p, t) => (p.status === 'converged' ? p.lossesMW : first.steps[t]!.lossEstimateMW)));
  const sched = dispatchDay(grid, { lossMW });
  const ops2: Array<OperatingPoint | undefined> = [];
  prev = undefined;
  let k = 0;
  for (const step of sched.steps) {
    const op = operate(grid, step, base, {
      participation: 'agc',
      ...(prev && prev.status === 'converged' ? { warm: prev.result, shuntSteps: prev.shuntSteps } : {}),
    });
    ops2[step.iv.index] = op;
    sendSnap(op);
    prev = op;
    post({ type: 'progress', stage: 'solve', done: first.steps.length + ++k, total });
    await yieldToMessages();
    answer();
  }
  // the final schedule takes over for requests from here on
  schedule = sched;
  baseOps = ops2;
  post({ type: 'schedule', day: summary(sched, 2) });
  post({ type: 'day-done', ms: performance.now() - t0 });
  answer();
}

function sendSnap(op: OperatingPoint): void {
  const s = snapshot(grid, op);
  post({ type: 'interval', snap: s }, transferables(s));
}
