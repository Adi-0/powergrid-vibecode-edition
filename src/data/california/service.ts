/**
 * 14 Cherry Lane — one service, from the pad-mounted transformer to a socket.
 *
 * This is where the zoom tree ends. Everything above it exists so that this
 * works, and almost nobody who uses it has ever seen any of the rest.
 *
 * WHAT A 240/120 V SERVICE ACTUALLY IS
 *
 * The transformer's secondary winding is one coil with a tap brought out from
 * its middle. Call the two ends L1 and L2 and the middle N. From L1 to L2 is
 * 240 V. From either end to the middle is 120 V — and because L1 and L2 are
 * opposite ends of the SAME winding, the two 120 V halves are 180° out of
 * phase with each other, which is exactly why they add to 240 and not to zero.
 * The middle tap is bonded to earth and becomes the NEUTRAL.
 *
 * That one arrangement is why a house has two voltages: 240 V across the ends
 * for the things that need power (cooker, dryer, heat pump, car charger) and
 * 120 V from either end to the neutral for everything else.
 *
 * THE OTHER CONSEQUENCE, WHICH IS THE POINT OF THE THREE-WIRE SERVICE. If the
 * 120 V load on L1 equals the 120 V load on L2, their currents cancel in the
 * neutral and it carries nothing at all. The neutral is sized for the
 * IMBALANCE, not for the load, which is why it is often a size smaller than the
 * two hot conductors.
 *
 * WHY THE VOLTAGE DROP IS CALCULATED HERE RATHER THAN SOLVED
 *
 * The power flow solves down to the transformer's secondary terminals, and
 * stops there, because everything past that point is genuinely single-phase and
 * the solver is a balanced positive-sequence one. Rather than pretend
 * otherwise, the last two spans are worked out in the open, by hand, in the
 * form any electrician would use:
 *
 *     ΔV = I · (R·cos φ + X·sin φ) · 2ℓ
 *
 * with the 2 because current goes out on one conductor and comes back on
 * another, and both of them drop voltage. The starting voltage is the solved
 * one; nothing here is a stand-in for a number the solver could have produced.
 * This is recorded in the model-honesty register.
 */

import { MODELLED_SERVICE, FEEDER_NODES } from './feeder.js';

// ---------------------------------------------------------------------------
// Conductors
// ---------------------------------------------------------------------------

export interface LVConductor {
  id: string;
  /** American Wire Gauge size as the trade actually writes it. */
  size: string;
  material: 'copper' | 'aluminium';
  /**
   * AC resistance at 75 °C, ohms per 1000 feet. The unit is feet because that
   * is the unit the source table uses and the unit every US electrician sizing
   * a conductor works in; the metric value is derived below rather than
   * substituted, so the number can be checked against the book.
   */
  rOhmPerKft: number;
  /** Reactance at 60 Hz in PVC conduit, ohms per 1000 feet. */
  xOhmPerKft: number;
  /** Continuous current this conductor may carry, amperes, 75 °C column. */
  ampacityA: number;
  source: string;
}

/**
 * The sizes that appear in one house.
 *
 * Resistance and reactance are from NEC Chapter 9, Table 9 (alternating-current
 * resistance and reactance for 600 V cables, three single conductors in a
 * PVC conduit, 75 °C). Ampacities are from NEC Table 310.16, 75 °C column.
 * These are the tables an electrician sizing this wire would open.
 */
export const LV_CONDUCTORS: Record<string, LVConductor> = {
  cu14: {
    id: 'cu14', size: '14 AWG', material: 'copper',
    rOhmPerKft: 3.1, xOhmPerKft: 0.058, ampacityA: 20,
    source: 'NEC Chapter 9 Table 9; ampacity NEC Table 310.16 (15 A after 240.4(D))',
  },
  cu12: {
    id: 'cu12', size: '12 AWG', material: 'copper',
    rOhmPerKft: 2.0, xOhmPerKft: 0.054, ampacityA: 25,
    source: 'NEC Chapter 9 Table 9; ampacity NEC Table 310.16 (20 A after 240.4(D))',
  },
  cu10: {
    id: 'cu10', size: '10 AWG', material: 'copper',
    rOhmPerKft: 1.2, xOhmPerKft: 0.050, ampacityA: 35,
    source: 'NEC Chapter 9 Table 9; ampacity NEC Table 310.16 (30 A after 240.4(D))',
  },
  al2_0: {
    id: 'al2_0', size: '2/0 AWG', material: 'aluminium',
    rOhmPerKft: 0.160, xOhmPerKft: 0.043, ampacityA: 135,
    source: 'NEC Chapter 9 Table 9, aluminium; ampacity NEC Table 310.16',
  },
  al4_0: {
    id: 'al4_0', size: '4/0 AWG', material: 'aluminium',
    rOhmPerKft: 0.100, xOhmPerKft: 0.041, ampacityA: 180,
    source: 'NEC Chapter 9 Table 9, aluminium; ampacity NEC Table 310.16',
  },
};

