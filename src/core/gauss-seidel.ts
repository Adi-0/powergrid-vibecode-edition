/**
 * Gauss–Seidel power flow.
 *
 * This is not the solver the app runs — Newton–Raphson is, because it
 * converges in a handful of iterations instead of hundreds. Gauss–Seidel
 * exists here for two reasons:
 *
 *  1. VALIDATION. It shares no code path with Newton–Raphson: no Jacobian, no
 *     matrix factorisation, a different update rule and a different
 *     convergence behaviour. If both land on the same voltage vector to 1e-6,
 *     that agreement is real evidence the answer is right, independent of any
 *     published reference table.
 *  2. TEACHING. It is the algorithm a person can actually run by hand, and the
 *     app shows it beside Newton–Raphson to make the point that the solution
 *     is a property of the network, not of the method.
 *
 * The update, from I_i = Σ_k Y_ik V_k and S_i = V_i · conj(I_i):
 *
 *   V_i ← (1 / Y_ii) · [ (P_i − jQ_i) / conj(V_i) − Σ_{k≠i} Y_ik V_k ]
 *
 * At a PV bus, Q is not scheduled, so it is computed from the present voltages
 * first, and afterwards the magnitude is forced back to the setpoint.
 */

import { Complex, C, polar, abs, arg, conj, mul, sub, div, add, scale } from './complex.js';
import { NetworkCase, indexCase } from './network.js';
import { buildYbus, yAt } from './ybus.js';
import { scheduledInjections } from './powerflow.js';

export interface GaussSeidelResult {
  converged: boolean;
  iterations: number;
  vm: number[];
  va: number[];
  /** Largest change in complex voltage on the last sweep, per-unit. */
  finalDelta: number;
}

export function solveGaussSeidel(
  net: NetworkCase,
  opts: { tol?: number; maxIterations?: number; accel?: number } = {}
): GaussSeidelResult {
  const tol = opts.tol ?? 1e-12;
  const maxIterations = opts.maxIterations ?? 20000;
  const accel = opts.accel ?? 1.6;
  const idx = indexCase(net);
  const y = buildYbus(net, idx);
  const sched = scheduledInjections(net, idx);
  const n = net.buses.length;

  const V: Complex[] = net.buses.map((b) =>
    b.type === 'PQ' ? C(1, 0) : polar(b.vSched ?? 1, b.thetaSched ?? 0)
  );
  const qMax = new Float64Array(n);
  const qMin = new Float64Array(n);
  for (const g of net.generators) {
    if (!g.inService) continue;
    const i = idx.indexOf.get(g.bus)!;
    qMax[i] += g.qMaxMVAr / net.baseMVA;
    qMin[i] += g.qMinMVAr / net.baseMVA;
  }

  let delta = Infinity;
  let iter = 0;
  for (; iter < maxIterations; iter++) {
    delta = 0;
    for (let i = 0; i < n; i++) {
      const bus = net.buses[i];
      if (bus.type === 'slack') continue;

      // Σ_{k≠i} Y_ik V_k
      let sum = C(0, 0);
      for (let k = 0; k < n; k++) {
        if (k === i) continue;
        const yik = yAt(y, i, k);
        if (yik.re === 0 && yik.im === 0) continue;
        sum = add(sum, mul(yik, V[k]));
      }

      let qi = sched.q[i];
      if (bus.type === 'PV') {
        // Q_i = −Im{ conj(V_i) · Σ_k Y_ik V_k }
        const total = add(sum, mul(yAt(y, i, i), V[i]));
        qi = -mul(conj(V[i]), total).im;
      }

      const yii = yAt(y, i, i);
      const sConj = C(sched.p[i], -qi);
      const vNew = div(sub(div(sConj, conj(V[i])), sum), yii);

      let vAcc = add(V[i], scale(sub(vNew, V[i]), accel));
      if (bus.type === 'PV') {
        // Hold the scheduled magnitude; only the angle is free at a PV bus.
        vAcc = polar(bus.vSched ?? 1, arg(vAcc));
      }
      delta = Math.max(delta, abs(sub(vAcc, V[i])));
      V[i] = vAcc;
    }
    if (delta < tol) break;
  }

  return {
    converged: delta < tol,
    iterations: iter,
    vm: V.map(abs),
    va: V.map(arg),
    finalDelta: delta,
  };
}

