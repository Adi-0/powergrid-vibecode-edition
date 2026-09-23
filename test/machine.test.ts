import { describe, expect, it } from 'vitest';
import { MACHINES } from '../src/data/machines';
import { capability, efMax, margins, phasors, xeOf } from '../src/model/machine';
import { Grid } from '../src/model/grid';

const rec = MACHINES[0]!;

describe('synchronous machine', () => {
  it('S = V I* recovers the operating point (current conjugated)', () => {
    const p = phasors(rec, 1.02, 0.3, 150, 40);
    // V∠θ · (I∠iAngle)* = V I ∠(θ − iAngle)
    const S = p.V * p.I;
    expect(S * Math.cos(p.theta - p.iAngle) * rec.mva).toBeCloseTo(150, 9);
    expect(S * Math.sin(p.theta - p.iAngle) * rec.mva).toBeCloseTo(40, 9);
  });

  it('electrical power from the internal voltage: P = E V sin δ / X_d when R_a = 0', () => {
    const r0 = { ...rec, ra: 0 };
    const p = phasors(r0, 1.0, 0.1, 160, 60);
    expect(((p.Ef * p.V) / r0.xd) * Math.sin(p.delta)).toBeCloseTo(160 / r0.mva, 10);
    // and Q = (E V cos δ − V²) / X_d
    expect(((p.Ef * p.V) * Math.cos(p.delta) - p.V * p.V) / r0.xd).toBeCloseTo(60 / r0.mva, 10);
  });

  it('the rated point sits on the armature and field limits', () => {
    const r0 = { ...rec, ra: 0 };
    const p = phasors(r0, 1, 0, r0.mva * r0.pf, r0.mva * Math.sqrt(1 - r0.pf ** 2));
    const cap = capability(r0, 1, xeOf(r0, 220, 12));
    const m = margins(p, cap);
    expect(m.armature).toBeCloseTo(1, 12);
    expect(m.field).toBeCloseTo(1, 12);
    // field circle: P² + (Q + V²/X_d)² = (V E_f,max / X_d)²
    expect(p.P ** 2 + (p.Q + 1 / r0.xd) ** 2).toBeCloseTo((efMax(r0) / r0.xd) ** 2, 12);
  });

  it('under-excited stability limit meets Q = −V²/X_d at no load', () => {
    const cap = capability(rec, 1, xeOf(rec, 220, 12));
    const bottom = cap.stability[0]!;
    expect(bottom[0]).toBeCloseTo(0, 12);
    expect(bottom[1]).toBeCloseTo(-1 / rec.xd, 12);
  });

  it('the power flow’s reactive limits for the unit lie inside its capability at rated output', () => {
    const g = new Grid();
    for (const m of MACHINES) {
      const gen = g.gens.find((x) => x.id === m.gen)!;
      expect(gen).toBeDefined();
      // at full turbine output, Q_max must not exceed the armature limit
      const qArm = Math.sqrt(m.mva ** 2 - m.turbineMW ** 2);
      expect(gen.qmaxMVAr).toBeLessThanOrEqual(qArm + 1e-6);
      expect(gen.pmaxMW).toBeCloseTo(m.turbineMW, 9);
    }
  });
});
