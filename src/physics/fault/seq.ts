import { Complex, c, A_OP, A2_OP, DEG } from '../complex';
import { CMatrix } from '../linalg';

/**
 * Faults by symmetrical components (Fortescue; Grainger & Stevenson; Glover, Overbye &
 * Sarma). A balanced network splits into three uncoupled sequence networks —
 * positive (1), negative (2) and zero (0) — each with its own bus admittance matrix.
 * A fault couples them only at the faulted bus, in a pattern set by the fault type:
 *
 *   three-phase (3φ)       I₁ = V_f / (Z₁ + Z_f),                 I₂ = I₀ = 0
 *   single line-to-ground  I₁ = I₂ = I₀ = V_f / (Z₁ + Z₂ + Z₀ + 3Z_f)
 *   line-to-line (b–c)     I₁ = −I₂ = V_f / (Z₁ + Z₂ + Z_f),      I₀ = 0
 *   double line-to-ground  I₁ = V_f / (Z₁ + Z₂ ∥ (Z₀ + 3Z_f)),
 *                          I₂ = −I₁ (Z₀ + 3Z_f)/(Z₂ + Z₀ + 3Z_f), I₀ = −I₁ Z₂/(Z₂ + Z₀ + 3Z_f)
 *
 * with Z₁, Z₂, Z₀ the Thevenin impedances at the faulted bus (the diagonal of each
 * sequence Z_bus) and V_f the pre-fault voltage there. Phase quantities from
 * [I_a I_b I_c]ᵀ = A [I₀ I₁ I₂]ᵀ, A = [[1,1,1],[1,a²,a],[1,a,a²]], a = 1∠120°.
 * Every other bus's voltage change is ΔV_i = −Z_ik I_k in each sequence (superposition).
 *
 * Transformers carry zero-sequence current only where their windings allow it:
 *   Yg–Yg  a series path, as for positive sequence;
 *   Yg–Δ   a path from the grounded-wye side to ground through the leakage impedance;
 *          the delta side sees an open circuit (the current circulates in the delta);
 *   any ungrounded wye, or Δ–Δ: open.
 * A neutral impedance Z_n appears as 3Z_n in the zero-sequence network. Δ–Y and Y–Δ
 * banks shift positive sequence by +30° from the low-voltage side to the high (ANSI
 * convention: high side leads) and negative sequence by −30°.
 */
export type Winding = 'Yg' | 'Y' | 'D';

export interface SeqBranch {
  from: number;
  to: number;
  /** Series impedance, positive (= negative) and zero sequence, pu. */
  z1: Complex;
  z0: Complex;
  /** Total shunt charging, pu (split half at each end), positive and zero sequence. */
  b1?: number;
  b0?: number;
  /** A transformer: its windings (from side, to side) and neutral impedances, pu. */
  xfmr?: { from: Winding; to: Winding; znFrom?: Complex; znTo?: Complex };
  inService?: boolean;
}

/** A source behind its sequence impedances (a generator, a grid equivalent). */
export interface SeqSource {
  bus: number;
  z1: Complex;
  z2: Complex;
  /** Zero-sequence impedance to ground (including 3Z_n); null if no path (ungrounded or behind a delta). */
  z0: Complex | null;
}

export interface SeqNetwork {
  n: number;
  branches: SeqBranch[];
  sources: SeqSource[];
  /**
   * Zero-sequence paths to ground that exist in no other sequence: a delta tertiary
   * seen from its transformer's star point (the three-winding T equivalent).
   */
  zeroShunts?: Array<{ bus: number; z: Complex }>;
}

export type FaultType = '3ph' | 'slg' | 'll' | 'dlg';

/** ANSI phase shift of a transformer's to-side positive-sequence voltage relative to its from side, degrees. */
function shiftDeg(x: NonNullable<SeqBranch['xfmr']>, hvFrom: boolean): number {
  const dy = (x.from === 'D') !== (x.to === 'D');
  if (!dy) return 0;
  // high side leads the low side by 30°: to-side angle relative to from-side
  return hvFrom ? -30 : 30;
}

export interface Ybus {
  y1: CMatrix;
  y2: CMatrix;
  y0: CMatrix;
}

/**
 * Sequence admittance matrices. `hvFrom[k]` says whether branch k's from end is its
 * high-voltage side (for the phase shift of a Δ–Y bank).
 */
