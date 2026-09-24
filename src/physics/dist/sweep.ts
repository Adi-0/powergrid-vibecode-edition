import { Complex } from '../complex';
import { CMatrix } from '../linalg';
import type { CenterTapBranch, DBranch, DistNetwork, DLoad, LineBranch, Phase, TransformerBranch } from './network';

/**
 * Unbalanced three-phase power flow for radial feeders: Kersting's ladder
 * ("backward/forward sweep").
 *
 *  Backward: starting at the far ends, add up the current every load draws (from the
 *  present voltages) and carry it toward the source through each element:
 *      I_sending = [c]·V_receiving + [d]·I_receiving
 *  Forward: starting from the fixed source voltage, compute each node's voltage from
 *  its parent's, less the drop the current just found causes:
 *      V_receiving = [A]·V_sending − [B]·I_receiving
 *  Repeat until voltages stop changing.
 *
 * [a], [b], [c], [d], [A], [B] are each element's "generalised matrices". For a line
 * segment with series impedance matrix Z and shunt admittance matrix Y (both 3×3):
 *     a = U + ½ZY,  b = Z,  c = Y + ¼YZY,  d = U + ½YZ,  A = a⁻¹,  B = a⁻¹·b
 */

type V3 = [Complex, Complex, Complex];
const Z3 = (): V3 => [Complex.ZERO, Complex.ZERO, Complex.ZERO];

export interface SweepOptions {
  /** Convergence: largest voltage change between sweeps, per unit of the node's base. */
  tol: number;
  maxIter: number;
  /** Let regulators with line-drop compensation move their taps. */
  regulate: boolean;
}

export interface BranchResult {
  If: V3;
  It: V3;
  Sf: Complex;
  St: Complex;
  loss: Complex;
}

export interface SweepResult {
  converged: boolean;
  iterations: number;
  /** Largest voltage change in the last sweep, per unit. */
  lastChange: number;
  V: Map<string, V3>;
  branch: Map<string, BranchResult>;
  /** Actual complex power drawn by each load (kW + j kvar... in W, var). */
  loadS: Map<string, Complex>;
  /** Actual reactive power supplied by each capacitor bank, var (positive = supplying). */
  capQ: Map<string, number>;
  /** Complex power entering the network at the root, W + j var. */
  headS: Complex;
  /** Current leaving the root, per phase. */
  headI: V3;
  losses: Complex;
  taps: Map<string, [number, number, number]>;
}

/**
 * Every element is linear in (V, I), so each is stored the same way — four 3×3 complex
 * matrices over typed arrays (re, im interleaved, row-major):
 *     forward:   V_receiving = F_A·V_sending + F_B·I_receiving
 *     backward:  I_sending   = B_C·V_receiving + B_D·I_receiving
 * For a line F_A = A, F_B = −B, B_C = c, B_D = d (zero rows and columns for absent
 * phases); transformers, regulators, switches and center-tapped services are the same
 * form with their own entries. The sweep then runs on flat arrays with no allocation.
 */
interface Elem {
  FA: Float64Array;
  FB: Float64Array;
  BC: Float64Array;
  BD: Float64Array;
}

const M = () => new Float64Array(18);
const setC = (m: Float64Array, r: number, c: number, re: number, im = 0) => {
  m[(r * 3 + c) * 2] = re;
  m[(r * 3 + c) * 2 + 1] = im;
};

const lineCache = new WeakMap<object, Elem>();

function lineElem(br: LineBranch): Elem {
  const hit = lineCache.get(br.Z);
  if (hit && (hit as Elem & { key?: string }).key === br.phases.join()) return hit;
  const ph = br.phases;
  const k = ph.length;
  const sub = (Mx: CMatrix) => {
    const s = new CMatrix(k, k);
    ph.forEach((p, i) => ph.forEach((q, j) => s.set(i, j, Mx.get(p, q))));
    return s;
  };
  const Z = sub(br.Z);
  const Y = sub(br.Y);
  const U = CMatrix.identity(k);
  const half = new Complex(0.5, 0);
  const quarter = new Complex(0.25, 0);
  const a = U.add(Z.mul(Y).scale(half));
  const c = Y.add(Y.mul(Z).mul(Y).scale(quarter));
  const d = U.add(Y.mul(Z).scale(half));
  const A = a.inverse();
  const B = A.mul(Z);
  const e: Elem & { key?: string } = { FA: M(), FB: M(), BC: M(), BD: M(), key: ph.join() };
  ph.forEach((p, i) =>
    ph.forEach((q, j) => {
      const av = A.get(i, j);
      const bv = B.get(i, j);
      const cv = c.get(i, j);
      const dv = d.get(i, j);
      setC(e.FA, p, q, av.re, av.im);
      setC(e.FB, p, q, -bv.re, -bv.im);
      setC(e.BC, p, q, cv.re, cv.im);
      setC(e.BD, p, q, dv.re, dv.im);
    }),
  );
  lineCache.set(br.Z, e);
  return e;
}

