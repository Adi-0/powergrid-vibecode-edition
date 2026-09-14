import { describe, it, expect } from 'vitest';
import { lineParameters, lineToPerUnit, surgeImpedance, geometricMeanDistance, bundleRadius } from '../src/core/lines.js';

describe('line parameters from conductor geometry', () => {
  it('gives textbook values for a 500 kV bundled line', () => {
    const p = lineParameters('finch', 'ehv-500-horizontal');
    // EHV lines land near 0.017 Ω/km resistance and 0.30 Ω/km reactance.
    expect(p.rOhmPerKm).toBeGreaterThan(0.015);
    expect(p.rOhmPerKm).toBeLessThan(0.025);
    // A 3-conductor 500 kV bundle lands near 0.34 Ω/km (≈0.55 Ω/mile).
    expect(p.xOhmPerKm).toBeGreaterThan(0.28);
    expect(p.xOhmPerKm).toBeLessThan(0.38);
    // Charging susceptance of an EHV line: a few microsiemens per km.
    expect(p.bSPerKm * 1e6).toBeGreaterThan(3.5);
    expect(p.bSPerKm * 1e6).toBeLessThan(6.0);
    const { zSurgeOhm, silMW } = surgeImpedance(p, 500);
    // Bundled EHV surge impedance is ~250 Ω, SIL ~1000 MW at 500 kV.
    expect(zSurgeOhm).toBeGreaterThan(220);
    expect(zSurgeOhm).toBeLessThan(290);
    expect(silMW).toBeGreaterThan(850);
    expect(silMW).toBeLessThan(1150);
  });

  it('gives textbook values for a 230 kV line', () => {
    const p = lineParameters('drake', 'hv-230-vertical');
    expect(p.xOhmPerKm).toBeGreaterThan(0.28);
    expect(p.xOhmPerKm).toBeLessThan(0.42);
    const { silMW } = surgeImpedance(p, 230);
    expect(silMW).toBeGreaterThan(180);
    expect(silMW).toBeLessThan(400);
  });

  it('reduces reactance as the bundle grows, which is why bundles exist', () => {
    const single = lineParameters('drake', 'hv-115-vertical');
    const bundled = lineParameters('drake', 'hv-230-vertical');
    expect(bundled.dsBundleM).toBeGreaterThan(single.dsBundleM);
  });

  it('computes GMD and bundle radius by the standard formulas', () => {
    expect(geometricMeanDistance([10, 10, 20])).toBeCloseTo(Math.cbrt(2000), 9);
    expect(bundleRadius(0.01, 2, 0.457)).toBeCloseTo(Math.sqrt(0.01 * 0.457), 12);
    expect(bundleRadius(0.01, 3, 0.457)).toBeCloseTo(Math.cbrt(0.01 * 0.457 ** 2), 12);
  });

  it('converts to per-unit on the stated base', () => {
    const p = lineParameters('finch', 'ehv-500-horizontal');
    const pu = lineToPerUnit(p, 100, 500, 100);
    // Z_base = 500²/100 = 2500 Ω
    expect(pu.zBaseOhm).toBeCloseTo(2500, 9);
    expect(pu.r).toBeCloseTo((p.rOhmPerKm * 100) / 2500, 12);
    expect(pu.x).toBeCloseTo((p.xOhmPerKm * 100) / 2500, 12);
    // A 500 kV line's per-unit reactance is small — that is the point of EHV.
    expect(pu.x).toBeLessThan(0.05);
  });
});
