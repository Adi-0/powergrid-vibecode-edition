import { solveReal } from '../physics/linalg';
import { solveLP } from '../physics/lp';
import type { Grid } from './grid';

/**
 * Security-constrained economic dispatch (the network-aware part of dispatch),
 * linearised: the DC approximation of the network through power transfer
 * distribution factors (PTDFs).
 *
 * PTDF_k,i is the fraction of a megawatt injected at bus i (and withdrawn at the
 * reference bus) that flows on branch k. With them, every branch flow is a linear
 * function of the dispatch, so "cheapest dispatch that keeps every branch within
 * its rating" is a linear program. When a limit binds, cheaper power stuck behind
 * it is backed down and dearer power on the far side runs instead: congestion. The
 * price of energy then differs by location — the locational marginal price (LMP),
 * the cost of serving one more MW at that bus.
 */

export interface Ptdf {
  /** rows: branches, cols: buses; zero rows for out-of-service branches. */
  m: Float64Array;
  nb: number;
  nbus: number;
  ref: number;
}

export function computePtdf(grid: Grid, outages: ReadonlySet<number> = new Set()): Ptdf {
  const nbus = grid.buses.length;
  const nb = grid.branches.length;
  const ref = grid.bus(grid.refBus).index;
  const B = new Float64Array(nbus * nbus);
  grid.branches.forEach((br, k) => {
    if (outages.has(k)) return;
    const b = 1 / br.x;
    const f = br.from.index;
    const t = br.to.index;
    B[f * nbus + f] = B[f * nbus + f]! + b;
    B[t * nbus + t] = B[t * nbus + t]! + b;
    B[f * nbus + t] = B[f * nbus + t]! - b;
    B[t * nbus + f] = B[t * nbus + f]! - b;
  });
  // X = B′⁻¹ with the reference row and column removed (zero)
  const keep = [...Array(nbus).keys()].filter((i) => i !== ref);
  const n = keep.length;
  const A = new Float64Array(n * n);
  keep.forEach((i, a) => keep.forEach((j, b) => (A[a * n + b] = B[i * nbus + j]!)));
  const X = new Float64Array(nbus * nbus);
  for (let c = 0; c < n; c++) {
    const e = new Float64Array(n);
    e[c] = 1;
    let col: Float64Array;
    try {
      col = solveReal(A, e, n);
    } catch {
      // islanded: leave zeros (flows into a split network are not meaningful in DC)
      continue;
    }
    for (let r = 0; r < n; r++) X[keep[r]! * nbus + keep[c]!] = col[r]!;
  }
  const m = new Float64Array(nb * nbus);
  grid.branches.forEach((br, k) => {
    if (outages.has(k)) return;
    const f = br.from.index;
    const t = br.to.index;
    for (let i = 0; i < nbus; i++) m[k * nbus + i] = (X[f * nbus + i]! - X[t * nbus + i]!) / br.x;
  });
  return { m, nb, nbus, ref };
}

export interface ScedVariable {
  key: string;
  /** Bus shares of this variable's MW (a plant may sit on several terminal buses). */
  buses: Array<{ bus: number; share: number }>;
  lb: number;
  ub: number;
  cost: number;
  /** Merit-order value, used when no constraint binds. */
  mw: number;
}

export interface ScedResult {
  mw: Map<string, number>;
  /** Locational marginal price per bus, $/MWh. */
  lmp: Float64Array;
  /** System marginal cost (the energy component), $/MWh. */
  energyPrice: number;
  /** Branches whose limit binds, with the shadow price ($/MWh per MW of rating). */
  binding: Array<{ branch: number; shadow: number; flowMW: number; limitMW: number }>;
  /** Flow above the limit the dispatch could not remove, per branch, MW. */
  residualOverload: Map<number, number>;
  redispatched: boolean;
}

/** Share of rating a DC (MW-only) flow may use, leaving room for reactive flow. */
export const DC_LIMIT_FRACTION = 0.92;
const PENALTY = 5000;

/**
 * @param fixedInj  net injection per bus from everything not being dispatched (fixed
 *                  generation minus load minus losses), MW
 */
