/**
 * AC power flow by the Newton–Raphson method, in polar form.
 *
 * WHAT A POWER FLOW IS
 * Every bus has four quantities: voltage magnitude |V|, voltage angle θ, real
 * power injection P, and reactive power injection Q. At each bus two of the
 * four are known and two must be solved for — which two depends on the bus
 * type. The power flow finds the |V| and θ at every bus that make the injected
 * power match what is scheduled, given the network's admittance matrix.
 *
 * THE EQUATIONS (standard form, e.g. Grainger & Stevenson eq. 9.1–9.2)
 *
 *   P_i = Σ_k |V_i||V_k| ( G_ik cos θ_ik + B_ik sin θ_ik )
 *   Q_i = Σ_k |V_i||V_k| ( G_ik sin θ_ik − B_ik cos θ_ik )        θ_ik = θ_i − θ_k
 *
 * These are nonlinear in |V| and θ, so they are solved iteratively. Newton–
 * Raphson linearises them about the current guess using the Jacobian
 *
 *   [ ΔP ]   [ H  N ] [ Δθ  ]                H = ∂P/∂θ   N = ∂P/∂|V|
 *   [    ] = [      ] [     ]                M = ∂Q/∂θ   L = ∂Q/∂|V|
 *   [ ΔQ ]   [ M  L ] [ Δ|V|]
 *
 * solves for the correction, applies it, and repeats. Each iteration is
 * recorded in the trace so the UI can show the solution converging.
 */

import { Complex, C, polar, abs, arg, conj, mul, sub } from './complex.js';
import { NetworkCase, CaseIndex, indexCase, Bus } from './network.js';
import { Ybus, buildYbus } from './ybus.js';
import { solveDCPowerFlow } from './dc-powerflow.js';
import { Matrix, zeros, mset, luSolve, SingularMatrixError } from './linalg.js';

export interface PowerFlowOptions {
  /** Convergence tolerance on the largest power mismatch, per-unit. */
  tol: number;
  maxIterations: number;
  /**
   * Enforce generator reactive limits by converting a PV bus whose Q hits a
   * limit into a PQ bus at that limit. This is what a real study does; it is
   * off for the IEEE validation cases so that the published solutions
   * (computed without limit enforcement) are reproduced exactly.
   */
  enforceQLimits: boolean;
  /** Flat start ignores any scheduled voltages at PQ buses and begins at 1.0∠0°. */
  flatStart: boolean;
  /**
   * Where the iteration begins.
   *  - `flat` : every unknown voltage at 1.0∠0°. Fine for small networks.
   *  - `dc`   : angles from a DC power flow, magnitudes flat. On a network
   *             spanning a thousand kilometres the angle spread is well over
   *             100°, and a flat start asks Newton to cross that in one leap —
   *             which it does not survive. Solving the linear approximation
   *             first costs one matrix factorisation and puts the iteration
   *             inside the basin of attraction.
   *  - `warm` : use the scheduled voltages already in the case, which is what
   *             you want when re-solving after a small perturbation.
   */
  init: 'flat' | 'dc' | 'warm';
  /**
   * Largest angle correction accepted in one iteration, radians.
   *
   * An undamped Newton step is only trustworthy where the linearisation is,
   * and far from the solution it is not. Capping the step turns a divergent
   * sequence into a slower but convergent one; near the solution the cap never
   * binds and the quadratic convergence Newton is famous for is untouched.
   */
  maxAngleStep: number;
  /** Largest voltage magnitude correction accepted in one iteration, per-unit. */
  maxVoltageStep: number;
  /** How many times the line search may halve a step before giving up on it. */
  maxBacktracks: number;
  /**
   * Start from a previous solution rather than from scratch. Overrides `init`.
   *
   * This is how a time-series or a contingency study is run in practice: the
   * answer at 18:05 is a few iterations away from the answer at 18:00, and
   * starting there instead of at a flat profile turns a twelve-iteration solve
   * into a three-iteration one. It is also what makes scrubbing through the day
   * interactive rather than a slideshow.
   */
  startFrom?: { vm: readonly number[]; va: readonly number[] };
  /**
   * How many times a single bus may be switched between PV and PQ by the
   * reactive-limit loop before it is left where it is. Without a cap, a bus
   * that sits exactly on its limit can be switched back and forth forever.
   */
  maxSwitchesPerBus: number;
}

