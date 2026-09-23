import { beforeAll, describe, expect, it } from 'vitest';
import { Grid } from '../src/model/grid';
import { runDay, type DayRun } from '../src/model/day';
import { coupledSolve, COUPLING_BUS } from '../src/model/coupling';
import { makeFeeder, nodeIndex, type Feeder } from '../src/model/feeder';
import { feederSnap, type FeederSnap } from '../src/model/feederSnapshot';
import { snapshot } from '../src/model/snapshot';

/**
 * Phase 5's done-condition: the outlet's voltage is traceable to the transmission
 * bus, and at every level what goes in comes out through meters and losses.
 */
describe('substation → feeder → service', () => {
  let g: Grid;
  let day: DayRun;
  let fd: Feeder;
  beforeAll(() => {
    g = new Grid();
    day = runDay(g);
    fd = makeFeeder();
  }, 120_000);

  const solve = (t: number): { f: FeederSnap; vm60: number; va60: number } => {
    const w = day.points[t]!;
    const cp = coupledSolve(g, w.step, g.baseCase(), fd, { participation: 'agc', warm: w.result, shuntSteps: w.shuntSteps });
    const s = snapshot(g, cp.op);
    const b = g.bus(COUPLING_BUS).index;
    return { f: feederSnap(cp), vm60: s.vm[b]!, va60: (s.va[b]! * 180) / Math.PI };
  };

  for (const t of [76, 50, 12]) {
    it(`interval ${t}: meters + losses = feeder head, and the substation closes too`, () => {
      const { f } = solve(t);
      let meters = 0;
      let other = 0;
      f.loadIds.forEach((id, i) => {
        if (id.startsWith('OTHER:')) other += f.loadP[i]!;
        else meters += f.loadP[i]!;
      });
      let feederLoss = 0;
      let bankLoss = 0;
      fd.base.branches.forEach((b, k) => {
        const loss = f.flows[k * 4]! - f.flows[k * 4 + 2]!;
        if (b.id === 'EV-BANK') bankLoss += loss;
        else feederLoss += loss;
      });
      expect(Math.abs(meters + feederLoss - f.headP)).toBeLessThan(1e-3); // W
      expect(Math.abs(f.headP + other + bankLoss - f.boundaryP)).toBeLessThan(1e-3);
      expect(f.couplingChangeVA).toBeLessThan(1);
    });

    it(`interval ${t}: the outlet's voltage traces to the transmission solution`, () => {
      const { f, vm60, va60 } = solve(t);
      // the feeder's source is exactly the transmission solution's 60 kV bus
      expect(f.sourcePu).toBeCloseTo(vm60, 12);
      expect(f.sourceDeg).toBeCloseTo(va60, 10);
      const root = nodeIndex(fd).get('EV-60')!;
      const vRoot = Math.hypot(f.V[root * 6]!, f.V[root * 6 + 1]!);
      expect(vRoot / (60000 / Math.sqrt(3))).toBeCloseTo(vm60, 9);
      // and the outlet ends inside ANSI C84.1 Range A, below its meter
      const o = nodeIndex(fd).get(fd.layout.outlet.node)!;
      const m = nodeIndex(fd).get(fd.layout.outlet.home)!;
      const vo = Math.hypot(f.V[o * 6]!, f.V[o * 6 + 1]!);
      const vm = Math.hypot(f.V[m * 6]!, f.V[m * 6 + 1]!);
      expect(vo).toBeGreaterThan(114);
      expect(vo).toBeLessThan(126);
      expect(vo).toBeLessThan(vm);
    });
  }
});
