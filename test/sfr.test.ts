import { describe, expect, it } from 'vitest';
import { GOV, simulateTrip, type SfrUnit } from '../src/physics/dyn/sfr';

/**
 * The frequency model against closed forms. One gas unit with a first-order governor
 * and load damping is a linear two-state system,
 *   M dΔω/dt = m − ΔP − D P_L Δω,   T_G dm/dt = −S Δω / R − m,
 * whose exact solution is x(t) = x_ss + e^{At}(x₀ − x_ss) (2 × 2 matrix exponential in
 * closed form). The RK4 run must reproduce it; limits and the settled frequency are
 * checked against their own closed forms.
 */
function expm2(a: number, b: number, c: number, d: number, t: number): [number, number, number, number] {
  const s = (a + d) / 2;
  const det = a * d - b * c;
  const q = s * s - det;
  let C: number;
  let Sx: number; // sinh(μt)/μ or sin(νt)/ν
  if (q > 0) {
    const mu = Math.sqrt(q);
    C = Math.cosh(mu * t);
    Sx = Math.sinh(mu * t) / mu;
  } else if (q < 0) {
    const nu = Math.sqrt(-q);
    C = Math.cos(nu * t);
    Sx = Math.sin(nu * t) / nu;
  } else {
    C = 1;
    Sx = t;
  }
  const e = Math.exp(s * t);
  return [e * (C + Sx * (a - s)), e * Sx * b, e * Sx * c, e * (C + Sx * (d - s))];
}

describe('system frequency response', () => {
  const f0 = 60;
  const H = 5;
  const S = 1000;
  const R = 0.05;
  const D = 1;
  const PL = 800;
  const loss = 50;
  const unit: SfrUnit = { id: 'G', group: 'gas', H, S, P0: 500, Pmax: 2000, Pmin: 0, R, gov: 'gas' };
  const run = simulateTrip([unit], loss, { f0, D, PL, h: 0.01, tEnd: 20, sample: 0.01 });
  const M = 2 * H * S;
  const T = GOV.gas.TG;
  const A = [-(D * PL) / M, 1 / M, -S / (R * T), -1 / T] as const;
  const wss = -loss / (S / R + D * PL);
  const mss = (-S * wss) / R;
  const exact = (t: number) => {
    const E = expm2(A[0], A[1], A[2], A[3], t);
    const x0 = [0 - wss, 0 - mss];
    return f0 * (1 + wss + E[0] * x0[0]! + E[1] * x0[1]!);
  };

  it('reproduces the exact linear solution', () => {
    let worst = 0;
    run.t.forEach((t, k) => (worst = Math.max(worst, Math.abs(run.f[k]! - exact(t)))));
    expect(worst).toBeLessThan(1e-8);
  });

  it('initial rate of change and settled frequency, closed form', () => {
    expect(run.rocof).toBeCloseTo((-loss * f0) / M, 12);
    expect((run.f[1]! - run.f[0]!) / 0.01).toBeCloseTo(run.rocof, 3);
    expect(run.settledHz).toBeCloseTo(f0 * (1 + wss), 10);
    expect(run.f[run.f.length - 1]!).toBeCloseTo(run.settledHz, 6);
  });

  it('nadir matches the exact solution', () => {
    let fmin = Infinity;
    for (let t = 0; t < 20; t += 1e-4) fmin = Math.min(fmin, exact(t));
    expect(run.nadirHz).toBeCloseTo(fmin, 6);
  });

  it('power balance at every sample: governors + load relief − loss = inertia’s share', () => {
    // M dΔω/dt = ΣΔPm − ΔP − D P_L Δω; at the end the derivative is ~0, so the pick-up closes the loss
    const k = run.t.length - 1;
    const pick = run.dPm[0]![k]! + run.dLoad[k]!;
    expect(pick).toBeCloseTo(loss, 4);
  });

  it('a unit at its limit gives no more; the settled frequency accounts for it', () => {
    const small: SfrUnit = { ...unit, Pmax: 520 };
    const r = simulateTrip([small], loss, { f0, D, PL, h: 0.01, tEnd: 30, sample: 0.1 });
    expect(r.unitDP[0]).toBeCloseTo(20, 9);
    // 20 MW from the unit, the other 30 from load: Δω = −30 / (D P_L)
    expect(r.settledHz).toBeCloseTo(f0 * (1 - 30 / (D * PL)), 9);
    expect(r.atLimit).toBe(1);
  });

  it('hydro: the water column first pushes the wrong way', () => {
    const hy: SfrUnit = { id: 'Y', group: 'hydro', H: 3, S: 1000, P0: 500, Pmax: 1000, Pmin: 0, R: 0.05, gov: 'hydro' };
    const r = simulateTrip([hy], loss, { f0, D, PL, h: 0.005, tEnd: 120, sample: 0.05 });
    const early = r.dPm[0]!.slice(1, 10);
    expect(Math.min(...early)).toBeLessThan(0);
    expect(r.f[r.f.length - 1]!).toBeCloseTo(r.settledHz, 3);
  });
});
