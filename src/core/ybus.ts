/**
 * Bus admittance matrix (Ybus) construction.
 *
 * Ybus is the network written as a matrix. Entry Y[i][k] for i≠k is minus the
 * admittance directly connecting bus i to bus k; the diagonal Y[i][i] is the
 * sum of every admittance touching bus i. It is the matrix form of Kirchhoff's
 * current law: I = Y·V.
 *
 * Standard notation: Y = G + jB, where G is conductance and B is susceptance.
 */

import { Complex, C, add, inv, mul, conj, div, scale, polar, ZERO } from './complex.js';
import { Branch, NetworkCase, CaseIndex } from './network.js';

/** The four admittance terms of one branch's two-port (pi) model. */
export interface BranchAdmittance {
  /** Self term at the `from` end. */
  yff: Complex;
  /** Transfer term, from→to. */
  yft: Complex;
  /** Transfer term, to→from. */
  ytf: Complex;
  /** Self term at the `to` end. */
  ytt: Complex;
  /** Series admittance y = 1/Z, before any tap is applied. */
  ySeries: Complex;
  /** Complex turns ratio a = tap∠shift. 1∠0° for a plain line. */
  a: Complex;
}

/**
 * Branch pi model with an off-nominal tap on the `from` side.
 *
 * With series admittance y, total charging susceptance B_c split half at each
 * end, and complex turns ratio a = t∠φ:
 *
 *   Yff = (y + jB_c/2) / (a · a*)
 *   Yft = −y / a*
 *   Ytf = −y / a
 *   Ytt =  y + jB_c/2
 *
 * For a plain line a = 1∠0° and this collapses to the textbook pi model.
 */
export function branchAdmittance(br: Branch): BranchAdmittance {
  const z = C(br.r, br.x);
  const ySeries = br.r === 0 && br.x === 0 ? ZERO : inv(z);
  const yShuntHalf = C(0, br.b / 2);
  const t = br.tap && br.tap !== 0 ? br.tap : 1;
  const phi = ((br.shiftDeg ?? 0) * Math.PI) / 180;
  const a = polar(t, phi);
  const aa = mul(a, conj(a)); // |a|², real
  const ytt = add(ySeries, yShuntHalf);
  return {
    yff: div(add(ySeries, yShuntHalf), aa),
    yft: scale(div(ySeries, conj(a)), -1),
    ytf: scale(div(ySeries, a), -1),
    ytt,
    ySeries,
    a,
  };
}

export interface Ybus {
  n: number;
  /** Conductance matrix G, n×n, row-major. */
  G: Float64Array;
  /** Susceptance matrix B, n×n, row-major. */
  B: Float64Array;
  /** Per-branch admittance terms, in the case's branch order. Out-of-service = null. */
  branch: (BranchAdmittance | null)[];
}

export function buildYbus(net: NetworkCase, idx: CaseIndex): Ybus {
  const n = net.buses.length;
  const G = new Float64Array(n * n);
  const B = new Float64Array(n * n);
  const branch: (BranchAdmittance | null)[] = [];

  const addAt = (i: number, k: number, y: Complex) => {
    G[i * n + k] += y.re;
    B[i * n + k] += y.im;
  };

  for (const br of net.branches) {
    if (!br.inService) {
      branch.push(null);
      continue;
    }
    const f = idx.indexOf.get(br.from);
    const t = idx.indexOf.get(br.to);
    if (f === undefined || t === undefined) {
      throw new Error(`branch ${br.id}: unknown bus ${f === undefined ? br.from : br.to}`);
    }
    const ba = branchAdmittance(br);
    addAt(f, f, ba.yff);
    addAt(f, t, ba.yft);
    addAt(t, f, ba.ytf);
    addAt(t, t, ba.ytt);
    branch.push(ba);
  }

  // Fixed bus shunts (from the bus record) and switchable shunt devices.
  net.buses.forEach((b, i) => {
    if (b.gShunt) G[i * n + i] += b.gShunt;
    if (b.bShunt) B[i * n + i] += b.bShunt;
  });
  for (const sh of net.shunts ?? []) {
    if (!sh.inService) continue;
    const i = idx.indexOf.get(sh.bus);
    if (i === undefined) throw new Error(`shunt ${sh.id}: unknown bus ${sh.bus}`);
    // A capacitor rated q MVAr at 1.0 pu contributes B = q / baseMVA per-unit.
    B[i * n + i] += sh.qMVAr / net.baseMVA;
  }

  return { n, G, B, branch };
}

/** Read Y[i][k] as a complex number. */
export const yAt = (y: Ybus, i: number, k: number): Complex =>
  C(y.G[i * y.n + k], y.B[i * y.n + k]);
