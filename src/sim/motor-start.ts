/**
 * What happens on the street when somebody presses the green button.
 *
 * The industrial unit half-way down Cherry Lane 1201 has a 200 horsepower motor
 * on a compressor. Starting it is the largest single disturbance this feeder
 * ever sees in normal operation, and every part of what makes it a disturbance
 * is computed here rather than asserted:
 *
 *   - the starting current comes from the motor's NEMA code letter;
 *   - the voltage dip comes from re-solving the whole power flow with the
 *     motor's locked-rotor demand added at its bus;
 *   - the torque the motor then develops comes from the voltage it actually
 *     got, squared;
 *   - and the textbook estimate — starting kVA over short-circuit kVA — is
 *     computed alongside so that the reader can see how good a rule of thumb
 *     is when it is checked against a real solve.
 *
 * THE SLOW CONTROLS ARE HELD. A motor start lasts a few seconds. In that time
 * the capacitor bank does not switch and the voltage regulator does not move —
 * a tap changer takes tens of seconds per step by design, precisely so that it
 * does not chase transients. Letting them respond would make the dip vanish and
 * would be a lie about what a person standing under the lights would see.
 */

import { NetworkCase, cloneCase, indexCase } from '../core/network.js';
import { SolvedCase } from '../core/results.js';

import { operate, OperateResult } from './operate.js';
import { buildFaultModel, theveninImpedance } from '../core/fault.js';
import { abs } from '../core/complex.js';
import {
  InductionMotor, StartMethod, StartMethodSpec, START_METHODS, MotorOperatingPoint,
  running, starting, startingTorquePU, estimatedDipPU, lockedRotorKVAperHP,
  threePhaseAmps,
} from '../core/motor.js';
import { feederBusId } from '../data/california/feeder.js';

/**
 * The motor itself.
 *
 * A 200 hp, 480 V, NEMA Design B squirrel-cage induction motor with a code G
 * nameplate — which is to say the most ordinary large motor there is. Design B
 * is the general-purpose class: normal starting torque, normal starting
 * current, low slip. Code G puts its locked-rotor demand at about 6 kVA per
 * horsepower, so roughly 1,200 kVA at standstill against 170 kVA running.
 */
export const CHERRY_LANE_MOTOR: InductionMotor = {
  id: 'MOTOR_F03',
  name: '200 hp compressor motor',
  hp: 200,
  voltsLL: 480,
  design: 'B',
  codeLetter: 'G',
  efficiency: 0.945,
  fullLoadPF: 0.87,
  startingPF: 0.20,
  lockedRotorTorquePU: 1.5,
  runUpSeconds: 6,
  note:
    'On a compressor at the light-industrial unit by the recloser. It is fed ' +
    'at 480 V through the unit’s own transformer, which is why the feeder ' +
    'sees it at 12.47 kV as a lump of demand and not as a motor.',
};

/**
 * Where the motor is.
 *
 * Two places, because the lesson is not the motor, it is the STIFFNESS of the
 * bus it is started against. The same machine that barely registers next to the
 * substation makes the lights swing at the end of three kilometres of wire, and
 * seeing the identical nameplate produce two different answers is the only way
 * to make "short-circuit capacity" mean anything.
 */
export interface MotorSite {
  id: string;
  busId: string;
  name: string;
  note: string;
}

export const MOTOR_SITES: MotorSite[] = [
  {
    id: 'industrial',
    busId: feederBusId('F03'),
    name: 'At the industrial unit',
    note:
      'By the recloser, eight hundred metres from the substation. A stiff ' +
      'point: the transformer banks are close, so the voltage barely moves.',
  },
  {
    id: 'far-end',
    busId: feederBusId('F11'),
    name: 'At the far end of the feeder',
    note:
      'Three kilometres out, past the regulator and the capacitor bank, where ' +
      'the only thing between the motor and the substation is wire. The same ' +
      'motor, a much weaker bus, and a visibly different answer.',
  },
];

export const motorSite = (id: string): MotorSite =>
  MOTOR_SITES.find((s) => s.id === id) ?? MOTOR_SITES[0];

const MOTOR_LOAD_ID = 'FDRLD_MOTOR';

export type MotorState = 'off' | 'starting' | 'running';

export interface MotorStudy {
  motor: InductionMotor;
  method: StartMethodSpec;
  site: MotorSite;
  state: MotorState;
  /** What the line draws, at the voltage the motor actually gets. */
  demand: MotorOperatingPoint;
  /** What it would draw at rated voltage — the nameplate figure. */
  demandAtRated: MotorOperatingPoint;
  running: MotorOperatingPoint;
  /** Volts at the motor bus before and during, per-unit. */
  beforePU: number;
  duringPU: number;
  dipPU: number;
  dipPercent: number;
  /** The rule of thumb, for comparison with the solve. */
  shortCircuitMVA: number;
  estimatedDipPercent: number;
  /** Torque developed at the voltage the motor actually gets, per-unit. */
  torquePU: number;
  /** Whether it can accelerate the load it is bolted to. */
  torqueAdequate: boolean;
  /** The worst-hit bus anywhere on the feeder, which is not always the motor's. */
  worst: { id: string; name: string; beforePU: number; duringPU: number; dipPercent: number };
  /** Everybody on the feeder, for the dip profile. */
  feederDips: { id: string; name: string; distanceKm: number; dipPercent: number }[];
  /** The solve with the motor in the case. */
  result: OperateResult;
  /** The solve WITHOUT it, so the drawings can show both. */
  before: SolvedCase;
}

