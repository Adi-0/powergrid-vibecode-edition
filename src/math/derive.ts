/**
 * Worked derivations, bound to whatever is selected.
 *
 * THE RULE THAT GOVERNS THIS FILE. Every step shows the equation in its general
 * form, then the same equation with this object's numbers substituted, then the
 * result with its units. The substituted line is a real arithmetic string, and
 * the value printed under it is what that string evaluates to — not a number
 * computed separately in TypeScript and described in prose beside it. The two
 * cannot drift apart because there is only one of them.
 *
 * Where a step reproduces something the solver also computed, it carries a
 * `checkAgainst`, and `test/math-panel.test.ts` asserts the two agree. That is
 * the real claim of this panel: not "here is roughly how it works", but "here
 * is the arithmetic, and if you do it by hand you get the number the solver
 * got".
 *
 * INTERMEDIATE QUANTITIES ARE EXPOSED, NOT HIDDEN. A branch derivation walks
 * the whole chain — per-unit bases, impedance in ohms, series admittance,
 * the voltage difference, the series current, the charging current, the total
 * current, and only then the complex power. Every one of those is a line on the
 * page, because the step a reader gets stuck on is never the last one.
 *
 * SIGN CONVENTIONS ARE STATED, NOT ASSUMED. Each derivation names its reference
 * direction in words and draws it, because the commonest way to get a power
 * flow wrong by hand is to be confident about a sign for the wrong reason.
 */

import { SolvedCase, BranchFlow } from '../core/results.js';
import { Branch, Bus, Generator, NetworkCase } from '../core/network.js';
import { lineParameters, LineParameters } from '../core/lines.js';
import { CLASS_CONSTRUCTION } from '../data/california/build.js';
import { DropStep } from '../data/california/service.js';
import { PlantEnergyChain } from '../data/california/plant.js';
import { MachineOperatingPoint, CapabilityCurve } from '../core/machine.js';
import { FaultResult } from '../core/fault.js';
import { ReliabilityResult, RELIABILITY_DATA } from '../sim/reliability.js';
import { MotorStudy, LOAD_BREAKAWAY_TORQUE_PU } from '../sim/motor-start.js';
import { FerrantiStudy } from '../sim/ferranti.js';
import { FactorSet } from '../sim/factors.js';
import {
  NEMA_CODE_LETTERS, lockedRotorKVAperHP, running, WATTS_PER_HP,
} from '../core/motor.js';
import { add } from '../core/complex.js';
import { evaluate, num } from './expr.js';

export interface DerivationStep {
  /** What this step is for, in one short phrase. */
  label: string;
  /** The equation in standard symbols, exactly as the field writes it. */
  general: string;
  /**
   * The same equation with this object's numbers. This string is evaluated to
   * produce `value`; it is not a description of the arithmetic, it is the
   * arithmetic.
   */
  substituted: string;
  /** What `substituted` evaluates to. Never typed in by hand. */
  value: number;
  unit: string;
  decimals?: number;
  /** Why this step exists, or what the number means. */
  note?: string;
  /** A quantity the solver also computed, which this must agree with. */
  checkAgainst?: { name: string; value: number; tolerance: number };
}

export interface BaseQuantity {
  symbol: string;
  value: number;
  unit: string;
  note: string;
}

export interface Derivation {
  id: string;
  title: string;
  subtitle: string;
  /** The standard that defines this form, where one does. */
  standard?: string;
  /** The reference direction and sign convention, in words. */
  convention?: string;
  /** The same, drawn. */
  diagram?: string;
  /** The per-unit bases in force. Never omitted where per-unit is used. */
  bases?: BaseQuantity[];
  steps: DerivationStep[];
  /** A closing remark: what the reader should take from the whole chain. */
  closing?: string;
}

/**
 * Build one step, evaluating its own arithmetic.
 *
 * This is the only way a step is ever constructed, which is what guarantees
 * that no panel can print a result its own working does not produce.
 */
function step(
  label: string,
  general: string,
  substituted: string,
  unit: string,
  opts: {
    decimals?: number;
    note?: string;
    checkAgainst?: { name: string; value: number; tolerance: number };
  } = {}
): DerivationStep {
  return {
    label, general, substituted,
    value: evaluate(substituted),
    unit,
    ...(opts.decimals !== undefined ? { decimals: opts.decimals } : {}),
    ...(opts.note !== undefined ? { note: opts.note } : {}),
    ...(opts.checkAgainst !== undefined ? { checkAgainst: opts.checkAgainst } : {}),
  };
}

/** A number as it appears inside an arithmetic string. */
const n = (v: number, d = 6): string => {
  if (v === 0) return '0';
  // Trimmed, because an operand written as 2500.000000 is harder to read than
  // 2500 and is not making any claim about precision that 2500 does not.
  const s = num(v, d, true);
  // A negative number inside a product needs brackets, or "a * -b" is
  // ambiguous to read even though the parser copes.
  return v < 0 ? `(${s})` : s;
};

// ---------------------------------------------------------------------------
// Per-unit bases — the foundation under everything else
// ---------------------------------------------------------------------------

/**
 * The bases in force at a given nominal voltage.
 *
 * The brief is emphatic that a per-unit value never appears without its base,
 * and it is right: a per-unit number with no base is not a number, it is a
 * rumour. Every derivation that touches per-unit carries these.
 */
export function perUnitBases(baseKV: number, baseMVA: number): BaseQuantity[] {
  return [
    {
      symbol: 'S_base', value: baseMVA, unit: 'MVA',
      note: 'One number for the whole system, chosen once. 100 MVA is the convention.',
    },
    {
      symbol: 'V_base', value: baseKV, unit: 'kV',
      note: 'Line-to-line, and it changes at every transformer — which is the whole point: the transformer disappears from the arithmetic.',
    },
    {
      symbol: 'Z_base', value: (baseKV * baseKV) / baseMVA, unit: 'Ω',
      note: 'Z_base = V_base² / S_base',
    },
    {
      symbol: 'I_base', value: (baseMVA * 1000) / (Math.sqrt(3) * baseKV), unit: 'A',
      note: 'I_base = S_base / (√3 · V_base), the √3 because V_base is line-to-line and current is per phase.',
    },
  ];
}

/** The per-unit bases, derived rather than asserted. */
export function deriveBases(baseKV: number, baseMVA: number): Derivation {
  return {
    id: `bases:${baseKV}`,
    title: 'Per-unit bases',
    subtitle: `${baseKV} kV on a ${baseMVA} MVA system base`,
    convention:
      'Per-unit means every quantity divided by a base of the same kind. Two ' +
      'bases are chosen — apparent power for the whole system, and voltage for ' +
      'each voltage level — and every other base follows from them.',
    steps: [
      step('Impedance base', 'Z_base = V_base² / S_base',
        `${n(baseKV)}^2 / ${n(baseMVA)}`, 'Ω', {
          note:
            'Both in the same units, so kV² over MVA gives ohms directly. This ' +
            'is the number that turns a per-unit impedance back into something ' +
            'you could measure with a bridge.',
        }),
      step('Current base', 'I_base = S_base / (√3 · V_base)',
        `${n(baseMVA)} * 1000 / (sqrt(3) * ${n(baseKV)})`, 'A', {
          note:
            'The √3 is there because V_base is the voltage BETWEEN two phases ' +
            'while the current is the current IN one phase.',
        }),
      step('Check', 'V_base / (√3 · Z_base) should equal I_base',
        `${n(baseKV)} * 1000 / (sqrt(3) * (${n(baseKV)}^2 / ${n(baseMVA)}))`, 'A', {
          note:
            'The same number by a different route, which is the point of a ' +
            'consistent set of bases: any two of them determine the rest.',
          checkAgainst: {
            name: 'I_base',
            value: (baseMVA * 1000) / (Math.sqrt(3) * baseKV),
            tolerance: 1e-6,
          },
        }),
    ],
    closing:
      'Per-unit is not a trick to make numbers smaller. Its real work is that a ' +
      'transformer with the right base on each side becomes a plain impedance ' +
      'with no ratio at all, so a network spanning five voltage levels can be ' +
      'solved as one circuit.',
  };
}

// ---------------------------------------------------------------------------
// A bus
// ---------------------------------------------------------------------------

export function deriveBus(bus: Bus, solved: SolvedCase): Derivation | null {
  const r = solved.busById.get(bus.id);
  if (!r) return null;
  const baseMVA = solved.net.baseMVA;

  const steps: DerivationStep[] = [
    step('Voltage in kilovolts', 'V = v_pu · V_base',
      `${n(r.vpu)} * ${n(bus.baseKV)}`, 'kV', {
        decimals: 2,
        note: 'Line-to-line, because that is what V_base is.',
        checkAgainst: { name: 'solver V', value: r.vkV, tolerance: 1e-6 },
      }),
    step('Line-to-neutral', 'V_LN = V_LL / √3',
      `${n(r.vpu * bus.baseKV)} / sqrt(3)`, 'kV', {
        decimals: 3,
        note:
          'What one phase conductor sits at with respect to earth. It is the ' +
          'number that decides how much insulation the equipment needs.',
      }),
    step('Real part of the phasor', 'Re(V) = v · cos θ',
      `${n(r.vpu)} * cosd(${n(r.angleDeg)})`, 'pu', {
        decimals: 5,
      }),
    step('Imaginary part', 'Im(V) = v · sin θ',
      `${n(r.vpu)} * sind(${n(r.angleDeg)})`, 'pu', {
        decimals: 5,
        note:
          'The angle is measured against the slack bus, which is the reference ' +
          'the whole solution is built on. Only differences in angle mean ' +
          'anything; the absolute value is a choice.',
      }),
  ];

  if (Math.abs(r.pInjMW) > 1e-9 || Math.abs(r.qInjMVAr) > 1e-9) {
    steps.push(
      step('Net real injection', 'P_inj = P_gen − P_load',
        `${n(r.pGenMW, 5)} - ${n(r.pLoadMW, 5)}`, 'MW', {
          decimals: 2,
          note:
            'Positive means this bus is putting power into the network. This is ' +
            'the quantity the power flow drives to zero mismatch.',
          checkAgainst: { name: 'solver P_inj', value: r.pInjMW, tolerance: 1e-6 },
        }),
      step('Net reactive injection', 'Q_inj = Q_gen − Q_load',
        `${n(r.qGenMVAr, 5)} - ${n(r.qLoadMVAr, 5)}`, 'MVAr', {
          decimals: 2,
          checkAgainst: { name: 'solver Q_inj', value: r.qInjMVAr, tolerance: 1e-6 },
        }),
      step('In per-unit', 'P_pu = P / S_base',
        `${n(r.pInjMW, 5)} / ${n(baseMVA)}`, 'pu', {
          decimals: 5,
          note: 'Which is the form the Jacobian actually works in.',
        })
    );
  }

  return {
    id: `bus:${bus.id}`,
    title: 'Bus voltage',
    subtitle: `${bus.name} — ${bus.baseKV} kV, ${busTypeName(r.type)}`,
    standard: 'ANSI C84.1 voltage classes; V∠θ phasor notation',
    convention:
      'Voltage is a phasor: a magnitude and an angle, both of which the solver ' +
      'finds. The angle is relative to the slack bus. Injection is positive ' +
      'INTO the network, so a load is a negative injection.',
    bases: perUnitBases(bus.baseKV, baseMVA),
    steps,
    closing:
      r.type === 'slack'
        ? 'This is the slack bus. Its voltage and angle are fixed by definition, ' +
          'and its generation is whatever the rest of the solution leaves over — ' +
          'which is how the arithmetic closes when losses are not known until ' +
          'after it has been solved.'
        : r.type === 'PV'
          ? 'A PV bus: the machine holds the voltage magnitude, so the solver ' +
            'finds the angle and the reactive power instead. If the reactive ' +
            'power would exceed what the machine can produce, the bus is pinned ' +
            'at that limit and becomes a PQ bus.'
          : 'A PQ bus: real and reactive power are both known — it is a load, or ' +
            'nothing at all — and the solver finds the voltage magnitude and ' +
            'angle that make the injections come out right.',
  };
}