export const DEFAULT_PF_OPTIONS: PowerFlowOptions = {
  tol: 1e-10,
  maxIterations: 30,
  enforceQLimits: false,
  flatStart: true,
  init: 'flat',
  maxAngleStep: 0.5,
  maxVoltageStep: 0.25,
  maxBacktracks: 12,
  maxSwitchesPerBus: 3,
};

/** One Newton–Raphson step, kept so the UI can replay convergence. */
export interface IterationRecord {
  iteration: number;
  /** Largest |ΔP| over the mismatch set, per-unit. */
  maxDP: number;
  /** Largest |ΔQ| over the mismatch set, per-unit. */
  maxDQ: number;
  /** Largest absolute mismatch of either kind, per-unit — the convergence metric. */
  maxMismatch: number;
  /** Bus id where the largest mismatch sits, for the UI to point at. */
  worstBus: string;
  /** Voltage magnitudes, per-unit, at the END of this iteration. */
  vm: number[];
  /** Voltage angles, radians, at the END of this iteration. */
  va: number[];
  /** Largest correction applied this step: Δθ in radians, Δ|V| in per-unit. */
  maxDTheta: number;
  maxDV: number;
  /**
   * Set on the first iteration after the PROBLEM ITSELF changed.
   *
   * When a machine runs out of reactive capability its bus stops being a
   * voltage-controlled bus and becomes an ordinary load bus pinned at the
   * limit. That is a physical transition, and it changes the set of unknowns
   * part-way through solving — so the mismatch jumps back up and Newton starts
   * again on a different problem. Without this marker the convergence plot
   * looks like the method failing, when it is the method doing exactly what it
   * should.
   */
  restarted?: string;
}

export interface PowerFlowResult {
  converged: boolean;
  iterations: number;
  /** Per-iteration record, for the convergence view. */
  trace: IterationRecord[];
  /** Final voltage magnitude per bus, per-unit, in case bus order. */
  vm: number[];
  /** Final voltage angle per bus, radians, in case bus order. */
  va: number[];
  /** Net real power injection at each bus, per-unit (generation minus load). */
  pInj: number[];
  /** Net reactive power injection at each bus, per-unit. */
  qInj: number[];
  /** Bus types actually used at the end (may differ from input if Q limits bound). */
  finalType: BusType2[];
  /** Buses whose PV status was given up because a reactive limit bound. */
  qLimited: { bus: string; limit: 'qMax' | 'qMin'; qMVAr: number }[];
  baseMVA: number;
  busOrder: string[];
  ybus: Ybus;
  /** Final mismatch, per-unit — the number that must be below `tol`. */
  finalMismatch: number;
  /** The convergence tolerance this solve was asked to reach, per-unit. */
  tol: number;
  /** Wall-clock solve time, milliseconds. */
  solveMs: number;
  /** True if the iteration started from a DC power-flow angle estimate. */
  dcInitialised: boolean;
  /** Set if the solve failed with a structural problem rather than divergence. */
  error?: string;
}

type BusType2 = 'slack' | 'PV' | 'PQ';

