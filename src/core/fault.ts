/**
 * Short-circuit calculation.
 *
 * WHAT A FAULT IS. Two conductors that should not be connected become
 * connected, usually through an arc. The impedance between them collapses from
 * the impedance of a load to the impedance of a few hundred metres of copper,
 * and the current rises to whatever the network can deliver — commonly twenty
 * or thirty times normal. Everything about protection is a consequence of that
 * number: how big a breaker has to be, how fast it has to act, and how a relay
 * can tell a fault from an unusually heavy load.
 *
 * HOW IT IS CALCULATED, AND WHY IT IS NOT A POWER FLOW. A power flow solves a
 * nonlinear problem because loads are specified in megawatts rather than as
 * impedances. A fault calculation does not need to: it is a linear circuit
 * problem, solved by superposition about the pre-fault operating point, and the
 * answer comes from one matrix solve rather than from iteration.
 *
 * THE THEVENIN EQUIVALENT. Looking into the network from the faulted bus, the
 * whole system reduces to one voltage source behind one impedance. That
 * impedance is the driving-point impedance Z_kk — the k-th diagonal of the bus
 * impedance matrix — and it is obtained here by solving Y·z = e_k, which is
 * one column of Z without ever forming the inverse.
 *
 * THREE NETWORKS, NOT ONE. A fault that is not three-phase is unbalanced, so it
 * must be worked in symmetrical components, and each sequence has its own
 * network with its own impedances and its own connectivity:
 *
 *   - POSITIVE sequence: the network as the power flow sees it, plus the
 *     subtransient reactance of every machine, because in the first cycles a
 *     machine behaves as a voltage behind X_d″ rather than as a power injection.
 *   - NEGATIVE sequence: the same passive network. Lines and transformers do
 *     not care which way the phase sequence turns.
 *   - ZERO sequence: a different network entirely. A line's zero-sequence
 *     impedance is around three times its positive-sequence impedance, because
 *     the return path is the earth rather than the other two conductors. And a
 *     transformer either passes zero-sequence current or blocks it completely
 *     depending on how its windings are connected — which is the single most
 *     important consequence of a vector group.
 */

import { Complex, C, add, mul, div, abs, arg, toDeg, inv } from './complex.js';
import { NetworkCase, Branch, CaseIndex } from './network.js';
import { Matrix, zeros, mset, luSolve } from './linalg.js';
import { PhaseSet, SequenceSet, toPhase, describe } from './sequence.js';

export type FaultKind =
  | 'three-phase'
  | 'single-line-to-ground'
  | 'line-to-line'
  | 'double-line-to-ground';

export type Sequence = 'positive' | 'negative' | 'zero';

// ---------------------------------------------------------------------------
// Sequence impedances
// ---------------------------------------------------------------------------

/**
 * How a branch appears in each sequence network.
 *
 * The positive and negative sequence values are the same for any passive
 * element. The zero sequence values are not, and the differences are physical:
 *
 * A LINE carries zero-sequence current in all three conductors at once,
 * returning through the earth and any shield wire. That loop encloses far more
 * area than the loop between two phase conductors, so its inductance is much
 * larger — typically two and a half to three and a half times. The resistance
 * is larger too, because the earth is a poor conductor.
 *
 * A TRANSFORMER depends entirely on its windings. A delta winding is a closed
 * loop with no connection to earth: zero-sequence current can circulate inside
 * it but cannot get in or out, so from outside the delta looks like an open
 * circuit. A grounded-wye winding has a path to earth and passes it. A
 * delta–grounded-wye transformer therefore BLOCKS zero sequence on the delta
 * side and SUPPLIES it on the wye side, which is why a ground fault on a
 * distribution feeder does not push earth current back onto the transmission
 * system.
 */
export const ZERO_SEQUENCE_RATIO = {
  /** Z₀ / Z₁ for an overhead line. */
  line: 3.0,
  /** Z₀ / Z₁ for an underground cable, where the sheath is the return. */
  cable: 2.0,
  /** B₀ / B₁ for a line: less capacitance to earth than between phases. */
  lineCharging: 0.6,
} as const;

/** Whether a transformer passes zero-sequence current, and from which side. */
export interface ZeroSequencePath {
  /** Does zero-sequence current flow through, from side to side? */
  through: boolean;
  /** Is there a path to earth at the from (high-voltage) terminal? */
  groundedFrom: boolean;
  /** Is there a path to earth at the to (low-voltage) terminal? */
  groundedTo: boolean;
  /** Plain-language explanation, for the drawing. */
  why: string;
}