const busTypeName = (t: string): string =>
  t === 'slack' ? 'slack bus' : t === 'PV' ? 'PV bus' : 'PQ bus';

// ---------------------------------------------------------------------------
// A branch
// ---------------------------------------------------------------------------

/**
 * The whole chain from impedance to complex power, for one branch.
 *
 * This is the longest derivation in the app and it is meant to be. It is the
 * calculation the entire solver is made of, done once, by hand, on one branch,
 * with every intermediate on the page.
 */
export function deriveBranch(
  br: Branch, flow: BranchFlow, solved: SolvedCase
): Derivation {
  const net = solved.net;
  const baseMVA = net.baseMVA;
  const fromBus = net.buses.find((b) => b.id === br.from)!;
  const toBus = net.buses.find((b) => b.id === br.to)!;
  const kV = fromBus.baseKV;
  const zBase = (kV * kV) / baseMVA;
  const iBase = (baseMVA * 1000) / (Math.sqrt(3) * kV);

  const vf = solved.busById.get(br.from)!;
  const vt = solved.busById.get(br.to)!;
  const isTransformer = br.kind === 'transformer';
  const a = br.tap ?? 1;

  // Series admittance, in per-unit.
  const denom = br.r * br.r + br.x * br.x;
  const g = br.r / denom;
  const bSeries = -br.x / denom;

  const steps: DerivationStep[] = [];

  // --- 1. impedance in ohms ------------------------------------------------
  steps.push(
    step('Resistance in ohms', 'R = r_pu · Z_base',
      `${n(br.r)} * ${n(zBase)}`, 'Ω', {
        decimals: 3,
        note: 'What a bridge across the conductor would read, warm.',
      }),
    step('Reactance in ohms', 'X = x_pu · Z_base',
      `${n(br.x)} * ${n(zBase)}`, 'Ω', {
        decimals: 3,
        note:
          isTransformer
            ? 'Leakage reactance: the flux that links one winding and not the other.'
            : 'From the magnetic field around the conductor, which is why it ' +
              'depends on how far apart the phases are hung.',
      }),
    step('X over R', 'X / R', `${n(br.x)} / ${n(br.r)}`, '', {
      decimals: 2,
      note:
        'The single most useful shape number for a branch. Transmission lines ' +
        'run 5 to 20 and are mostly reactance; distribution conductor is near ' +
        'one; a small service transformer is below two.',
    })
  );

  // --- 2. series admittance -------------------------------------------------
  steps.push(
    step('Series admittance, real part', 'g = R / (R² + X²)',
      `${n(br.r)} / (${n(br.r)}^2 + ${n(br.x)}^2)`, 'pu', {
        decimals: 4,
        note: 'y = 1/Z, worked out in rectangular form by multiplying through by the conjugate.',
      }),
    step('Series admittance, imaginary part', 'b = −X / (R² + X²)',
      `-${n(br.x)} / (${n(br.r)}^2 + ${n(br.x)}^2)`, 'pu', {
        decimals: 4,
        note: 'Negative for an inductive branch, which almost every branch is.',
      })
  );

  // --- 3. the voltage difference --------------------------------------------
  const vfRe = vf.vpu * Math.cos((vf.angleDeg * Math.PI) / 180);
  const vfIm = vf.vpu * Math.sin((vf.angleDeg * Math.PI) / 180);
  const vtRe = vt.vpu * Math.cos((vt.angleDeg * Math.PI) / 180);
  const vtIm = vt.vpu * Math.sin((vt.angleDeg * Math.PI) / 180);
  // The tap divides the from-side voltage the series element actually sees.
  const vaRe = vfRe / a;
  const vaIm = vfIm / a;

  if (isTransformer && a !== 1) {
    steps.push(
      step('Voltage the winding sees', 'V_from / a, with a the off-nominal tap ratio',
        `${n(vf.vpu)} / ${n(a)}`, 'pu', {
          decimals: 5,
          note:
            `Tap ratio a = ${a.toFixed(5)}. A ratio BELOW one raises the ` +
            'downstream voltage, which is why the sign looks inverted: the ' +
            'from-side term in the admittance matrix is divided by a.',
        })
    );
  }

  steps.push(
    step('Voltage difference, real part', 'Re(ΔV) = Re(V_from/a) − Re(V_to)',
      `${n(vf.vpu)} * cosd(${n(vf.angleDeg)}) / ${n(a)} - ` +
      `${n(vt.vpu)} * cosd(${n(vt.angleDeg)})`, 'pu', { decimals: 6 }),
    step('Voltage difference, imaginary part', 'Im(ΔV) = Im(V_from/a) − Im(V_to)',
      `${n(vf.vpu)} * sind(${n(vf.angleDeg)}) / ${n(a)} - ` +
      `${n(vt.vpu)} * sind(${n(vt.angleDeg)})`, 'pu', {
        decimals: 6,
        note:
          'Almost all of the real power flow lives in this difference of ' +
          `angles: ${flow.angleDiffDeg.toFixed(3)}° across this branch.`,
      })
  );

  const dRe = vaRe - vtRe;
  const dIm = vaIm - vtIm;

  // --- 4. the series current ------------------------------------------------
  const iSerRe = g * dRe - bSeries * dIm;
  const iSerIm = g * dIm + bSeries * dRe;
  steps.push(
    step('Series current, real part', 'Re(I) = g·Re(ΔV) − b·Im(ΔV)',
      `${n(g)} * ${n(dRe)} - ${n(bSeries)} * ${n(dIm)}`, 'pu', {
        decimals: 6,
        note: 'Complex multiplication written out: (g + jb)(ΔV_re + jΔV_im).',
      }),
    step('Series current, imaginary part', 'Im(I) = g·Im(ΔV) + b·Re(ΔV)',
      `${n(g)} * ${n(dIm)} + ${n(bSeries)} * ${n(dRe)}`, 'pu', { decimals: 6 })
  );

  // --- 5. charging current --------------------------------------------------
  let iRe = iSerRe;
  let iIm = iSerIm;
  if (br.b > 1e-12) {
    const halfB = br.b / 2 / (a * a);
    steps.push(
      step('Charging current, real part', 'Re(I_sh) = −(B/2)·Im(V_from/a)',
        `-${n(halfB)} * ${n(vaIm)}`, 'pu', {
          decimals: 6,
          note:
            'The line is a capacitor to earth as well as a conductor along its ' +
            'length. At 500 kV this term produces over a megavar per kilometre ' +
            'whether anybody wants it or not.',
        }),
      step('Charging current, imaginary part', 'Im(I_sh) = (B/2)·Re(V_from/a)',
        `${n(halfB)} * ${n(vaRe)}`, 'pu', { decimals: 6 })
    );
    iRe = iSerRe - halfB * vaIm;
    iIm = iSerIm + halfB * vaRe;
    steps.push(
      step('Total current out of the from bus, real part', 'Re(I_from) = Re(I_series) + Re(I_sh)',
        `${n(iSerRe)} + ${n(-halfB * vaIm)}`, 'pu', { decimals: 6 }),
      step('Total current, imaginary part', 'Im(I_from) = Im(I_series) + Im(I_sh)',
        `${n(iSerIm)} + ${n(halfB * vaRe)}`, 'pu', { decimals: 6 })
    );
  }

  // --- 6. complex power -----------------------------------------------------
  // S = V · I*, and the tap means the from-bus voltage is the untapped one.
  const pPU = (vfRe * iRe + vfIm * iIm) / a;
  const qPU = (vfIm * iRe - vfRe * iIm) / a;

  const sFromMVA = Math.hypot(flow.pFromMW, flow.qFromMVAr);
  const sToMVA = Math.hypot(flow.pToMW, flow.qToMVAr);
  const worseEnd = sFromMVA >= sToMVA ? shortName(fromBus) : shortName(toBus);
  const worseEndMVA = Math.max(sFromMVA, sToMVA);

  steps.push(
    step('Real power', 'P = Re(V · I*) = V_re·I_re + V_im·I_im',
      `(${n(vfRe)} * ${n(iRe)} + ${n(vfIm)} * ${n(iIm)}) / ${n(a)} * ${n(baseMVA)}`,
      'MW', {
        decimals: 3,
        note:
          'The conjugate on the current is what makes this real power rather ' +
          'than an oscillating quantity: it is the part of the current in ' +
          'phase with the voltage.',
        checkAgainst: { name: 'solver P_from', value: flow.pFromMW, tolerance: 1e-3 },
      }),
    step('Reactive power', 'Q = Im(V · I*) = V_im·I_re − V_re·I_im',
      `(${n(vfIm)} * ${n(iRe)} - ${n(vfRe)} * ${n(iIm)}) / ${n(a)} * ${n(baseMVA)}`,
      'MVAr', {
        decimals: 3,
        note: 'The part of the current at right angles to the voltage.',
        checkAgainst: { name: 'solver Q_from', value: flow.qFromMVAr, tolerance: 1e-3 },
      }),
    step('Apparent power', '|S| = √(P² + Q²)',
      `sqrt((${n(pPU * baseMVA)})^2 + (${n(qPU * baseMVA)})^2)`, 'MVA', {
        decimals: 3,
        note: 'What the conductor and the equipment actually have to be sized for.',
      }),
    step('Power factor', 'cos φ = P / |S|',
      `${n(pPU * baseMVA)} / sqrt((${n(pPU * baseMVA)})^2 + (${n(qPU * baseMVA)})^2)`,
      '', { decimals: 4 }),
    step('Current in amperes', 'I = i_pu · I_base',
      `sqrt(${n(iRe)}^2 + ${n(iIm)}^2) * ${n(iBase)}`, 'A', {
        decimals: 1,
        note: 'The number that decides whether the conductor gets too hot.',
        checkAgainst: { name: 'solver I_from', value: flow.iFromAmps, tolerance: 0.5 },
      })
  );

  // --- 7. losses ------------------------------------------------------------
  const iSerMag2 = iSerRe * iSerRe + iSerIm * iSerIm;
  steps.push(
    step('Loss, from the current in the series element', 'P_loss = |I_series|² · R',
      `(${n(iSerRe)}^2 + ${n(iSerIm)}^2) * ${n(br.r)} * ${n(baseMVA)}`, 'MW', {
        decimals: 4,
        note:
          'The oldest equation in the subject. It is why transmission is done ' +
          'at high voltage: for the same power, ten times the voltage is a ' +
          'tenth of the current and a hundredth of the loss.',
        checkAgainst: { name: 'solver P_loss', value: flow.pLossMW, tolerance: 1e-2 },
      }),
    step('The same by conservation', 'P_loss = P_from + P_to',
      `${n(flow.pFromMW, 5)} + ${n(flow.pToMW, 5)}`, 'MW', {
        decimals: 4,
        note:
          'Both ends measured INTO the branch, so what goes in and does not ' +
          'come out is what was lost. Two independent routes to the same number.',
        checkAgainst: { name: 'I²R loss', value: iSerMag2 * br.r * baseMVA, tolerance: 1e-2 },
      }),
    step('Apparent power at the other end', '|S_to| = √(P_to² + Q_to²)',
      `sqrt((${n(flow.pToMW, 5)})^2 + (${n(flow.qToMVAr, 5)})^2)`, 'MVA', {
        decimals: 3,
        note:
          'Not the same as the from end, and it should not be: the difference ' +
          'between them is what the branch consumed on the way through.',
      }),
    step('Loading against the rating', 'loading = max(|S_from|, |S_to|) / S_rated',
      `${n(worseEndMVA, 5)} / ${n(br.ratingMVA)}`, '', {
        decimals: 4,
        note:
          `Rated ${br.ratingMVA.toFixed(0)} MVA, and judged at the ` +
          `${worseEnd} end — the one working hardest — because a branch is ` +
          `over its limit if either end is. Above 1.00 the conductor heats, ` +
          `anneals and sags.`,
        checkAgainst: { name: 'solver loading', value: Math.abs(flow.loading), tolerance: 2e-3 },
      })
  );

  // --- 8. the power-angle relation ------------------------------------------
  if (!isTransformer && br.x > 0) {
    steps.push(
      step('Real power from the angle alone', 'P ≈ (V₁·V₂ / X)·sin δ',
        `${n(vf.vpu)} * ${n(vt.vpu)} / ${n(br.x)} * sind(${n(flow.angleDiffDeg)}) * ${n(baseMVA)}`,
        'MW', {
          decimals: 1,
          note:
            'The approximation that resistance is negligible and the voltages ' +
            'are near one. It is not how the solver works, but it is how every ' +
            'engineer thinks: real power follows the ANGLE, and the angle is ' +
            'the one thing you cannot see by looking at a meter.',
        })
    );
  }

  return {
    id: `branch:${br.id}`,
    title: isTransformer ? 'Transformer flow' : 'Circuit flow',
    subtitle: br.name,
    standard: 'S = P + jQ; Z = R + jX; V∠θ. Nominal-π line model.',
    convention:
      `Current and power are positive FLOWING INTO the branch from the bus ` +
      `named first. Here that is ${shortName(fromBus)}, so a positive P means ` +
      `power is travelling from ${shortName(fromBus)} towards ` +
      `${shortName(toBus)}. Both ends are measured inward, which is why the ` +
      `two ends do not simply differ by a sign: what is left over is the loss.`,
    diagram: referenceDiagram(shortName(fromBus), shortName(toBus), flow.pFromMW >= 0),
    bases: perUnitBases(kV, baseMVA),
    steps,
    closing:
      `Every one of the ${solved.branches.length} branches in this network has ` +
      `this same calculation behind it, and the power flow is nothing more than ` +
      `finding the set of bus voltages that makes all of them add up at every ` +
      `bus at once.`,
  };
}