/** Scheduled net injection at each bus, per-unit, from generators and loads. */
export function scheduledInjections(net: NetworkCase, idx: CaseIndex): {
  p: Float64Array;
  q: Float64Array;
} {
  const n = net.buses.length;
  const p = new Float64Array(n);
  const q = new Float64Array(n);
  for (const g of net.generators) {
    if (!g.inService) continue;
    const i = idx.indexOf.get(g.bus);
    if (i === undefined) throw new Error(`generator ${g.id}: unknown bus ${g.bus}`);
    p[i] += g.pMW / net.baseMVA;
    q[i] += g.qMVAr / net.baseMVA;
  }
  for (const l of net.loads) {
    const i = idx.indexOf.get(l.bus);
    if (i === undefined) throw new Error(`load ${l.id}: unknown bus ${l.bus}`);
    p[i] -= l.pMW / net.baseMVA;
    q[i] -= l.qMVAr / net.baseMVA;
  }
  return { p, q };
}

/** Compute P_i and Q_i from the present voltages, using the equations above. */
export function calcInjections(
  y: Ybus,
  vm: Float64Array,
  va: Float64Array
): { p: Float64Array; q: Float64Array } {
  const n = y.n;
  const p = new Float64Array(n);
  const q = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let pi = 0;
    let qi = 0;
    const vi = vm[i];
    for (let k = 0; k < n; k++) {
      const g = y.G[i * n + k];
      const b = y.B[i * n + k];
      if (g === 0 && b === 0) continue;
      const th = va[i] - va[k];
      const ct = Math.cos(th);
      const st = Math.sin(th);
      const vv = vi * vm[k];
      pi += vv * (g * ct + b * st);
      qi += vv * (g * st - b * ct);
    }
    p[i] = pi;
    q[i] = qi;
  }
  return { p, q };
}

function initialVoltages(
  net: NetworkCase,
  opts: PowerFlowOptions
): { vm: Float64Array; va: Float64Array; dcUsed: boolean } {
  const n = net.buses.length;
  const vm = new Float64Array(n);
  const va = new Float64Array(n);
  net.buses.forEach((b, i) => {
    if (b.type === 'slack') {
      vm[i] = b.vSched ?? 1.0;
      va[i] = b.thetaSched ?? 0;
    } else if (b.type === 'PV') {
      vm[i] = b.vSched ?? 1.0;
      va[i] = 0;
    } else {
      vm[i] = opts.init === 'warm' || !opts.flatStart ? b.vSched ?? 1.0 : 1.0;
      va[i] = 0;
    }
  });

  if (opts.startFrom) {
    const { vm: v0, va: a0 } = opts.startFrom;
    if (v0.length !== n || a0.length !== n) {
      throw new Error('startFrom has the wrong number of buses for this case');
    }
    for (let i = 0; i < n; i++) {
      // Slack and PV magnitudes still come from the schedule: those are inputs,
      // not results, and a previous solution must not be allowed to override
      // them.
      if (net.buses[i].type === 'PQ') vm[i] = v0[i];
      if (net.buses[i].type !== 'slack') va[i] = a0[i];
    }
    return { vm, va, dcUsed: false };
  }

  let dcUsed = false;
  if (opts.init === 'dc') {
    try {
      const dc = solveDCPowerFlow(net);
      for (let i = 0; i < n; i++) va[i] = dc.theta[i];
      dcUsed = true;
    } catch {
      // A DC solve can fail on a disconnected network; the flat angles above
      // are then the fallback and the AC solve reports the real problem.
    }
  }
  return { vm, va, dcUsed };
}

/**
 * Solve the power flow.
 *
 * The returned result is the single source of truth for every electrical
 * quantity the app displays. Nothing downstream may invent a number that is
 * not derived from this (see test/no-hardcoded-quantities.test.ts).
 */
