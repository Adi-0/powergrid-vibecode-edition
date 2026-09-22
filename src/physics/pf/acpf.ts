import { SingularMatrixError, solveReal } from '../linalg';
import type { PFCase } from './case';
import { buildYbus } from './ybus';
import { islands as findIslands } from './topology';

/**
 * AC power flow by Newton–Raphson in polar coordinates, positive sequence.
 *
 * Unknowns: the voltage angle θ at every bus except the angle reference, the
 * voltage magnitude |V| at every PQ bus, and — with distributed slack — the
 * single number λ, the total imbalance that the participating generators pick up
 * in proportion to their participation factors k_g (Σk = 1).
 *
 * Equations: the power mismatch at each bus,
 *     ΔP_i = P_i(V, θ) − (Σ_g (P_g + k_g λ) − P_d,i)
 *     ΔQ_i = Q_i(V, θ) − (Σ_g Q_g − Q_d,i)            (PQ buses only)
 * with P_i = |V_i| Σ_k |V_k| (G_ik cos θ_ik + B_ik sin θ_ik),
 *      Q_i = |V_i| Σ_k |V_k| (G_ik sin θ_ik − B_ik cos θ_ik).
 *
 * With a single slack bus (the textbook simplification) the reference bus has no
 * P equation and its generator takes up the whole imbalance; with distributed slack
 * every bus has a P equation and λ closes the system, which is how a real grid
 * shares a change among governors.
 *
 * Failure is a result, not an exception: islands without a source, generation
 * that cannot cover load within limits, and a Newton iteration that does not
 * converge (typically past the nose of the P–V curve: voltage collapse) each come
 * back as a status with the physical reason.
 */

export type PFStatus =
  | 'converged'
  | 'no-source' // an island with load but no in-service generator
  | 'insufficient-generation' // governors ran out of headroom before balance
  | 'excess-generation' // units at minimum and still too much generation
  | 'max-iterations' // Newton did not settle
  | 'diverged' // mismatch grew without bound: no operating point near here
  | 'singular'; // Jacobian singular: at or beyond the nose of the P–V curve

export interface PFOptions {
  slack: 'single' | 'distributed';
  enforceQLimits: boolean;
  enforcePLimits: boolean;
  /** Convergence tolerance on the largest mismatch, per unit. */
  tol: number;
  maxIter: number;
  /** Keep a snapshot of every Newton iteration (for showing convergence). */
  record: boolean;
  /** Warm start from a previous solution (global bus indexing). */
  initial?: { vm: Float64Array; va: Float64Array };
  /**
   * Without a warm start: 'flat' (every |V| = 1, every θ = 0 — the textbook start) or
   * 'dc' (angles from the DC power flow; far more robust on heavily loaded, long lines).
   */
  start?: 'flat' | 'dc';
}

export const DEFAULT_PF: PFOptions = {
  slack: 'distributed',
  enforceQLimits: true,
  enforcePLimits: true,
  tol: 1e-9,
  maxIter: 30,
  record: false,
};

export interface PFIteration {
  k: number;
  /** Largest |ΔP| or |ΔQ| over all equations, per unit. */
  maxMismatch: number;
  worstBus: number;
  worstKind: 'P' | 'Q';
  lambda: number;
  vm: Float64Array;
  va: Float64Array;
}

export interface IslandResult {
  buses: number[];
  status: PFStatus;
  refBus: number;
  /** Total imbalance picked up by participating units, per unit. */
  lambda: number;
  iterations: PFIteration[];
  /** Newton iterations taken in total (across limit-handling passes). */
  newtonIterations: number;
  /** Generators pinned at a P or Q limit during the solve. */
  pinnedP: number[];
  pinnedQ: number[];
  /** Why there is no solution, in plain language, when status ≠ converged. */
  reason?: string;
}