function transformerElem(br: TransformerBranch): Elem {
  const zbLow = (br.kvLowLL * 1000) ** 2 / (br.kva * 1000);
  const zt = br.zpu.scale(zbLow); // Ω on the low side, per phase
  const ltc = br.ltc ?? 1;
  const e: Elem = { FA: M(), FB: M(), BC: M(), BD: M() };
  for (let p = 0; p < 3; p++) setC(e.FB, p, p, -zt.re, -zt.im);
  if (br.conn === 'YgYg') {
    const nt = br.kvHighLL / br.kvLowLL / ltc;
    for (let p = 0; p < 3; p++) {
      setC(e.FA, p, p, 1 / nt);
      setC(e.BD, p, p, 1 / nt);
    }
    return e;
  }
  // Delta – grounded wye, step-down. nt = kV_LL(high) / kV_LN(low).
  //   V_a = (V_A − V_C)/nt − Zt·I_a  (and cyclically);  I_A = (I_a − I_b)/nt  (and cyclically)
  const nt = br.kvHighLL / (br.kvLowLL / Math.sqrt(3)) / ltc;
  for (let p = 0; p < 3; p++) {
    setC(e.FA, p, p, 1 / nt);
    setC(e.FA, p, (p + 2) % 3, -1 / nt);
    setC(e.BD, p, p, 1 / nt);
    setC(e.BD, p, (p + 1) % 3, -1 / nt);
  }
  return e;
}

function centerTapElem(br: CenterTapBranch): Elem {
  // E = (V_p − z0·(I_1 − I_2)/n)/n;  V_1 = E − z1·I_1;  V_2 = −E − z1·I_2;  I_p = (I_1 − I_2)/n
  const vp = br.kvPrimaryLN * 1000;
  const S = br.kva * 1000;
  const n = vp / 120;
  const z0 = new Complex(0.5 * br.zpu.re, 0.8 * br.zpu.im).scale((vp * vp) / S);
  const z1 = new Complex(br.zpu.re, 0.4 * br.zpu.im).scale((120 * 120) / S);
  const p = br.phase;
  const w = z0.scale(1 / (n * n));
  const e: Elem = { FA: M(), FB: M(), BC: M(), BD: M() };
  setC(e.FA, 0, p, 1 / n);
  setC(e.FA, 1, p, -1 / n);
  setC(e.FB, 0, 0, -w.re - z1.re, -w.im - z1.im);
  setC(e.FB, 0, 1, w.re, w.im);
  setC(e.FB, 1, 0, w.re, w.im);
  setC(e.FB, 1, 1, -w.re - z1.re, -w.im - z1.im);
  setC(e.BD, p, 0, 1 / n);
  setC(e.BD, p, 1, -1 / n);
  return e;
}

function makeElem(br: DBranch, taps: Map<string, [number, number, number]>): Elem {
  switch (br.kind) {
    case 'line':
      return lineElem(br);
    case 'transformer':
      return transformerElem(br);
    case 'centertap':
      return centerTapElem(br);
    case 'switch': {
      const e: Elem = { FA: M(), FB: M(), BC: M(), BD: M() };
      for (let p = 0; p < 3; p++) {
        setC(e.FA, p, p, 1);
        setC(e.BD, p, p, 1);
      }
      return e;
    }
    case 'regulator': {
      const e: Elem = { FA: M(), FB: M(), BC: M(), BD: M() };
      const t = taps.get(br.id)!;
      for (const p of br.phases) {
        const r = 1 + 0.00625 * t[p]!;
        setC(e.FA, p, p, r);
        setC(e.BD, p, p, r);
      }
      return e;
    }
  }
}