/** Feet in a metre, so the conversion is visible rather than a magic 3.28. */
export const FEET_PER_METRE = 1 / 0.3048;

/** Resistance of a length of conductor, ohms. Length in metres. */
export const conductorR = (c: LVConductor, lengthM: number): number =>
  (c.rOhmPerKft / 1000) * lengthM * FEET_PER_METRE;

/** Reactance of a length of conductor, ohms. Length in metres. */
export const conductorX = (c: LVConductor, lengthM: number): number =>
  (c.xOhmPerKft / 1000) * lengthM * FEET_PER_METRE;

// ---------------------------------------------------------------------------
// The premises
// ---------------------------------------------------------------------------

export type ServiceNodeKind =
  | 'transformer' | 'meter' | 'panel' | 'breaker' | 'outlet' | 'ground-rod'
  | 'appliance';

export interface ServiceNode {
  id: string;
  kind: ServiceNodeKind;
  name: string;
  /** Metres east, north and above grade, from the transformer pad. */
  at: [number, number, number];
  /** Nominal voltage at this point, volts. */
  volts: number;
  note: string;
  rating?: string;
}

/**
 * The layout.
 *
 * A pad-mounted transformer on the verge, an underground service lateral to a
 * meter on the outside wall, a short run through the wall to the panel, and one
 * branch circuit followed all the way to a socket in the kitchen. The distances
 * are ordinary suburban ones.
 */
export const SERVICE_NODES: ServiceNode[] = [
  {
    id: 'PAD', kind: 'transformer', name: 'Pad-mounted transformer',
    at: [0, 0, 0.95], volts: 240,
    rating: `${MODELLED_SERVICE.transformerKVA} kVA, 12.47 kV / 240–120 V, 1.9 % Z`,
    note:
      'A green steel box on a concrete plinth, shared by twelve houses. ' +
      'Twelve thousand four hundred and seventy volts arrive on one side; two ' +
      'hundred and forty leave on the other. It is the last transformer in the ' +
      'chain, and its secondary terminals are where the power flow stops and ' +
      'the arithmetic below begins.',
  },
  {
    id: 'LATERAL_MID', kind: 'ground-rod', name: 'Service lateral, buried',
    at: [6.5, 2.5, -0.6], volts: 240,
    note:
      'The three conductors run in a trench about six hundred millimetres ' +
      'down: two hot legs and a neutral. Undergrounding costs more than a pole ' +
      'and is far less likely to be brought down by a branch.',
  },
  {
    id: 'METER', kind: 'meter', name: 'Revenue meter',
    at: [12.0, 4.4, 1.55], volts: 240,
    rating: 'Form 2S, 200 A socket, class 200',
    note:
      'The boundary of ownership: everything on the supply side belongs to the ' +
      'utility, everything past it to the householder. It measures the product ' +
      'of voltage and current, integrated over time — energy, in kilowatt-hours.',
  },
  {
    id: 'PANEL', kind: 'panel', name: 'Main panel',
    at: [13.4, 6.4, 1.35], volts: 240,
    rating: '200 A main breaker, 240/120 V, 40 spaces',
    note:
      'Two vertical bus bars, one fed by each hot leg, with the neutral bar ' +
      'and the ground bar bonded together here and nowhere else downstream. ' +
      'A breaker clipped to one bar gives a 120 V circuit; one spanning both ' +
      'gives 240 V.',
  },
  {
    id: 'GROUND_ROD', kind: 'ground-rod', name: 'Grounding electrode',
    at: [13.4, 5.2, -1.4], volts: 0,
    rating: '2.4 m copper-clad rod, 6 AWG copper electrode conductor',
    note:
      'A rod driven into the earth and bonded to the neutral bar. It does not ' +
      'carry load current and it does not clear faults — the neutral does ' +
      'that. What it does is hold the whole system near the potential of the ' +
      'ground a person is standing on, and give lightning and a fallen primary ' +
      'conductor somewhere to go.',
  },
  {
    id: 'BRK_KITCHEN', kind: 'breaker', name: 'Kitchen small-appliance breaker',
    at: [14.2, 7.6, 1.35], volts: 120,
    rating: '20 A, 1 pole, 10 kA interrupting',
    note:
      'The protection for one circuit. It opens on a sustained overload after ' +
      'a delay set by a bimetallic strip, and on a short circuit within a ' +
      'cycle by magnetic action — the same two ideas as devices 51 and 50 in ' +
      'the substation, in a plastic case the size of a matchbox.',
  },
  {
    id: 'OUTLET', kind: 'outlet', name: 'Kitchen receptacle',
    at: [18.6, 11.8, 0.35], volts: 120,
    rating: 'NEMA 5-15R duplex, 125 V, 15 A',
    note:
      'The end of the line. Between this socket and a turbine four hundred ' +
      'kilometres away there is an unbroken conducting path, and the frequency ' +
      'of the alternating voltage here is set by whether that turbine, and ' +
      'every other one on the system, is being pushed harder or easier than ' +
      'the load is pulling.',
  },
];