/**
 * Read a vector group and work out what it does to zero sequence.
 *
 * The notation is IEC 60076-1: capital letters are the high-voltage winding,
 * lower case the low-voltage one. D or d is delta, Y or y is wye, N or n means
 * the wye's star point is brought out and earthed, and the trailing number is
 * the phase shift in units of 30°.
 */
export function zeroSequencePath(vectorGroup: string | undefined): ZeroSequencePath {
  const raw = (vectorGroup ?? 'YNa0').trim();

  if (/regulator/i.test(raw)) {
    return {
      through: true, groundedFrom: true, groundedTo: true,
      why:
        'A voltage regulator is an autotransformer with its windings in ' +
        'series, so zero-sequence current passes straight through it.',
    };
  }

  // Strip the clock number, then split into the high-voltage winding letters
  // and the low-voltage ones. IEC 60076-1: capitals are the high-voltage
  // winding, lower case the low-voltage one, N or n means the star point is
  // brought out and earthed, and "a" means an autotransformer.
  const letters = raw.replace(/\d+$/, '');
  const hvMatch = /^([DYZ])(N?)/.exec(letters);
  const hv = hvMatch ? hvMatch[1] : 'Y';
  const hvGrounded = hvMatch ? hvMatch[2] === 'N' : false;
  const lv = letters.slice(hvMatch ? hvMatch[0].length : 1).toLowerCase();

  if (lv.startsWith('a')) {
    return {
      through: true, groundedFrom: true, groundedTo: true,
      why:
        'An autotransformer shares its windings between the two voltages, so ' +
        'zero-sequence current passes straight through. It cannot keep one ' +
        'system\u2019s earth faults out of the other, which is why these are ' +
        'usually built with a delta tertiary winding to give the zero sequence ' +
        'somewhere to circulate.',
    };
  }

  const lvDelta = lv.startsWith('d');
  const lvGrounded = lv.startsWith('y') && lv.includes('n');
  const hvDelta = hv === 'D';

  if (hvDelta && lvGrounded) {
    return {
      through: false, groundedFrom: false, groundedTo: true,
      why:
        'Delta on the high side, earthed wye on the low side. The delta is a ' +
        'closed loop with no connection to earth, so zero-sequence current can ' +
        'circulate inside it but cannot get in or out — it looks like an open ' +
        'circuit from the high side. The earthed wye supplies zero sequence to ' +
        'the low side. This is why a ground fault on a feeder does not push ' +
        'earth current back onto the transmission system, and why the feeder ' +
        'has a neutral at all.',
    };
  }
  if (hvGrounded && lvGrounded) {
    return {
      through: true, groundedFrom: true, groundedTo: true,
      why:
        'Earthed wye on both sides, so zero-sequence current passes through — ' +
        'and a ground fault on one side is therefore visible as ground current ' +
        'on the other.',
    };
  }
  if (hvGrounded && lvDelta) {
    return {
      through: false, groundedFrom: true, groundedTo: false,
      why:
        'Earthed wye on the high side, delta on the low. Zero sequence has a ' +
        'path to earth on the high side and none at all on the low side, so ' +
        'the low-voltage system is ungrounded unless something else earths it.',
    };
  }
  return {
    through: false, groundedFrom: hvGrounded, groundedTo: lvGrounded,
    why:
      'Neither winding offers a complete path for zero-sequence current, so it ' +
      'is blocked in both directions and the system on either side is ' +
      'ungrounded as far as this transformer is concerned.',
  };
}

/** Series impedance of a branch in a given sequence, per-unit. */
export function branchImpedance(br: Branch, sequence: Sequence): Complex {
  const z1 = C(br.r, br.x);
  if (sequence !== 'zero') return z1;
  if (br.kind === 'transformer') return z1;   // a transformer's Z₀ ≈ Z₁
  const k = br.kind === 'cable'
    ? ZERO_SEQUENCE_RATIO.cable : ZERO_SEQUENCE_RATIO.line;
  return C(br.r * k, br.x * k);
}

// ---------------------------------------------------------------------------
// The sequence admittance matrices
// ---------------------------------------------------------------------------

export interface SequenceNetwork {
  sequence: Sequence;
  /** Complex bus admittance matrix, n × n. */
  y: Complex[][];
  order: string[];
  index: Map<string, number>;
}