const shortName = (b: Bus): string => b.name.replace(/\s*\(.*\)\s*$/, '');

/**
 * The reference direction, drawn.
 *
 * A sign convention stated in words is read once and forgotten. The same
 * convention with an arrow on it is checkable at a glance, which is what it has
 * to be while somebody is working through the arithmetic underneath.
 */
function referenceDiagram(from: string, to: string, forward: boolean): string {
  const arrow = forward ? '→' : '←';
  return (
    `<svg viewBox="0 0 280 46" width="100%" role="img" ` +
    `aria-label="Reference direction from ${from} to ${to}">` +
    `<line x1="30" y1="24" x2="250" y2="24" stroke="#14161A" stroke-width="1.6"/>` +
    `<circle cx="30" cy="24" r="4" fill="#EFECE4" stroke="#14161A" stroke-width="1.4"/>` +
    `<circle cx="250" cy="24" r="4" fill="#EFECE4" stroke="#14161A" stroke-width="1.4"/>` +
    `<rect x="118" y="16" width="44" height="16" fill="#EFECE4" stroke="#14161A" stroke-width="1.2"/>` +
    `<text x="140" y="28" text-anchor="middle" font-size="9" fill="#14161A">R + jX</text>` +
    `<text x="30" y="14" text-anchor="middle" font-size="9" fill="#5C5953">${escapeXML(from)}</text>` +
    `<text x="250" y="14" text-anchor="middle" font-size="9" fill="#5C5953">${escapeXML(to)}</text>` +
    `<text x="78" y="41" text-anchor="middle" font-size="10" fill="#14161A">I ${arrow}</text>` +
    `<text x="202" y="41" text-anchor="middle" font-size="10" fill="#14161A">P ${arrow}</text>` +
    `</svg>`
  );
}

const escapeXML = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// A line's impedance, from the geometry of the towers
// ---------------------------------------------------------------------------

/**
 * Where a line's per-unit impedance came from in the first place.
 *
 * Nothing in this model is a typed-in impedance. Every overhead line's R, X and
 * B is computed from a published conductor table, a tower geometry and a route
 * length, and this derivation is that computation with the numbers in it. It
 * calls the same `lineParameters` the network builder calls, so the chain shown
 * here is not a re-implementation that could drift — it is the chain.
 */
export function deriveLineGeometry(br: Branch, net: NetworkCase): Derivation | null {
  // Overhead lines only. A cable's phases are concentric rather than hung
  // apart on a crossarm, so D_eq means nothing for one, and this whole chain
  // would produce a confident wrong answer.
  if (br.kind !== 'line' || !br.conductor || !br.lengthKm) return null;
  const fromBus = net.buses.find((b) => b.id === br.from);
  if (!fromBus) return null;
  const kV = fromBus.baseKV;
  let p: LineParameters;
  try {
    p = lineParameters(br.conductor, towerFor(kV));
  } catch {
    return null;
  }
  const zBase = (kV * kV) / net.baseMVA;
  const c = p.conductor;
  const t = p.tower;

  return {
    id: `geometry:${br.id}`,
    title: 'Where this impedance came from',
    subtitle: `${c.name} ${c.kcmil} kcmil ACSR on a ${t.name}`,
    standard: `Conductor data: ${c.source}`,
    convention:
      'A transmission line is not a component with a datasheet. Its impedance ' +
      'is a consequence of how big the conductor is, how far apart the phases ' +
      'are hung, and how long the route is — and that is all it is.',
    steps: [
      step('Equivalent spacing between the phases', 'D_eq = ∛(D₁₂ · D₂₃ · D₃₁)',
        `cbrt(${n(t.spacingM[0])} * ${n(t.spacingM[1])} * ${n(t.spacingM[2])})`,
        'm', {
          decimals: 3,
          note:
            'The three phases are not equally spaced, so the geometric mean of ' +
            'the three distances stands in for the one spacing that would give ' +
            'the same inductance. The cube root is what makes it a mean of three.',
          checkAgainst: { name: 'D_eq used by the model', value: p.dEqM, tolerance: 1e-5 },
        }),
      step('Geometric mean radius of one conductor', 'GMR, from the conductor table',
        `${n(c.gmrFt)} * 0.3048`, 'm', {
          decimals: 5,
          note:
            'Smaller than the physical radius, because current is distributed ' +
            'through the metal rather than running on its surface. The table ' +
            'gives it in feet, as ACSR tables always have.',
          checkAgainst: { name: 'GMR used by the model', value: p.gmrM, tolerance: 1e-9 },
        }),
      ...(t.bundleN > 1
        ? [step('Effective radius of the bundle', bundleFormula(t.bundleN),
            bundleArithmetic(t.bundleN, p.gmrM, t.bundleSpacingM), 'm', {
              decimals: 5,
              note:
                `${t.bundleN} conductors per phase, ${t.bundleSpacingM} m apart. ` +
                'Bundling makes the phase behave like one much fatter conductor: ' +
                'it lowers the reactance, and — the reason it is actually done at ' +
                '500 kV — it lowers the electric field at the conductor surface ' +
                'enough to stop the air ionising and hissing.',
              checkAgainst: { name: 'D_s used by the model', value: p.dsBundleM, tolerance: 1e-5 },
            })]
        : []),
      step('Series reactance per kilometre', 'X_L = 2πf · 2×10⁻⁷ · ln(D_eq / D_s) · 1000',
        `2 * pi * ${n(p.frequencyHz)} * 2e-7 * ln(${n(p.dEqM)} / ${n(p.dsBundleM)}) * 1000`,
        'Ω/km', {
          decimals: 5,
          note:
            'The logarithm is the whole physics: inductance depends on the RATIO ' +
            'of spacing to conductor size, not on either alone. Double both and ' +
            'nothing changes. It is also why the reactance of every overhead ' +
            'line ever built lands within a factor of two of 0.4 Ω/km.',
          checkAgainst: { name: 'X per km used by the model', value: p.xOhmPerKm, tolerance: 1e-4 },
        }),
      step('Resistance per kilometre', 'R = r₇₅ / n',
        `${n(c.rOhmPerMile75C)} / 1.609344 / ${t.bundleN}`, 'Ω/km', {
          decimals: 5,
          note:
            'Tabulated at 75 °C because a loaded conductor is hot, and the ' +
            `bundle's ${t.bundleN} conductors are in parallel.`,
          checkAgainst: { name: 'R per km used by the model', value: p.rOhmPerKm, tolerance: 1e-4 },
        }),
      step('Shunt capacitance per kilometre', 'C = 2πε₀ / ln(D_eq / r_b) · 1000',
        `2 * pi * 8.8541878128e-12 / ln(${n(p.dEqM)} / ${n(p.rBundleM)}) * 1000`,
        'F/km', {
          decimals: 5,
          note:
            'The same geometry again, but with the conductor\u2019s PHYSICAL radius ' +
            'this time rather than its geometric mean radius — charge sits on the ' +
            'surface while current flows through the section.',
          checkAgainst: { name: 'C per km used by the model', value: p.cFPerKm, tolerance: 1e-4 },
        }),
      step('Reactance over the whole route', 'X = X_L · ℓ',
        `${n(p.xOhmPerKm)} * ${n(br.lengthKm)}`, 'Ω', {
          decimals: 2,
          note: `${br.lengthKm.toFixed(1)} km of route, which already includes the ` +
            'circuity factor: a line does not go where a straight line would.',
        }),
      step('Into per-unit', 'x_pu = X / Z_base',
        `${n(p.xOhmPerKm)} * ${n(br.lengthKm)} / ${n(zBase)}`, 'pu', {
          decimals: 6,
          note: `Z_base = ${kV}² / ${net.baseMVA} = ${zBase.toFixed(2)} Ω.`,
          checkAgainst: { name: 'the branch\u2019s own x', value: br.x, tolerance: 1e-4 },
        }),
      step('Surge impedance', 'Z_c = √(L / C) = √(X_L / (ωC))',
        `sqrt(${n(p.xOhmPerKm)} / (2 * pi * ${n(p.frequencyHz)} * ${n(p.cFPerKm)}))`,
        'Ω', {
          decimals: 1,
          note:
            'The ratio of voltage to current for a wave travelling along this ' +
            'line. Load it at exactly V²/Z_c and the reactive power the series ' +
            'inductance consumes is exactly what the shunt capacitance produces, ' +
            'and the voltage is flat from one end to the other.',
        }),
    ],
    closing:
      'The per-unit line is the number the solver uses. Everything above it is ' +
      'where that number comes from, and it is all geometry and one table.',
  };
}