export function sced(grid: Grid, P: Ptdf, vars: ScedVariable[], fixedInj: Float64Array, outages: ReadonlySet<number> = new Set()): ScedResult {
  const nbus = P.nbus;
  const flowOf = (mw: (v: ScedVariable) => number) => {
    const inj = fixedInj.slice();
    for (const v of vars) for (const b of v.buses) inj[b.bus] = inj[b.bus]! + mw(v) * b.share;
    const f = new Float64Array(P.nb);
    for (let k = 0; k < P.nb; k++) {
      let s = 0;
      for (let i = 0; i < nbus; i++) s += P.m[k * nbus + i]! * inj[i]!;
      f[k] = s;
    }
    return f;
  };
  const limit = (k: number) => grid.branches[k]!.rateMVA * DC_LIMIT_FRACTION;
  const f0 = flowOf((v) => v.mw);
  const monitored = new Set<number>();
  for (let k = 0; k < P.nb; k++) if (!outages.has(k) && Math.abs(f0[k]!) > limit(k)) monitored.add(k);
  const result: ScedResult = {
    mw: new Map(vars.map((v) => [v.key, v.mw])),
    lmp: new Float64Array(nbus),
    energyPrice: 0,
    binding: [],
    residualOverload: new Map(),
    redispatched: false,
  };
  if (monitored.size === 0) return result;

  // Balance: Σ x = −Σ fixedInj (generation meets load and losses)
  const demand = -fixedInj.reduce((a, b) => a + b, 0);
  const colPtdf = (k: number, v: ScedVariable) => v.buses.reduce((s, b) => s + b.share * P.m[k * nbus + b.bus]!, 0);
  const fixedFlow = (k: number) => {
    let s = 0;
    for (let i = 0; i < nbus; i++) s += P.m[k * nbus + i]! * fixedInj[i]!;
    return s;
  };
  let sol: ReturnType<typeof solveLP> | null = null;
  let mon: number[] = [];
  for (let round = 0; round < 8; round++) {
    mon = [...monitored];
    const nv = vars.length;
    const ns = 2 * mon.length;
    const c = [...vars.map((v) => v.cost), ...new Array(ns).fill(PENALTY)];
    const lb = [...vars.map((v) => v.lb), ...new Array(ns).fill(0)];
    const ub = [...vars.map((v) => v.ub), ...new Array(ns).fill(Infinity)];
    const Aeq = [[...new Array(nv).fill(1), ...new Array(ns).fill(0)]];
    const Aub: number[][] = [];
    const bub: number[] = [];
    mon.forEach((k, j) => {
      const row = vars.map((v) => colPtdf(k, v));
      const pos = [...row, ...new Array(ns).fill(0)];
      pos[nv + 2 * j] = -1;
      Aub.push(pos);
      bub.push(limit(k) - fixedFlow(k));
      const neg = [...row.map((a) => -a), ...new Array(ns).fill(0)];
      neg[nv + 2 * j + 1] = -1;
      Aub.push(neg);
      bub.push(limit(k) + fixedFlow(k));
    });
    sol = solveLP({ c, Aeq, beq: [demand], Aub, bub, lb, ub });
    if (sol.status !== 'optimal') return result;
    const f = flowOf((v) => sol!.x[vars.indexOf(v)]!);
    let added = false;
    for (let k = 0; k < P.nb; k++) {
      if (outages.has(k) || monitored.has(k)) continue;
      if (Math.abs(f[k]!) > limit(k) + 1e-6) {
        monitored.add(k);
        added = true;
      }
    }
    if (!added) break;
  }
  if (!sol || sol.status !== 'optimal') return result;
  vars.forEach((v, j) => result.mw.set(v.key, sol!.x[j]!));
  result.redispatched = true;
  const lam = sol.dualEq[0]!;
  result.energyPrice = lam;
  // LMP_i = λ + Σ_k (μ⁺_k − μ⁻_k)·PTDF_k,i, with μ from d(cost)/d(limit) ≤ 0
  const f = flowOf((v) => result.mw.get(v.key)!);
  for (let i = 0; i < nbus; i++) {
    let p = lam;
    mon.forEach((k, j) => {
      p += sol!.dualUb[2 * j]! * P.m[k * nbus + i]!;
      p -= sol!.dualUb[2 * j + 1]! * P.m[k * nbus + i]!;
    });
    result.lmp[i] = p;
  }
  mon.forEach((k, j) => {
    const mu = sol!.dualUb[2 * j]! + sol!.dualUb[2 * j + 1]!;
    if (Math.abs(mu) > 1e-6) result.binding.push({ branch: k, shadow: -mu, flowMW: f[k]!, limitMW: limit(k) });
    const over = Math.abs(f[k]!) - limit(k);
    if (over > 1e-3) result.residualOverload.set(k, over);
  });
  return result;
}
