/**
 * Dense linear algebra, just enough for the power-flow Jacobian.
 *
 * The networks here are small (tens to low hundreds of buses), so a dense LU
 * factorisation with partial pivoting solves in well under a millisecond. A
 * sparse solver would be faster and much harder to read; readability wins here
 * because the point of the project is that the arithmetic is inspectable.
 */

export interface Matrix {
  rows: number;
  cols: number;
  /** Row-major data. */
  a: Float64Array;
}

export const zeros = (rows: number, cols: number): Matrix => ({
  rows,
  cols,
  a: new Float64Array(rows * cols),
});

export const mget = (m: Matrix, i: number, j: number): number => m.a[i * m.cols + j];
export const mset = (m: Matrix, i: number, j: number, v: number): void => {
  m.a[i * m.cols + j] = v;
};

export class SingularMatrixError extends Error {
  constructor(public readonly pivotRow: number) {
    super(`Jacobian is singular at pivot ${pivotRow}. The network is probably ` +
      `split into disconnected islands, or a bus has no path to the slack.`);
    this.name = 'SingularMatrixError';
  }
}

/**
 * Solve A·x = b by LU decomposition with partial pivoting.
 * `A` is consumed (factored in place); pass a copy if you still need it.
 */
export function luSolve(A: Matrix, b: Float64Array): Float64Array {
  const n = A.rows;
  if (A.cols !== n) throw new Error('luSolve: matrix must be square');
  if (b.length !== n) throw new Error('luSolve: dimension mismatch');
  const a = A.a;
  const perm = new Int32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;

  for (let k = 0; k < n; k++) {
    // Partial pivot: find the largest magnitude in column k at or below row k.
    let piv = k;
    let best = Math.abs(a[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i * n + k]);
      if (v > best) {
        best = v;
        piv = i;
      }
    }
    if (best < 1e-14) throw new SingularMatrixError(k);
    if (piv !== k) {
      for (let j = 0; j < n; j++) {
        const t = a[k * n + j];
        a[k * n + j] = a[piv * n + j];
        a[piv * n + j] = t;
      }
      const tp = perm[k];
      perm[k] = perm[piv];
      perm[piv] = tp;
    }
    const akk = a[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = a[i * n + k] / akk;
      a[i * n + k] = f;
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) a[i * n + j] -= f * a[k * n + j];
    }
  }

  // Forward substitution on the permuted right-hand side.
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[perm[i]];
    for (let j = 0; j < i; j++) s -= a[i * n + j] * y[j];
    y[i] = s;
  }
  // Back substitution.
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let j = i + 1; j < n; j++) s -= a[i * n + j] * x[j];
    x[i] = s / a[i * n + i];
  }
  return x;
}

export const copyMatrix = (m: Matrix): Matrix => ({
  rows: m.rows,
  cols: m.cols,
  a: new Float64Array(m.a),
});

export const infNorm = (v: Float64Array): number => {
  let m = 0;
  for (let i = 0; i < v.length; i++) {
    const x = Math.abs(v[i]);
    if (x > m) m = x;
  }
  return m;
};
