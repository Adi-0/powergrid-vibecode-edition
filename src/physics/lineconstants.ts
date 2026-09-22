import { Complex } from './complex';
import { CMatrix } from './linalg';
import { CONDUCTORS, type ConductorId } from '../data/conductors';

/**
 * Overhead line constants from conductor data and geometry.
 *
 * Series impedance: Kersting's modified Carson's equations, which give the
 * self and mutual impedance of conductors with the earth as return path
 * (earth resistivity ρ, frequency f), in Ω/mile with distances in feet:
 *
 *   z_ii = r_i + 0.00158836·f + j·0.00202237·f·( ln(1/GMR_i) + 7.6786 + ½·ln(ρ/f) )
 *   z_ij =       0.00158836·f + j·0.00202237·f·( ln(1/D_ij)  + 7.6786 + ½·ln(ρ/f) )
 *
 * The primitive matrix includes neutrals and shield wires; Kron reduction folds
 * them into the phase conductors (they are grounded, so their voltage is zero):
 *
 *   Z_abc = Z_ij − Z_in · Z_nn⁻¹ · Z_nj
 *
 * Shunt admittance: potential coefficients with image conductors below ground,
 * P_ii = 11.17689·ln(S_ii / RD_i), P_ij = 11.17689·ln(S_ij / D_ij) mile/µF,
 * Kron-reduced the same way, inverted to C_abc, and y_abc = j·ω·C_abc.
 *
 * Bundled phases are replaced by an equivalent conductor with bundle GMR
 * (GMR·A^(n−1)·n)^(1/n)-style formulas and resistance r/n.
 */

export interface WirePosition {
  /** Horizontal position, m. */
  x: number;
  /** Height above ground (average, accounting for sag), m. */
  y: number;
  conductor: ConductorId;
  role: 'phase' | 'neutral' | 'shield';
  /** Subconductors per phase and their spacing, m. */
  bundle?: { n: 2 | 3 | 4; spacing: number };
  /** Label for the phase ("a", "b", "c") or neutral. */
  label: string;
}

export interface LineConstants {
  /** Phase impedance matrix after Kron reduction, Ω/km. Rows/cols in phase order given. */
  zabc: CMatrix;
  /** Phase shunt admittance matrix, S/km (j·ω·C). */
  yabc: CMatrix;
  /** Same, Ω/mile and µS/mile, as the distribution literature tabulates them. */
  zabcPerMile: CMatrix;
  yabcPerMile_uS: CMatrix;
  phases: string[];
  /**
   * Sequence values assuming a transposed line (average self and mutual terms):
   * Z1 = Z2 = Zs − Zm, Z0 = Zs + 2·Zm. Ω/km and S/km.
   */
  z1: Complex;
  z0: Complex;
  y1: Complex;
  y0: Complex;
  /** Phase conductor ampacity (bundle total), A. */
  ampacity: number;
}

const FT_PER_M = 1 / 0.3048;
const KM_PER_MI = 1.609344;

function gmrBundle(gmrFt: number, b?: { n: number; spacing: number }): number {
  if (!b) return gmrFt;
  const d = b.spacing * FT_PER_M;
  if (b.n === 2) return Math.sqrt(gmrFt * d);
  if (b.n === 3) return Math.cbrt(gmrFt * d * d);
  return 1.0905 * Math.pow(gmrFt * d * d * d, 0.25);
}