export interface PFResult {
  status: PFStatus;
  vm: Float64Array;
  va: Float64Array;
  /** Per-generator output, per unit (generator reference). */
  pg: Float64Array;
  qg: Float64Array;
  /** Calculated bus injections P_i, Q_i (net: generation − load), per unit. */
  pinj: Float64Array;
  qinj: Float64Array;
  energized: Uint8Array;
  islands: IslandResult[];
  /** Participation factor actually used for each generator (0 if pinned). */
  kUsed: Float64Array;
  /** Largest final mismatch over all islands that converged, per unit. */
  maxMismatch: number;
}

export function solveAC(c: PFCase, options: Partial<PFOptions> = {}): PFResult {
  const opts: PFOptions = { ...DEFAULT_PF, ...options };
  const n = c.buses.length;
  const Y = buildYbus(c);
  const res: PFResult = {
    status: 'converged',
    vm: new Float64Array(n),
    va: new Float64Array(n),
    pg: new Float64Array(c.gens.length),
    qg: new Float64Array(c.gens.length),
    pinj: new Float64Array(n),
    qinj: new Float64Array(n),
    energized: new Uint8Array(n),
    islands: [],
    kUsed: new Float64Array(c.gens.length),
    maxMismatch: 0,
  };
  const rank: Record<PFStatus, number> = {
    converged: 0,
    'no-source': 1,
    'excess-generation': 2,
    'insufficient-generation': 3,
    'max-iterations': 4,
    singular: 5,
    diverged: 6,
  };
  for (const isl of findIslands(c)) {
    const r = solveIsland(c, Y.re, Y.im, isl, opts, res);
    res.islands.push(r);
    if (rank[r.status] > rank[res.status]) res.status = r.status;
  }
  return res;
}

