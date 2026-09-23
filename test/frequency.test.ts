import { beforeAll, describe, expect, it } from 'vitest';
import { Grid } from '../src/model/grid';
import { runDay, type DayRun } from '../src/model/day';
import { snapshot } from '../src/model/snapshot';
import { operate } from '../src/model/operate';
import { tripResponse } from '../src/model/frequency';

/**
 * Losing Moss Landing Unit 1 at 19:00: the frequency dip is physically sized, the
 * pick-up closes the loss, and the governors share it as the power flow's governor
 * participation does.
 */
describe('frequency response to a plant trip', () => {
  let g: Grid;
  let day: DayRun;
  beforeAll(() => {
    g = new Grid();
    day = runDay(g);
  }, 120_000);

  it('dip, nadir and settling are in the physical range; the pick-up closes the loss', () => {
    const s = snapshot(g, day.points[76]!);
    const r = tripResponse(g, s, 'ML1');
    expect(r.lossMW).toBeGreaterThan(400);
    expect(r.nadirHz).toBeLessThan(60);
    expect(r.nadirHz).toBeGreaterThan(59.5);
    expect(r.nadirHz).toBeLessThanOrEqual(r.settledHz + 1e-9);
    expect(r.rocof).toBeLessThan(0);
    // at the end of the run the machines have stopped slowing: governors + load relief = loss
    const k = r.t.length - 1;
    const pick = r.dPm.reduce((a, g) => a + g[k]!, 0) + r.dLoad[k]!;
    expect(Math.abs(pick - r.lossMW) / r.lossMW).toBeLessThan(0.01);
    expect(r.f[k]!).toBeCloseTo(r.settledHz, 2);
  });

  it('governors share the loss as the power flow’s governor participation does', () => {
    const s = snapshot(g, day.points[76]!);
    const r = tripResponse(g, s, 'ML1');
    const w = day.points[76]!;
    const after = operate(g, w.step, g.baseCase(), { participation: 'governor', plantOutages: new Set(['ML1']), warm: w.result, shuntSteps: w.shuntSteps });
    expect(after.status).toBe('converged');
    // ratio of each governed unit's pick-up in the power flow to its pick-up in the
    // frequency model is the same for all units not at a limit
    const ratios: number[] = [];
    r.units.forEach((u, i) => {
      if (u.R === null || r.unitDP[i]! < 1) return;
      const gi = g.gens.find((x) => x.id === u.id)!.index;
      if (after.genMW[gi]! >= g.gens[gi]!.pmaxMW - 1e-3) return;
      ratios.push((after.genMW[gi]! - s.pg[gi]!) / r.unitDP[i]!);
    });
    expect(ratios.length).toBeGreaterThan(5);
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    for (const x of ratios) expect(Math.abs(x / mean - 1)).toBeLessThan(0.02);
  });
});