/**
 * Build the bus admittance matrix for one sequence.
 *
 * The positive and negative sequence networks are the ordinary one, with every
 * machine represented as a shunt admittance 1/jX_d″ at its bus — because in the
 * first cycles after a fault a synchronous machine is a voltage source behind
 * its subtransient reactance, not a scheduled power injection.
 *
 * The zero sequence network is assembled differently, branch by branch,
 * according to what each transformer's windings actually do.
 */
export function buildSequenceNetwork(
  net: NetworkCase, idx: CaseIndex, sequence: Sequence
): SequenceNetwork {
  const order = net.buses.map((b) => b.id);
  const index = new Map(order.map((id, i) => [id, i]));
  const n = order.length;
  const y: Complex[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => C(0, 0)));

  const addSeries = (i: number, k: number, z: Complex, tap: number) => {
    if (abs(z) < 1e-12) return;
    const yy = inv(z);
    const a = tap || 1;
    y[i][i] = add(y[i][i], div(yy, C(a * a, 0)));
    y[k][k] = add(y[k][k], yy);
    y[i][k] = add(y[i][k], mul(C(-1 / a, 0), yy));
    y[k][i] = add(y[k][i], mul(C(-1 / a, 0), yy));
  };
  const addShunt = (i: number, z: Complex) => {
    if (abs(z) < 1e-12) return;
    y[i][i] = add(y[i][i], inv(z));
  };

  for (const br of net.branches) {
    if (!br.inService) continue;
    const i = index.get(br.from);
    const k = index.get(br.to);
    if (i === undefined || k === undefined) continue;
    const z = branchImpedance(br, sequence);

    if (sequence !== 'zero') {
      addSeries(i, k, z, br.tap ?? 1);
      // Line charging appears in the positive and negative networks as it does
      // in the power flow.
      if (br.b > 0) {
        const half = C(0, br.b / 2);
        y[i][i] = add(y[i][i], half);
        y[k][k] = add(y[k][k], half);
      }
      continue;
    }

    // --- zero sequence ------------------------------------------------------
    if (br.kind !== 'transformer') {
      addSeries(i, k, z, br.tap ?? 1);
      if (br.b > 0) {
        const half = C(0, (br.b * ZERO_SEQUENCE_RATIO.lineCharging) / 2);
        y[i][i] = add(y[i][i], half);
        y[k][k] = add(y[k][k], half);
      }
      continue;
    }

    const path = zeroSequencePath(br.vectorGroup);
    if (path.through) {
      addSeries(i, k, z, br.tap ?? 1);
    } else {
      // The winding that is earthed offers a path from its bus to earth
      // through the transformer's own impedance; the other side is open.
      if (path.groundedFrom) addShunt(i, z);
      if (path.groundedTo) addShunt(k, z);
    }
  }

  // Machines. In the positive and negative networks they are a source behind
  // X_d″. In the zero sequence network a generator is almost always connected
  // through a delta winding, so it contributes nothing — which this represents
  // by simply leaving it out.
  if (sequence !== 'zero') {
    for (const g of net.generators) {
      if (!g.inService) continue;
      const i = index.get(g.bus);
      if (i === undefined) continue;
      // The machine's subtransient reactance, on its own base, converted to
      // the system base.
      const xdpp = g.xdpp ?? 0.2;
      const xSystem = xdpp * (net.baseMVA / g.mBaseMVA);
      addShunt(i, C(0, xSystem));
    }
  }

  void idx;
  return { sequence, y, order, index };
}

// ---------------------------------------------------------------------------
// Thevenin impedance
// ---------------------------------------------------------------------------

/**
 * The driving-point impedance looking into a bus, Z_kk.
 *
 * Solving Y·z = e_k gives the k-th column of Z = Y⁻¹, and its k-th entry is
 * the Thevenin impedance at that bus. The whole inverse is never formed, which
 * matters: for a ninety-bus network that is eight thousand complex numbers for
 * one that is needed.
 *
 * The complex system is solved by writing it out in real arithmetic:
 *
 *     ⎡ Re(Y)  −Im(Y) ⎤ ⎡ Re(z) ⎤   ⎡ Re(b) ⎤
 *     ⎢               ⎥ ⎢       ⎥ = ⎢       ⎥
 *     ⎣ Im(Y)   Re(Y) ⎦ ⎣ Im(z) ⎦   ⎣ Im(b) ⎦
 *
 * which is exactly the same equations, and lets the same LU routine the power
 * flow uses do the work.
 */
