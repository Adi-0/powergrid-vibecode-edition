import { Complex } from './complex';

/**
 * Dense linear algebra. The networks here are small (tens to low hundreds of
 * unknowns), so dense LU with partial pivoting solves in well under a millisecond
 * and keeps every step inspectable.
 */

export class SingularMatrixError extends Error {
  constructor(readonly column: number) {
    super(`matrix is singular (no usable pivot in column ${column})`);
  }
}

/** Solve A x = b in place for a dense row-major n×n real matrix. Returns x. */
export function solveReal(A: Float64Array, b: Float64Array, n: number): Float64Array {
  const a = A.slice();
  const x = b.slice();
  const piv = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    let p = k;
    let max = Math.abs(a[k * n + k]!);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i * n + k]!);
      if (v > max) {
        max = v;
        p = i;
      }
    }
    if (!(max > 1e-14)) throw new SingularMatrixError(k);
    piv[k] = p;
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const t = a[k * n + j]!;
        a[k * n + j] = a[p * n + j]!;
        a[p * n + j] = t;
      }
      const t = x[k]!;
      x[k] = x[p]!;
      x[p] = t;
    }
    const akk = a[k * n + k]!;
    for (let i = k + 1; i < n; i++) {
      const f = a[i * n + k]! / akk;
      if (f === 0) continue;
      a[i * n + k] = f;
      for (let j = k + 1; j < n; j++) a[i * n + j] = a[i * n + j]! - f * a[k * n + j]!;
      x[i] = x[i]! - f * x[k]!;
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i]!;
    for (let j = i + 1; j < n; j++) s -= a[i * n + j]! * x[j]!;
    x[i] = s / a[i * n + i]!;
  }
  return x;
}

/** Dense complex matrix, row-major, separate real and imaginary planes. */
export class CMatrix {
  readonly re: Float64Array;
  readonly im: Float64Array;
  constructor(
    readonly rows: number,
    readonly cols: number,
  ) {
    this.re = new Float64Array(rows * cols);
    this.im = new Float64Array(rows * cols);
  }
  static from(rows: Complex[][]): CMatrix {
    const m = new CMatrix(rows.length, rows[0]?.length ?? 0);
    rows.forEach((r, i) => r.forEach((v, j) => m.set(i, j, v)));
    return m;
  }
  static identity(n: number): CMatrix {
    const m = new CMatrix(n, n);
    for (let i = 0; i < n; i++) m.re[i * n + i] = 1;
    return m;
  }
  get(i: number, j: number): Complex {
    const k = i * this.cols + j;
    return new Complex(this.re[k]!, this.im[k]!);
  }
  set(i: number, j: number, v: Complex): void {
    const k = i * this.cols + j;
    this.re[k] = v.re;
    this.im[k] = v.im;
  }
  addAt(i: number, j: number, v: Complex): void {
    const k = i * this.cols + j;
    this.re[k] = this.re[k]! + v.re;
    this.im[k] = this.im[k]! + v.im;
  }
  clone(): CMatrix {
    const m = new CMatrix(this.rows, this.cols);
    m.re.set(this.re);
    m.im.set(this.im);
    return m;
  }
  mul(o: CMatrix): CMatrix {
    const m = new CMatrix(this.rows, o.cols);
    for (let i = 0; i < this.rows; i++)
      for (let k = 0; k < this.cols; k++) {
        const ar = this.re[i * this.cols + k]!;
        const ai = this.im[i * this.cols + k]!;
        if (ar === 0 && ai === 0) continue;
        for (let j = 0; j < o.cols; j++) {
          const br = o.re[k * o.cols + j]!;
          const bi = o.im[k * o.cols + j]!;
          m.re[i * o.cols + j] = m.re[i * o.cols + j]! + ar * br - ai * bi;
          m.im[i * o.cols + j] = m.im[i * o.cols + j]! + ar * bi + ai * br;
        }
      }
    return m;
  }
  mulVec(v: readonly Complex[]): Complex[] {
    const out: Complex[] = [];
    for (let i = 0; i < this.rows; i++) {
      let r = 0;
      let im = 0;
      for (let j = 0; j < this.cols; j++) {
        const ar = this.re[i * this.cols + j]!;
        const ai = this.im[i * this.cols + j]!;
        const x = v[j]!;
        r += ar * x.re - ai * x.im;
        im += ar * x.im + ai * x.re;
      }
      out.push(new Complex(r, im));
    }
    return out;
  }
  add(o: CMatrix): CMatrix {
    const m = this.clone();
    for (let k = 0; k < m.re.length; k++) {
      m.re[k] = m.re[k]! + o.re[k]!;
      m.im[k] = m.im[k]! + o.im[k]!;
    }
    return m;
  }
  sub(o: CMatrix): CMatrix {
    const m = this.clone();
    for (let k = 0; k < m.re.length; k++) {
      m.re[k] = m.re[k]! - o.re[k]!;
      m.im[k] = m.im[k]! - o.im[k]!;
    }
    return m;
  }
  scale(s: Complex): CMatrix {
    const m = new CMatrix(this.rows, this.cols);
    for (let k = 0; k < m.re.length; k++) {
      const r = this.re[k]!;
      const i = this.im[k]!;
      m.re[k] = r * s.re - i * s.im;
      m.im[k] = r * s.im + i * s.re;
    }
    return m;
  }
  /** Inverse by Gauss–Jordan with partial pivoting. */
  inverse(): CMatrix {
    const n = this.rows;
    const a = this.clone();
    const inv = CMatrix.identity(n);
    for (let k = 0; k < n; k++) {
      let p = k;
      let max = a.get(k, k).abs();
      for (let i = k + 1; i < n; i++) {
        const v = a.get(i, k).abs();
        if (v > max) {
          max = v;
          p = i;
        }
      }
      if (!(max > 1e-14)) throw new SingularMatrixError(k);
      if (p !== k) {
        swapRows(a, k, p);
        swapRows(inv, k, p);
      }
      const d = a.get(k, k).inv();
      for (let j = 0; j < n; j++) {
        a.set(k, j, a.get(k, j).mul(d));
        inv.set(k, j, inv.get(k, j).mul(d));
      }
      for (let i = 0; i < n; i++) {
        if (i === k) continue;
        const f = a.get(i, k);
        if (f.re === 0 && f.im === 0) continue;
        for (let j = 0; j < n; j++) {
          a.set(i, j, a.get(i, j).sub(f.mul(a.get(k, j))));
          inv.set(i, j, inv.get(i, j).sub(f.mul(inv.get(k, j))));
        }
      }
    }
    return inv;
  }
  /** Solve A x = b. */
  solve(b: readonly Complex[]): Complex[] {
    return this.inverse().mulVec(b);
  }
  toArray(): Complex[][] {
    const out: Complex[][] = [];
    for (let i = 0; i < this.rows; i++) {
      const r: Complex[] = [];
      for (let j = 0; j < this.cols; j++) r.push(this.get(i, j));
      out.push(r);
    }
    return out;
  }
}

function swapRows(m: CMatrix, a: number, b: number): void {
  for (let j = 0; j < m.cols; j++) {
    const ka = a * m.cols + j;
    const kb = b * m.cols + j;
    let t = m.re[ka]!;
    m.re[ka] = m.re[kb]!;
    m.re[kb] = t;
    t = m.im[ka]!;
    m.im[ka] = m.im[kb]!;
    m.im[kb] = t;
  }
}