export function buildYbus(net: SeqNetwork, hvFrom: (k: number) => boolean = () => true): Ybus {
  const y1 = new CMatrix(net.n, net.n);
  const y2 = new CMatrix(net.n, net.n);
  const y0 = new CMatrix(net.n, net.n);
  net.branches.forEach((b, k) => {
    if (b.inService === false) return;
    const i = b.from;
    const j = b.to;
    const ys1 = b.z1.inv();
    // positive and negative sequence: series admittance with the bank's phase shift
    const sh = b.xfmr ? shiftDeg(b.xfmr, hvFrom(k)) : 0;
    for (const [Y, sgn] of [
      [y1, 1],
      [y2, -1],
    ] as const) {
      const t = Complex.polarDeg(1, -sgn * sh); // V_from = t · V_to across the ideal phase shifter
      Y.addAt(i, i, ys1);
      Y.addAt(j, j, ys1);
      Y.addAt(i, j, ys1.neg().div(t.conj()));
      Y.addAt(j, i, ys1.neg().div(t));
      if (b.b1) {
        const half = c(0, b.b1 / 2);
        Y.addAt(i, i, half);
        Y.addAt(j, j, half);
      }
    }
    // zero sequence
    if (!b.xfmr) {
      const ys0 = b.z0.inv();
      y0.addAt(i, i, ys0);
      y0.addAt(j, j, ys0);
      y0.addAt(i, j, ys0.neg());
      y0.addAt(j, i, ys0.neg());
      if (b.b0) {
        const half = c(0, b.b0 / 2);
        y0.addAt(i, i, half);
        y0.addAt(j, j, half);
      }
      return;
    }
    const x = b.xfmr;
    const zf = x.znFrom ? x.znFrom.scale(3) : Complex.ZERO;
    const zt = x.znTo ? x.znTo.scale(3) : Complex.ZERO;
    if (x.from === 'Yg' && x.to === 'Yg') {
      const ys0 = b.z0.add(zf).add(zt).inv();
      y0.addAt(i, i, ys0);
      y0.addAt(j, j, ys0);
      y0.addAt(i, j, ys0.neg());
      y0.addAt(j, i, ys0.neg());
    } else if (x.from === 'Yg' && x.to === 'D') {
      y0.addAt(i, i, b.z0.add(zf).inv());
    } else if (x.from === 'D' && x.to === 'Yg') {
      y0.addAt(j, j, b.z0.add(zt).inv());
    }
    // any other combination: no zero-sequence path through or to ground
  });
  for (const z of net.zeroShunts ?? []) y0.addAt(z.bus, z.bus, z.z.inv());
  for (const s of net.sources) {
    y1.addAt(s.bus, s.bus, s.z1.inv());
    y2.addAt(s.bus, s.bus, s.z2.inv());
    if (s.z0) y0.addAt(s.bus, s.bus, s.z0.inv());
  }
  return { y1, y2, y0 };
}

export interface FaultResult {
  type: FaultType;
  bus: number;
  /** Thevenin impedances at the faulted bus, pu. */
  z1: Complex;
  z2: Complex;
  z0: Complex;
  /** Sequence currents into the fault, pu. */
  i0: Complex;
  i1: Complex;
  i2: Complex;
  /** Phase currents into the fault, pu. */
  ia: Complex;
  ib: Complex;
  ic: Complex;
  /** Every bus's sequence voltages during the fault, pu. */
  v0: Complex[];
  v1: Complex[];
  v2: Complex[];
  /** Columns of the sequence Z_bus at the faulted bus (for branch currents). */
  zc1: Complex[];
  zc2: Complex[];
  zc0: Complex[];
}

/**
 * LU factorisation of a complex matrix (partial pivoting) on typed arrays: factor once
 * per network, then each Z_bus column is a forward and back substitution.
 */
export class CLU {
  readonly n: number;
  private re: Float64Array;
  private im: Float64Array;
  private piv: Int32Array;
  readonly singular: boolean = false;