export function solvePowerFlow(
  net: NetworkCase,
  options: Partial<PowerFlowOptions> = {}
): PowerFlowResult {
  const opts = { ...DEFAULT_PF_OPTIONS, ...options };
  const t0 = performance.now();
  const idx = indexCase(net);
  const n = net.buses.length;
  const y = buildYbus(net, idx);
  const sched = scheduledInjections(net, idx);
  const { vm, va, dcUsed } = initialVoltages(net, opts);

  const type: BusType2[] = net.buses.map((b) => b.type);
  const qLimited: PowerFlowResult['qLimited'] = [];
  // Reactive capability at each bus, summed over its in-service generators.
  const qMaxPU = new Float64Array(n);
  const qMinPU = new Float64Array(n);
  for (const g of net.generators) {
    if (!g.inService) continue;
    const i = idx.indexOf.get(g.bus)!;
    qMaxPU[i] += g.qMaxMVAr / net.baseMVA;
    qMinPU[i] += g.qMinMVAr / net.baseMVA;
  }
  // Load reactive demand must be subtracted: the PV bus holds NET injection.
  const qLoadPU = new Float64Array(n);
  for (const l of net.loads) qLoadPU[idx.indexOf.get(l.bus)!] += l.qMVAr / net.baseMVA;

  /** Which limit each bus has been pinned at, if any. */
  const pinned: (null | 'qMax' | 'qMin')[] = new Array(n).fill(null);
  /** Tolerance on the reactive limit check, per-unit (1 MVAr on a 100 MVA base). */
  const qTol = 1e-2 / net.baseMVA * 100 * 1e-2;
  /** Tolerance on the voltage check that releases a pinned bus, per-unit. */
  const vTol = 1e-4;
  /** How many times each bus has been switched, to stop it oscillating. */
  const switchCount = new Int32Array(n);

  const trace: IterationRecord[] = [];
  /** Why the next inner solve is starting, if it is not the first. */
  let pendingRestart: string | undefined;
  let converged = false;
  let iter = 0;
  let finalMismatch = Infinity;
  let error: string | undefined;

  // Outer loop exists only for Q-limit switching; without it, it runs once.
  for (let outer = 0; outer < (opts.enforceQLimits ? 20 : 1); outer++) {
    const traceStart = trace.length;
    const inner = newtonLoop(y, vm, va, sched, type, opts, net, trace, iter);
    if (pendingRestart !== undefined && trace.length > traceStart) {
      trace[traceStart].restarted = pendingRestart;
      pendingRestart = undefined;
    }
    iter = inner.iteration;
    converged = inner.converged;
    finalMismatch = inner.mismatch;
    error = inner.error;
    if (!converged || !opts.enforceQLimits) break;

    // REACTIVE LIMIT ENFORCEMENT.
    //
    // A PV bus holds its voltage by adjusting the excitation of the machines on
    // it, which costs reactive power. There is only so much available: past the
    // limit the machine cannot hold the setpoint any more, and the bus stops
    // being a voltage-controlled bus and becomes an ordinary load bus with a
    // fixed reactive injection at the limit. That is a physical transition, not
    // a numerical trick, and it is often what a voltage collapse is made of.
    //
    // The reverse also has to be handled. Once a bus has been pinned at its
    // maximum, later switching elsewhere may raise its voltage back ABOVE the
    // setpoint it was trying to hold — at which point the machine no longer
    // needs all that reactive power and the bus should go back to being PV.
    // Without this restoration step the procedure ratchets one way and can
    // strand the system in a state it would never actually reach.
    const { q } = calcInjections(y, vm, va);
    let switched = false;
    let switchedCount = 0;
    for (let i = 0; i < n; i++) {
      const schedV = net.buses[i].vSched;
      if (switchCount[i] >= opts.maxSwitchesPerBus) continue;
      if (type[i] === 'PV') {
        const qGen = q[i] + qLoadPU[i];
        if (qGen > qMaxPU[i] + qTol) {
          type[i] = 'PQ';
          pinned[i] = 'qMax';
          sched.q[i] = qMaxPU[i] - qLoadPU[i];
          qLimited.push({ bus: net.buses[i].id, limit: 'qMax', qMVAr: qMaxPU[i] * net.baseMVA });
          switchCount[i]++;
          switched = true;
          switchedCount++;
        } else if (qGen < qMinPU[i] - qTol) {
          type[i] = 'PQ';
          pinned[i] = 'qMin';
          sched.q[i] = qMinPU[i] - qLoadPU[i];
          qLimited.push({ bus: net.buses[i].id, limit: 'qMin', qMVAr: qMinPU[i] * net.baseMVA });
          switchCount[i]++;
          switched = true;
          switchedCount++;
        }
      } else if (pinned[i] && schedV !== undefined) {
        // Pinned at maximum but the voltage has come back up on its own, or
        // pinned at minimum but it has fallen: release the bus back to PV.
        const release =
          (pinned[i] === 'qMax' && vm[i] > schedV + vTol) ||
          (pinned[i] === 'qMin' && vm[i] < schedV - vTol);
        if (release) {
          type[i] = 'PV';
          pinned[i] = null;
          vm[i] = schedV;
          switchCount[i]++;
          switched = true;
          switchedCount++;
        }
      }
    }
    if (!switched) break;
    // Record why the next round exists, so the convergence plot can say that
    // the problem changed rather than that the method wandered.
    pendingRestart =
      `${switchedCount} bus${switchedCount === 1 ? '' : 'es'} changed type on a ` +
      `reactive limit`;
  }

  const { p: pInj, q: qInj } = calcInjections(y, vm, va);

  return {
    converged,
    iterations: iter,
    trace,
    vm: Array.from(vm),
    va: Array.from(va),
    pInj: Array.from(pInj),
    qInj: Array.from(qInj),
    finalType: type,
    qLimited,
    baseMVA: net.baseMVA,
    busOrder: idx.order,
    ybus: y,
    finalMismatch,
    tol: opts.tol,
    solveMs: performance.now() - t0,
    dcInitialised: dcUsed,
    ...(error ? { error } : {}),
  };
}

