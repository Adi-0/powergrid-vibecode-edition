/**
 * Symmetrical components.
 *
 * THE PROBLEM THEY SOLVE. A balanced three-phase system can be solved as one
 * circuit, which is why the rest of this app can. A fault is not balanced: one
 * conductor touches earth, or two touch each other, and the three phases stop
 * being copies of one another rotated by 120°. The whole apparatus of
 * single-phase equivalents collapses.
 *
 * Fortescue's result, from 1918, is that ANY set of three phasors can be
 * written as the sum of three BALANCED sets:
 *
 *   - a POSITIVE sequence set, three equal phasors 120° apart in the order
 *     a-b-c — an ordinary balanced system;
 *   - a NEGATIVE sequence set, three equal phasors 120° apart in the order
 *     a-c-b — the same thing turning backwards;
 *   - a ZERO sequence set, three equal phasors all in phase with each other,
 *     which do not sum to zero and must therefore return through earth.
 *
 * That is not a mathematical trick. Each of the three behaves differently in
 * real equipment and each has its own network:
 *
 *   - An induction motor turns with the positive sequence and is BRAKED by the
 *     negative sequence, which is why unbalance overheats motors.
 *   - Zero sequence current is identical in all three phases, so it cannot flow
 *     unless there is a return path through earth. A delta winding has no
 *     connection to earth at all and blocks it completely — which is the whole
 *     reason a distribution transformer is delta on the high side.
 *
 * So the unbalanced problem becomes three balanced ones, solved separately and
 * connected together in a way that depends on what kind of fault it is. That
 * connection is the subject of `fault.ts`.
 */

import { Complex, C, polar, add, mul, abs, arg, toDeg } from './complex.js';

/**
 * The operator a: a rotation of 120° with no change of magnitude.
 *
 *     a = 1∠120° = −0.5 + j0.866
 *
 * Everything in this file is built from it. a³ = 1, and 1 + a + a² = 0 —
 * which is the statement that three equal phasors 120° apart add to nothing,
 * and is why a balanced system needs no neutral conductor.
 */
export const A: Complex = polar(1, (2 * Math.PI) / 3);
export const A2: Complex = polar(1, (4 * Math.PI) / 3);

/** Three phase quantities, in the order a, b, c. */
export interface PhaseSet { a: Complex; b: Complex; c: Complex }

/** Three sequence quantities: zero, positive, negative. */
export interface SequenceSet { zero: Complex; positive: Complex; negative: Complex }

/**
 * Phase quantities to sequence quantities.
 *
 *     ⎡V₀⎤       ⎡1  1   1 ⎤ ⎡Va⎤
 *     ⎢V₁⎥ = ⅓ · ⎢1  a   a²⎥ ⎢Vb⎥
 *     ⎣V₂⎦       ⎣1  a²  a ⎦ ⎣Vc⎦
 *
 * The one third is what makes it an average rather than a sum: the zero
 * sequence component is literally the mean of the three phasors.
 */
export function toSequence(p: PhaseSet): SequenceSet {
  const third = C(1 / 3, 0);
  return {
    zero: mul(third, add(add(p.a, p.b), p.c)),
    positive: mul(third, add(add(p.a, mul(A, p.b)), mul(A2, p.c))),
    negative: mul(third, add(add(p.a, mul(A2, p.b)), mul(A, p.c))),
  };
}

/**
 * Sequence quantities back to phase quantities.
 *
 *     ⎡Va⎤   ⎡1  1   1 ⎤ ⎡V₀⎤
 *     ⎢Vb⎥ = ⎢1  a²  a ⎥ ⎢V₁⎥
 *     ⎣Vc⎦   ⎣1  a   a²⎦ ⎣V₂⎦
 *
 * No factor of three here, which is the asymmetry that catches everybody: the
 * forward transform averages and the inverse one sums.
 */
export function toPhase(s: SequenceSet): PhaseSet {
  return {
    a: add(add(s.zero, s.positive), s.negative),
    b: add(add(s.zero, mul(A2, s.positive)), mul(A, s.negative)),
    c: add(add(s.zero, mul(A, s.positive)), mul(A2, s.negative)),
  };
}

/**
 * The residual current: Ia + Ib + Ic, which is three times the zero sequence.
 *
 * This is the quantity a ground overcurrent relay actually measures, and the
 * reason it can be set far more sensitively than the phase elements: in a
 * balanced circuit it is zero no matter how much load is flowing, so anything
 * it sees is current returning through the earth.
 */
export const residual = (p: PhaseSet): Complex => add(add(p.a, p.b), p.c);

/**
 * How unbalanced a set is: the negative sequence as a fraction of the positive.
 *
 * Standards limit this to about 1 % on the transmission system and 2 % at a
 * customer's terminals, because negative sequence current in a rotating machine
 * produces a field turning backwards at twice synchronous speed and heats the
 * rotor surface.
 */
export function unbalanceFactor(p: PhaseSet): number {
  const s = toSequence(p);
  const pos = abs(s.positive);
  return pos > 0 ? abs(s.negative) / pos : 0;
}

/** A balanced positive-sequence set, for comparison and for tests. */
export function balanced(magnitude: number, angleDeg = 0): PhaseSet {
  return toPhase({
    zero: C(0, 0),
    positive: polar(magnitude, (angleDeg * Math.PI) / 180),
    negative: C(0, 0),
  });
}

/** Magnitude and angle of each phase, for display. */
export function describe(p: PhaseSet): {
  phase: 'a' | 'b' | 'c'; magnitude: number; angleDeg: number;
}[] {
  return (['a', 'b', 'c'] as const).map((k) => ({
    phase: k,
    magnitude: abs(p[k]),
    angleDeg: toDeg(arg(p[k])),
  }));
}