  constructor(M: CMatrix) {
    const n = M.rows;
    this.n = n;
    const re = new Float64Array(n * n);
    const im = new Float64Array(n * n);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const v = M.get(i, j);
        re[i * n + j] = v.re;
        im[i * n + j] = v.im;
      }
    const piv = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      let p = k;
      let best = -1;
      for (let i = k; i < n; i++) {
        const m = re[i * n + k]! ** 2 + im[i * n + k]! ** 2;
        if (m > best) (best = m), (p = i);
      }
      piv[k] = p;
      if (best <= 1e-300) {
        (this as { singular: boolean }).singular = true;
        continue;
      }
      if (p !== k)
        for (let j = 0; j < n; j++) {
          const a = k * n + j;
          const b = p * n + j;
          [re[a], re[b]] = [re[b]!, re[a]!];
          [im[a], im[b]] = [im[b]!, im[a]!];
        }
      const dr = re[k * n + k]!;
      const di = im[k * n + k]!;
      const dd = dr * dr + di * di;
      for (let i = k + 1; i < n; i++) {
        const ar = re[i * n + k]!;
        const ai = im[i * n + k]!;
        if (ar === 0 && ai === 0) continue;
        // l = a / d
        const lr = (ar * dr + ai * di) / dd;
        const li = (ai * dr - ar * di) / dd;
        re[i * n + k] = lr;
        im[i * n + k] = li;
        for (let j = k + 1; j < n; j++) {
          const ur = re[k * n + j]!;
          const ui = im[k * n + j]!;
          if (ur === 0 && ui === 0) continue;
          re[i * n + j] = re[i * n + j]! - (lr * ur - li * ui);
          im[i * n + j] = im[i * n + j]! - (lr * ui + li * ur);
        }
      }
    }
    this.re = re;
    this.im = im;
    this.piv = piv;
  }

  /** Solve for a right-hand side (real and imaginary parts), returning complex values. */
  solve(bre: Float64Array, bim: Float64Array): Complex[] {
    const { n, re, im, piv } = this;
    const xr = Float64Array.from(bre);
    const xi = Float64Array.from(bim);
    for (let k = 0; k < n; k++) {
      const p = piv[k]!;
      if (p !== k) {
        [xr[k], xr[p]] = [xr[p]!, xr[k]!];
        [xi[k], xi[p]] = [xi[p]!, xi[k]!];
      }
    }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < i; j++) {
        const lr = re[i * n + j]!;
        const li = im[i * n + j]!;
        xr[i] = xr[i]! - (lr * xr[j]! - li * xi[j]!);
        xi[i] = xi[i]! - (lr * xi[j]! + li * xr[j]!);
      }
    for (let i = n - 1; i >= 0; i--) {
      let sr = xr[i]!;
      let si = xi[i]!;
      for (let j = i + 1; j < n; j++) {
        const ur = re[i * n + j]!;
        const ui = im[i * n + j]!;
        sr -= ur * xr[j]! - ui * xi[j]!;
        si -= ur * xi[j]! + ui * xr[j]!;
      }
      const dr = re[i * n + i]!;
      const di = im[i * n + i]!;
      const dd = dr * dr + di * di;
      xr[i] = (sr * dr + si * di) / dd;
      xi[i] = (si * dr - sr * di) / dd;
    }
    return Array.from(xr, (r, i) => new Complex(r, xi[i]!));
  }

  column(k: number): Complex[] {
    const bre = new Float64Array(this.n);
    bre[k] = 1;
    return this.solve(bre, new Float64Array(this.n));
  }
}

/** Factored sequence networks: what every fault on the network needs. */
export interface Factored {
  lu1: CLU;
  lu2: CLU;
  lu0: CLU;
}

export function factor(y: Ybus): Factored {
  return { lu1: new CLU(y.y1), lu2: new CLU(y.y2), lu0: new CLU(regularise(y.y0)) };
}

/** Column k of Z_bus: solve Y z = e_k. A bus with no path to ground in a sequence gives an infinite Thevenin impedance. */
function zcol(Y: CMatrix, k: number): Complex[] | null {
  const e = Array.from({ length: Y.rows }, (_, i) => (i === k ? Complex.ONE : Complex.ZERO));
  try {
    return Y.solve(e);
  } catch {
    return null;
  }
}

/**
 * Zero sequence can have parts with no path to ground at all (a bus behind a delta, an
 * island of ungrounded windings). A negligible admittance to ground on every bus
 * (10⁻⁹ pu, a gigohm-scale impedance) keeps Y solvable; such a part then shows a Z₀ of
 * order 10⁹ pu, which is read as no path.
 */
function regularise(Y: CMatrix): CMatrix {
  const out = Y.clone();
  for (let i = 0; i < out.rows; i++) out.addAt(i, i, c(1e-9, 0));
  return out;
}