function newtonLoop(
  y: Ybus,
  vm: Float64Array,
  va: Float64Array,
  sched: { p: Float64Array; q: Float64Array },
  type: BusType2[],
  opts: PowerFlowOptions,
  net: NetworkCase,
  trace: IterationRecord[],
  startIter: number
): { converged: boolean; iteration: number; mismatch: number; error?: string } {
  const n = y.n;
  // Index sets. Angle unknowns: every non-slack bus. Magnitude unknowns: PQ only.
  const pvpq: number[] = [];
  const pq: number[] = [];
  for (let i = 0; i < n; i++) {
    if (type[i] !== 'slack') pvpq.push(i);
    if (type[i] === 'PQ') pq.push(i);
  }
  const npvpq = pvpq.length;
  const npq = pq.length;
  const m = npvpq + npq;
  if (m === 0) return { converged: true, iteration: startIter, mismatch: 0 };

  const posTheta = new Int32Array(n).fill(-1);
  pvpq.forEach((i, k) => (posTheta[i] = k));
  const posV = new Int32Array(n).fill(-1);
  pq.forEach((i, k) => (posV[i] = npvpq + k));

  let iteration = startIter;
  for (let step = 0; step < opts.maxIterations; step++) {
    const { p, q } = calcInjections(y, vm, va);

    // Mismatch: scheduled minus calculated.
    const f = new Float64Array(m);
    let maxDP = 0;
    let maxDQ = 0;
    let worst = 0;
    let worstVal = 0;
    for (let k = 0; k < npvpq; k++) {
      const i = pvpq[k];
      const d = sched.p[i] - p[i];
      f[k] = d;
      if (Math.abs(d) > maxDP) maxDP = Math.abs(d);
      if (Math.abs(d) > worstVal) {
        worstVal = Math.abs(d);
        worst = i;
      }
    }
    for (let k = 0; k < npq; k++) {
      const i = pq[k];
      const d = sched.q[i] - q[i];
      f[npvpq + k] = d;
      if (Math.abs(d) > maxDQ) maxDQ = Math.abs(d);
      if (Math.abs(d) > worstVal) {
        worstVal = Math.abs(d);
        worst = i;
      }
    }
    const mismatch = Math.max(maxDP, maxDQ);

    if (mismatch < opts.tol) {
      // Already converged; record the resting state if nothing has been recorded.
      if (trace.length === 0) {
        trace.push({
          iteration,
          maxDP,
          maxDQ,
          maxMismatch: mismatch,
          worstBus: net.buses[worst].id,
          vm: Array.from(vm),
          va: Array.from(va),
          maxDTheta: 0,
          maxDV: 0,
        });
      }
      return { converged: true, iteration, mismatch };
    }

    const J = buildJacobian(y, vm, va, p, q, pvpq, pq, posTheta, posV, m);
    let dx: Float64Array;
    try {
      dx = luSolve(J, f);
    } catch (e) {
      if (e instanceof SingularMatrixError) {
        return { converged: false, iteration, mismatch, error: e.message };
      }
      throw e;
    }

    // STEP CONTROL.
    //
    // An undamped Newton step is only trustworthy where the linearisation is,
    // and far from the solution it is not. Two guards, in order:
    //
    //  1. A hard cap on how far any one component may move, applied as a single
    //     scale factor over the whole correction rather than per-component
    //     clipping — clipping components individually changes the DIRECTION of
    //     the step, which is the one thing Newton gets right far out.
    //  2. A backtracking line search: take the step, measure whether the
    //     mismatch actually got smaller, and if it did not, halve the step and
    //     try again. This is what turns a divergent sequence, or one stuck in a
    //     limit cycle between two bad points, into a convergent one.
    //
    // Near the solution neither guard binds, and the quadratic convergence
    // Newton is famous for is untouched.
    let damp = 1;
    for (let k = 0; k < npvpq; k++) {
      const a = Math.abs(dx[k]);
      if (a > opts.maxAngleStep) damp = Math.min(damp, opts.maxAngleStep / a);
    }
    for (let k = 0; k < npq; k++) {
      const a = Math.abs(dx[npvpq + k]);
      if (a > opts.maxVoltageStep) damp = Math.min(damp, opts.maxVoltageStep / a);
    }

    const vmSave = Float64Array.from(vm);
    const vaSave = Float64Array.from(va);
    const applyStep = (alpha: number): number => {
      for (let k = 0; k < npvpq; k++) va[pvpq[k]] = vaSave[pvpq[k]] + dx[k] * alpha;
      for (let k = 0; k < npq; k++) {
        // A voltage magnitude is a magnitude: it cannot go negative, and
        // letting it do so sends the iteration somewhere with no meaning.
        vm[pq[k]] = Math.max(0.05, vmSave[pq[k]] + dx[npvpq + k] * alpha);
      }
      const t = calcInjections(y, vm, va);
      let worst = 0;
      for (let k = 0; k < npvpq; k++) {
        worst = Math.max(worst, Math.abs(sched.p[pvpq[k]] - t.p[pvpq[k]]));
      }
      for (let k = 0; k < npq; k++) {
        worst = Math.max(worst, Math.abs(sched.q[pq[k]] - t.q[pq[k]]));
      }
      return worst;
    };

    let alpha = damp;
    let trial = applyStep(alpha);
    for (let b = 0; b < opts.maxBacktracks && trial >= mismatch; b++) {
      alpha *= 0.5;
      trial = applyStep(alpha);
    }
    // If even the smallest step made things worse, take it anyway: the
    // iteration is at a point the linearisation cannot help with, and the
    // convergence check on the next pass will report the failure honestly
    // rather than spinning here.

    let maxDTheta = 0;
    let maxDV = 0;
    for (let k = 0; k < npvpq; k++) {
      maxDTheta = Math.max(maxDTheta, Math.abs(va[pvpq[k]] - vaSave[pvpq[k]]));
    }
    for (let k = 0; k < npq; k++) {
      maxDV = Math.max(maxDV, Math.abs(vm[pq[k]] - vmSave[pq[k]]));
    }

    iteration += 1;
    trace.push({
      iteration,
      maxDP,
      maxDQ,
      maxMismatch: mismatch,
      worstBus: net.buses[worst].id,
      vm: Array.from(vm),
      va: Array.from(va),
      maxDTheta,
      maxDV,
    });

    if (!Number.isFinite(mismatch) || mismatch > 1e6) {
      return { converged: false, iteration, mismatch, error: 'diverged' };
    }
  }
  return { converged: false, iteration, mismatch: Infinity, error: 'iteration limit reached' };
}

