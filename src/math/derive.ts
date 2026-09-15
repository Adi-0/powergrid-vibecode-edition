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