/** out[o..o+6] = M1·x1 + M2·x2 for 3-vectors of complex (re, im interleaved). */
function mulAdd(M1: Float64Array, x1: Float64Array, o1: number, M2: Float64Array, x2: Float64Array, o2: number, out: Float64Array, o: number): void {
  for (let r = 0; r < 3; r++) {
    let re = 0;
    let im = 0;
    for (let c = 0; c < 3; c++) {
      const k = (r * 3 + c) * 2;
      const ar = M1[k]!;
      const ai = M1[k + 1]!;
      const br = x1[o1 + 2 * c]!;
      const bi = x1[o1 + 2 * c + 1]!;
      re += ar * br - ai * bi;
      im += ar * bi + ai * br;
      const cr = M2[k]!;
      const ci = M2[k + 1]!;
      const dr = x2[o2 + 2 * c]!;
      const di = x2[o2 + 2 * c + 1]!;
      re += cr * dr - ci * di;
      im += cr * di + ci * dr;
    }
    out[o + 2 * r] = re;
    out[o + 2 * r + 1] = im;
  }
}

export function solveSweep(net: DistNetwork, source: V3, options: Partial<SweepOptions> = {}): SweepResult {
  const opts: SweepOptions = { tol: 1e-10, maxIter: 100, regulate: false, ...options };
  // tree, in breadth-first order from the root
  const children = new Map<string, DBranch[]>();
  for (const br of net.branches) {
    if (br.kind === 'switch' && !br.closed) continue;
    const l = children.get(br.from);
    if (l) l.push(br);
    else children.set(br.from, [br]);
  }
  const order: string[] = [];
  const parentOf = new Map<string, DBranch>();
  const seen = new Set<string>();
  for (let q = [net.root]; q.length; ) {
    const next: string[] = [];
    for (const n of q) {
      if (seen.has(n)) throw new Error(`distribution network is not radial at ${n}`);
      seen.add(n);
      order.push(n);
      for (const br of children.get(n) ?? []) {
        parentOf.set(br.to, br);
        next.push(br.to);
      }
    }
    q = next;
  }
  const N = order.length;
  const idx = new Map(order.map((n, i) => [n, i]));
  // per node (in order): its parent branch's element, the parent node's index
  const branches = order.map((n) => parentOf.get(n) ?? null);
  const parent = Int32Array.from(order, (n) => (parentOf.has(n) ? idx.get(parentOf.get(n)!.from)! : -1));
  const base = Float64Array.from(order, (n) => net.nodes.get(n)!.vbaseLN);
  const taps = new Map<string, [number, number, number]>();
  for (const br of net.branches) if (br.kind === 'regulator') taps.set(br.id, [...br.taps] as [number, number, number]);
  let elems: Array<Elem | null> = [];
  const buildElems = () => {
    elems = branches.map((b) => (b ? makeElem(b, taps) : null));
  };
  buildElems();
  // loads and capacitors by node index
  type L = { l: DLoad; i: number };
  const loads: L[] = [];
  for (const l of net.loads) {
    const i = idx.get(l.node);
    if (i !== undefined) loads.push({ l, i });
  }
  const caps: Array<{ i: number; y: number; phases: Phase[] }> = [];
  for (const c of net.caps) {
    const i = idx.get(c.node);
    if (c.closed && i !== undefined) caps.push({ i, y: (c.kvarPerPhase * 1000) / (c.vRatedLN * c.vRatedLN), phases: c.phases });
  }

  const V = new Float64Array(N * 6);
  const Vnew = new Float64Array(6);
  const It = new Float64Array(N * 6); // current arriving at node i through its parent branch
  const If = new Float64Array(N * 6); // current leaving node parent(i) into that branch
  const acc = new Float64Array(N * 6); // node injections + children, per sweep
  for (let p = 0; p < 3; p++) {
    V[2 * p] = source[p]!.re;
    V[2 * p + 1] = source[p]!.im;
  }

  const forward = (): number => {
    let change = 0;
    for (let k = 1; k < N; k++) {
      const e = elems[k]!;
      mulAdd(e.FA, V, parent[k]! * 6, e.FB, It, k * 6, Vnew, 0);
      const o = k * 6;
      let d = 0;
      for (let q = 0; q < 3; q++) {
        const dr = Vnew[2 * q]! - V[o + 2 * q]!;
        const di = Vnew[2 * q + 1]! - V[o + 2 * q + 1]!;
        d = Math.max(d, Math.hypot(dr, di));
      }
      change = Math.max(change, d / base[k]!);
      V.set(Vnew, o);
    }
    return change;
  };

  const vr = new Float64Array(2);
  /** Voltage across a load element at node i. */
  const loadV = (l: DLoad, i: number): void => {
    const o = i * 6;
    const ph = (p: number) => {
      vr[0] = V[o + 2 * p]!;
      vr[1] = V[o + 2 * p + 1]!;
    };
    switch (l.conn) {
      case 'Y':
        ph(l.phases[0]!);
        return;
      case 'L1N':
        ph(0);
        return;
      case 'L2N':
        ph(1);
        return;
      case 'L12':
        vr[0] = V[o]! - V[o + 2]!;
        vr[1] = V[o + 1]! - V[o + 3]!;
        return;
      case 'D': {
        const p = l.phases[0]!;
        const q = l.phases[1]!;
        vr[0] = V[o + 2 * p]! - V[o + 2 * q]!;
        vr[1] = V[o + 2 * p + 1]! - V[o + 2 * q + 1]!;
      }
    }
  };
  const ic = new Float64Array(2);
  /** Current a load draws at voltage vr, into ic. */
  const loadI = (l: DLoad): void => {
    const vre = vr[0]!;
    const vim = vr[1]!;
    const v2 = vre * vre + vim * vim;
    if (v2 < 1e-18) {
      ic[0] = 0;
      ic[1] = 0;
      return;
    }
    const P = l.kw * 1000;
    const Q = l.kvar * 1000;
    if (l.model === 'PQ') {
      // I = conj(S / V) = conj(S)·V / |V|²
      ic[0] = (P * vre + Q * vim) / v2;
      ic[1] = (P * vim - Q * vre) / v2;
    } else if (l.model === 'Z') {
      // I = V·conj(S) / V_rated²
      const k = 1 / (l.vRated * l.vRated);
      ic[0] = (vre * P + vim * Q) * k;
      ic[1] = (vim * P - vre * Q) * k;
    } else {
      // constant current magnitude |S|/V_rated at the load's power-factor angle from V
      const mag = Math.hypot(P, Q) / l.vRated;
      const ang = Math.atan2(vim, vre) - Math.atan2(Q, P);
      ic[0] = mag * Math.cos(ang);
      ic[1] = mag * Math.sin(ang);
    }
  };
  const addAt = (o: number, p: number, sgn: number) => {
    acc[o + 2 * p] = acc[o + 2 * p]! + sgn * ic[0]!;
    acc[o + 2 * p + 1] = acc[o + 2 * p + 1]! + sgn * ic[1]!;
  };

  const backward = () => {
    acc.fill(0);
    for (const { l, i } of loads) {
      loadV(l, i);
      loadI(l);
      const o = i * 6;
      switch (l.conn) {
        case 'Y':
          addAt(o, l.phases[0]!, 1);
          break;
        case 'L1N':
          addAt(o, 0, 1);
          break;
        case 'L2N':
          addAt(o, 1, 1);
          break;
        case 'L12':
          addAt(o, 0, 1);
          addAt(o, 1, -1);
          break;
        case 'D':
          addAt(o, l.phases[0]!, 1);
          addAt(o, l.phases[1]!, -1);
          break;
      }
    }
    // A capacitor draws I = jB·V: current leading voltage by 90°, i.e. it supplies vars.
    for (const c of caps) {
      const o = c.i * 6;
      for (const p of c.phases) {
        acc[o + 2 * p] = acc[o + 2 * p]! - c.y * V[o + 2 * p + 1]!;
        acc[o + 2 * p + 1] = acc[o + 2 * p + 1]! + c.y * V[o + 2 * p]!;
      }
    }
    for (let k = N - 1; k >= 1; k--) {
      const o = k * 6;
      for (let q = 0; q < 6; q++) It[o + q] = acc[o + q]!;
      const e = elems[k]!;
      mulAdd(e.BC, V, o, e.BD, It, o, If, o);
      const po = parent[k]! * 6;
      for (let q = 0; q < 6; q++) acc[po + q] = acc[po + q]! + If[o + q]!;
    }
  };

  forward(); // no-load voltages
  let iterations = 0;
  let change = Infinity;
  let converged = false;
  for (let outer = 0; outer < 30; outer++) {
    for (let it = 0; it < opts.maxIter; it++) {
      backward();
      change = forward();
      iterations++;
      if (change < opts.tol) {
        converged = true;
        break;
      }
    }
    if (!converged || !opts.regulate) break;
    // Regulators with line-drop compensation: move each phase's tap toward the band.
    let moved = false;
    for (const br of net.branches) {
      if (br.kind !== 'regulator' || !br.control) continue;
      const c = br.control;
      const t = taps.get(br.id)!;
      const k = idx.get(br.to)!;
      for (const p of br.phases) {
        const vo = new Complex(V[k * 6 + 2 * p]!, V[k * 6 + 2 * p + 1]!);
        const io = new Complex(It[k * 6 + 2 * p]!, It[k * 6 + 2 * p + 1]!);
        const vRelay = vo.scale(1 / c.ptRatio).sub(new Complex(c.r, c.x).mul(io).scale(1 / c.ctPrimary));
        const err = c.vset - vRelay.abs();
        if (Math.abs(err) > c.band / 2) {
          const step = Math.round(err / 0.75); // one tap = 0.625 % of 120 V
          const next = Math.max(-16, Math.min(16, t[p]! + step));
          if (next !== t[p]) {
            t[p] = next;
            moved = true;
          }
        }
      }
    }
    if (!moved) break;
    buildElems();
    converged = false;
  }
  // the root's own injection (the sweep leaves it in acc)
  const headRaw = acc.subarray(0, 6);

  // results, in the object form the rest of the model reads
  const v3 = (a: Float64Array, o: number): V3 => [new Complex(a[o]!, a[o + 1]!), new Complex(a[o + 2]!, a[o + 3]!), new Complex(a[o + 4]!, a[o + 5]!)];
  const Vmap = new Map<string, V3>();
  order.forEach((n, i) => Vmap.set(n, v3(V, i * 6)));
  const branch = new Map<string, BranchResult>();
  let losses = Complex.ZERO;
  const dot = (v: V3, i: V3) => v.reduce((s2, x, k) => s2.add(x.mul(i[k]!.conj())), Complex.ZERO);
  for (let k = 1; k < N; k++) {
    const br = branches[k]!;
    const i_f = v3(If, k * 6);
    const i_t = v3(It, k * 6);
    const Sf = dot(Vmap.get(br.from)!, i_f);
    const St = dot(Vmap.get(br.to)!, i_t);
    const loss = Sf.sub(St);
    losses = losses.add(loss);
    branch.set(br.id, { If: i_f, It: i_t, Sf, St, loss });
  }
  const loadS = new Map<string, Complex>();
  for (const { l, i } of loads) {
    loadV(l, i);
    loadI(l);
    // S = V · conj(I)
    loadS.set(l.id, new Complex(vr[0]! * ic[0]! + vr[1]! * ic[1]!, vr[1]! * ic[0]! - vr[0]! * ic[1]!));
  }
  const capQ = new Map<string, number>();
  for (const c of net.caps) {
    const i = idx.get(c.node);
    if (!c.closed || i === undefined) {
      capQ.set(c.id, 0);
      continue;
    }
    const y = (c.kvarPerPhase * 1000) / (c.vRatedLN * c.vRatedLN);
    capQ.set(c.id, c.phases.reduce<number>((s2, p) => s2 + y * (V[i * 6 + 2 * p]! ** 2 + V[i * 6 + 2 * p + 1]! ** 2), 0));
  }
  const headI = v3(headRaw, 0);
  return {
    converged,
    iterations,
    lastChange: change,
    V: Vmap,
    branch,
    loadS,
    capQ,
    headS: dot(Vmap.get(net.root)!, headI),
    headI,
    losses,
    taps,
  };
}
