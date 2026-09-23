import { beforeAll, describe, expect, it } from 'vitest';
import { indices, simulateYears, tMed } from '../src/model/reliability';
import { Grid } from '../src/model/grid';
import { runDay } from '../src/model/day';
import { snapshot, type Snapshot } from '../src/model/snapshot';
import { coupledSolve } from '../src/model/coupling';
import { makeFeeder, type Feeder } from '../src/model/feeder';
import { feederSnap } from '../src/model/feederSnapshot';
import { faultStudy } from '../src/model/faultStudy';
import { feederSource, type FeederSource } from '../src/model/feederFault';

/**
 * IEEE 1366's indices against their definitions, worked by hand on a small record, and
 * the 2.5β major-event threshold; then a simulated record for feeder 1105 is plausible
 * and shows what fuse saving trades.
 */
describe('reliability indices (IEEE 1366)', () => {
  it('SAIFI, SAIDI, CAIDI, MAIFI_E on a hand-worked record', () => {
    // 1 000 customers; three sustained interruptions and two momentary events in a year
    const r = indices(
      1000,
      [
        { customers: 200, minutes: 90 },
        { customers: 50, minutes: 240 },
        { customers: 1000, minutes: 30 },
      ],
      [{ customers: 600 }, { customers: 300 }],
    );
    // Σ N_i = 1 250 → SAIFI 1.25; Σ r_i N_i = 18 000 + 12 000 + 30 000 = 60 000 → SAIDI 60 min
    expect(r.saifi).toBeCloseTo(1.25, 12);
    expect(r.saidi).toBeCloseTo(60, 12);
    expect(r.caidi).toBeCloseTo(48, 12);
    expect(r.maifiE).toBeCloseTo(0.9, 12);
    expect(r.asai).toBeCloseTo(1 - 60 / 525600, 12);
  });

  it('major-event threshold: T_MED = exp(α + 2.5β) of the daily log-SAIDI', () => {
    // logs of e^0, e^1, e^2 (and a zero day, left out): α = 1, β = 1 (sample standard deviation)
    const days = [1, Math.E, Math.E ** 2, 0];
    expect(tMed(days)).toBeCloseTo(Math.exp(1 + 2.5), 10);
  });

  describe('a simulated record on feeder 1105', () => {
    let fd: Feeder;
    let s: Snapshot;
    let src: FeederSource;
    beforeAll(() => {
      const g = new Grid();
      const day = runDay(g);
      fd = makeFeeder();
      const w = day.points[76]!;
      const cp = coupledSolve(g, w.step, g.baseCase(), fd, { participation: 'agc', warm: w.result, shuntSteps: w.shuntSteps });
      s = { ...snapshot(g, cp.op), feeder: feederSnap(cp) };
      src = feederSource(g, faultStudy(g, s));
    }, 120_000);

    it('indices in the range of North American feeders; fuse saving trades blinks for outages', () => {
      const r = simulateYears(fd, s, src);
      expect(r.faults).toBeGreaterThan(10);
      expect(r.saifi).toBeGreaterThan(0.05);
      expect(r.saifi).toBeLessThan(3);
      expect(r.saidi).toBeGreaterThan(5);
      expect(r.saidi).toBeLessThan(600);
      expect(r.maifiE).toBeGreaterThan(0);
      // without fuse saving, more sustained outages
      expect(r.fuseBlowing.saifi).toBeGreaterThan(r.saifi);
      // the same seed gives the same record
      expect(simulateYears(fd, s, src).saidi).toBe(r.saidi);
    });
  });
});