export interface ServiceRun {
  from: string;
  to: string;
  conductor: string;
  /** Route length in metres — the wire, not the straight line. */
  lengthM: number;
  /** How many volts this run works at, for the drawing's line weight. */
  volts: number;
  /** Conductors carrying current in the loop: 2 for a two-wire circuit. */
  conductorsInLoop: number;
  name: string;
  note?: string;
}

export const SERVICE_RUNS: ServiceRun[] = [
  {
    from: 'PAD', to: 'LATERAL_MID', conductor: 'al4_0', lengthM: 7.6,
    volts: 240, conductorsInLoop: 2, name: 'Service lateral (buried)',
  },
  {
    from: 'LATERAL_MID', to: 'METER', conductor: 'al4_0', lengthM: 8.0,
    volts: 240, conductorsInLoop: 2, name: 'Service lateral (riser)',
    note: 'The lateral turns up the wall in a conduit and lands in the meter socket.',
  },
  {
    from: 'METER', to: 'PANEL', conductor: 'al4_0', lengthM: 3.2,
    volts: 240, conductorsInLoop: 2, name: 'Service-entrance conductors',
    note: 'Through the wall to the panel. Unfused on this side of the main breaker, which is why the run is kept short.',
  },
  {
    from: 'PANEL', to: 'GROUND_ROD', conductor: 'cu10', lengthM: 3.0,
    volts: 0, conductorsInLoop: 1, name: 'Grounding electrode conductor',
    note: 'Carries no current in normal operation.',
  },
  {
    from: 'PANEL', to: 'BRK_KITCHEN', conductor: 'cu12', lengthM: 0.4,
    volts: 120, conductorsInLoop: 2, name: 'Panel bus to breaker',
  },
  {
    from: 'BRK_KITCHEN', to: 'OUTLET', conductor: 'cu12', lengthM: 14.5,
    volts: 120, conductorsInLoop: 2, name: 'Kitchen circuit',
    note:
      'Two-conductor cable with a bare ground, stapled through the joists. ' +
      'Fourteen and a half metres of it, which is an ordinary distance from a ' +
      'panel in a garage to a socket in a kitchen.',
  },
];

// ---------------------------------------------------------------------------
// Things you can switch on
// ---------------------------------------------------------------------------

export interface Appliance {
  id: string;
  name: string;
  /** Real power drawn, watts. */
  watts: number;
  /** Power factor. Resistive heat is 1.00; motors and electronics are not. */
  powerFactor: number;
  /** Which circuit it is on: 120 V branch or 240 V feeder. */
  volts: 120 | 240;
  note: string;
}

/**
 * A short menu of ordinary loads, chosen so the range is instructive: a phone
 * charger and an electric car differ by a factor of about two thousand.
 */