/**
 * The torque the compressor demands at standstill, per-unit.
 *
 * A compressor started unloaded needs very little; started against pressure it
 * needs a great deal. This is the middle of the range, and it is the number the
 * torque check is against — a motor that develops less than this does not
 * accelerate, it stalls.
 */
export const LOAD_BREAKAWAY_TORQUE_PU = 0.35;

export function startMethod(id: StartMethod): StartMethodSpec {
  return START_METHODS.find((m) => m.id === id) ?? START_METHODS[0];
}

/**
 * Add the motor to a case and solve it.
 *
 * `before` is the case as already solved without the motor; the returned study
 * compares the two. The motor enters the case as an ordinary constant-power
 * load, which is the standard way a starting motor is represented in a power
 * flow — a real starting study uses a constant-impedance model, and the
 * difference is recorded in the honesty register.
 */
export function studyMotorStart(
  net: NetworkCase,
  beforeResult: OperateResult,
  state: Exclude<MotorState, 'off'>,
  methodId: StartMethod,
  siteId = MOTOR_SITES[0].id
): MotorStudy {
  const method = startMethod(methodId);
  const m = CHERRY_LANE_MOTOR;
  const before = beforeResult.solved;
  const site = motorSite(siteId);
  const MOTOR_BUS = site.busId;

  const beforeBus = before.busById.get(MOTOR_BUS);
  const beforePU = beforeBus?.vpu ?? 1;

  // First pass: what it would draw at rated voltage. The feeder has not sagged
  // yet, so this is the nameplate demand.
  const atRated = state === 'starting'
    ? starting(m, method, 1)
    : running(m);

  const withMotor = cloneCase(net);
  withMotor.loads.push({
    id: MOTOR_LOAD_ID,
    name: `${m.name} — ${state}`,
    bus: MOTOR_BUS,
    pMW: atRated.pKW / 1000,
    qMVAr: atRated.qKVAr / 1000,
    loadClass: 'industrial',
  });

  // Hold the capacitor banks and the tap changers where the pre-start solve
  // left them. A start is over before either can respond — a tap changer takes
  // tens of seconds per step by design, so that it does not chase transients —
  // and letting them act would hide the whole effect. The tap changers are the
  // ones the before-case settled on, not a fresh set at their defaults, or the
  // comparison would be against a different feeder.
  //
  // Once the motor is RUNNING, both do respond, and the contrast is worth
  // seeing: the dip that made the lights flicker is regulated away within a
  // minute, and the only trace left is a tap position.
  const result = state === 'starting'
    ? operate(withMotor, {
      holdSwitching: true, holdTaps: true, taps: beforeResult.taps,
    })
    : operate(withMotor, { taps: beforeResult.taps });
  const solved = result.solved;

  const duringPU = solved.busById.get(MOTOR_BUS)?.vpu ?? beforePU;
  const dipPU = beforePU - duringPU;

  // Second pass: at standstill the motor is a fixed impedance, so what it
  // really draws follows the voltage it really got.
  const demand = state === 'starting'
    ? starting(m, method, duringPU)
    : running(m);

  // The rule of thumb, from the stiffness of the bus.
  const model = buildFaultModel(net, indexCase(net));
  const z = theveninImpedance(model.positive, MOTOR_BUS);
  const zMag = abs(z);
  const shortCircuitMVA = Number.isFinite(zMag) && zMag > 0
    ? net.baseMVA / zMag : 0;

  const torquePU = state === 'starting'
    ? startingTorquePU(m, method, duringPU)
    : 1;

  // Everybody else on the feeder. A motor start is felt by the neighbours, and
  // the shape of who feels it most is the point.
  const nameOf = new Map(withMotor.buses.map((b) => [b.id, b.name]));
  const feederDips = solved.buses
    .filter((b) => b.busId.startsWith('FDR_') || b.busId === 'SVC_LV')
    .map((b) => {
      const was = before.busById.get(b.busId)?.vpu ?? b.vpu;
      return {
        id: b.busId,
        name: nameOf.get(b.busId) ?? b.busId,
        distanceKm: 0,
        dipPercent: (was - b.vpu) * 100,
      };
    });
  const worstEntry = feederDips.reduce(
    (a, b) => (b.dipPercent > a.dipPercent ? b : a), feederDips[0]);
  const worstBefore = before.busById.get(worstEntry.id)?.vpu ?? 1;

  return {
    motor: m,
    method,
    site,
    state,
    demand,
    demandAtRated: atRated,
    running: running(m),
    beforePU,
    duringPU,
    dipPU,
    dipPercent: dipPU * 100,
    shortCircuitMVA,
    estimatedDipPercent:
      estimatedDipPU(demand.sKVA, shortCircuitMVA * 1000) * 100,
    torquePU,
    torqueAdequate: state !== 'starting' || torquePU >= LOAD_BREAKAWAY_TORQUE_PU,
    worst: {
      id: worstEntry.id,
      name: worstEntry.name,
      beforePU: worstBefore,
      duringPU: worstBefore - worstEntry.dipPercent / 100,
      dipPercent: worstEntry.dipPercent,
    },
    feederDips,
    result,
    before,
  };
}

/** Full-load current at the motor's own terminals, for the readouts. */
export const fullLoadAmps = (m: InductionMotor): number =>
  threePhaseAmps(running(m).sKVA, m.voltsLL);

/** Locked-rotor current at rated voltage, across the line. */
export const lockedRotorAmps = (m: InductionMotor): number =>
  threePhaseAmps(m.hp * lockedRotorKVAperHP(m), m.voltsLL);