/**
 * The geometric mean radius of a bundle, in the form the textbooks give it.
 *
 * There is no tidy closed form for every n. Two, three and four conductors each
 * have their own expression, and the four-conductor one carries an empirical
 * 1.09 because the conductors sit on the corners of a square rather than on a
 * circle. Writing a general n-th root here instead would be neater and wrong.
 */
function bundleFormula(n: number): string {
  return n === 2 ? 'D_s = √(GMR · d)'
    : n === 3 ? 'D_s = ∛(GMR · d²)'
    : n === 4 ? 'D_s = 1.09 · √(√(GMR · d³))'
    : 'D_s = GMR';
}

function bundleArithmetic(n: number, gmrM: number, dM: number): string {
  const g = num(gmrM, 6, true);
  const d = num(dM, 6, true);
  // The fourth root is written as a square root of a square root, because it
  // is one, and because it can then be set as a root rather than as an
  // exponent that has to be read carefully.
  return n === 2 ? `sqrt(${g} * ${d})`
    : n === 3 ? `cbrt(${g} * ${d}^2)`
    : n === 4 ? `1.09 * sqrt(sqrt(${g} * ${d}^3))`
    : g;
}

/**
 * The tower a line of this voltage is built on.
 *
 * Read out of the same `CLASS_CONSTRUCTION` table the network builder used, so
 * this derivation cannot describe a different tower from the one whose geometry
 * produced the impedance. A second copy of that mapping here would be a second
 * thing to keep in step, and it would silently stop being in step.
 */
