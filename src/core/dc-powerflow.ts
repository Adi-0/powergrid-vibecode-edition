/**
 * DC power flow — the linear approximation.
 *
 * The full AC power flow is nonlinear and can fail to have any solution at all.
 * The DC power flow is what you get by making three approximations that are
 * roughly true on a high-voltage network:
 *
 *   1. Every voltage magnitude is exactly 1.0 per-unit.
 *   2. Line resistance is negligible beside reactance (true at EHV: X/R ≈ 20).
 *   3. Angle differences are small, so sin δ ≈ δ and cos δ ≈ 1.
 *
 * Under those, the real power on a branch becomes simply
 *
 *   P_ik = (θ_i − θ_k) / X_ik
 *
 * and the whole system reduces to one linear equation, P = B'·θ, which always
 * has a solution. It gets real power flows roughly right, says nothing at all
 * about voltage or reactive power, and reports no losses — because by
 * assumption 2 there are none.
 *
 * Two uses here. It is the honest first answer to "why does power flow that
 * way?", because it shows that flow is set by angle difference divided by
 * reactance and nothing else. And it is a feasibility check: if the DC flows
 * are already far beyond a corridor's rating, no AC solution exists either, and
 * the network needs reinforcing rather than a better solver.
 */

import { NetworkCase, indexCase } from './network.js';
import { zeros, mset, mget, luSolve } from './linalg.js';

export interface DCResult {
  /** Bus angles in radians, slack at its scheduled value. */
  theta: number[];
  busOrder: string[];
  /** Real power on each branch, MW, positive from→to. */
  branchMW: number[];
  branchIds: string[];
  /** Loading as a fraction of the normal rating. */
  loading: number[];
  /** Real power the slack bus must supply, MW. */
  slackMW: number;
}

export function solveDCPowerFlow(net: NetworkCase): DCResult {
  const idx = indexCase(net);
  const n = net.buses.length;
  const slack = idx.slackIndex;

  // B' matrix: off-diagonal −1/x, diagonal the sum of the 1/x touching the bus.
  const B = zeros(n, n);
  for (const br of net.branches) {
    if (!br.inService || br.x === 0) continue;
    const f = idx.indexOf.get(br.from)!;
    const t = idx.indexOf.get(br.to)!;
    const b = 1 / br.x;
    mset(B, f, f, mget(B, f, f) + b);
    mset(B, t, t, mget(B, t, t) + b);
    mset(B, f, t, mget(B, f, t) - b);
    mset(B, t, f, mget(B, t, f) - b);
  }

  // Net injection per bus, per-unit.
  const p = new Float64Array(n);
  for (const g of net.generators) {
    if (!g.inService) continue;
    p[idx.indexOf.get(g.bus)!] += g.pMW / net.baseMVA;
  }
  for (const l of net.loads) p[idx.indexOf.get(l.bus)!] -= l.pMW / net.baseMVA;

  // Delete the slack row and column; its angle is the reference.
  const m = n - 1;
  const keep: number[] = [];
  for (let i = 0; i < n; i++) if (i !== slack) keep.push(i);
  const Br = zeros(m, m);
  const pr = new Float64Array(m);
  for (let a = 0; a < m; a++) {
    pr[a] = p[keep[a]];
    for (let b = 0; b < m; b++) mset(Br, a, b, mget(B, keep[a], keep[b]));
  }

  const x = luSolve(Br, pr);
  const theta = new Array<number>(n).fill(net.buses[slack].thetaSched ?? 0);
  keep.forEach((i, a) => (theta[i] = x[a]));

  const branchMW: number[] = [];
  const branchIds: string[] = [];
  const loading: number[] = [];
  for (const br of net.branches) {
    branchIds.push(br.id);
    if (!br.inService || br.x === 0) {
      branchMW.push(0);
      loading.push(0);
      continue;
    }
    const f = idx.indexOf.get(br.from)!;
    const t = idx.indexOf.get(br.to)!;
    const mw = ((theta[f] - theta[t]) / br.x) * net.baseMVA;
    branchMW.push(mw);
    loading.push(br.ratingMVA > 0 ? Math.abs(mw) / br.ratingMVA : 0);
  }

  // The slack supplies whatever the rest of the network does not.
  let slackMW = 0;
  for (let k = 0; k < net.branches.length; k++) {
    const br = net.branches[k];
    if (!br.inService) continue;
    if (idx.indexOf.get(br.from) === slack) slackMW += branchMW[k];
    if (idx.indexOf.get(br.to) === slack) slackMW -= branchMW[k];
  }

  return { theta, busOrder: idx.order, branchMW, branchIds, loading, slackMW };
}