function solveIsland(
  c: PFCase,
  Gfull: Float64Array,
  Bfull: Float64Array,
  buses: number[],
  opts: PFOptions,
  out: PFResult,
): IslandResult {
  const N = c.buses.length;
  const n = buses.length;
  const local = new Map<number, number>();
  buses.forEach((g, l) => local.set(g, l));
  const gens = c.gens.map((g, i) => ({ g, i })).filter(({ g }) => g.inService && local.has(g.bus));
  const hasLoad = buses.some((b) => Math.abs(c.buses[b]!.pd) > 1e-9 || Math.abs(c.buses[b]!.qd) > 1e-9);

  const result: IslandResult = { buses, status: 'converged', refBus: buses[0]!, lambda: 0, iterations: [], newtonIterations: 0, pinnedP: [], pinnedQ: [] };

  if (gens.length === 0) {
    // No source: this island is dark. Voltages are zero; its load is unserved.
    for (const b of buses) {
      out.vm[b] = 0;
      out.va[b] = 0;
      out.energized[b] = 0;
    }
    result.status = hasLoad ? 'no-source' : 'converged';
    if (hasLoad)
      result.reason =
        'These buses are cut off from every generator. With no source there is no voltage and no current: the load here is unserved (a blackout), not a solution with low voltage.';
    return result;
  }

  // Local dense G and B.
  const G = new Float64Array(n * n);
  const B = new Float64Array(n * n);
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      G[a * n + b] = Gfull[buses[a]! * N + buses[b]!]!;
      B[a * n + b] = Bfull[buses[a]! * N + buses[b]!]!;
    }

  // Scheduled demand per local bus.
  const pd = new Float64Array(n);
  const qd = new Float64Array(n);
  buses.forEach((b, l) => {
    pd[l] = c.buses[b]!.pd;
    qd[l] = c.buses[b]!.qd;
  });

  // Reference bus: the case's REF if it is here and has a unit, else the bus of the
  // largest unit (the angle reference is arbitrary; the physics does not depend on it).
  // With distributed slack the reference is only an angle datum and may be any bus;
  // with a single slack it must hold a generator.
  const busHasGen = new Set(gens.map(({ g }) => local.get(g.bus)!));
  let ref = buses.findIndex(
    (b, l) => c.buses[b]!.type === 'REF' && (opts.slack === 'distributed' || busHasGen.has(l)),
  );
  if (ref < 0) {
    let best = -1;
    for (const { g } of gens) if (best < 0 || g.pmax > c.gens[best]!.pmax) best = c.gens.indexOf(g);
    ref = local.get(c.gens[best]!.bus)!;
  }
  result.refBus = buses[ref]!;

  // Generator working state.
  const pg = new Float64Array(c.gens.length);
  const qfix = new Float64Array(c.gens.length);
  const pinnedP = new Set<number>();
  const pinnedQ = new Set<number>();
  const releases = new Map<number, number>();
  for (const { g, i } of gens) pg[i] = g.pg;

  const distributed = opts.slack === 'distributed';
  const kRaw = (i: number) => (pinnedP.has(i) ? 0 : Math.max(0, c.gens[i]!.participation));

  // Voltage state (local), warm or flat start.
  const vm = new Float64Array(n).fill(1);
  const va = new Float64Array(n);
  if (opts.initial) {
    buses.forEach((b, l) => {
      const v = opts.initial!.vm[b]!;
      if (v > 0.5 && v < 1.5) {
        vm[l] = v;
        va[l] = opts.initial!.va[b]!;
      }
    });
    const a0 = va[ref]!;
    for (let l = 0; l < n; l++) va[l] = va[l]! - a0;
  }
  if (!opts.initial && opts.start === 'dc') dcStart(c, buses, local, gens, pd, ref, va);
  let lambda = 0;

  for (let outer = 0; outer < 40; outer++) {
    // Bus roles for this pass.
    const isPV = new Uint8Array(n);
    const vset = new Float64Array(n);
    for (const { g, i } of gens) {
      const l = local.get(g.bus)!;
      if (g.regulates && !pinnedQ.has(i)) {
        if (!isPV[l]) vset[l] = g.vg;
        isPV[l] = 1;
      }
    }
    // In single-slack mode the reference bus always holds its voltage.
    if (!distributed) {
      isPV[ref] = 1;
      const gr = gens.find(({ g }) => local.get(g.bus) === ref)!;
      vset[ref] = gr.g.vg;
    }
    for (let l = 0; l < n; l++) if (isPV[l]) vm[l] = vset[l]!;

    // Participation factors (distributed only).
    let kSum = 0;
    for (const { i } of gens) kSum += kRaw(i);
    const useDistributed = distributed && kSum > 0;
    const kBus = new Float64Array(n);
    if (useDistributed)
      for (const { g, i } of gens) {
        const l = local.get(g.bus)!;
        kBus[l] = kBus[l]! + kRaw(i) / kSum;
      }
    if (distributed && kSum === 0) {
      result.status = lambda >= 0 ? 'insufficient-generation' : 'excess-generation';
      result.reason = generationReason(result.status);
      return finishDark(result, buses, out);
    }

    // Scheduled injections (without λ).
    const psch = new Float64Array(n);
    const qsch = new Float64Array(n);
    for (let l = 0; l < n; l++) {
      psch[l] = -pd[l]!;
      qsch[l] = -qd[l]!;
    }
    for (const { g, i } of gens) {
      const l = local.get(g.bus)!;
      psch[l] = psch[l]! + pg[i]!;
      if (!isPV[l]) qsch[l] = qsch[l]! + (pinnedQ.has(i) ? qfix[i]! : g.regulates ? 0 : g.qg);
    }

    // Unknown and equation indexing.
    const thIdx = new Int32Array(n).fill(-1);
    const vIdx = new Int32Array(n).fill(-1);
    const pEq = new Int32Array(n).fill(-1);
    const qEq = new Int32Array(n).fill(-1);
    let nx = 0;
    for (let l = 0; l < n; l++) if (l !== ref) thIdx[l] = nx++;
    for (let l = 0; l < n; l++) if (!isPV[l]) vIdx[l] = nx++;
    const lamIdx = useDistributed ? nx++ : -1;
    let ne = 0;
    for (let l = 0; l < n; l++) if (useDistributed || l !== ref) pEq[l] = ne++;
    for (let l = 0; l < n; l++) if (!isPV[l]) qEq[l] = ne++;
    if (ne !== nx) throw new Error(`power flow: ${ne} equations for ${nx} unknowns`);

    const P = new Float64Array(n);
    const Q = new Float64Array(n);
    const F = new Float64Array(nx);
    const calcPQ = () => {
      for (let i = 0; i < n; i++) {
        let p = 0;
        let q = 0;
        const vi = vm[i]!;
        for (let k = 0; k < n; k++) {
          const g = G[i * n + k]!;
          const b = B[i * n + k]!;
          if (g === 0 && b === 0) continue;
          const t = va[i]! - va[k]!;
          const ct = Math.cos(t);
          const st = Math.sin(t);
          p += vm[k]! * (g * ct + b * st);
          q += vm[k]! * (g * st - b * ct);
        }
        P[i] = vi * p;
        Q[i] = vi * q;
      }
    };
    const mismatch = (): { max: number; bus: number; kind: 'P' | 'Q' } => {
      calcPQ();
      let max = 0;
      let bus = 0;
      let kind: 'P' | 'Q' = 'P';
      for (let l = 0; l < n; l++) {
        if (pEq[l]! >= 0) {
          const f = P[l]! - (psch[l]! + (useDistributed ? kBus[l]! * lambda : 0));
          F[pEq[l]!] = f;
          if (Math.abs(f) > max) {
            max = Math.abs(f);
            bus = l;
            kind = 'P';
          }
        }
        if (qEq[l]! >= 0) {
          const f = Q[l]! - qsch[l]!;
          F[qEq[l]!] = f;
          if (Math.abs(f) > max) {
            max = Math.abs(f);
            bus = l;
            kind = 'Q';
          }
        }
      }
      return { max, bus, kind };
    };

    let converged = false;
    let status: PFStatus = 'max-iterations';
    for (let it = 0; it <= opts.maxIter; it++) {
      const mm = mismatch();
      if (opts.record)
        result.iterations.push({
          k: result.iterations.length,
          maxMismatch: mm.max,
          worstBus: buses[mm.bus]!,
          worstKind: mm.kind,
          lambda,
          vm: scatter(vm, buses, N),
          va: scatter(va, buses, N),
        });
      if (!Number.isFinite(mm.max) || mm.max > 1e4) {
        status = 'diverged';
        break;
      }
      if (mm.max < opts.tol) {
        converged = true;
        break;
      }
      if (it === opts.maxIter) break;
      result.newtonIterations++;
      // Jacobian, dense, rows = equations, cols = unknowns.
      const J = new Float64Array(nx * nx);
      for (let i = 0; i < n; i++) {
        const rp = pEq[i]!;
        const rq = qEq[i]!;
        if (rp < 0 && rq < 0) continue;
        const vi = vm[i]!;
        for (let k = 0; k < n; k++) {
          const g = G[i * n + k]!;
          const b = B[i * n + k]!;
          if (g === 0 && b === 0 && i !== k) continue;
          const ct = thIdx[k]!;
          const cv = vIdx[k]!;
          if (i === k) {
            const dPdth = -Q[i]! - b * vi * vi;
            const dPdv = P[i]! / vi + g * vi;
            const dQdth = P[i]! - g * vi * vi;
            const dQdv = Q[i]! / vi - b * vi;
            if (rp >= 0) {
              if (ct >= 0) J[rp * nx + ct] = dPdth;
              if (cv >= 0) J[rp * nx + cv] = dPdv;
            }
            if (rq >= 0) {
              if (ct >= 0) J[rq * nx + ct] = dQdth;
              if (cv >= 0) J[rq * nx + cv] = dQdv;
            }
          } else {
            const t = va[i]! - va[k]!;
            const cs = Math.cos(t);
            const sn = Math.sin(t);
            const vk = vm[k]!;
            const gsbc = g * sn - b * cs;
            const gcbs = g * cs + b * sn;
            if (rp >= 0) {
              if (ct >= 0) J[rp * nx + ct] = vi * vk * gsbc;
              if (cv >= 0) J[rp * nx + cv] = vi * gcbs;
            }
            if (rq >= 0) {
              if (ct >= 0) J[rq * nx + ct] = -vi * vk * gcbs;
              if (cv >= 0) J[rq * nx + cv] = vi * gsbc;
            }
          }
        }
        if (lamIdx >= 0 && rp >= 0) J[rp * nx + lamIdx] = -kBus[i]!;
      }
      let dx: Float64Array;
      try {
        const rhs = new Float64Array(nx);
        for (let r = 0; r < nx; r++) rhs[r] = -F[r]!;
        dx = solveReal(J, rhs, nx);
      } catch (e) {
        if (e instanceof SingularMatrixError) {
          status = 'singular';
          break;
        }
        throw e;
      }
      for (let l = 0; l < n; l++) {
        if (thIdx[l]! >= 0) va[l] = va[l]! + dx[thIdx[l]!]!;
        if (vIdx[l]! >= 0) vm[l] = vm[l]! + dx[vIdx[l]!]!;
      }
      if (lamIdx >= 0) lambda += dx[lamIdx]!;
      let bad = false;
      for (let l = 0; l < n; l++) if (!(vm[l]! > 0.05 && vm[l]! < 3)) bad = true;
      if (bad) {
        status = 'diverged';
        // record the state that made it obvious
        if (opts.record) {
          result.iterations.push({
            k: result.iterations.length,
            maxMismatch: Infinity,
            worstBus: buses[0]!,
            worstKind: 'P',
            lambda,
            vm: scatter(vm, buses, N),
            va: scatter(va, buses, N),
          });
        }
        break;
      }
    }

    if (!converged) {
      result.status = status;
      result.lambda = lambda;
      result.reason = divergenceReason(status);
      return finishDark(result, buses, out);
    }

    // Limits. Real power first (distributed slack sharing), then reactive.
    let changed = false;
    if (useDistributed && opts.enforcePLimits) {
      // Output each participant would have with this λ.
      const eff = new Map<number, number>();
      for (const { i } of gens) {
        const k = kRaw(i) / kSum;
        if (k > 0) eff.set(i, pg[i]! + k * lambda);
      }
      const violators = [...eff].filter(([i, p]) => p > c.gens[i]!.pmax + 1e-9 || p < c.gens[i]!.pmin - 1e-9);
      if (violators.length) {
        // Pin violators at their limit; fold the share already carried by the others
        // into their schedules, so λ restarts as "what is still unbalanced".
        for (const [i, p] of eff) {
          const g = c.gens[i]!;
          if (p > g.pmax + 1e-9) {
            pg[i] = g.pmax;
            pinnedP.add(i);
          } else if (p < g.pmin - 1e-9) {
            pg[i] = g.pmin;
            pinnedP.add(i);
          } else pg[i] = p;
        }
        const dir = lambda;
        lambda = 0;
        let kS = 0;
        for (const { i } of gens) kS += kRaw(i);
        if (kS === 0) {
          result.status = dir > 0 ? 'insufficient-generation' : 'excess-generation';
          result.lambda = dir;
          result.reason = generationReason(result.status);
          result.pinnedP = [...pinnedP];
          return finishDark(result, buses, out);
        }
        continue;
      }
    }

    // Generator reactive output at voltage-controlled buses.
    const qBus = new Float64Array(n);
    for (let l = 0; l < n; l++) qBus[l] = Q[l]! + qd[l]!;
    const qOut = new Float64Array(c.gens.length);
    for (let l = 0; l < n; l++) {
      const here = gens.filter(({ g }) => local.get(g.bus) === l);
      if (!here.length) continue;
      if (!isPV[l]) {
        for (const { g, i } of here) qOut[i] = pinnedQ.has(i) ? qfix[i]! : g.regulates ? 0 : g.qg;
        continue;
      }
      // Split among regulating units on the bus in proportion to their Q range.
      const reg = here.filter(({ g, i }) => g.regulates && !pinnedQ.has(i));
      const other = here.filter((h) => !reg.includes(h));
      let qRemain = qBus[l]!;
      for (const { g, i } of other) {
        qOut[i] = pinnedQ.has(i) ? qfix[i]! : g.qg;
        qRemain -= qOut[i]!;
      }
      const span = reg.reduce((s, { g }) => s + Math.max(g.qmax - g.qmin, 1e-6), 0);
      for (const { g, i } of reg) qOut[i] = (qRemain * Math.max(g.qmax - g.qmin, 1e-6)) / span;
    }
    if (opts.enforceQLimits) {
      // PV→PQ switching, bus by bus: when the units holding a bus's voltage together
      // need more reactive power than they can make (or absorb more than they can),
      // they are held at their limit and the bus voltage is left free to move.
      // A unit held at its maximum is released again if the voltage has risen above
      // its set-point (it no longer needs to be at its limit), and vice versa.
      const released = new Set<number>();
      for (const i of [...pinnedQ]) {
        const g = c.gens[i]!;
        const l = local.get(g.bus)!;
        const atMax = qfix[i]! >= g.qmax - 1e-12;
        if ((releases.get(i) ?? 0) >= 2) continue;
        if ((atMax && vm[l]! > g.vg + 1e-4) || (!atMax && vm[l]! < g.vg - 1e-4)) released.add(i);
      }
      for (let l = 0; l < n; l++) {
        if (!isPV[l]) continue;
        if (!distributed && l === ref) continue; // textbook slack bus holds its voltage
        const reg = gens.filter(({ g, i }) => local.get(g.bus) === l && g.regulates && !pinnedQ.has(i));
        if (!reg.length) continue;
        let q = 0;
        let qmx = 0;
        let qmn = 0;
        for (const { g, i } of reg) {
          q += qOut[i]!;
          qmx += g.qmax;
          qmn += g.qmin;
        }
        if (q > qmx + 1e-6 || q < qmn - 1e-6) {
          for (const { g, i } of reg) {
            qfix[i] = q > qmx ? g.qmax : g.qmin;
            pinnedQ.add(i);
          }
          changed = true;
        }
      }
      if (!changed && released.size) {
        for (const i of released) {
          pinnedQ.delete(i);
          releases.set(i, (releases.get(i) ?? 0) + 1);
        }
        changed = true;
      }
    }
    if (changed) continue;

    // Converged with every limit respected. Write back.
    const kFinal = (i: number) => (useDistributed ? kRaw(i) / kSum : 0);
    for (const { g, i } of gens) {
      out.kUsed[i] = kFinal(i);
      out.pg[i] = pg[i]! + kFinal(i) * lambda;
      out.qg[i] = qOut[i]!;
      void g;
    }
    if (!useDistributed) {
      // The single slack's generator takes whatever balances the reference bus.
      const refGens = gens.filter(({ g }) => local.get(g.bus) === ref);
      let other = 0;
      for (const { i } of refGens.slice(1)) other += pg[i]!;
      out.pg[refGens[0]!.i] = P[ref]! + pd[ref]! - other;
    }
    buses.forEach((b, l) => {
      out.vm[b] = vm[l]!;
      out.va[b] = va[l]!;
      out.pinj[b] = P[l]!;
      out.qinj[b] = Q[l]!;
      out.energized[b] = 1;
    });
    let mmx = 0;
    for (let r = 0; r < nx; r++) mmx = Math.max(mmx, Math.abs(F[r]!));
    out.maxMismatch = Math.max(out.maxMismatch, mmx);
    result.lambda = lambda;
    result.pinnedP = [...pinnedP];
    result.pinnedQ = [...pinnedQ];
    result.status = 'converged';
    return result;
  }
  result.status = 'max-iterations';
  result.reason = 'Generator limits kept changing which units control voltage; no consistent operating point was found.';
  return finishDark(result, buses, out);
}

