/**
 * Starting an induction motor, which is the most violent ordinary thing that
 * happens on a distribution feeder.
 *
 * WHY IT IS VIOLENT. An induction motor at standstill is a short-circuited
 * transformer. The rotor is not turning, so there is no back-emf, and the only
 * thing limiting the current is the leakage impedance of the two windings —
 * which is small, because a motor is designed to transfer power, not to limit
 * current. So a motor drawing 200 amperes when it is running draws twelve
 * hundred at the instant the contactor closes, and it draws them at a power
 * factor of about 0.2, because a stalled motor is almost pure reactance.
 *
 * THAT IS THE PROBLEM. Six times the current would be tolerable; six times the
 * current at a power factor of 0.2 means roughly SEVEN TIMES the reactive
 * demand of the running motor, and reactive current is what moves voltage. The
 * whole street dims. Lights flicker, other people's motors slow down, and the
 * starting motor itself may not develop enough torque to accelerate, because
 * torque goes as the SQUARE of the voltage it actually gets.
 *
 * THE STANDARD NOTATION
 *
 *   Locked-rotor kVA per horsepower is given by a NEMA CODE LETTER stamped on
 *   the nameplate (NEMA MG 1, Table 10-1). Code G is 5.6–6.29 kVA/hp; the
 *   letters run A (under 3.15) to V (22.4 and up).
 *
 *   S_LR = hp · (kVA/hp)                      locked-rotor apparent power
 *   I_LR / I_FL ≈ 6                           for a Design B motor
 *   T ∝ V²                                    torque against terminal voltage
 *   ΔV/V ≈ S_LR / S_sc                        the dip, from the short-circuit
 *                                             capacity at the point of supply
 *
 * The last of those is the reason this module sits next to the fault code: the
 * stiffness of a bus is one number, and it decides both how much current a
 * fault draws and how far the voltage falls when a motor starts. A strong bus
 * is strong for both reasons and for the same reason.
 */

/** NEMA MG 1 Table 10-1, locked-rotor kVA per horsepower by code letter. */
export const NEMA_CODE_LETTERS: Record<string, { min: number; max: number }> = {
  A: { min: 0, max: 3.14 },
  B: { min: 3.15, max: 3.54 },
  C: { min: 3.55, max: 3.99 },
  D: { min: 4.0, max: 4.49 },
  E: { min: 4.5, max: 4.99 },
  F: { min: 5.0, max: 5.59 },
  G: { min: 5.6, max: 6.29 },
  H: { min: 6.3, max: 7.09 },
  J: { min: 7.1, max: 7.99 },
  K: { min: 8.0, max: 8.99 },
  L: { min: 9.0, max: 9.99 },
  M: { min: 10.0, max: 11.19 },
  N: { min: 11.2, max: 12.49 },
  P: { min: 12.5, max: 13.99 },
  R: { min: 14.0, max: 15.99 },
  S: { min: 16.0, max: 17.99 },
  T: { min: 18.0, max: 19.99 },
  U: { min: 20.0, max: 22.39 },
  V: { min: 22.4, max: Infinity },
};

/** 745.7 W in a horsepower, exactly, by definition of the mechanical hp. */
export const WATTS_PER_HP = 745.699872;

export interface InductionMotor {
  id: string;
  name: string;
  /** Rated mechanical output, horsepower — how a motor is always rated in the US. */
  hp: number;
  /** Rated terminal voltage, volts line-to-line. */
  voltsLL: number;
  /** NEMA design letter. B is the ordinary industrial workhorse. */
  design: 'A' | 'B' | 'C' | 'D';
  /** Locked-rotor code letter, which fixes the starting kVA. */
  codeLetter: keyof typeof NEMA_CODE_LETTERS;
  /** Efficiency and power factor at full load. */
  efficiency: number;
  fullLoadPF: number;
  /**
   * Power factor at standstill. A stalled motor is almost pure leakage
   * reactance, so this is low — 0.15 to 0.25 for a motor of this size.
   */
  startingPF: number;
  /** Starting torque as a fraction of rated torque, at rated voltage. NEMA B. */
  lockedRotorTorquePU: number;
  /** How long it takes to get up to speed, seconds, at rated voltage. */
  runUpSeconds: number;
  note?: string;
}

export type StartMethod = 'across-the-line' | 'autotransformer' | 'soft-starter';

export interface StartMethodSpec {
  id: StartMethod;
  name: string;
  /**
   * The fraction of rated voltage applied to the motor terminals.
   *
   * An autotransformer starter applies a·V to the motor, so the MOTOR draws a
   * times its locked-rotor current — but the LINE draws a² times it, because
   * the autotransformer trades current for voltage the way any transformer
   * does. That squared relationship is the whole reason this starter exists,
   * and it is also why the torque penalty is exactly as severe: torque also
   * goes as a².
   */
  tap: number;
  /** Line current as a fraction of the across-the-line value. */
  lineCurrentFactor: number;
  note: string;
}

