import { RK4 } from './rk4';

/**
 * A single machine on an infinite bus (SMIB), classical model: a constant voltage E′
 * behind the transient reactance X′_d, swinging against a bus whose voltage V and
 * frequency nothing can move. Its electrical power is P_e = (E′V / X) sin δ, where X is
 * the transfer reactance between the two, and δ the rotor angle of E′ ahead of V.
 *
 * Swing equation (Kundur; Glover, Overbye & Sarma), per unit on the machine base:
 *
 *   (2H / ω_s) d²δ/dt² = P_m − P_e(δ)        ω_s = 2π f₀ rad/s
 *
 * A three-phase fault changes X, so P_max = E′V / X, in three stages: before, during
 * and after (the faulted circuit switched out). The equal-area criterion finds the
 * critical clearing angle δ_cr in closed form; the critical clearing time needs the
 * fault-on trajectory, which is closed form only when nothing is transferred during
 * the fault (P_max,during = 0), and otherwise is integrated.
 */
export interface SmibCase {
  /** Inertia constant, s (machine base). */
  H: number;
  f0: number;
  /** Mechanical power, pu. */
  Pm: number;
  /** Maximum electrical power before, during and after the fault, pu. */
  Pmax1: number;
  Pmax2: number;
  Pmax3: number;
}

export interface EqualArea {
  /** Pre-fault operating angle, rad. */
  delta0: number;
  /** Largest angle the machine can swing to after clearing and still return, rad. */
  deltaMax: number;
  /** Critical clearing angle, rad. */
  deltaCr: number;
  /** Closed-form critical clearing time, s — only when P_max,during = 0. */
  tcrClosed: number | null;
}

/** Equal-area criterion: angles in radians. Null when the case has no stable pre- or post-fault point. */
export function equalArea(c: SmibCase): EqualArea | null {
  if (c.Pm >= c.Pmax1 || c.Pm >= c.Pmax3) return null;
  const delta0 = Math.asin(c.Pm / c.Pmax1);
  const deltaMax = Math.PI - Math.asin(c.Pm / c.Pmax3);
  // A1 (accelerating, during the fault) = A2 (decelerating, after clearing):
  // cos δ_cr = [P_m(δ_max − δ₀) + P3 cos δ_max − P2 cos δ₀] / (P3 − P2)
  const cosCr = (c.Pm * (deltaMax - delta0) + c.Pmax3 * Math.cos(deltaMax) - c.Pmax2 * Math.cos(delta0)) / (c.Pmax3 - c.Pmax2);
  if (cosCr > 1) return { delta0, deltaMax, deltaCr: delta0, tcrClosed: 0 };
  if (cosCr < -1) return null;
  const deltaCr = Math.acos(cosCr);
  const ws = 2 * Math.PI * c.f0;
  // With P_e = 0 during the fault, δ(t) = δ₀ + (ω_s P_m / 4H) t²
  const tcrClosed = c.Pmax2 === 0 ? Math.sqrt((4 * c.H * (deltaCr - delta0)) / (ws * c.Pm)) : null;
  return { delta0, deltaMax, deltaCr, tcrClosed };
}

/** Fixed integration step for the swing equation, s. */
export const SMIB_STEP = 0.0005;

export interface SwingRun {
  t: Float64Array;
  /** Rotor angle, rad. */
  delta: Float64Array;
  /** Speed deviation Δω, rad/s. */
  dw: Float64Array;
  /** First swing turned back (stable) — or the angle passed δ_max (lost synchronism). */
  stable: boolean;
  /** Largest angle reached, rad. */
  peak: number;
}

/** Fault at t = 0, cleared at tc; integrate to tEnd with fixed-step RK4. */
export function swing(c: SmibCase, tc: number, tEnd = 3, h = SMIB_STEP, every = 1): SwingRun {
  const ea = equalArea(c);
  const delta0 = ea ? ea.delta0 : Math.asin(Math.min(1, c.Pm / c.Pmax1));
  const deltaMax = ea ? ea.deltaMax : Math.PI;
  const ws = 2 * Math.PI * c.f0;
  const M = (2 * c.H) / ws;
  let pmax = c.Pmax2;
  const rk = new RK4(2, h, (_t, x, dx) => {
    dx[0] = x[1]!;
    dx[1] = (c.Pm - pmax * Math.sin(x[0]!)) / M;
  });
  const x = Float64Array.of(delta0, 0);
  const n = Math.ceil(tEnd / h);
  const nc = Math.round(tc / h);
  const T: number[] = [0];
  const D: number[] = [delta0];
  const W: number[] = [0];
  let stable = true;
  let peak = delta0;
  let turned = false;
  for (let k = 0; k < n; k++) {
    pmax = k < nc ? c.Pmax2 : c.Pmax3;
    rk.step(k * h, x);
    peak = Math.max(peak, x[0]!);
    if (!turned && k >= nc && x[1]! <= 0) turned = true;
    if (!turned && x[0]! > deltaMax) {
      stable = false;
      turned = true;
    }
    if ((k + 1) % every === 0) {
      T.push((k + 1) * h);
      D.push(x[0]!);
      W.push(x[1]!);
    }
  }
  return { t: Float64Array.from(T), delta: Float64Array.from(D), dw: Float64Array.from(W), stable, peak };
}

/** Time for the fault-on trajectory to reach angle δ (the critical clearing time when δ = δ_cr). */
export function timeToAngle(c: SmibCase, delta: number, h = SMIB_STEP): number {
  const ea = equalArea(c);
  const ws = 2 * Math.PI * c.f0;
  const M = (2 * c.H) / ws;
  const rk = new RK4(2, h, (_t, x, dx) => {
    dx[0] = x[1]!;
    dx[1] = (c.Pm - c.Pmax2 * Math.sin(x[0]!)) / M;
  });
  const x = Float64Array.of(ea ? ea.delta0 : 0, 0);
  let t = 0;
  for (;;) {
    const d0 = x[0]!;
    const w0 = x[1]!;
    rk.step(t, x);
    if (x[0]! >= delta) {
      // cubic Hermite between the two steps, solved for the crossing by bisection
      const d1 = x[0]!;
      const w1 = x[1]!;
      let a = 0;
      let b = 1;
      for (let i = 0; i < 60; i++) {
        const s = (a + b) / 2;
        const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
        const h10 = s ** 3 - 2 * s ** 2 + s;
        const h01 = -2 * s ** 3 + 3 * s ** 2;
        const h11 = s ** 3 - s ** 2;
        const v = h00 * d0 + h10 * h * w0 + h01 * d1 + h11 * h * w1;
        if (v < delta) a = s;
        else b = s;
      }
      return t + ((a + b) / 2) * h;
    }
    t += h;
    if (t > 10) return Infinity;
  }
}

/** Critical clearing time by simulation: bisection on the clearing time until stable/unstable meet. */
export function criticalClearingTime(c: SmibCase, tol = 1e-5): number {
  let lo = 0;
  let hi = 2;
  if (swing(c, hi, 4).stable) return Infinity;
  while (hi - lo > tol) {
    const mid = (lo + hi) / 2;
    if (swing(c, mid, 4).stable) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
