import { describe, expect, it } from 'vitest';
import { ampacity, conductorTemperature, heatBalance, sagAt, solarFluxClear, type ThermalConductor, type ThermalWeather } from '../src/physics/ieee738';

/**
 * IEEE 738's worked example: a 795 kcmil 26/7 ACSR "Drake" conductor at 100 °C, in 40 °C
 * air, a 0.61 m/s wind across it, emissivity and absorptivity 0.8, at sea level, an
 * east–west line at 30° N at 11:00 solar time on 10 June (the sun at 74.8° altitude,
 * 114° azimuth), clear atmosphere. The standard's answer is a steady-state ampacity of
 * about 1025 A, from a convective loss of about 81.9 W/m, radiated 39.1 W/m and solar
 * gain 22.4 W/m, with a resistance of 9.39 × 10⁻⁵ Ω/m at 100 °C.
 */
const drake: ThermalConductor = { D: 0.02814, rLo: 7.283e-5, tLo: 25, rHi: 8.688e-5, tHi: 75, absorptivity: 0.8, emissivity: 0.8 };
const weather: ThermalWeather = { Ta: 40, windMs: 0.61, windAngleDeg: 90, elevationM: 0, sunAltDeg: 74.8, sunAzDeg: 114, lineAzDeg: 90 };

describe('IEEE 738 heat balance', () => {
  it('reproduces the standard example’s terms', () => {
    const b = heatBalance(drake, weather, 100, 0);
    expect(b.R).toBeCloseTo(9.39e-5, 7);
    expect(b.qc).toBeGreaterThan(81.9 * 0.995);
    expect(b.qc).toBeLessThan(81.9 * 1.005 + 0.2);
    expect(b.qr).toBeCloseTo(39.1, 0);
    expect(b.qs).toBeCloseTo(22.4, 0);
  });

  it('reproduces the standard example’s ampacity, about 1025 A', () => {
    const I = ampacity(drake, weather, 100);
    expect(Math.abs(I - 1025) / 1025).toBeLessThan(0.005);
  });

  it('inverts: the temperature at that current is 100 °C, and the balance closes', () => {
    const I = ampacity(drake, weather, 100);
    const r = conductorTemperature(drake, weather, I);
    expect(r.Ts).toBeCloseTo(100, 3);
    expect(Math.abs(r.residual)).toBeLessThan(1e-6);
  });

  it('runs hotter in still air, cooler in a breeze, and at air temperature with no current and no sun', () => {
    const I = 800;
    const still = conductorTemperature(drake, { ...weather, windMs: 0 }, I).Ts;
    const breeze = conductorTemperature(drake, { ...weather, windMs: 3 }, I).Ts;
    const mid = conductorTemperature(drake, weather, I).Ts;
    expect(still).toBeGreaterThan(mid);
    expect(breeze).toBeLessThan(mid);
    expect(conductorTemperature(drake, { ...weather, sunAltDeg: -10 }, 0).Ts).toBeCloseTo(40, 3);
  });

  it('has a clear-sky flux near 1000 W/m² with the sun overhead, and none below the horizon', () => {
    expect(solarFluxClear(90)).toBeGreaterThan(1000);
    expect(solarFluxClear(90)).toBeLessThan(1080);
    expect(solarFluxClear(-5)).toBe(0);
  });
});

describe('sag by change of state', () => {
  const m = { S: 300, w: 1.628 * 9.81, A: 468.5e-6, E: 74e9, alpha: 18.9e-6, T0: 15, H0: 0.2 * 140e3 };
  it('gives the reference sag at the reference temperature', () => {
    const D0 = (m.w * m.S * m.S) / (8 * m.H0);
    expect(sagAt(m, 15).D).toBeCloseTo(D0, 4);
  });
  it('sags more as it heats, and less than thermal growth alone would give (the tension relaxes)', () => {
    const a = sagAt(m, 15);
    const b = sagAt(m, 100);
    expect(b.D).toBeGreaterThan(a.D);
    // with no elasticity: D from the thermally grown length alone
    const Lgrown = a.L * (1 + m.alpha * 85);
    const Dthermal = Math.sqrt((3 * m.S * (Lgrown - m.S)) / 8);
    expect(b.D).toBeLessThan(Dthermal);
    expect(b.H).toBeLessThan(a.H);
  });
});