export const APPLIANCES: Appliance[] = [
  {
    id: 'charger', name: 'Phone charger', watts: 6, powerFactor: 0.55, volts: 120,
    note: 'A switch-mode supply. Its power factor is poor because it draws current in short spikes at the peak of the voltage wave rather than smoothly.',
  },
  {
    id: 'lamp', name: 'LED lamp', watts: 9, powerFactor: 0.9, volts: 120,
    note: 'Nine watts for the light a sixty-watt filament used to give. The other fifty-one watts used to be heat.',
  },
  {
    id: 'fridge', name: 'Refrigerator', watts: 150, powerFactor: 0.78, volts: 120,
    note: 'An induction motor driving a compressor. It is inductive, so it draws reactive power as well as real power — and at the instant it starts, several times its running current.',
  },
  {
    id: 'kettle', name: 'Electric kettle', watts: 1500, powerFactor: 1.0, volts: 120,
    note: 'A resistance element. Power factor exactly one: the current is in phase with the voltage because there is nothing but resistance in the circuit.',
  },
  {
    id: 'dryer', name: 'Clothes dryer', watts: 5000, powerFactor: 1.0, volts: 240,
    note: 'Across both hot legs, so it works at 240 V. At the same power that halves the current, which is why the cable to it is not enormous.',
  },
  {
    id: 'ev', name: 'Car charger', watts: 11500, powerFactor: 0.99, volts: 240,
    note: 'Forty-eight amperes at 240 V, for hours. One of these is a larger load than the rest of the house put together, and a street of them is what makes distribution planners nervous.',
  },
];

// ---------------------------------------------------------------------------
// The arithmetic
// ---------------------------------------------------------------------------

export interface DropStep {
  runId: string;
  name: string;
  conductor: LVConductor;
  lengthM: number;
  conductorsInLoop: number;
  /** Current through this run, amperes. */
  currentA: number;
  powerFactor: number;
  /** Loop resistance and reactance, ohms. */
  rOhm: number;
  xOhm: number;
  /** Voltage drop across the run, volts. */
  dropV: number;
  /** Voltage at the far end of the run, volts. */
  toV: number;
  /** Which nominal the far-end voltage is measured against. */
  nominalV: number;
}

/**
 * Voltage drop along one run.
 *
 *     ΔV = I · (R·cos φ + X·sin φ)
 *
 * This is the standard approximate form, and the approximation is worth naming:
 * it is the component of the impedance drop that lies ALONG the supply voltage.
 * There is also a component at right angles to it, which changes the angle far
 * more than the magnitude, and at these currents and lengths it moves the
 * magnitude by less than a hundredth of a volt. Every voltage-drop table ever
 * printed uses this form.
 */
export function dropAcross(
  run: ServiceRun, currentA: number, powerFactor: number, fromV: number
): DropStep {
  const c = LV_CONDUCTORS[run.conductor];
  if (!c) throw new Error(`service run ${run.from}–${run.to}: unknown conductor`);
  const rOhm = conductorR(c, run.lengthM) * run.conductorsInLoop;
  const xOhm = conductorX(c, run.lengthM) * run.conductorsInLoop;
  const sinPhi = Math.sqrt(Math.max(0, 1 - powerFactor * powerFactor));
  const dropV = currentA * (rOhm * powerFactor + xOhm * sinPhi);
  return {
    runId: `${run.from}_${run.to}`,
    name: run.name,
    conductor: c,
    lengthM: run.lengthM,
    conductorsInLoop: run.conductorsInLoop,
    currentA,
    powerFactor,
    rOhm,
    xOhm,
    dropV,
    toV: fromV - dropV,
    nominalV: run.volts || 240,
  };
}

export const runById = (from: string, to: string): ServiceRun => {
  const r = SERVICE_RUNS.find((s) => s.from === from && s.to === to);
  if (!r) throw new Error(`no service run ${from}–${to}`);
  return r;
};

export interface ServiceSolution {
  /** Voltage at the transformer secondary, volts, straight from the solver. */
  secondaryV: number;
  /** This house's share of the solved load at the transformer, watts. */
  housePowerW: number;
  housePowerFactor: number;
  /** Current in the house's service conductors, amperes. */
  serviceCurrentA: number;
  /** The three runs from the transformer to the panel. */
  serviceSteps: DropStep[];
  /** Voltage at the panel, across both legs (240 V nominal). */
  panelV: number;
  /** Voltage from one leg to neutral at the panel (120 V nominal). */
  panelLegV: number;
  /** Current in the branch circuit, amperes. */
  branchCurrentA: number;
  branchPowerFactor: number;
  branchSteps: DropStep[];
  /** Voltage at the socket, volts. */
  outletV: number;
  /** Total drop from the transformer to the socket, as a percentage of 120 V. */
  totalDropPercent: number;
  /** Whether the socket is inside ANSI C84.1 Range A utilisation voltage. */
  withinRangeA: boolean;
}

