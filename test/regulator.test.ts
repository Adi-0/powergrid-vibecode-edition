import { beforeAll, describe, expect, it } from 'vitest';
import { Grid } from '../src/model/grid';
import { runDay, type DayRun } from '../src/model/day';
import { snapshot, type Snapshot } from '../src/model/snapshot';
import { coupledSolve } from '../src/model/coupling';
import { makeFeeder, type Feeder } from '../src/model/feeder';
import { feederSnap } from '../src/model/feederSnapshot';
import { regState } from '../src/model/regState';

/**
 * Feeder 1105's regulator as the Regulator level shows it: what its control sees is
 * the line-drop-compensated voltage, and the solve left it inside the band; its output
 * is its input times its tap's ratio; and a set point the reader raises is a real
 * re-solve that moves the taps and the voltage down the feeder.
 */
describe('the feeder regulator', () => {
  let g: Grid;
  let day: DayRun;
  let fd: Feeder;
  const solve = (t: number, regVset?: number): Snapshot => {
    const w = day.points[t]!;
    const cp = coupledSolve(g, w.step, g.baseCase(), fd, { participation: 'agc', warm: w.result, shuntSteps: w.shuntSteps, ...(regVset !== undefined ? { regVset } : {}) });
    return { ...snapshot(g, cp.op), feeder: feederSnap(cp) };
  };
  beforeAll(() => {
    g = new Grid();
    day = runDay(g);
    fd = makeFeeder();
  }, 120_000);

  for (const t of [76, 50, 24]) {
    it(`holds each phase inside its band, output = ratio × input, at interval ${t}`, () => {
      const st = regState(solve(t), fd, null)!;
      expect(st).not.toBeNull();
      for (const p of st.phases) {
        expect(p.vL).toBeCloseTo(p.ratio * p.vS, 6);
        expect(p.degL).toBeCloseTo(p.degS, 9);
        // a tap at the end of its range may not reach the band; otherwise it is inside
        if (Math.abs(p.tap) < 16) expect(p.inBand).toBe(true);
      }
    });
  }

  it('moves its taps, and the voltage beyond it, when the set point is raised', () => {
    const t = 76;
    const base = regState(solve(t), fd, null)!;
    const up = regState(solve(t, base.control.vset + 2), fd, base.control.vset + 2)!;
    const end = (st: typeof base) => st.profile.v[st.profile.v.length - 1]!;
    for (let p = 0; p < 3; p++) {
      expect(up.phases[p]!.tap).toBeGreaterThan(base.phases[p]!.tap);
      expect(end(up)[p]!).toBeGreaterThan(end(base)[p]!);
    }
    // the voltage before the regulator hardly moves
    const before = up.profile.ids.indexOf('F4');
    for (let p = 0; p < 3; p++) expect(Math.abs(up.profile.v[before]![p]! - base.profile.v[before]![p]!)).toBeLessThan(0.5);
  });
});
