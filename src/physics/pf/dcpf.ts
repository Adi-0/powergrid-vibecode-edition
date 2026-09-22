import { SingularMatrixError, solveReal } from '../linalg';
import type { PFCase } from './case';

/**
 * DC power flow: the linear approximation P = B′θ that assumes |V| = 1 everywhere,
 * small angle differences (sin θ ≈ θ, cos θ ≈ 1), and no resistance, so each
 * branch carries P_ft = (θ_f − θ_t − θ_shift) / (x·τ). It ignores reactive power
 * and losses entirely. Used here to show what the approximation gets right and
 * wrong next to the full AC solution.
 */
export interface DCResult {
  ok: boolean;
  va: Float64Array;
  /** Branch flows from → to, per unit. */
  pf: Float64Array;
}

export function solveDC(c: PFCase, pinj: Float64Array, ref: number): DCResult {
  const n = c.buses.length;
  const Bp = new Float64Array(n * n);
  const shiftInj = new Float64Array(n);
  for (const br of c.branches) {
    if (!br.inService) continue;
    const b = 1 / (br.x * br.tap);
    const f = br.from;
    const t = br.to;
    Bp[f * n + f] = Bp[f * n + f]! + b;
    Bp[t * n + t] = Bp[t * n + t]! + b;
    Bp[f * n + t] = Bp[f * n + t]! - b;
    Bp[t * n + f] = Bp[t * n + f]! - b;
    shiftInj[f] = shiftInj[f]! - b * br.shift;
    shiftInj[t] = shiftInj[t]! + b * br.shift;
  }
  const keep = [...Array(n).keys()].filter((i) => i !== ref);
  const m = keep.length;
  const A = new Float64Array(m * m);
  const rhs = new Float64Array(m);
  keep.forEach((i, a) => {
    rhs[a] = pinj[i]! - shiftInj[i]!;
    keep.forEach((k, b) => (A[a * m + b] = Bp[i * n + k]!));
  });
  const va = new Float64Array(n);
  const pf = new Float64Array(c.branches.length);
  try {
    const th = solveReal(A, rhs, m);
    keep.forEach((i, a) => (va[i] = th[a]!));
  } catch (e) {
    if (e instanceof SingularMatrixError) return { ok: false, va, pf };
    throw e;
  }
  c.branches.forEach((br, k) => {
    if (br.inService) pf[k] = (va[br.from]! - va[br.to]! - br.shift) / (br.x * br.tap);
  });
  return { ok: true, va, pf };
}