export const START_METHODS: StartMethodSpec[] = [
  {
    id: 'across-the-line',
    name: 'Across the line',
    tap: 1,
    lineCurrentFactor: 1,
    note:
      'A contactor closes and the motor gets full voltage. It is the cheapest ' +
      'starter there is, it develops the most torque, and it is the hardest on ' +
      'everybody else on the feeder.',
  },
  {
    id: 'autotransformer',
    name: 'Autotransformer, 65 % tap',
    tap: 0.65,
    // a² — the transformer takes a times the motor current at 1/a the voltage.
    lineCurrentFactor: 0.65 * 0.65,
    note:
      'An autotransformer applies 65 % of rated voltage, so the motor draws ' +
      '65 % of its locked-rotor current and the LINE draws 42 % of it — the ' +
      'square, because that is what a transformer does. The price is torque: ' +
      'also the square, so 42 % of the starting torque, and a motor that ' +
      'cannot accelerate its load at 42 % will simply sit there and overheat.',
  },
  {
    id: 'soft-starter',
    name: 'Soft starter, 350 % current limit',
    // A thyristor starter holds the current at a set multiple of full load by
    // phasing back the voltage; 350 % of FLA is a common setting, which for a
    // 600 % locked-rotor motor is 0.583 of the across-the-line current.
    tap: 350 / 600,
    lineCurrentFactor: 350 / 600,
    note:
      'Thyristors chop the voltage so that the current never exceeds a set ' +
      'multiple of full load. The line current falls in PROPORTION rather than ' +
      'as the square — worse than an autotransformer for the same terminal ' +
      'voltage — but it ramps smoothly rather than stepping, which is easier ' +
      'on the driven machine and on everyone watching a light bulb.',
  },
];

export interface MotorOperatingPoint {
  /** Apparent, real and reactive power drawn at this instant. */
  sKVA: number;
  pKW: number;
  qKVAr: number;
  /** Line current at the motor's own rated voltage, amperes. */
  amps: number;
  powerFactor: number;
}

/** The mid-point of the code letter's band — what a nameplate value really is. */
export function lockedRotorKVAperHP(m: InductionMotor): number {
  const band = NEMA_CODE_LETTERS[m.codeLetter];
  return Number.isFinite(band.max) ? (band.min + band.max) / 2 : band.min;
}

/** Three-phase current from apparent power: I = S / (√3 · V). */
export const threePhaseAmps = (kVA: number, voltsLL: number): number =>
  (kVA * 1000) / (Math.sqrt(3) * voltsLL);

/** What the motor draws once it is up to speed and loaded. */
export function running(m: InductionMotor, loadFraction = 1): MotorOperatingPoint {
  const pKW = (m.hp * WATTS_PER_HP * loadFraction) / m.efficiency / 1000;
  const sKVA = pKW / m.fullLoadPF;
  return {
    sKVA, pKW,
    qKVAr: sKVA * Math.sin(Math.acos(m.fullLoadPF)),
    amps: threePhaseAmps(sKVA, m.voltsLL),
    powerFactor: m.fullLoadPF,
  };
}

/**
 * What the LINE sees at the instant of starting.
 *
 * `terminalVoltagePU` is what the motor actually gets once the feeder has
 * sagged, which is not known until the network is solved — so this is called
 * twice: once at 1.0 to set up the solve, and again with the answer to say what
 * really happened. Current scales with the voltage the motor sees, because at
 * standstill it is a fixed impedance and nothing else.
 */
export function starting(
  m: InductionMotor, method: StartMethodSpec, terminalVoltagePU = 1
): MotorOperatingPoint {
  const sRated = m.hp * lockedRotorKVAperHP(m);
  const sKVA = sRated * method.lineCurrentFactor * terminalVoltagePU;
  return {
    sKVA,
    pKW: sKVA * m.startingPF,
    qKVAr: sKVA * Math.sin(Math.acos(m.startingPF)),
    amps: threePhaseAmps(sKVA, m.voltsLL),
    powerFactor: m.startingPF,
  };
}

/**
 * Starting torque as a fraction of the motor's rated torque.
 *
 * T ∝ V², and the voltage the motor gets is the starter's tap times whatever
 * the feeder has sagged to. Both squared. This is the number that decides
 * whether the motor accelerates at all: it has to exceed the torque the driven
 * machine demands at standstill, or the motor sits at zero speed drawing
 * locked-rotor current until something opens.
 */
export function startingTorquePU(
  m: InductionMotor, method: StartMethodSpec, terminalVoltagePU: number
): number {
  const v = method.tap * terminalVoltagePU;
  return m.lockedRotorTorquePU * v * v;
}

/**
 * The classic estimate of the dip, before any network is solved.
 *
 * ΔV/V ≈ S_start / (S_sc + S_start), where S_sc is the short-circuit capacity
 * at the point of supply. It comes from treating the source as a pure reactance
 * behind a fixed voltage and the starting motor as a second reactance in
 * series: the divider between them IS the dip. It is a good approximation
 * precisely because both impedances are nearly pure reactance, which is why a
 * rule of thumb this crude survives in a field this careful.
 */
export function estimatedDipPU(startKVA: number, shortCircuitKVA: number): number {
  if (shortCircuitKVA <= 0) return 0;
  return startKVA / (shortCircuitKVA + startKVA);
}