function towerFor(kV: number): string {
  let best = '';
  let bestDiff = Infinity;
  for (const [k, cons] of Object.entries(CLASS_CONSTRUCTION)) {
    const d = Math.abs(Math.log(kV / Number(k)));
    if (d < bestDiff) { bestDiff = d; best = cons.tower; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// A transformer's impedance, from its nameplate
// ---------------------------------------------------------------------------

export function deriveTransformerImpedance(
  br: Branch, net: NetworkCase, percentZ: number, xOverR: number, ownMVA: number
): Derivation {
  const zMag = percentZ / 100;
  const x = (zMag * xOverR) / Math.sqrt(1 + xOverR * xOverR);

  return {
    id: `nameplate:${br.id}`,
    title: 'From the nameplate to the model',
    subtitle: `${ownMVA} MVA, ${percentZ} % Z, X/R = ${xOverR}`,
    standard: 'IEEE C57.12 — impedance stated as a percentage on the self-cooled rating',
    convention:
      'A transformer’s impedance is quoted as a PERCENTAGE, and the ' +
      'percentage is of its own rating, not the system’s. That is the ' +
      'single most common way to get this wrong, and the base change below is ' +
      'the fix.',
    steps: [
      step('Impedance magnitude in per-unit on its own base', '|Z| = %Z / 100',
        `${n(percentZ)} / 100`, 'pu', {
          decimals: 5,
          note:
            'It means: short the low side, and this fraction of rated voltage ' +
            'on the high side drives rated current. That is literally how it ' +
            'is measured in the factory.',
        }),
      step('Reactance', 'X = |Z| · (X/R) / √(1 + (X/R)²)',
        `${n(zMag)} * ${n(xOverR)} / sqrt(1 + ${n(xOverR)}^2)`, 'pu', { decimals: 5 }),
      step('Resistance', 'R = X / (X/R)',
        `${n(x)} / ${n(xOverR)}`, 'pu', {
          decimals: 6,
          note: 'Small, and it is almost all copper loss in the windings.',
        }),
      step('Onto the system base', 'Z_sys = Z_own · (S_sys / S_own)',
        `${n(x)} * ${n(net.baseMVA)} / ${n(ownMVA)}`, 'pu', {
          decimals: 5,
          note:
            'Only the apparent-power base changes here, because both sides of ' +
            'this transformer already use the nominal voltage of their own ' +
            'level as V_base. If they did not, a (V_own/V_sys)² term would ' +
            'appear as well.',
          checkAgainst: { name: 'the branch’s x', value: br.x, tolerance: 1e-4 },
        }),
      step('Short-circuit current it would allow', 'I_sc = 1 / |Z| of rated',
        `1 / ${n(zMag)}`, '× rated', {
          decimals: 2,
          note:
            'The reason transformer impedance is chosen rather than minimised: ' +
            'it is what limits the current into a fault on the low side. Lower ' +
            'impedance means better voltage regulation and a more violent fault.',
        }),
    ],
  };
}

// ---------------------------------------------------------------------------
// The service drop
// ---------------------------------------------------------------------------

export function deriveServiceDrop(
  steps: DropStep[], secondaryV: number, label: string
): Derivation {
  const out: DerivationStep[] = [];
  let v = secondaryV;
  for (const s of steps) {
    const sinPhi = Math.sqrt(Math.max(0, 1 - s.powerFactor * s.powerFactor));
    out.push(
      step(`${s.name} — loop resistance`, 'R = r_kft · (ℓ / 304.8) · n',
        `${n(s.conductor.rOhmPerKft)} * (${n(s.lengthM)} / 304.8) * ${n(s.conductorsInLoop)}`,
        'Ω', {
          decimals: 5,
          note:
            `${s.conductor.size} ${s.conductor.material}, ${s.lengthM} m. ` +
            'The table gives resistance per thousand feet, and 304.8 metres is ' +
            `a thousand feet. Counted ${s.conductorsInLoop} times because the ` +
            'current goes out on one conductor and comes back on another, and ' +
            'both of them drop voltage.',
        }),
      step(`${s.name} — drop`, 'ΔV = I · (R·cos φ + X·sin φ)',
        `${n(s.currentA)} * (${n(s.rOhm)} * ${n(s.powerFactor)} + ${n(s.xOhm)} * ${n(sinPhi)})`,
        'V', {
          decimals: 3,
          note:
            'The component of the impedance drop lying along the supply ' +
            'voltage. The component at right angles to it moves the angle and ' +
            'not the magnitude, and at these lengths it is worth less than a ' +
            'hundredth of a volt.',
          checkAgainst: { name: 'the panel’s drop', value: s.dropV, tolerance: 1e-4 },
        }),
      step(`${s.name} — voltage at the far end`, 'V = V_near − ΔV',
        `${n(v)} - ${n(s.dropV)}`, 'V', {
          decimals: 2,
          checkAgainst: { name: 'the panel’s voltage', value: s.toV, tolerance: 1e-4 },
        })
    );
    v = s.toV;
  }

  return {
    id: `service:${label}`,
    title: 'Voltage drop to here',
    subtitle: label,
    standard: 'Conductor data: NFPA 70 (NEC) Chapter 9 Table 9; limits ANSI C84.1',
    convention:
      'The starting voltage is the solved voltage at the transformer’s ' +
      'secondary terminals. Everything below it is arithmetic done in the open, ' +
      'because a 240/120 V service is single-phase and the balanced solver has ' +
      'no business past that point.',
    steps: out,
    closing:
      'This is the one calculation in the app a reader could do on the back of ' +
      'an envelope with the table open beside them, which is exactly why it is ' +
      'shown in full.',
  };
}

// ---------------------------------------------------------------------------
// The system, as one equation
// ---------------------------------------------------------------------------

export function deriveSystemBalance(solved: SolvedCase): Derivation {
  const s = solved.system;
  return {
    id: 'system:balance',
    title: 'The whole system in one line',
    subtitle: 'Generation = load + losses, at every instant',
    convention:
      'There is no storage in a transmission network. Whatever is being ' +
      'consumed, plus whatever is being wasted heating conductors, is being ' +
      'generated at that same instant — and if it is not, the frequency moves.',
    steps: [
      step('Total generation', 'ΣP_gen',
        `${n(s.pLoadMW, 8)} + ${n(s.pLossMW, 8)}`, 'MW', {
          decimals: 2,
          note: 'Which has to come out equal to what the machines are actually producing.',
          checkAgainst: { name: 'solver ΣP_gen', value: s.pGenMW, tolerance: 1e-3 },
        }),
      step('Losses as a fraction', 'P_loss / P_gen',
        `${n(s.pLossMW, 8)} / ${n(s.pGenMW, 8)} * 100`, '%', {
          decimals: 3,
          note:
            'Two to four per cent is normal for a transmission system. It rises ' +
            'with the square of the load, because loss goes as I².',
          checkAgainst: { name: 'solver loss %', value: s.lossPercent, tolerance: 1e-6 },
        }),
    ],
    closing:
      'Every number on this page is downstream of that first line. The solver ' +
      'does not impose it — it falls out, which is how you know the solution is ' +
      'a solution.',
  };
}

// ---------------------------------------------------------------------------
// The plant
// ---------------------------------------------------------------------------

/**
 * Where the fuel goes.
 *
 * The chain closes by construction — the condenser stream is computed as the
 * remainder — so the last step here is not a coincidence, it is the statement
 * that nothing has been left out.
 */
export function derivePlantEnergy(chain: PlantEnergyChain): Derivation {
  const c = chain.flows;
  const get = (id: string) => c.find((f) => f.id === id)?.mw ?? 0;

  return {
    id: 'plant:energy',
    title: 'Where the fuel goes',
    subtitle: `${chain.netMW.toFixed(0)} MW out of ${chain.fuelMW.toFixed(0)} MW of gas`,
    standard: 'Heat rate in BTU/kWh; 1 kWh = 3,412.14 BTU',
    convention:
      'Every stream is measured as power — megawatts — whether it is chemical ' +
      'energy in a pipe, hot gas in a duct, work on a shaft or electricity in a ' +
      'cable. They are the same quantity in different forms, which is the whole ' +
      'reason the chain can be added up at all.',
    steps: [
      step('Efficiency, from the heat rate', 'η = 3412.14 / HR',
        `3412.142 / ${n(chain.heatRateBtuPerKWh)}`, '', {
          decimals: 4,
          note:
            'Efficiency and heat rate are the same fact written two ways. The ' +
            'heat rate form is used in the industry because it multiplies ' +
            'straight by the fuel price to give the cost of a megawatt-hour.',
          checkAgainst: { name: 'the plant’s efficiency', value: chain.efficiency, tolerance: 1e-6 },
        }),
      step('Fuel burning right now', 'P_fuel = P_net / η',
        `${n(chain.netMW, 5)} / ${n(chain.efficiency)}`, 'MW thermal', {
          decimals: 1,
          note: 'Chemical energy arriving in a pipe, in the same units as everything else.',
          checkAgainst: { name: 'the fuel stream', value: chain.fuelMW, tolerance: 1e-4 },
        }),
      step('In the units a gas contract is written in',
        'MMBtu/h = P_fuel · 1000 · 3412.14 / 10⁶',
        `${n(chain.fuelMW, 5)} * 1000 * 3412.142 / 1000000`, 'MMBtu/h', {
          decimals: 1,
          checkAgainst: {
            name: 'the plant’s fuel burn', value: chain.fuelMMBtuPerHour, tolerance: 1e-6,
          },
        }),
      step('Carbon dioxide', 'CO₂ = fuel · 53.06 kg/MMBtu',
        `${n(chain.fuelMMBtuPerHour, 5)} * 53.06 / 1000`, 't/h', {
          decimals: 1,
          note:
            'A property of the fuel’s chemistry — burning methane to carbon ' +
            'dioxide and water — not of the plant. An efficient plant emits ' +
            'less per megawatt-hour and exactly the same per unit of fuel.',
          checkAgainst: {
            name: 'the plant’s emissions', value: chain.co2TonnesPerHour, tolerance: 1e-6,
          },
        }),
      step('Gross output, before the plant’s own consumption',
        'P_gross = P_net / (1 − aux)',
        `${n(chain.netMW, 5)} / (1 - ${n((chain.grossMW - chain.netMW) / chain.grossMW)})`,
        'MW', {
          decimals: 1,
          note: 'Pumps, fans and the cooling tower. A large station is a substantial load in its own right.',
          checkAgainst: { name: 'gross output', value: chain.grossMW, tolerance: 1e-3 },
        }),
      step('Everything that leaves, added up',
        'P_elec + P_stack + P_condenser + losses',
        `${n(get('gt-generator'), 5)} + ${n(get('st-generator'), 5)} + ` +
        `${n(get('stack'), 5)} + ${n(get('condenser'), 5)} + ` +
        `${n(chain.fuelMW - get('gt-generator') - get('st-generator') - get('stack') - get('condenser'), 5)}`,
        'MW', {
          decimals: 1,
          note:
            'Which is the fuel that went in. Not approximately — the condenser ' +
            'stream is worked out as the remainder precisely so that this line ' +
            'is an identity rather than a coincidence.',
          checkAgainst: { name: 'the fuel that went in', value: chain.fuelMW, tolerance: 1e-6 },
        }),
      step('What the cooling tower has to get rid of',
        'as a fraction of the fuel',
        `${n(get('condenser'), 5)} / ${n(chain.fuelMW, 5)} * 100`, '%', {
          decimals: 1,
          note:
            'More than the plant exports as electricity. A heat engine must ' +
            'reject heat to a cold reservoir — that is the second law, not an ' +
            'engineering shortcoming — and this is that reservoir.',
        }),
    ],
    closing:
      'Every megawatt on this page came from the plant’s dispatched output ' +
      'and its heat rate, both of which are in the network case because they ' +
      'are what put it where it is in the merit order.',
  };
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

/**
 * How a generator's internal EMF and load angle follow from what it is doing.
 *
 * The two equations at the top of `src/core/machine.ts`, run backwards: given
 * the terminal voltage and the output, E and δ are determined.
 */
export function deriveMachine(
  g: Generator, op: MachineOperatingPoint, c: CapabilityCurve
): Derivation {
  const base = g.mBaseMVA;
  const xd = c.xd;
  const iRe = op.vPU > 0 ? op.pPU / op.vPU : 0;
  const iIm = op.vPU > 0 ? -op.qPU / op.vPU : 0;

  return {
    id: `machine:${g.id}`,
    title: 'Inside the machine',
    subtitle: `${g.name} — ${base.toFixed(0)} MVA, X_d = ${xd} pu`,
    standard: 'Round-rotor synchronous machine: E∠δ = V∠0 + jX_d·I',
    convention:
      'The terminal voltage is the reference, so V sits at angle zero and δ is ' +
      'measured from it. Current is positive OUT of the machine, so a positive ' +
      'Q means the machine is producing reactive power and its internal EMF is ' +
      'above its terminal voltage.',
    bases: [
      {
        symbol: 'S_base', value: base, unit: 'MVA',
        note: 'The MACHINE’s own base, not the system’s. Its reactance is quoted on this.',
      },
      {
        symbol: 'X_d', value: xd, unit: 'pu',
        note: 'Synchronous reactance. Around 2 for a large turbogenerator, which is far larger than any line.',
      },
      {
        symbol: 'V', value: op.vPU, unit: 'pu',
        note: 'Terminal voltage, solved. It is the reference the angle is measured from.',
      },
    ],
    steps: [
      step('Real power in per-unit', 'P_pu = P / S_base',
        `${n(op.pMW, 5)} / ${n(base)}`, 'pu', { decimals: 5 }),
      step('Reactive power in per-unit', 'Q_pu = Q / S_base',
        `${n(op.qMVAr, 5)} / ${n(base)}`, 'pu', { decimals: 5 }),
      step('Current, real part', 'Re(I) = P / V',
        `${n(op.pPU)} / ${n(op.vPU)}`, 'pu', {
          decimals: 5,
          note: 'From I = S*/V*, with V taken as the reference so that V* = V.',
        }),
      step('Current, imaginary part', 'Im(I) = −Q / V',
        `-${n(op.qPU)} / ${n(op.vPU)}`, 'pu', {
          decimals: 5,
          note: 'Negative when the machine is producing reactive power: the current lags the voltage.',
        }),
      step('Internal EMF, real part', 'Re(E) = V − X_d·Im(I)',
        `${n(op.vPU)} - ${n(xd)} * ${n(iIm)}`, 'pu', { decimals: 5 }),
      step('Internal EMF, imaginary part', 'Im(E) = X_d·Re(I)',
        `${n(xd)} * ${n(iRe)}`, 'pu', {
          decimals: 5,
          note: 'The j in jX_d·I is what turns the current through a right angle.',
        }),
      step('Internal EMF', '|E| = √(Re(E)² + Im(E)²)',
        `sqrt((${n(op.vPU - xd * iIm)})^2 + (${n(xd * iRe)})^2)`, 'pu', {
          decimals: 4,
          note:
            'What the field current produces. Above the terminal voltage means ' +
            'over-excited and producing reactive power; below means the opposite.',
          checkAgainst: { name: 'the machine panel', value: op.ePU, tolerance: 1e-4 },
        }),
      step('Load angle', 'δ = atan(Im(E) / Re(E))',
        `atan(${n(xd * iRe)} / ${n(op.vPU - xd * iIm)}) * 180 / pi`, '°', {
          decimals: 3,
          note:
            'How far the rotor leads the terminal voltage. It is a real, ' +
            'physical angle: the rotor really is at that position relative to ' +
            'the rotating field the stator currents set up.',
          checkAgainst: { name: 'the machine panel', value: op.deltaDeg, tolerance: 1e-4 },
        }),
      step('Real power, back from the angle', 'P = (V·E / X_d)·sin δ',
        `${n(op.vPU)} * ${n(op.ePU)} / ${n(xd)} * sind(${n(op.deltaDeg)}) * ${n(base)}`,
        'MW', {
          decimals: 1,
          note:
            'The equation run forwards again. It closes, which is the check ' +
            'that the phasor arithmetic above has not picked up a sign.',
          checkAgainst: { name: 'the solved output', value: op.pMW, tolerance: 2e-3 },
        }),
      step('Stored kinetic energy', 'E_k = H · S_base',
        `${n(g.inertiaH ?? 4)} * ${n(base)}`, 'MJ', {
          decimals: 0,
          note:
            'H seconds is how long this rotor could supply the machine’s own ' +
            'rated output from its rotation alone, with no fuel at all. It is a ' +
            'real time, and for a large turbogenerator it is about five seconds.',
        }),
    ],
    closing:
      'Real power followed the ANGLE and reactive power followed the FIELD, and ' +
      'the two barely interfered with each other. That near-independence is why ' +
      'a plant has two separate controls and why the power flow can treat them ' +
      'as separate knobs.',
  };
}

// ---------------------------------------------------------------------------
// A fault
// ---------------------------------------------------------------------------

/**
 * A short circuit, worked in symmetrical components.
 *
 * The derivation is the connection of the three sequence networks, which is
 * different for every kind of fault and IS the whole of fault analysis. What
 * follows is that connection written out with this bus's actual Thevenin
 * impedances in it.
 */
export function deriveFault(f: FaultResult, baseKV: number): Derivation {
  const z1m = absC(f.z1);
  const z2m = absC(f.z2);
  const z0m = absC(f.z0);
  const v = absC(f.prefaultV);
  const finite0 = Number.isFinite(z0m);

  const steps: DerivationStep[] = [
    step('Base current at this voltage', 'I_base = S_base / (√3 · V_base)',
      `100 * 1000 / (sqrt(3) * ${n(baseKV)})`, 'A', {
        decimals: 1,
        note: 'Everything below is in per-unit until this turns it into amperes.',
        checkAgainst: { name: 'the study’s base', value: f.baseAmps, tolerance: 1e-4 },
      }),
    step('Positive sequence impedance at this bus', '|Z₁| = |(Y₁⁻¹)_kk|',
      `sqrt(${n(f.z1.re)}^2 + ${n(f.z1.im)}^2)`, 'pu', {
        decimals: 5,
        note:
          'The whole network, reduced to one impedance seen from this bus, with ' +
          'every machine represented as a voltage behind its subtransient ' +
          'reactance. A smaller number means a stronger source and a bigger fault.',
      }),
  ];

  if (f.kind !== 'three-phase' && f.kind !== 'line-to-line') {
    steps.push(
      step('Zero sequence impedance', '|Z₀| = |(Y₀⁻¹)_kk|',
        finite0 ? `sqrt(${n(f.z0.re)}^2 + ${n(f.z0.im)}^2)` : '0', 'pu', {
          decimals: 5,
          note: finite0
            ? 'A different network entirely: a line’s zero-sequence impedance ' +
              'is about three times its positive-sequence value because the ' +
              'return path is the earth, and every delta winding is an open ' +
              'circuit to it.'
            : 'There is no path to earth from this bus at all — every ' +
              'transformer between it and a grounded winding has a delta. Zero ' +
              'sequence current cannot flow, so a fault to earth here draws ' +
              'almost nothing.',
        })
    );
  }

  switch (f.kind) {
    case 'three-phase':
      steps.push(
        step('Fault current', 'I_f = V / (Z₁ + Z_f)',
          `${n(v)} / ${n(absC(add(f.z1, f.zf)))}`, 'pu', {
            decimals: 4,
            note:
              'Balanced, so there is no negative or zero sequence at all and ' +
              'only the positive sequence network is involved.',
          }),
        step('In amperes', 'I = i_pu · I_base',
          `${n(v / absC(add(f.z1, f.zf)))} * ${n(f.baseAmps)}`, 'A', {
            decimals: 0,
            checkAgainst: { name: 'the study', value: f.maxAmps, tolerance: 2e-3 },
          })
      );
      break;
    case 'single-line-to-ground':
      steps.push(
        step('Sequence current', 'I₀ = I₁ = I₂ = V / (Z₀ + Z₁ + Z₂ + 3Z_f)',
          finite0
            ? `${n(v)} / ${n(absC(add(add(add(f.z0, f.z1), f.z2), mulC(3, f.zf))))}`
            : '0',
          'pu', {
            decimals: 5,
            note:
              'The three networks in SERIES, because the same current has to ' +
              'flow through all three. The 3Z_f is because the current in the ' +
              'fault is 3I₀ while the current in each network is I₀.',
          }),
        step('Fault current in the faulted phase', 'I_a = 3·I₀',
          finite0
            ? `3 * ${n(v / absC(add(add(add(f.z0, f.z1), f.z2), mulC(3, f.zf))))} * ${n(f.baseAmps)}`
            : '0',
          'A', {
            decimals: 0,
            note:
              'The other two phases carry nothing at all, and the whole of it ' +
              'returns through the earth — which is exactly what a ground ' +
              'overcurrent relay measures.',
            checkAgainst: { name: 'the study', value: f.maxAmps, tolerance: 5e-3 },
          })
      );
      break;
    case 'line-to-line':
      steps.push(
        step('Sequence current', 'I₁ = −I₂ = V / (Z₁ + Z₂ + Z_f)',
          `${n(v)} / ${n(absC(add(add(f.z1, f.z2), f.zf)))}`, 'pu', {
            decimals: 5,
            note:
              'Positive and negative in PARALLEL OPPOSITION, and no zero ' +
              'sequence at all: the two faulted phases touch each other and not ' +
              'the earth, so nothing returns through the ground.',
          }),
        step('Fault current in the two faulted phases', 'I = √3 · I₁',
          `sqrt(3) * ${n(v / absC(add(add(f.z1, f.z2), f.zf)))} * ${n(f.baseAmps)}`,
          'A', {
            decimals: 0,
            note:
              'With Z₁ = Z₂ this comes to √3/2 of the three-phase fault — about ' +
              '87 %, which is the rule of thumb every protection engineer ' +
              'carries and which falls straight out of this connection.',
            checkAgainst: { name: 'the study', value: f.maxAmps, tolerance: 5e-3 },
          })
      );
      break;
    case 'double-line-to-ground':
      steps.push(
        step('Negative and zero in parallel', 'Z_p = Z₂·(Z₀+3Z_f) / (Z₂ + Z₀ + 3Z_f)',
          finite0
            ? `${n(z2m)} * ${n(absC(add(f.z0, mulC(3, f.zf))))} / ` +
              `${n(absC(add(add(f.z2, f.z0), mulC(3, f.zf))))}`
            : '0',
          'pu', {
            decimals: 5,
            note: 'The current returning to earth divides between those two paths.',
          }),
        step('Positive sequence current', 'I₁ = V / (Z₁ + Z_p)',
          finite0 ? `${n(v)} / ${n(z1m + parallelMag(z2m, absC(add(f.z0, mulC(3, f.zf)))))}` : '0',
          'pu', { decimals: 5 })
      );
      break;
  }

  steps.push(
    step('Short-circuit level', 'S = √3 · V · I',
      `sqrt(3) * ${n(baseKV)} * 1000 * ${n(f.maxAmps, 5)} / 1000000`, 'MVA', {
        decimals: 0,
        note:
          'What switchgear at this point has to be rated to interrupt. It is ' +
          'quoted in MVA rather than amperes because that is how equipment is ' +
          'specified and because it is comparable across voltage levels.',
        checkAgainst: { name: 'the study', value: f.mva, tolerance: 1e-3 },
      })
  );

  return {
    id: `fault:${f.busId}:${f.kind}`,
    title: 'Short-circuit current',
    subtitle: `${f.kind.replace(/-/g, ' ')} at ${f.busId}`,
    standard: 'Symmetrical components (Fortescue); IEEE Std 399',
    convention:
      'Current is positive INTO the fault. The pre-fault voltage is the ' +
      'Thevenin source, and the calculation is a linear superposition about ' +
      'the operating point the power flow found — not an iteration, because ' +
      'with the loads replaced by impedances the problem is linear.',
    steps,
    closing: f.connection,
  };
}

const absC = (z: { re: number; im: number }): number => Math.hypot(z.re, z.im);
const mulC = (k: number, z: { re: number; im: number }) =>
  ({ re: k * z.re, im: k * z.im });
const parallelMag = (a: number, b: number): number =>
  a + b > 0 ? (a * b) / (a + b) : 0;

// ---------------------------------------------------------------------------
// Reliability indices
// ---------------------------------------------------------------------------

/**
 * SAIFI, SAIDI, CAIDI, MAIFI and ASAI, worked out from the feeder.
 *
 * These are the numbers a distribution utility is judged on, and they are
 * almost always presented as though they had been measured. They are not
 * measurements: they are the arithmetic consequence of section lengths,
 * canonical failure rates, and which device clears which fault. Writing the
 * working out is the only way to make that visible.
 *
 * THE DECOMPOSITION IS BY PROTECTIVE DEVICE, which is not how the textbook
 * writes the sum but is how the system actually works: every section a device
 * protects drops exactly the same set of customers, so the per-section sum
 * factorises into one term per device — its exposure times its zone. Read that
 * way the sum says something a list of sections does not: what each device is
 * worth.
 */
export function deriveReliability(r: ReliabilityResult): Derivation {
  const byDevice = new Map<string, { lambda: number; customers: number }>();
  for (const s of r.sections) {
    const cur = byDevice.get(s.clearedBy) ?? { lambda: 0, customers: s.customersInterrupted };
    cur.lambda += s.permanentPerYear + (s.temporaryBecomesSustained ? s.temporaryPerYear : 0);
    byDevice.set(s.clearedBy, cur);
  }
  const terms = [...byDevice.entries()]
    .filter(([, v]) => v.lambda > 0)
    .sort((a, b) => b[1].lambda * b[1].customers - a[1].lambda * a[1].customers);

  // The worked example is the worst piece of WIRE, not the worst contributor
  // outright: a substation bus has no length, and λ = f · ℓ would read as
  // zero times zero.
  const worst = r.sections.find((s) => s.kind === 'overhead') ?? r.sections[0];
  const ratePerKm = worst.kind === 'cable'
    ? RELIABILITY_DATA.cablePermanentPerKmYear
    : RELIABILITY_DATA.overheadPermanentPerKmYear;
  const saidiMin = r.saidiMinutes;

  const steps: DerivationStep[] = [];

  steps.push(step(
    'Failure rate of one section',
    'λ = f · ℓ',
    `${n(ratePerKm)} * ${n(worst.lengthKm, 4)}`,
    'faults/yr',
    {
      decimals: 4,
      checkAgainst: {
        name: 'the contribution table', value: worst.permanentPerYear, tolerance: 1e-3,
      },
      note:
        `${worst.label} — the worst single piece of wire on the feeder. A ` +
        `kilometre of overhead line fails permanently about a tenth of a time a ` +
        `year in a mild climate; cable fails less often and takes three times ` +
        `as long to repair.`,
    }
  ));

  const groups = worst.restoration
    .map((g) => `${n(g.customers)} * ${n(g.hours, 3)}`).join(' + ');
  steps.push(step(
    'Customer-hours it costs each year',
    'CH = λ · Σ (Nⱼ · rⱼ)',
    `${n(worst.permanentPerYear, 6)} * (${groups})`,
    'customer-hours/yr',
    {
      decimals: 1,
      checkAgainst: {
        name: 'the contribution table', value: worst.customerHoursPerYear, tolerance: 1e-3,
      },
      note:
        'Who waits how long, taken from this section\u2019s own restoration: ' +
        worst.restoration
          .map((g) => `${g.customers} customers, ${num(g.hours, 2)} h — ${g.how}`)
          .join('; ') + '.',
    }
  ));

  steps.push(step(
    'Customer interruptions in a year',
    'Σ CI = Σ_devices (λ_zone · N_zone)',
    terms.map(([, v]) => `${n(v.lambda, 6)} * ${n(v.customers)}`).join(' + '),
    'customer-interruptions/yr',
    {
      decimals: 1,
      checkAgainst: {
        name: 'the total over sections', value: r.customerInterruptionsPerYear, tolerance: 1e-3,
      },
      note:
        `One term per protective device: how often something in its zone fails, ` +
        `times how many customers it drops when it opens. ` +
        terms.map(([name, v]) =>
          `${name}: ${num(v.lambda, 3)} faults/yr × ${v.customers} customers`).join('; ') + '.',
    }
  ));

  steps.push(step(
    'SAIFI',
    'SAIFI = Σ (λᵢ · Nᵢ) / N_T',
    `${n(r.customerInterruptionsPerYear, 4)} / ${n(r.totalCustomers)}`,
    'interruptions per customer per year',
    {
      decimals: 3,
      checkAgainst: { name: 'the panel', value: r.saifi, tolerance: 1e-4 },
      note:
        'The average customer on this feeder loses supply this many times a ' +
        'year. It says nothing about for how long.',
    }
  ));

  steps.push(step(
    'SAIDI',
    'SAIDI = Σ (λᵢ · rᵢ · Nᵢ) / N_T',
    `${n(r.customerHoursPerYear, 4)} / ${n(r.totalCustomers)} * 60`,
    'minutes per customer per year',
    {
      decimals: 1,
      checkAgainst: { name: 'the panel', value: saidiMin, tolerance: 1e-4 },
      note:
        'The same average customer is without supply for this many minutes a ' +
        'year, all interruptions added together. Utilities quote it in minutes ' +
        'because the numbers are otherwise uncomfortably large.',
    }
  ));

  steps.push(step(
    'CAIDI',
    'CAIDI = SAIDI / SAIFI',
    `${n(saidiMin, 4)} / ${n(r.saifi, 4)}`,
    'minutes per interruption',
    {
      decimals: 1,
      checkAgainst: { name: 'the panel', value: r.caidiMinutes, tolerance: 1e-3 },
      note:
        'How long one interruption lasts on average. It is a RATIO OF THE OTHER ' +
        'TWO and not an independent measurement, which is why it can get worse ' +
        'while the system gets better: clear away the short interruptions and ' +
        'the average of what is left goes up.',
    }
  ));

  steps.push(step(
    'MAIFI',
    'MAIFI = Σ (λTᵢ · N_mᵢ) / N_T',
    `${n(r.momentaryCustomersPerYear, 4)} / ${n(r.totalCustomers)}`,
    'momentary interruptions per customer per year',
    {
      decimals: 2,
      checkAgainst: { name: 'the panel', value: r.maifi, tolerance: 1e-4 },
      note:
        'The blinks. Four out of five overhead faults clear themselves the ' +
        'moment the circuit is de-energised, and a recloser exists to turn those ' +
        'into this number instead of the one above it.',
    }
  ));

  steps.push(step(
    'ASAI',
    'ASAI = (8760 − SAIDI) / 8760',
    `(8760 - ${n(r.saidiHours, 6)}) / 8760`,
    '',
    {
      decimals: 6,
      checkAgainst: { name: 'the panel', value: r.asai, tolerance: 1e-9 },
      note:
        'The fraction of the year the average customer had supply. Quoting it ' +
        'as a number of nines is a habit worth distrusting: the difference ' +
        'between four nines and five is fifty minutes a year, and the difference ' +
        'between reading them is one character.',
    }
  ));

  return {
    id: 'reliability',
    title: 'Reliability indices',
    subtitle: `Cherry Lane 1201 — ${r.totalCustomers.toLocaleString()} customers`,
    standard: 'IEEE Std 1366 — distribution reliability indices',
    convention:
      'A SUSTAINED interruption is one lasting longer than five minutes; ' +
      'anything shorter is MOMENTARY and is counted in MAIFI rather than in ' +
      'SAIFI, however many customers it affects. Customers are counted, not ' +
      'megawatts: a hospital and a garden shed each count once. Major event ' +
      'days — the storm that takes a week to clean up — are excluded here, as ' +
      'they are from most published figures, which is the single largest ' +
      'reason a quoted index looks better than a bad year feels.',
    steps,
    closing:
      'Every number above came from how long the wire is, where the devices ' +
      'are, and how fast somebody can drive there. None of it was measured, ' +
      'because this feeder does not exist — but the arithmetic is the same ' +
      'arithmetic, and moving the recloser moves the answer.',
  };
}

// ---------------------------------------------------------------------------
// Starting a motor
// ---------------------------------------------------------------------------

/**
 * The voltage dip when an induction motor starts, twice over.
 *
 * Once by the rule of thumb every distribution engineer carries — starting kVA
 * over short-circuit kVA — and once by the power flow, which solved the whole
 * network with the motor's locked-rotor demand in it. Printing both is the
 * point: an approximation whose error is never shown is a superstition, and one
 * whose error IS shown is a tool.
 *
 * The rule works because both impedances in the divider are nearly pure
 * reactance — the source because it is dominated by transformer and generator
 * reactance, the stalled motor because it is leakage reactance and very little
 * else. Where that stops being true, on a feeder whose resistance rivals its
 * reactance, the rule starts to over-predict, and the two numbers here part
 * company.
 */
export function deriveMotorStart(s: MotorStudy): Derivation {
  const m = s.motor;
  const kvaPerHp = lockedRotorKVAperHP(m);
  const steps: DerivationStep[] = [];

  if (s.state === 'running') {
    // Up to speed the motor is an ordinary load, and the interesting thing
    // about it is how ordinary: the machine that drew twelve hundred kilovolt-
    // amperes a few seconds ago now draws less than two hundred.
    steps.push(step(
      'Mechanical output, in electrical units',
      'P_out = hp · 745.7 W',
      `${n(m.hp)} * ${n(WATTS_PER_HP, 3)} / 1000`,
      'kW',
      {
        decimals: 1,
        note:
          'A horsepower is defined as 745.699872 watts, not 746. The rounded ' +
          'figure is harmless here and is not used, because a value that is ' +
          'exact by definition should not be approximated in a place where ' +
          'somebody might be checking.',
      }
    ));
    steps.push(step(
      'Electrical input',
      'P_in = P_out / η',
      `${n((m.hp * WATTS_PER_HP) / 1000, 3)} / ${n(m.efficiency, 4)}`,
      'kW',
      {
        decimals: 1,
        checkAgainst: { name: 'the panel', value: s.running.pKW, tolerance: 1e-3 },
        note:
          `The difference — about ${num((m.hp * WATTS_PER_HP / 1000) * (1 / m.efficiency - 1), 1)} kW — ` +
          `is heat in the windings, the core and the bearings. It is why a ` +
          `motor of this size needs a fan bolted to the back of it.`,
      }
    ));
    steps.push(step(
      'Apparent power, and the reactive part',
      'S = P / cos φ   and   Q = S · sin φ',
      `${n(s.running.pKW, 3)} / ${n(m.fullLoadPF, 4)} * ${n(Math.sin(Math.acos(m.fullLoadPF)), 5)}`,
      'kVAr',
      {
        decimals: 1,
        checkAgainst: { name: 'the panel', value: s.running.qKVAr, tolerance: 1e-3 },
        note:
          `An induction motor always absorbs reactive power, because the ` +
          `rotating field has to be magnetised from the supply — there is no ` +
          `other source for it. That is the whole reason a capacitor bank hangs ` +
          `on a pole half a kilometre away.`,
      }
    ));
    steps.push(step(
      'What the network did about it',
      'ΔV = |V|_before − |V|_after',
      `(${n(s.beforePU, 5)} - ${n(s.duringPU, 5)}) * 100`,
      '%',
      {
        decimals: 3,
        checkAgainst: { name: 'the solver', value: s.dipPercent, tolerance: 1e-3 },
        note:
          'A negative number here means the voltage went UP. Over a minute the ' +
          'regulator and the capacitor bank have had time to respond, and they ' +
          'can easily overshoot a load this modest — which is exactly what ' +
          'they could not do during the start.',
      }
    ));
  } else {
    steps.push(step(
      'Locked-rotor apparent power',
      'S_LR = hp · (kVA/hp)',
      `${n(m.hp)} * ${n(kvaPerHp, 3)}`,
      'kVA',
      {
        decimals: 0,
        note:
          `Code letter ${m.codeLetter} on the nameplate means ` +
          `${num(NEMA_CODE_LETTERS[m.codeLetter].min, 2)} to ` +
          `${num(NEMA_CODE_LETTERS[m.codeLetter].max, 2)} kVA per horsepower at ` +
          `standstill (NEMA MG 1, Table 10-1); the mid-band is used here. It is ` +
          `the only number on a motor nameplate that describes what it does to ` +
          `everybody else.`,
      }
    ));

    steps.push(step(
      'Line current at that demand',
      'I = S / (√3 · V)',
      `${n(m.hp * kvaPerHp, 1)} * 1000 / (sqrt(3) * ${n(m.voltsLL)})`,
      'A',
      {
        decimals: 0,
        note:
          `Against a full-load current of ${num(running(m).amps, 0)} A — a ratio ` +
          `of about six, which is what "Design B" means.`,
      }
    ));

    if (s.method.lineCurrentFactor !== 1) {
      steps.push(step(
        `Reduced by the starter — ${s.method.name.toLowerCase()}`,
        'S_line = S_LR · a²',
        `${n(m.hp * kvaPerHp, 1)} * ${n(s.method.lineCurrentFactor, 4)}`,
        'kVA',
        { decimals: 0, note: s.method.note }
      ));
    }

    steps.push(step(
      'The dip, by the rule of thumb',
      'ΔV/V ≈ S_LR / (S_sc + S_LR)',
      `${n(s.demand.sKVA, 1)} / (${n(s.shortCircuitMVA * 1000, 0)} + ${n(s.demand.sKVA, 1)}) * 100`,
      '%',
      {
        decimals: 2,
        note:
          `The bus is ${num(s.shortCircuitMVA, 0)} MVA stiff — the same ` +
          `short-circuit capacity that decides how much current a fault there ` +
          `would draw. A stiff bus is stiff for both reasons and for the same ` +
          `reason, which is why this one number is worth knowing about any ` +
          `point on a network.`,
      }
    ));

    steps.push(step(
      'The dip, by solving the network',
      'ΔV = |V|_before − |V|_during',
      `(${n(s.beforePU, 5)} - ${n(s.duringPU, 5)}) * 100`,
      '%',
      {
        decimals: 2,
        checkAgainst: { name: 'the solver', value: s.dipPercent, tolerance: 1e-3 },
        note:
          'Both voltages are solver output, from two full power flows over the ' +
          'whole state — the second with the motor in the case and with the ' +
          'capacitor bank and the tap changer held where the first one left ' +
          'them, because neither can move in the second a start takes.',
      }
    ));

    steps.push(step(
      'Torque the motor develops',
      'T = T_LR · (a · V)²',
      `${n(m.lockedRotorTorquePU, 3)} * (${n(s.method.tap, 4)} * ${n(s.duringPU, 5)})^2`,
      'pu',
      {
        decimals: 2,
        checkAgainst: { name: 'the panel', value: s.torquePU, tolerance: 1e-3 },
        note:
          `Squared, which is why a starter that halves the voltage quarters the ` +
          `torque. The compressor needs ` +
          `${num(LOAD_BREAKAWAY_TORQUE_PU, 2)} pu to break away, so this ` +
          `${s.torqueAdequate ? 'is enough' : 'is NOT enough — the motor stalls'}.`,
      }
    ));
  }

  return {
    id: 'motor-start',
    title: s.state === 'running' ? 'A motor running' : 'Starting a motor',
    subtitle: `${m.hp} hp, ${m.voltsLL} V — ${s.site.name.toLowerCase()}`,
    standard: 'NEMA MG 1 for the code letter and the design class',
    convention:
      'Current is drawn INTO the motor, so it is a load and its reactive power ' +
      'is positive — the motor absorbs vars, it does not supply them. The dip ' +
      'is quoted as a positive number of per cent when the voltage FALLS, so a ' +
      'negative dip means it rose. Per-unit voltages are on the bus’s own ' +
      'base, and the motor’s own figures are at its rated 480 V, not at the ' +
      'feeder’s 12.47 kV.',
    steps,
    closing: s.state === 'running'
      ? 'Running, it is one of the least remarkable loads on the feeder. ' +
        'Everything difficult about a motor happens in the first few seconds.'
      : 'The two dips agree because the divider the rule of thumb imagines is ' +
        'very nearly the divider that actually exists. Where they disagree, ' +
        'believe the solve — and then ask what the rule assumed that this ' +
        'network does not.',
  };
}

// ---------------------------------------------------------------------------
// The Ferranti effect
// ---------------------------------------------------------------------------

/**
 * A long line's far end, higher than its near end.
 *
 * Three answers to the same question, in increasing order of faithfulness: the
 * nominal π model the solver uses, the exact distributed-parameter equations a
 * real study uses, and the solve itself. They agree to four figures on a
 * two-hundred-kilometre line and visibly disagree on a five-hundred-kilometre
 * one, which is the honest way to say what a lumped model is for.
 */
export function deriveFerranti(f: FerrantiStudy): Derivation {
  const steps: DerivationStep[] = [];

  steps.push(step(
    'How much of a capacitor the line is',
    'Q_c = B · V²  (at nominal voltage)',
    `${n(f.b, 5)} * 100`,
    'MVAr',
    {
      decimals: 0,
      note:
        `${num(f.lengthKm, 0)} km of conductor in the air, with the earth and ` +
        `the other phases as the other plate. At nominal voltage the line ` +
        `generates this much reactive power whether anybody wants it or not, ` +
        `and somebody has to absorb it.`,
    }
  ));

  steps.push(step(
    'The nominal π answer',
    'V_r / V_s = 1 / (1 − X·B/2)',
    `1 / (1 - ${n(f.x, 5)} * ${n(f.b, 5)} / 2)`,
    '',
    {
      decimals: 4,
      // X and B are printed to five decimal places, and on a 500 kV line
      // whose susceptance is a few tenths per-unit that rounding is worth a
      // few parts in a million of the ratio. The tolerance is what the
      // printing costs, not a licence for the arithmetic to drift.
      checkAgainst: { name: 'the π model', value: f.nominalPiRatio, tolerance: 1e-5 },
      note:
        'With the far end open the only current through the series reactance ' +
        'is what the receiving-end shunt draws. A capacitive current through ' +
        'an inductive reactance produces a RISE, because the two are 180° ' +
        'apart — which is the whole effect in one sentence.',
    }
  ));

  steps.push(step(
    'The exact answer, treating the line as distributed',
    'V_r / V_s = 1 / cos(βl),  βl = √(X·B)',
    `1 / cosd(${n((f.betaL * 180) / Math.PI, 4)})`,
    '',
    {
      decimals: 4,
      checkAgainst: { name: 'the long-line equations', value: f.exactRatio, tolerance: 1e-4 },
      note:
        `βl is the line's ELECTRICAL LENGTH: ` +
        `${num((f.betaL * 180) / Math.PI, 1)}° of the 90° at which the ratio ` +
        `would go to infinity — a quarter wavelength, about 1,500 km at 60 Hz. ` +
        `The π model's error is what it costs to pretend the capacitance sits ` +
        `in two lumps at the ends rather than being spread along the whole ` +
        `length, and it grows with the cube of that angle.`,
    }
  ));

  steps.push(step(
    'What the solver found, with the far end genuinely open',
    'V_r / V_s',
    `${n(f.openEndPU, 5)} / ${n(f.sendingPU, 5)}`,
    '',
    {
      decimals: 4,
      note:
        `The line was energised from ${num(f.sendingPU, 4)} pu with its far ` +
        `breaker open and the whole state re-solved. The open end came out at ` +
        `${num(f.openEndPU, 4)} pu — a rise of ` +
        `${num((f.openEndPU / f.sendingPU - 1) * 100, 2)} %.`,
    }
  ));

  steps.push(step(
    'The charging current it draws to do it',
    'I = V_r · B/2',
    `${n(f.openEndPU, 5)} * ${n(f.b, 5)} / 2 * 100 * 1e6 / (sqrt(3) * ${n(f.baseKV, 2)} * 1000)`,
    'A',
    {
      decimals: 0,
      checkAgainst: { name: 'the study', value: f.chargingAmps, tolerance: 1e-3 },
      note:
        `An open-circuited line carrying ${num(f.chargingAmps, 0)} amperes. ` +
        `Nothing is connected to it: the current is the line charging itself.`,
    }
  ));

  return {
    id: `ferranti:${f.branchId}`,
    title: 'The Ferranti effect',
    subtitle: `${f.branchName} — ${num(f.lengthKm, 0)} km, far end open`,
    standard: 'Nominal π and the distributed-parameter line equations',
    convention:
      'The SENDING end is the one the line is energised from and the RECEIVING ' +
      'end is the open one; the ratio is receiving over sending, so a number ' +
      'greater than one is a rise. Per-unit voltages are on the line’s own ' +
      'voltage base, and B is the TOTAL shunt susceptance of the line, half of ' +
      'which sits at each end of the π.',
    closing:
      'This is why a long line is not simply switched in from one end. Before ' +
      'a single customer is connected the far-end voltage can exceed what the ' +
      'insulation is rated for, so the switching procedure puts a shunt reactor ' +
      'in first — a lump of inductance whose only job is to absorb the vars a ' +
      'line makes by existing.',
    steps,
  };
}

// ---------------------------------------------------------------------------
// The factors
// ---------------------------------------------------------------------------

/**
 * Load, demand, coincidence and capacity, as ratios rather than as words.
 *
 * All four are quoted constantly and confused constantly, and the confusion is
 * understandable: they are all ratios of a demand to another demand. Writing
 * them out one after another, in the same numbers, is the shortest route to
 * seeing what each one is actually dividing by.
 */
export function deriveFactors(f: FactorSet, example: FactorSet['capacity'][0] | null): Derivation {
  const steps: DerivationStep[] = [];

  steps.push(step(
    'Load factor, over the modelled day',
    'LF = P_avg / P_peak',
    `${n(f.averageDemandGW * 1000, 1)} / ${n(f.peakDemandGW * 1000, 1)}`,
    '',
    {
      decimals: 3,
      checkAgainst: { name: 'the panel', value: f.loadFactor, tolerance: 1e-4 },
      note:
        'The whole system is built for the peak and paid for by the energy. A ' +
        'load factor of one would mean demand never varied and every asset was ' +
        'fully used every hour; anything less is the cost of a system that has ' +
        'to be ready for its worst moment.',
    }
  ));

  steps.push(step(
    'Connected load on the feeder',
    'Σ (n_i · connected_i)',
    f.byClass.map((c) =>
      `${n(c.customers)} * ${n(c.connectedKW / c.customers, 2)}`).join(' + '),
    'kW',
    {
      decimals: 0,
      checkAgainst: { name: 'the feeder', value: f.connectedKW, tolerance: 1e-4 },
      note:
        'What every service on this feeder could deliver at once. A house is ' +
        'counted at what its own service can pass — one hundred amperes at ' +
        '240 volts — not at what anybody actually uses.',
    }
  ));

  steps.push(step(
    'Demand factor',
    'DF = P_max / connected load',
    `${n(f.feederPeakKW, 1)} / ${n(f.connectedKW, 0)}`,
    '',
    {
      decimals: 3,
      checkAgainst: { name: 'the panel', value: f.demandFactor, tolerance: 1e-4 },
      note:
        `Six-sevenths of what could be drawn never is. That is not slack in ` +
        `the design — it is the whole economics of a distribution system, and ` +
        `a feeder built for its connected load would cost about ` +
        `${num(1 / f.demandFactor, 0)} times what this one costs.`,
    }
  ));

  steps.push(step(
    'Sum of the individual peaks',
    'Σ (n_i · P̂_i)',
    f.byClass.map((c) =>
      `${n(c.customers)} * ${n(c.peaksKW / c.customers, 2)}`).join(' + '),
    'kW',
    {
      decimals: 0,
      checkAgainst: { name: 'the feeder', value: f.sumOfIndividualPeaksKW, tolerance: 1e-4 },
      note:
        'Every customer’s own worst moment, added up as though they all ' +
        'happened together. They do not.',
    }
  ));

  steps.push(step(
    'Coincidence factor',
    'F_co = P_group / Σ P̂_i',
    `${n(f.feederPeakKW, 1)} / ${n(f.sumOfIndividualPeaksKW, 0)}`,
    '',
    {
      decimals: 3,
      checkAgainst: { name: 'the panel', value: f.coincidenceFactor, tolerance: 1e-4 },
      note:
        `Its reciprocal, ${num(f.diversityFactor, 2)}, is the DIVERSITY FACTOR, ` +
        `and the two names get used for each other constantly. This is the ` +
        `most valuable number in distribution planning: it is why a 50 kVA ` +
        `transformer can serve twelve houses whose services could each pass ` +
        `24 kW, and the more customers you put behind one piece of equipment ` +
        `the smaller it gets.`,
    }
  ));

  if (example) {
    steps.push(step(
      `Capacity factor — ${example.name}`,
      'CF = E / (P_rated · T)',
      `${n(example.energyMWh, 1)} / (${n(example.capacityMW, 1)} * 24)`,
      '',
      {
        decimals: 3,
        checkAgainst: { name: 'the dispatch', value: example.capacityFactor, tolerance: 1e-3 },
        note:
          `Energy actually dispatched over the day against energy if it had ` +
          `run flat out for all of it. Across the whole fleet it is ` +
          `${num(f.fleetCapacityFactor, 3)} — and the units at the bottom of ` +
          `that list are at zero, because a peaking plant is built to be ` +
          `available rather than to run.`,
      }
    ));
  }

  return {
    id: 'factors',
    title: 'The factors',
    subtitle: 'load, demand, coincidence and capacity',
    standard: 'The standard definitions used in utility planning',
    convention:
      'Every one of these is a ratio of a POWER to a POWER or of an ENERGY to ' +
      'an ENERGY, so all of them are dimensionless and none of them has a unit ' +
      'however it is quoted. The period matters and is stated with each: the ' +
      'load factor and the capacity factors here are over the modelled day, ' +
      'not over a year, and an annual figure would be lower for the load ' +
      'factor and different for every unit.',
    steps,
    closing:
      'Four ratios, one idea: a power system is sized for a moment and paid ' +
      'for by a year, and the distance between those two is where all of the ' +
      'engineering and all of the money is.',
  };
}