/**
 * ANSI C84.1 voltage ranges at 120 V nominal.
 *
 * Two ranges, and the distinction matters: Range A is where the system is
 * supposed to sit, Range B is where it may sit occasionally and briefly. The
 * SERVICE limits apply at the meter; the UTILISATION limits apply at the
 * appliance, and they are wider at the bottom precisely to leave room for the
 * drop along the customer's own wiring.
 */
export const C84_1 = {
  nominalV: 120,
  serviceRangeA: [114, 126] as const,
  utilisationRangeA: [110, 126] as const,
  serviceRangeB: [110, 127] as const,
  utilisationRangeB: [106, 127] as const,
  standard: 'ANSI C84.1-2020, Table 1',
} as const;

/**
 * Work the whole chain from the solved secondary voltage to the socket.
 *
 * `secondaryV` and the transformer's load both come out of the power flow.
 * Nothing else in here is a number the solver could have produced.
 *
 * ONE SUBTLETY THAT IS THE WHOLE POINT OF A COINCIDENCE FACTOR. The load the
 * solver reports at the transformer is what all twelve houses are drawing
 * together. This house's SHARE of that is a twelfth of it. But an appliance the
 * reader switches on is in THIS house and in no other, so it is taken out of
 * the shared figure before dividing and added back afterwards. Get that wrong
 * and an eleven-kilowatt car charger appears to draw four amperes.
 */
export function solveService(
  secondaryV: number,
  transformerLoadW: number,
  transformerLoadVAr: number,
  appliance: { watts: number; powerFactor: number; volts: 120 | 240 } | null
): ServiceSolution {
  const appP = appliance?.watts ?? 0;
  const appQ = appliance
    ? appliance.watts * Math.tan(Math.acos(appliance.powerFactor))
    : 0;

  const shareP = (transformerLoadW - appP) / MODELLED_SERVICE.housesServed + appP;
  const shareQ = (transformerLoadVAr - appQ) / MODELLED_SERVICE.housesServed + appQ;
  const houseS = Math.hypot(shareP, shareQ);
  const housePowerFactor = houseS > 0 ? shareP / houseS : 1;
  // Current is set by APPARENT power, not by real power: the reactive part is
  // real current in the real conductor and drops real volts along it.
  const serviceCurrentA = houseS / secondaryV;

  const serviceRuns = [
    runById('PAD', 'LATERAL_MID'),
    runById('LATERAL_MID', 'METER'),
    runById('METER', 'PANEL'),
  ];
  const serviceSteps: DropStep[] = [];
  let v = secondaryV;
  for (const r of serviceRuns) {
    const step = dropAcross(r, serviceCurrentA, housePowerFactor, v);
    serviceSteps.push(step);
    v = step.toV;
  }
  const panelV = v;
  const panelLegV = panelV / 2;

  // The branch circuit is a 120 V circuit, so it works from one leg to the
  // neutral. A 240 V appliance spans both legs and is not on this circuit.
  const onBranch = appliance !== null && appliance.volts === 120;
  const branchPowerFactor = onBranch ? appliance.powerFactor : 1;
  const branchCurrentA = onBranch
    ? appliance.watts / (panelLegV * branchPowerFactor)
    : 0;
  const branchRuns = [runById('PANEL', 'BRK_KITCHEN'), runById('BRK_KITCHEN', 'OUTLET')];
  const branchSteps: DropStep[] = [];
  let vb = panelLegV;
  for (const r of branchRuns) {
    const step = dropAcross(r, branchCurrentA, branchPowerFactor, vb);
    branchSteps.push(step);
    vb = step.toV;
  }
  const outletV = vb;

  return {
    secondaryV,
    housePowerW: shareP,
    housePowerFactor,
    serviceCurrentA,
    serviceSteps,
    panelV,
    panelLegV,
    branchCurrentA,
    branchPowerFactor,
    branchSteps,
    outletV,
    totalDropPercent: ((secondaryV / 2 - outletV) / C84_1.nominalV) * 100,
    withinRangeA:
      outletV >= C84_1.utilisationRangeA[0] && outletV <= C84_1.utilisationRangeA[1],
  };
}

/** Where the service sits in the world, taken from the feeder's own geometry. */
export const SERVICE_SITE = (() => {
  const n = FEEDER_NODES.find((x) => x.id === MODELLED_SERVICE.fromNode);
  if (!n) throw new Error('service: cannot find its own feeder node');
  return { lat: n.lat, lon: n.lon };
})();

export const serviceNodeById = new Map(SERVICE_NODES.map((n) => [n.id, n]));
