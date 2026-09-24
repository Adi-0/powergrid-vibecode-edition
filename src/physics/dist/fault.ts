import { Complex, A_OP, A2_OP } from '../complex';
import { CMatrix } from '../linalg';
import type { DBranch, DistNetwork, Phase } from './network';

/**
 * Faults on a radial feeder, phase by phase (Kersting's approach): the Thevenin
 * impedance matrix at a node is the source's, referred to the feeder, plus every
 * series phase-impedance matrix on the way (switches, fuses and reclosers add nothing;
 * a step regulator is taken at neutral tap). Load is neglected, as is standard.
 *
 * With Z_th (3×3, Ω) and the pre-fault phase voltages V at the node:
 *   a ground fault on phases F (one, two or three) through Z_f:   (Z_FF + Z_f·I) I_F = V_F
 *   a line-to-line fault between p and q:  I_p = −I_q = (V_p − V_q) / (Z_pp + Z_qq − Z_pq − Z_qp + Z_f)
 * Every series device between the source and the fault carries the fault current.
 */
export type FeederFaultKind = 'slg' | 'll' | 'dlg' | '3ph';

/** The branches from `start` down to `node`, in order; null if there is no closed path or it crosses a transformer. */
export function pathBetween(net: DistNetwork, start: string, node: string): DBranch[] | null {
  const parent = new Map<string, DBranch>();
  for (const b of net.branches) parent.set(b.to, b);
  const path: DBranch[] = [];
  for (let n = node; n !== start; ) {
    const b = parent.get(n);
    if (!b) return null;
    if (b.kind === 'switch' && !b.closed) return null;
    if (b.kind === 'transformer' || b.kind === 'centertap') return null;
    path.unshift(b);
    n = b.from;
  }
  return path;
}

/** Thevenin phase-impedance matrix at `node`, given the source's matrix at `start`. */
export function theveninAt(net: DistNetwork, start: string, zStart: CMatrix, node: string): CMatrix | null {
  const path = pathBetween(net, start, node);
  if (!path) return null;
  let Z = zStart.clone();
  for (const b of path) if (b.kind === 'line') Z = Z.add(b.Z);
  return Z;
}

/** Sequence impedances → a phase matrix: Z_abc = A diag(Z₀, Z₁, Z₂) A⁻¹. */
export function phaseFromSeq(z0: Complex, z1: Complex, z2: Complex): CMatrix {
  const A = CMatrix.from([
    [Complex.ONE, Complex.ONE, Complex.ONE],
    [Complex.ONE, A2_OP, A_OP],
    [Complex.ONE, A_OP, A2_OP],
  ]);
  const D = CMatrix.from([
    [z0, Complex.ZERO, Complex.ZERO],
    [Complex.ZERO, z1, Complex.ZERO],
    [Complex.ZERO, Complex.ZERO, z2],
  ]);
  return A.mul(D).mul(A.inverse());
}

/**
 * Fault currents into the fault, per phase (a, b, c), amperes, for a fault on the
 * given phases of a node whose Thevenin matrix is Z and pre-fault voltages V.
 */
export function feederFault(Z: CMatrix, V: readonly Complex[], kind: FeederFaultKind, on: Phase[], zf: Complex = Complex.ZERO): [Complex, Complex, Complex] {
  const I: [Complex, Complex, Complex] = [Complex.ZERO, Complex.ZERO, Complex.ZERO];
  if (kind === 'll') {
    const [p, q] = on as [Phase, Phase];
    const den = Z.get(p, p).add(Z.get(q, q)).sub(Z.get(p, q)).sub(Z.get(q, p)).add(zf);
    const ip = V[p]!.sub(V[q]!).div(den);
    I[p] = ip;
    I[q] = ip.neg();
    return I;
  }
  const n = on.length;
  const M = new CMatrix(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M.set(i, j, Z.get(on[i]!, on[j]!).add(i === j ? zf : Complex.ZERO));
  const x = M.solve(on.map((p) => V[p]!));
  on.forEach((p, i) => (I[p] = x[i]!));
  return I;
}
