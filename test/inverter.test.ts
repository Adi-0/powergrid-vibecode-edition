import { beforeAll, describe, expect, it } from 'vitest';
import { Grid } from '../src/model/grid';
import { runDay, type DayRun } from '../src/model/day';
import { snapshot, type Snapshot } from '../src/model/snapshot';
import { coupledSolve } from '../src/model/coupling';
import { homePV, makeFeeder, type Feeder } from '../src/model/feeder';
import { feederSnap } from '../src/model/feederSnapshot';
import { invState, invWave, INVERTER_EFF } from '../src/model/invState';
import { COMPONENTS } from '../src/data/components';

/**
 * A home's solar inverter as the Inverter level shows it: its AC output is the solver's,
 * which is the array model's; its current is in phase with the line's voltage; the power
 * out pulses between nothing and twice its average; and the drawn switching averages to
 * the sine it is made to follow.
 */
describe('a home solar inverter', () => {
  let g: Grid;
  let day: DayRun;
  let fd: Feeder;
  const solve = (t: number): Snapshot => {
    const w = day.points[t]!;
    const cp = coupledSolve(g, w.step, g.baseCase(), fd, { participation: 'agc', warm: w.result, shuntSteps: w.shuntSteps });
    return { ...snapshot(g, cp.op), feeder: feederSnap(cp) };
  };
  beforeAll(() => {
    g = new Grid();
    day = runDay(g);
    fd = makeFeeder();
  }, 120_000);

  it('puts out what the array model makes, and makes nothing at night', () => {
    const noon = solve(50);
    const night = solve(8);
    let n = 0;
    for (const h of fd.layout.homes) {
      if (h.pvKW <= 0) continue;
      const st = invState(noon, fd, h.id)!;
      expect(st.pAC).toBeCloseTo(h.pvKW * 1000 * homePV(st.hour).pac, 6);
      expect(st.pDC * INVERTER_EFF).toBeCloseTo(st.pAC, 6);
      expect(st.m).toBeLessThan(1);
      expect(invState(night, fd, h.id)!.pAC).toBe(0);
      n++;
    }
    expect(n).toBeGreaterThan(5);
  });

  it('pushes current in step with the voltage: the power out pulses from nothing to twice its average', () => {
    const s = solve(50);
    const h = fd.layout.homes.find((x) => x.pvKW > 0)!;
    const st = invState(s, fd, h.id)!;
    const T = 1 / COMPONENTS.fHz;
    let sum = 0;
    let max = 0;
    let min = Infinity;
    const N = 600;
    for (let k = 0; k < N; k++) {
      const w = invWave(st, (T * k) / N);
      sum += w.p;
      max = Math.max(max, w.p);
      min = Math.min(min, w.p);
    }
    expect(sum / N).toBeCloseTo(st.pAC, 3);
    expect(Math.abs(max - 2 * st.pAC) / (2 * st.pAC)).toBeLessThan(1e-4);
    expect(min).toBeGreaterThanOrEqual(-1e-9);
  });

  it('switches so that each carrier period averages to the sine', () => {
    const s = solve(50);
    const h = fd.layout.homes.find((x) => x.pvKW > 0)!;
    const st = invState(s, fd, h.id)!;
    const Tc = 1 / (COMPONENTS.fHz * COMPONENTS.inverter.drawnCarrier);
    for (let c = 0; c < COMPONENTS.inverter.drawnCarrier; c++) {
      let avg = 0;
      let ref = 0;
      const N = 2000;
      for (let k = 0; k < N; k++) {
        const w = invWave(st, Tc * (c + k / N));
        avg += w.leg;
        ref += w.ref;
      }
      // the pulses' average over a carrier period follows the reference within the period's own change
      expect(Math.abs(avg / N - ref / N)).toBeLessThan(0.08);
    }
  });
});