/**
 * Angles from the DC power flow (B′θ = P, |V| = 1, lossless) as a starting point.
 * Any imbalance is spread over all generators in proportion to their ratings.
 */
function dcStart(
  c: PFCase,
  buses: number[],
  local: Map<number, number>,
  gens: Array<{ g: PFCase['gens'][number]; i: number }>,
  pd: Float64Array,
  ref: number,
  va: Float64Array,
): void {
  const n = buses.length;
  const p = new Float64Array(n);
  for (let l = 0; l < n; l++) p[l] = -pd[l]!;
  let gen = 0;
  let load = 0;
  let cap = 0;
  for (const { g } of gens) {
    gen += g.pg;
    cap += Math.max(g.pmax, 1e-6);
  }
  for (let l = 0; l < n; l++) load += pd[l]!;
  const mis = load - gen;
  for (const { g } of gens) {
    const l = local.get(g.bus)!;
    p[l] = p[l]! + g.pg + (mis * Math.max(g.pmax, 1e-6)) / cap;
  }
  const B = new Float64Array(n * n);
  for (const br of c.branches) {
    if (!br.inService) continue;
    const f = local.get(br.from);
    const t = local.get(br.to);
    if (f === undefined || t === undefined) continue;
    const b = 1 / (br.x * br.tap);
    B[f * n + f] = B[f * n + f]! + b;
    B[t * n + t] = B[t * n + t]! + b;
    B[f * n + t] = B[f * n + t]! - b;
    B[t * n + f] = B[t * n + f]! - b;
  }
  const keep: number[] = [];
  for (let l = 0; l < n; l++) if (l !== ref) keep.push(l);
  const m = keep.length;
  if (m === 0) return;
  const A = new Float64Array(m * m);
  const rhs = new Float64Array(m);
  keep.forEach((i, a) => {
    rhs[a] = p[i]!;
    keep.forEach((k, b) => (A[a * m + b] = B[i * n + k]!));
  });
  try {
    const th = solveReal(A, rhs, m);
    keep.forEach((i, a) => (va[i] = th[a]!));
  } catch {
    // a singular B′ just means we keep the flat start
  }
}

