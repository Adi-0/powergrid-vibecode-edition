import { beforeAll, describe, expect, it } from 'vitest';
import { Grid } from '../src/model/grid';
import { runDay, type DayRun } from '../src/model/day';
import { snapshot, type Snapshot } from '../src/model/snapshot';
import { coupledSolve } from '../src/model/coupling';
import { makeFeeder, type Feeder } from '../src/model/feeder';
import { feederSnap } from '../src/model/feederSnapshot';
import { numberText } from '../src/ui/quantity';
import { parseDisplayed, type Expr, type Panel } from '../src/math/expr';
import { branchPanel, busPanel, feederPanel, frequencyPanel, machinePanel, meterPanel, outletPanel, plantPanel, regionPanel, substationPanel } from '../src/math/panels';
import { tripResponse } from '../src/model/frequency';

/**
 * Phase 6's done-condition: every math panel's displayed arithmetic reproduces its
 * displayed result. Checked the way a reader would: take the numbers as they are
 * printed (strings), redo the arithmetic, round as the result is printed, compare the
 * strings. And the printed precision must be enough for that result to agree with the
 * solver's own value (to two units in the last printed place, or the stated tolerance
 * of a step marked as an approximation).
 */
const DEG = Math.PI / 180;

function redo(e: Expr, printed: string[]): number {
  switch (e.k) {
    case 'num':
      return parseDisplayed(numberText(e.value, e.digits));
    case 'ref':
      return parseDisplayed(printed[e.step]!);
    case 'neg':
      return -redo(e.a, printed);
    case 'paren':
      return redo(e.a, printed);
    case 'sq':
      return redo(e.a, printed) ** 2;
    case 'fn': {
      const v = redo(e.a, printed);
      return e.fn === 'cos' ? Math.cos(v * DEG) : e.fn === 'sin' ? Math.sin(v * DEG) : e.fn === 'atan' ? Math.atan(v) / DEG : Math.sqrt(v);
    }
    case 'op': {
      const a = redo(e.a, printed);
      const b = redo(e.b, printed);
      return e.op === '+' ? a + b : e.op === '−' ? a - b : e.op === '×' ? a * b : a / b;
    }
  }
}

function check(p: Panel, where: string): number {
  const printed: string[] = [];
  let n = 0;
  for (const st of p.steps) {
    const v = redo(st.expr, printed);
    const out = numberText(v, st.digits);
    printed.push(out);
    n++;
    if (st.solver !== undefined) {
      const tol = st.approx ? st.approx.tol : 2 * 10 ** -st.digits;
      const diff = Math.abs(parseDisplayed(out) - st.solver);
      expect(diff, `${where} · ${st.label}: printed ${out} vs solver ${st.solver}`).toBeLessThanOrEqual(tol + 1e-12);
    }
  }
  return n;
}

describe('math panels', () => {
  let g: Grid;
  let day: DayRun;
  let fd: Feeder;
  beforeAll(() => {
    g = new Grid();
    day = runDay(g);
    fd = makeFeeder();
  }, 120_000);

  for (const t of [76, 50]) {
    it(`every branch and every bus at interval ${t}`, () => {
      const s = snapshot(g, day.points[t]!);
      let steps = 0;
      let panels = 0;
      g.branches.forEach((br, k) => {
        const p = branchPanel(g, s, k);
        if (p) {
          steps += check(p, br.id);
          panels++;
        }
      });
      g.buses.forEach((b) => {
        const p = busPanel(g, s, b.index);
        if (p) {
          steps += check(p, b.id);
          panels++;
        }
      });
      for (const r of ['bay', 'la', 'central', 'north', 'coast', 'inland', 'sd']) {
        const ids = g.sites.filter((x) => x.region === r && !x.outOfState).map((x) => x.id);
        const p = regionPanel(g, s, ids, r);
        if (p) steps += check(p, r);
      }
      expect(panels).toBeGreaterThan(250);
      expect(steps).toBeGreaterThan(1500);
    });

    it(`plant, machines and the frequency response at interval ${t}`, () => {
      const s = snapshot(g, day.points[t]!);
      const p = plantPanel(g, s, 'ML1');
      expect(p).not.toBeNull();
      check(p!, p!.title);
      for (const id of ['ML1-GT1', 'ML1-GT2', 'ML1-ST']) {
        const m = machinePanel(g, s, id);
        expect(m).not.toBeNull();
        check(m!, id);
      }
      check(frequencyPanel(tripResponse(g, s, 'ML1')), 'trip ML1');
      check(frequencyPanel(tripResponse(g, s, 'DIABLO')), 'trip DIABLO');
    });

    it(`substation, feeder, meters and the outlet at interval ${t}`, () => {
      const w = day.points[t]!;
      const cp = coupledSolve(g, w.step, g.baseCase(), fd, { participation: 'agc', warm: w.result, shuntSteps: w.shuntSteps });
      const s: Snapshot = { ...snapshot(g, cp.op), feeder: feederSnap(cp) };
      for (const p of [substationPanel(s), feederPanel(s, fd), outletPanel(s, fd)]) {
        expect(p).not.toBeNull();
        check(p!, p!.title);
      }
      for (const h of fd.layout.homes) {
        const p = meterPanel(s, fd, h.id);
        if (p) check(p, h.id);
      }
    });
  }
});
