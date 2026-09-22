/// <reference lib="webworker" />
import { Grid } from '../model/grid';
import { dispatchDay } from '../model/dispatch';
import { operate, type OperatingPoint } from '../model/operate';
import { snapshot, transferables } from '../model/snapshot';

/**
 * The solver thread. It owns the model and the solvers so the drawing thread never
 * waits on arithmetic. The day is dispatched, then the evening peak is solved first
 * (so the map has flows within a moment), then every interval in order.
 */
export type ToWorker = { type: 'init'; focus: number };
export type FromWorker =
  | { type: 'progress'; stage: string; done: number; total: number }
  | { type: 'interval'; snap: ReturnType<typeof snapshot> }
  | { type: 'day-done'; ms: number };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let grid: Grid;

ctx.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type === 'init') runDayProgressive(msg.focus);
};

function post(m: FromWorker, transfer: Transferable[] = []): void {
  ctx.postMessage(m, transfer);
}

function runDayProgressive(focus: number): void {
  const t0 = performance.now();
  grid = new Grid();
  const base = grid.baseCase();
  post({ type: 'progress', stage: 'dispatch', done: 0, total: 1 });
  // first pass: dispatch with estimated losses, and the focus interval straight away
  const first = dispatchDay(grid);
  const focusOp = operate(grid, first.steps[focus]!, base, { participation: 'agc' });
  sendSnap(focusOp);
  // full sequence for losses, then the final dispatch and its solutions
  const pts1: OperatingPoint[] = [];
  let prev: OperatingPoint | undefined;
  for (const step of first.steps) {
    const op = operate(grid, step, base, {
      participation: 'agc',
      ...(prev && prev.status === 'converged' ? { warm: prev.result, shuntSteps: prev.shuntSteps } : {}),
    });
    pts1.push(op);
    prev = op;
    post({ type: 'progress', stage: 'losses', done: pts1.length, total: first.steps.length * 2 });
  }
  const lossMW = Float64Array.from(pts1.map((p, t) => (p.status === 'converged' ? p.lossesMW : first.steps[t]!.lossEstimateMW)));
  const sched = dispatchDay(grid, { lossMW });
  prev = undefined;
  let k = 0;
  for (const step of sched.steps) {
    const op = operate(grid, step, base, {
      participation: 'agc',
      ...(prev && prev.status === 'converged' ? { warm: prev.result, shuntSteps: prev.shuntSteps } : {}),
    });
    sendSnap(op);
    prev = op;
    post({ type: 'progress', stage: 'solve', done: first.steps.length + ++k, total: first.steps.length * 2 });
  }
  post({ type: 'day-done', ms: performance.now() - t0 });
}

function sendSnap(op: OperatingPoint): void {
  const s = snapshot(grid, op);
  post({ type: 'interval', snap: s }, transferables(s));
}