export function lineConstants(wires: readonly WirePosition[], rho = 100, f = 60): LineConstants {
  const n = wires.length;
  const zp = new CMatrix(n, n);
  const pp = new Float64Array(n * n);
  const re0 = 0.00158836 * f;
  const xk = 0.00202237 * f;
  const cst = 7.6786 + 0.5 * Math.log(rho / f);
  const pos = wires.map((w) => ({ x: w.x * FT_PER_M, y: w.y * FT_PER_M }));
  for (let i = 0; i < n; i++) {
    const wi = wires[i]!;
    const ci = CONDUCTORS[wi.conductor];
    const nb = wi.bundle?.n ?? 1;
    const gmr = gmrBundle(ci.gmr_ft, wi.bundle);
    const radiusFt = gmrBundle(ci.diameter_in / 24, wi.bundle); // equivalent radius for charge
    for (let j = 0; j < n; j++) {
      const pi = pos[i]!;
      const pj = pos[j]!;
      if (i === j) {
        zp.set(i, i, new Complex(ci.r_ohm_per_mi / nb + re0, xk * (Math.log(1 / gmr) + cst)));
        pp[i * n + i] = 11.17689 * Math.log((2 * pi.y) / radiusFt);
      } else {
        const D = Math.hypot(pi.x - pj.x, pi.y - pj.y);
        const S = Math.hypot(pi.x - pj.x, pi.y + pj.y);
        zp.set(i, j, new Complex(re0, xk * (Math.log(1 / D) + cst)));
        pp[i * n + j] = 11.17689 * Math.log(S / D);
      }
    }
  }
  const ph = wires.map((w, i) => (w.role === 'phase' ? i : -1)).filter((i) => i >= 0);
  const gn = wires.map((w, i) => (w.role !== 'phase' ? i : -1)).filter((i) => i >= 0);
  const zabc = kron(zp, ph, gn);
  // potential coefficients are real; reduce as complex with zero imaginary part
  const pc = new CMatrix(n, n);
  for (let k = 0; k < n * n; k++) pc.re[k] = pp[k]!;
  const pabc = kron(pc, ph, gn);
  const cabc = pabc.inverse(); // µF/mile
  const w = 2 * Math.PI * f;
  const yPerMile = cabc.scale(new Complex(0, w)); // µS/mile
  const zPerKm = zabc.scale(new Complex(1 / KM_PER_MI, 0));
  const yPerKm = yPerMile.scale(new Complex(1e-6 / KM_PER_MI, 0));

  const m = ph.length;
  const avg = (M: CMatrix) => {
    let s = Complex.ZERO;
    let mm = Complex.ZERO;
    let ns = 0;
    let nm = 0;
    for (let i = 0; i < m; i++)
      for (let j = 0; j < m; j++) {
        if (i === j) {
          s = s.add(M.get(i, j));
          ns++;
        } else {
          mm = mm.add(M.get(i, j));
          nm++;
        }
      }
    return { s: s.scale(1 / ns), m: nm ? mm.scale(1 / nm) : Complex.ZERO };
  };
  const za = avg(zPerKm);
  const ya = avg(yPerKm);
  const lead = wires[ph[0]!]!;
  const amp = CONDUCTORS[lead.conductor].ampacity_a * (lead.bundle?.n ?? 1);
  return {
    zabc: zPerKm,
    yabc: yPerKm,
    zabcPerMile: zabc,
    yabcPerMile_uS: yPerMile,
    phases: ph.map((i) => wires[i]!.label),
    z1: za.s.sub(za.m),
    z0: za.s.add(za.m.scale(2)),
    y1: ya.s.sub(ya.m),
    y0: ya.s.add(ya.m.scale(2)),
    ampacity: amp,
  };
}

/** Kron reduction: eliminate the rows/columns in `elim`, keeping `keep`. */
export function kron(M: CMatrix, keep: number[], elim: number[]): CMatrix {
  const k = keep.length;
  const out = new CMatrix(k, k);
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) out.set(a, b, M.get(keep[a]!, keep[b]!));
  if (!elim.length) return out;
  const e = elim.length;
  const Znn = new CMatrix(e, e);
  for (let a = 0; a < e; a++) for (let b = 0; b < e; b++) Znn.set(a, b, M.get(elim[a]!, elim[b]!));
  const inv = Znn.inverse();
  for (let a = 0; a < k; a++)
    for (let b = 0; b < k; b++) {
      let s = Complex.ZERO;
      for (let p = 0; p < e; p++)
        for (let q = 0; q < e; q++) s = s.add(M.get(keep[a]!, elim[p]!).mul(inv.get(p, q)).mul(M.get(elim[q]!, keep[b]!)));
      out.set(a, b, out.get(a, b).sub(s));
    }
  return out;
}

/** Surge impedance Z_c = √(z/y) (Ω) and surge impedance loading SIL = V²/Z_c (MW, V in kV LL). */
export function surge(z1PerKm: Complex, y1PerKm: Complex, kvLL: number): { zc: number; sil: number } {
  const zc = z1PerKm.div(y1PerKm).sqrt().abs();
  return { zc, sil: (kvLL * kvLL) / zc };
}

/**
 * Practical loadability as a multiple of SIL versus line length (the St. Clair
 * curve, as extended by Dunlop, Gutman & Marchenko). Points read from the curve;
 * an estimate of its shape, interpolated linearly in length.
 */
const ST_CLAIR: ReadonlyArray<[number, number]> = [
  [0, 3.0],
  [80, 3.0],
  [160, 2.0],
  [240, 1.6],
  [320, 1.3],
  [480, 1.0],
  [640, 0.8],
  [960, 0.65],
];

export function stClairMultiple(lengthKm: number): number {
  for (let i = 1; i < ST_CLAIR.length; i++) {
    const [x1, y1] = ST_CLAIR[i]!;
    const [x0, y0] = ST_CLAIR[i - 1]!;
    if (lengthKm <= x1) return y0 + ((y1 - y0) * (lengthKm - x0)) / (x1 - x0);
  }
  return ST_CLAIR[ST_CLAIR.length - 1]![1];
}
