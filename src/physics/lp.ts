/**
 * A small dense linear-programming solver (two-phase simplex, Bland's rule), for
 * the dispatch problems here: tens of variables and constraints.
 *
 *   minimise    cᵀx
 *   subject to  A_ub x ≤ b_ub,   A_eq x = b_eq,   lb ≤ x ≤ ub
 *
 * Returns the optimum and the dual values (shadow prices) of every constraint: the
 * change in the optimal cost per unit increase of that constraint's right-hand
 * side. In a dispatch problem the equality's dual is the system marginal cost and a
 * line limit's dual is what that congestion costs per MW.
 */
export interface LPProblem {
  c: number[];
  Aub?: number[][];
  bub?: number[];
  Aeq?: number[][];
  beq?: number[];
  lb: number[];
  ub: number[];
}

export interface LPResult {
  status: 'optimal' | 'infeasible' | 'unbounded';
  x: number[];
  objective: number;
  /** d(objective)/d(b_ub[i]) (≤ 0 when binding). */
  dualUb: number[];
  /** d(objective)/d(b_eq[i]). */
  dualEq: number[];
}

const EPS = 1e-9;

export function solveLP(p: LPProblem): LPResult {
  const n = p.c.length;
  const Aub = p.Aub ?? [];
  const bub = p.bub ?? [];
  const Aeq = p.Aeq ?? [];
  const beq = p.beq ?? [];
  // Shift x = lb + y, so 0 ≤ y ≤ u.
  const u = p.ub.map((v, i) => v - p.lb[i]!);
  if (u.some((v) => v < -1e-9)) return fail('infeasible', n, Aub.length, Aeq.length);
  const shift = (A: number[][], b: number[]) => b.map((bi, r) => bi - A[r]!.reduce((s, a, j) => s + a * p.lb[j]!, 0));
  const bu = shift(Aub, bub);
  const be = shift(Aeq, beq);

  // Rows: original ≤ rows, variable upper-bound rows, equality rows.
  type Row = { a: number[]; b: number; kind: 'ub' | 'bound' | 'eq'; orig: number };
  const rows: Row[] = [];
  Aub.forEach((a, r) => rows.push({ a: a.slice(), b: bu[r]!, kind: 'ub', orig: r }));
  u.forEach((v, j) => {
    if (Number.isFinite(v)) {
      const a = new Array(n).fill(0);
      a[j] = 1;
      rows.push({ a, b: v, kind: 'bound', orig: j });
    }
  });
  Aeq.forEach((a, r) => rows.push({ a: a.slice(), b: be[r]!, kind: 'eq', orig: r }));
  const m = rows.length;

  // Columns: n structural, one slack per inequality row, one artificial per row that
  // needs it (equalities, and inequalities whose right-hand side is negative).
  const flip = rows.map((r) => r.b < 0);
  const slackCol: number[] = [];
  const artCol: number[] = [];
  let col = n;
  rows.forEach((r) => {
    slackCol.push(r.kind === 'eq' ? -1 : col++);
  });
  rows.forEach((r, i) => {
    artCol.push(r.kind === 'eq' || flip[i] ? col++ : -1);
  });
  const N = col;
  const T: Float64Array[] = [];
  const basis: number[] = [];
  rows.forEach((r, i) => {
    const row = new Float64Array(N + 1);
    const sgn = flip[i] ? -1 : 1;
    for (let j = 0; j < n; j++) row[j] = sgn * r.a[j]!;
    if (slackCol[i]! >= 0) row[slackCol[i]!] = sgn; // slack enters with the row's sign
    if (artCol[i]! >= 0) row[artCol[i]!] = 1;
    row[N] = sgn * r.b;
    T.push(row);
    basis.push(artCol[i]! >= 0 ? artCol[i]! : slackCol[i]!);
  });

  const pivot = (pr: number, pc: number) => {
    const prow = T[pr]!;
    const pv = prow[pc]!;
    for (let j = 0; j <= N; j++) prow[j] = prow[j]! / pv;
    for (let i = 0; i < m; i++) {
      if (i === pr) continue;
      const row = T[i]!;
      const f = row[pc]!;
      if (f === 0) continue;
      for (let j = 0; j <= N; j++) row[j] = row[j]! - f * prow[j]!;
    }
    basis[pr] = pc;
  };

  const run = (cost: Float64Array, allowed: (j: number) => boolean): 'optimal' | 'unbounded' => {
    for (let iter = 0; iter < 5000; iter++) {
      // reduced costs r_j = c_j − c_B·B⁻¹a_j
      let enter = -1;
      for (let j = 0; j < N; j++) {
        if (!allowed(j) || basis.includes(j)) continue;
        let rc = cost[j]!;
        for (let i = 0; i < m; i++) rc -= cost[basis[i]!]! * T[i]![j]!;
        if (rc < -EPS) {
          enter = j; // Bland: lowest index
          break;
        }
      }
      if (enter < 0) return 'optimal';
      let leave = -1;
      let best = Infinity;
      for (let i = 0; i < m; i++) {
        const a = T[i]![enter]!;
        if (a > EPS) {
          const ratio = T[i]![N]! / a;
          if (ratio < best - EPS || (Math.abs(ratio - best) <= EPS && basis[i]! < basis[leave]!)) {
            best = ratio;
            leave = i;
          }
        }
      }
      if (leave < 0) return 'unbounded';
      pivot(leave, enter);
    }
    return 'optimal';
  };

  // Phase 1: minimise the sum of artificials.
  const c1 = new Float64Array(N);
  artCol.forEach((a) => {
    if (a >= 0) c1[a] = 1;
  });
  if (artCol.some((a) => a >= 0)) {
    run(c1, () => true);
    let infeas = 0;
    for (let i = 0; i < m; i++) if (c1[basis[i]!]! > 0) infeas += T[i]![N]!;
    if (infeas > 1e-7) return fail('infeasible', n, Aub.length, Aeq.length);
    // drive remaining (zero-valued) artificials out of the basis where possible
    for (let i = 0; i < m; i++) {
      if (c1[basis[i]!]! === 0) continue;
      for (let j = 0; j < N; j++) {
        if (c1[j]! > 0) continue;
        if (Math.abs(T[i]![j]!) > EPS) {
          pivot(i, j);
          break;
        }
      }
    }
  }
  // Phase 2: the real objective; artificials may not re-enter.
  const c2 = new Float64Array(N);
  for (let j = 0; j < n; j++) c2[j] = p.c[j]!;
  const st = run(c2, (j) => c1[j]! === 0);
  if (st === 'unbounded') return fail('unbounded', n, Aub.length, Aeq.length);

  const y = new Array(N).fill(0);
  for (let i = 0; i < m; i++) y[basis[i]!] = T[i]![N]!;
  const x = p.lb.map((l, j) => l + y[j]!);
  const objective = p.c.reduce((s, cj, j) => s + cj * x[j]!, 0);

  // Duals: π = c_B·B⁻¹ for the rows as they sit in the tableau. Row i's column of
  // B⁻¹ is the final column of the variable that started basic in row i (its slack,
  // or its artificial for equalities and sign-flipped rows: both unit columns). A
  // flipped row is −1 × the original, so its dual changes sign on the way back.
  const dualOfRow = (i: number): number => {
    const j0 = artCol[i]! >= 0 ? artCol[i]! : slackCol[i]!;
    let v = 0;
    for (let k = 0; k < m; k++) v += c2[basis[k]!]! * T[k]![j0]!;
    return flip[i] ? -v : v;
  };
  const dualUb = new Array(Aub.length).fill(0);
  const dualEq = new Array(Aeq.length).fill(0);
  rows.forEach((r, i) => {
    if (r.kind === 'ub') dualUb[r.orig] = dualOfRow(i);
    else if (r.kind === 'eq') dualEq[r.orig] = dualOfRow(i);
  });
  return { status: 'optimal', x, objective, dualUb, dualEq };
}

function fail(status: 'infeasible' | 'unbounded', n: number, mu: number, me: number): LPResult {
  return { status, x: new Array(n).fill(NaN), objective: NaN, dualUb: new Array(mu).fill(0), dualEq: new Array(me).fill(0) };
}