export function fault(y: Ybus | Factored, bus: number, type: FaultType, vpre: Complex[], zf: Complex = Complex.ZERO): FaultResult {
  const n = vpre.length;
  const f = 'lu1' in y ? y : null;
  const zc1 = f ? f.lu1.column(bus) : zcol((y as Ybus).y1, bus)!;
  const zc2 = f ? f.lu2.column(bus) : zcol((y as Ybus).y2, bus)!;
  // a zero-sequence network may have islands with no path to ground; they carry no zero-sequence current
  const zc0 = f ? f.lu0.column(bus) : (zcol(regularise((y as Ybus).y0), bus) ?? Array.from({ length: n }, () => Complex.ZERO));
  const z1 = zc1[bus]!;
  const z2 = zc2[bus]!;
  let z0 = zc0[bus]!;
  if (z0.abs() > 1e6) z0 = c(Infinity, 0);
  const vf = vpre[bus]!;
  let i0 = Complex.ZERO;
  let i1 = Complex.ZERO;
  let i2 = Complex.ZERO;
  switch (type) {
    case '3ph':
      i1 = vf.div(z1.add(zf));
      break;
    case 'slg': {
      if (!Number.isFinite(z0.re)) break;
      i1 = vf.div(z1.add(z2).add(z0).add(zf.scale(3)));
      i2 = i1;
      i0 = i1;
      break;
    }
    case 'll':
      i1 = vf.div(z1.add(z2).add(zf));
      i2 = i1.neg();
      break;
    case 'dlg': {
      const z0f = Number.isFinite(z0.re) ? z0.add(zf.scale(3)) : null;
      if (!z0f) {
        // no zero-sequence path: a double line-to-ground fault is a line-to-line fault
        i1 = vf.div(z1.add(z2));
        i2 = i1.neg();
        break;
      }
      const par = z2.mul(z0f).div(z2.add(z0f));
      i1 = vf.div(z1.add(par));
      i2 = i1.neg().mul(z0f).div(z2.add(z0f));
      i0 = i1.neg().mul(z2).div(z2.add(z0f));
      break;
    }
  }
  const ia = i0.add(i1).add(i2);
  const ib = i0.add(A2_OP.mul(i1)).add(A_OP.mul(i2));
  const ic = i0.add(A_OP.mul(i1)).add(A2_OP.mul(i2));
  const v1 = vpre.map((v, i) => v.sub(zc1[i]!.mul(i1)));
  const v2 = zc2.map((z) => z.mul(i2).neg());
  const v0 = zc0.map((z) => z.mul(i0).neg());
  return { type, bus, z1, z2, z0, i0, i1, i2, ia, ib, ic, v0, v1, v2, zc1, zc2, zc0 };
}

/** Phase voltages from sequence voltages: [V_a V_b V_c] = A [V₀ V₁ V₂]. */
export function phaseOf(v0: Complex, v1: Complex, v2: Complex): [Complex, Complex, Complex] {
  return [v0.add(v1).add(v2), v0.add(A2_OP.mul(v1)).add(A_OP.mul(v2)), v0.add(A_OP.mul(v1)).add(A2_OP.mul(v2))];
}

/** Sequence current in a branch during the fault, from→to, pu (series element only). */
export function branchSeqCurrent(b: SeqBranch, v: Complex[], seq: 0 | 1 | 2, hvFrom = true): Complex {
  const vi = v[b.from]!;
  const vj = v[b.to]!;
  if (seq === 0) {
    if (!b.xfmr) return vi.sub(vj).div(b.z0);
    const x = b.xfmr;
    if (x.from === 'Yg' && x.to === 'Yg') return vi.sub(vj).div(b.z0.add((x.znFrom ?? Complex.ZERO).scale(3)).add((x.znTo ?? Complex.ZERO).scale(3)));
    if (x.from === 'Yg' && x.to === 'D') return vi.div(b.z0.add((x.znFrom ?? Complex.ZERO).scale(3)));
    return Complex.ZERO;
  }
  const sh = b.xfmr ? shiftDeg(b.xfmr, hvFrom) : 0;
  const t = Complex.polarDeg(1, -(seq === 1 ? 1 : -1) * sh);
  // current into the series element from the from-side, referred to the from side
  return vi.sub(vj.mul(t)).div(b.z1);
}

export { DEG };