function scatter(a: Float64Array, buses: number[], N: number): Float64Array {
  const o = new Float64Array(N);
  buses.forEach((b, l) => (o[b] = a[l]!));
  return o;
}

function finishDark(r: IslandResult, buses: number[], out: PFResult): IslandResult {
  for (const b of buses) {
    out.vm[b] = 0;
    out.va[b] = 0;
    out.energized[b] = 0;
  }
  return r;
}

function generationReason(s: PFStatus): string {
  return s === 'insufficient-generation'
    ? 'Every generator that can respond is already at its maximum and load still exceeds generation. Frequency would keep falling until protection sheds load or trips units: there is no steady operating point.'
    : 'Every generator that can respond is already at its minimum and generation still exceeds load. Frequency would keep rising until units trip: there is no steady operating point.';
}

function divergenceReason(s: PFStatus): string {
  switch (s) {
    case 'singular':
      return 'The equations lost a unique answer: the network is at (or past) the most power it can carry at a stable voltage — the nose of the P–V curve. Beyond it, voltage collapses.';
    case 'diverged':
      return 'The Newton iterations ran away instead of settling. That is how the equations behave when the network cannot deliver this power at any voltage it can hold (voltage collapse). Failing to find an operating point is strong evidence that none exists, not proof.';
    default:
      return 'The Newton iterations did not settle within the allowed number of steps. No steady-state operating point was found; this usually means none exists, though it is not proof.';
  }
}
