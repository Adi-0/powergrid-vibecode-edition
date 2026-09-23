import { describe, expect, it } from 'vitest';
import fx from './fixtures/smib.json';
import { criticalClearingTime, equalArea, swing, timeToAngle, type SmibCase } from '../src/physics/dyn/smib';

/**
 * Single machine on an infinite bus against an offline reference (tools/ref/smib.py:
 * scipy's DOP853 at 1e-12 tolerance, and the equal-area closed form evaluated there).
 */
const sys = fx.system;
const mk = (c: { Pmax1: number; Pmax2: number; Pmax3: number }): SmibCase => ({ H: sys.H, f0: sys.f0, Pm: sys.Pm, Pmax1: c.Pmax1, Pmax2: c.Pmax2, Pmax3: c.Pmax3 });

describe('SMIB equal-area criterion', () => {
  for (const name of ['midLineFault', 'busFault'] as const) {
    const ref = fx[name];
    const c = mk(ref);
    it(`${name}: transfer limits from the network`, () => {
      const X1 = sys.Xd_transient + sys.Xt + sys.Xline / 2;
      const X3 = sys.Xd_transient + sys.Xt + sys.Xline;
      expect((sys.E * sys.V) / X1).toBeCloseTo(ref.Pmax1, 12);
      expect((sys.E * sys.V) / X3).toBeCloseTo(ref.Pmax3, 12);
    });
    it(`${name}: critical clearing angle, closed form`, () => {
      const ea = equalArea(c)!;
      expect(ea.delta0).toBeCloseTo(ref.delta0, 12);
      expect(ea.deltaMax).toBeCloseTo(ref.deltaMax, 12);
      expect(ea.deltaCr).toBeCloseTo(ref.deltaCr, 12);
      if (name === 'busFault') expect(ea.tcrClosed!).toBeCloseTo(fx.busFault.tcrClosed, 12);
    });
    it(`${name}: critical clearing time, fixed-step RK4 against DOP853`, () => {
      const ea = equalArea(c)!;
      // fault-on trajectory to δ_cr: RK4 at 0.5 ms is accurate to far below a microsecond here
      expect(Math.abs(timeToAngle(c, ea.deltaCr) - ref.tcrEvent)).toBeLessThan(1e-6);
      // without the equal-area criterion: bisection on clearing time, stability by simulation
      expect(Math.abs(criticalClearingTime(c) - ref.tcrBisect)).toBeLessThan(1e-3);
    });
    it(`${name}: cleared just inside is stable, just outside is not`, () => {
      expect(swing(c, ref.tcrEvent - 0.01).stable).toBe(true);
      expect(swing(c, ref.tcrEvent + 0.01).stable).toBe(false);
    });
  }
});