export function theveninImpedance(sn: SequenceNetwork, busId: string): Complex {
  const k = sn.index.get(busId);
  if (k === undefined) throw new Error(`unknown bus "${busId}"`);

  // THE ZERO SEQUENCE NETWORK IS GENUINELY DISCONNECTED, and that is not a
  // defect to be smoothed over — it is the most important thing about it. Every
  // delta winding is an open circuit to zero sequence, so the network falls
  // into islands, and a bus in an island with no path to earth simply cannot
  // carry zero-sequence current at all. Its Thevenin impedance is infinite.
  //
  // Solving the whole matrix at once therefore fails on a singular pivot
  // somewhere else entirely. So the solve is restricted to the island the
  // faulted bus is actually in, and an island with no connection to earth
  // returns infinity rather than a number.
  const island = componentContaining(sn, k);
  const local = island.indexOf(k);
  const n = island.length;

  const m: Matrix = zeros(2 * n, 2 * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const z = sn.y[island[i]][island[j]];
      mset(m, i, j, z.re);
      mset(m, i, j + n, -z.im);
      mset(m, i + n, j, z.im);
      mset(m, i + n, j + n, z.re);
    }
  }
  const b = new Float64Array(2 * n);
  b[local] = 1;
  let x: Float64Array;
  try {
    x = luSolve(m, b);
  } catch {
    // No reference to earth anywhere in this island. Physically: an ungrounded
    // system, in which a single line to earth drives almost no current at all
    // and the system keeps running with one phase at earth potential — which is
    // exactly why some industrial systems are built that way on purpose.
    return C(Infinity, Infinity);
  }
  return C(x[local], x[local + n]);
}

/**
 * The buses reachable from one bus through non-zero off-diagonal admittances.
 *
 * This is connectivity in the SEQUENCE network, which is not the same as
 * connectivity in the physical one: a transformer that is a solid connection in
 * the positive sequence network may be an open circuit in the zero sequence one.
 */