/**
 * Assemble the Jacobian. Sub-block formulas, for i ≠ k:
 *   H_ik = ∂P_i/∂θ_k   =  |V_i||V_k| ( G_ik sin θ_ik − B_ik cos θ_ik )
 *   N_ik = ∂P_i/∂|V_k| =  |V_i|      ( G_ik cos θ_ik + B_ik sin θ_ik )
 *   M_ik = ∂Q_i/∂θ_k   = −|V_i||V_k| ( G_ik cos θ_ik + B_ik sin θ_ik )
 *   L_ik = ∂Q_i/∂|V_k| =  |V_i|      ( G_ik sin θ_ik − B_ik cos θ_ik )
 * and on the diagonal:
 *   H_ii = −Q_i − B_ii|V_i|²      N_ii = P_i/|V_i| + G_ii|V_i|
 *   M_ii =  P_i − G_ii|V_i|²      L_ii = Q_i/|V_i| − B_ii|V_i|
 */
export function buildJacobian(
  y: Ybus,
  vm: Float64Array,
  va: Float64Array,
  p: Float64Array,
  q: Float64Array,
  pvpq: number[],
  _pq: number[],
  posTheta: Int32Array,
  posV: Int32Array,
  m: number
): Matrix {
  const n = y.n;
  const J = zeros(m, m);
  for (const i of pvpq) {
    const row = posTheta[i];
    const rowQ = posV[i]; // −1 unless i is PQ
    for (let k = 0; k < n; k++) {
      const g = y.G[i * n + k];
      const b = y.B[i * n + k];
      const colT = posTheta[k];
      const colV = posV[k];
      if (colT < 0 && colV < 0) continue;
      if (i === k) {
        const v = vm[i];
        const gii = y.G[i * n + i];
        const bii = y.B[i * n + i];
        if (colT >= 0) mset(J, row, colT, -q[i] - bii * v * v);
        if (colV >= 0) mset(J, row, colV, p[i] / v + gii * v);
        if (rowQ >= 0) {
          if (colT >= 0) mset(J, rowQ, colT, p[i] - gii * v * v);
          if (colV >= 0) mset(J, rowQ, colV, q[i] / v - bii * v);
        }
      } else {
        if (g === 0 && b === 0) continue;
        const th = va[i] - va[k];
        const ct = Math.cos(th);
        const st = Math.sin(th);
        const vv = vm[i] * vm[k];
        const gcbs = g * ct + b * st;
        const gsbc = g * st - b * ct;
        if (colT >= 0) mset(J, row, colT, vv * gsbc);
        if (colV >= 0) mset(J, row, colV, vm[i] * gcbs);
        if (rowQ >= 0) {
          if (colT >= 0) mset(J, rowQ, colT, -vv * gcbs);
          if (colV >= 0) mset(J, rowQ, colV, vm[i] * gsbc);
        }
      }
    }
  }
  return J;
}

/** Complex bus voltage V_i = |V_i|∠θ_i, per-unit. */
export const busVoltage = (r: PowerFlowResult, i: number): Complex => polar(r.vm[i], r.va[i]);

/** Complex bus injection S_i = P_i + jQ_i, per-unit. */
export const busInjection = (r: PowerFlowResult, i: number): Complex => C(r.pInj[i], r.qInj[i]);

export { abs, arg, conj, mul, sub, type Bus };
