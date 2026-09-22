import { Complex } from '../complex';
import { CMatrix } from '../linalg';
import type { PFBranch, PFCase } from './case';

/**
 * The bus admittance matrix, Ybus: I = Ybus · V, where I is the vector of currents
 * injected into each bus and V the vector of bus voltages (per unit).
 *
 * Each branch is a π model: series admittance y_s = 1/(R + jX) with half the
 * line-charging susceptance jB/2 at each end, and an ideal transformer of complex
 * ratio t = τ·e^{jθ_shift} at the from end. Its 2×2 contribution is
 *
 *   [I_f]   [ (y_s + jB/2)/|t|²   −y_s/t* ] [V_f]
 *   [I_t] = [ −y_s/t              y_s + jB/2 ] [V_t]
 *
 * (MATPOWER's convention). Bus shunts add G + jB on the diagonal.
 */
export interface BranchAdmittance {
  yff: Complex;
  yft: Complex;
  ytf: Complex;
  ytt: Complex;
}

export function branchAdmittance(br: PFBranch): BranchAdmittance {
  if (!br.inService) return { yff: Complex.ZERO, yft: Complex.ZERO, ytf: Complex.ZERO, ytt: Complex.ZERO };
  const ys = new Complex(br.r, br.x).inv();
  const half = new Complex(0, br.b / 2);
  const t = Complex.polar(br.tap, br.shift);
  const ytt = ys.add(half);
  return {
    yff: ytt.scale(1 / (br.tap * br.tap)),
    yft: ys.neg().div(t.conj()),
    ytf: ys.neg().div(t),
    ytt,
  };
}

export function buildYbus(c: PFCase): CMatrix {
  const n = c.buses.length;
  const Y = new CMatrix(n, n);
  for (const br of c.branches) {
    if (!br.inService) continue;
    const a = branchAdmittance(br);
    Y.addAt(br.from, br.from, a.yff);
    Y.addAt(br.from, br.to, a.yft);
    Y.addAt(br.to, br.from, a.ytf);
    Y.addAt(br.to, br.to, a.ytt);
  }
  c.buses.forEach((b, i) => {
    if (b.gs !== 0 || b.bs !== 0) Y.addAt(i, i, new Complex(b.gs, b.bs));
  });
  return Y;
}