function componentContaining(sn: SequenceNetwork, k: number): number[] {
  const n = sn.order.length;
  const seen = new Set<number>([k]);
  const stack = [k];
  while (stack.length > 0) {
    const i = stack.pop()!;
    for (let j = 0; j < n; j++) {
      if (j === i || seen.has(j)) continue;
      if (abs(sn.y[i][j]) > 1e-12) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// The faults themselves
// ---------------------------------------------------------------------------

export interface FaultResult {
  kind: FaultKind;
  busId: string;
  /** Pre-fault voltage at the bus, per-unit. The Thevenin source. */
  prefaultV: Complex;
  /** Sequence impedances at the bus, per-unit. */
  z1: Complex;
  z2: Complex;
  z0: Complex;
  /** Fault impedance, per-unit. Zero for a bolted fault. */
  zf: Complex;
  /** Sequence currents INTO the fault, per-unit. */
  sequenceCurrents: SequenceSet;
  /** Phase currents into the fault, per-unit and in amperes. */
  phaseCurrents: PhaseSet;
  phaseAmps: { phase: 'a' | 'b' | 'c'; magnitude: number; angleDeg: number }[];
  /** Base current at this voltage level, amperes. */
  baseAmps: number;
  /** The largest phase current, amperes — what a breaker has to interrupt. */
  maxAmps: number;
  /** Residual current, 3·I₀, amperes: what a ground relay sees. */
  residualAmps: number;
  /** The short-circuit level, MVA. */
  mva: number;
  /** How the three sequence networks are connected for this fault. */
  connection: string;
}

/**
 * Solve a shunt fault at a bus.
 *
 * Each fault type connects the three sequence networks differently, and the
 * connection IS the derivation. They are worth stating plainly because they are
 * the whole of fault analysis:
 *
 *   THREE-PHASE. Balanced, so there is no negative or zero sequence at all.
 *   Only the positive sequence network is involved: I₁ = V / (Z₁ + Z_f).
 *
 *   SINGLE LINE TO GROUND. The three networks in SERIES, because the same
 *   current must flow in all three: I₀ = I₁ = I₂ = V / (Z₀ + Z₁ + Z₂ + 3Z_f).
 *   The three on the fault impedance is because the fault current is 3I₀ while
 *   the sequence current is I₀.
 *
 *   LINE TO LINE. Positive and negative in PARALLEL opposition, and no zero
 *   sequence at all because no current reaches earth: I₁ = −I₂ =
 *   V / (Z₁ + Z₂ + Z_f).
 *
 *   DOUBLE LINE TO GROUND. Positive in series with the PARALLEL combination of
 *   negative and zero, because the fault current divides between them.
 */
export function solveFault(
  networks: { positive: SequenceNetwork; negative: SequenceNetwork; zero: SequenceNetwork },
  busId: string,
  kind: FaultKind,
  options: { prefaultV?: Complex; zf?: Complex; baseKV: number; baseMVA: number } 
): FaultResult {
  const z1 = theveninImpedance(networks.positive, busId);
  const z2 = theveninImpedance(networks.negative, busId);
  const z0 = theveninImpedance(networks.zero, busId);
  const v = options.prefaultV ?? C(1, 0);
  const zf = options.zf ?? C(0, 0);

  let seq: SequenceSet;
  let connection: string;

  switch (kind) {
    case 'three-phase': {
      const i1 = div(v, add(z1, zf));
      seq = { zero: C(0, 0), positive: i1, negative: C(0, 0) };
      connection =
        'Balanced, so there is no negative or zero sequence at all. Only the ' +
        'positive sequence network is involved, and the fault current is ' +
        'simply the pre-fault voltage over the positive sequence impedance.';
      break;
    }
    case 'single-line-to-ground': {
      const total = add(add(add(z0, z1), z2), mul(C(3, 0), zf));
      const i = div(v, total);
      seq = { zero: i, positive: i, negative: i };
      connection =
        'The three networks in SERIES, because the same current has to flow ' +
        'through all three. The fault impedance appears as 3Z_f, because the ' +
        'current in the fault is 3I₀ while the current in each sequence network ' +
        'is I₀.';
      break;
    }
    case 'line-to-line': {
      const i1 = div(v, add(add(z1, z2), zf));
      seq = { zero: C(0, 0), positive: i1, negative: mul(C(-1, 0), i1) };
      connection =
        'Positive and negative in PARALLEL OPPOSITION, and no zero sequence at ' +
        'all: the two faulted phases are connected to each other and not to ' +
        'earth, so nothing returns through the ground.';
      break;
    }
    case 'double-line-to-ground': {
      const zfe = add(z0, mul(C(3, 0), zf));
      const parallel = div(mul(z2, zfe), add(z2, zfe));
      const i1 = div(v, add(z1, parallel));
      const vFault = mul(i1, parallel);
      seq = {
        positive: i1,
        negative: mul(C(-1, 0), div(vFault, z2)),
        zero: mul(C(-1, 0), div(vFault, zfe)),
      };
      connection =
        'Positive in series with the PARALLEL combination of negative and zero, ' +
        'because the current returning to earth divides between those two ' +
        'paths. This is usually the most severe fault of all at a station with ' +
        'strong earthing.';
      break;
    }
  }

  const phase = toPhase(seq);
  const baseAmps = (options.baseMVA * 1e6) / (Math.sqrt(3) * options.baseKV * 1000);
  const described = describe(phase).map((d) => ({
    ...d, magnitude: d.magnitude * baseAmps,
  }));
  const maxAmps = Math.max(...described.map((d) => d.magnitude));
  const residualAmps = abs(mul(C(3, 0), seq.zero)) * baseAmps;

  return {
    kind, busId,
    prefaultV: v,
    z1, z2, z0, zf,
    sequenceCurrents: seq,
    phaseCurrents: phase,
    phaseAmps: described,
    baseAmps,
    maxAmps,
    residualAmps,
    mva: (maxAmps * Math.sqrt(3) * options.baseKV * 1000) / 1e6,
    connection,
  };
}

/** Everything needed to solve faults anywhere in a case, built once. */
export function buildFaultModel(net: NetworkCase, idx: CaseIndex): {
  positive: SequenceNetwork; negative: SequenceNetwork; zero: SequenceNetwork;
} {
  return {
    positive: buildSequenceNetwork(net, idx, 'positive'),
    negative: buildSequenceNetwork(net, idx, 'negative'),
    zero: buildSequenceNetwork(net, idx, 'zero'),
  };
}

/** The angle of an impedance, degrees — how inductive the source is. */
export const impedanceAngleDeg = (z: Complex): number => toDeg(arg(z));
