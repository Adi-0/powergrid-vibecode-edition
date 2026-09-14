/**
 * Eden Vale substation — inside the fence.
 *
 * This is where the high-voltage network ends and a neighbourhood begins. Two
 * 115 kV circuits come in from Metcalf, two transformer banks drop them to
 * 12.47 kV, and four feeders leave for the streets. Perhaps two acres of
 * gravel, steel and porcelain.
 *
 * TWO REPRESENTATIONS OF THE SAME OBJECT
 *
 * Every piece of equipment here carries two positions: where it physically
 * stands in the YARD, and where it sits on the SINGLE-LINE DIAGRAM. The two are
 * the same substation and the app moves between them by interpolating, because
 * the relationship between the drawing and the thing is exactly what is hard to
 * learn and exactly what a static picture of either one cannot teach.
 *
 * The single-line diagram is the more abstract and the more useful: it throws
 * away where things are and keeps only what is connected to what, which is all
 * the electricity cares about. Watching one become the other is the point.
 *
 * PROTECTION DEVICE NUMBERS are ANSI/IEEE C37.2, used exactly as a real
 * drawing uses them: 87T is transformer differential, 51 is time-overcurrent,
 * 50 is instantaneous overcurrent, a suffix N means it is watching the neutral,
 * 79 is reclosing, 21 is distance, 63 is sudden pressure.
 */

export type BayKind =
  | 'line' | 'transformer' | 'bus' | 'feeder' | 'capacitor' | 'station-service';

export type ElementKind =
  | 'breaker' | 'disconnect' | 'transformer' | 'bus' | 'ct' | 'pt'
  | 'arrester' | 'capacitor' | 'regulator' | 'ground-grid' | 'line-terminal';

export interface SubstationElement {
  id: string;
  kind: ElementKind;
  name: string;
  /** Which bay it belongs to. */
  bay: string;
  /** Nominal voltage of the equipment, kV. */
  kV: number;
  /**
   * Position in the physical yard, metres east and north of the south-west
   * corner of the fence, and height above grade.
   */
  yard: [number, number, number];
  /** Position on the single-line diagram, in diagram units. */
  schematic: [number, number];
  /** Plain-language description. */
  note: string;
  /** Nameplate detail, where the equipment has one worth stating. */
  rating?: string;
  /** ANSI/IEEE C37.2 device numbers associated with this element. */
  devices?: string[];
  /** For switching devices: are they closed? */
  closed?: boolean;
  /** Ratio, for instrument transformers. e.g. "1200:5". */
  ratio?: string;
  /**
   * For a BUS: how far it runs, because a bus is the one thing here that is a
   * span rather than a point. Schematic units across the diagram, and metres
   * east along the yard. Everything else attaches to the nearest point on it.
   */
  span?: { schematic: [number, number]; yardX: [number, number] };
}

export interface SubstationBay {
  id: string;
  kind: BayKind;
  name: string;
  note: string;
}

/** The fence, in metres. Eden Vale is a compact suburban distribution station. */
export const YARD = {
  widthM: 80,
  depthM: 52,
  /** Height of the 115 kV bus above grade, metres. */
  busHeight115M: 7.6,
  /** Height of the 12.47 kV bus above grade, metres. */
  busHeight12M: 4.2,
  /** Height of the overhead shield wire that takes lightning strikes. */
  shieldHeightM: 12.0,
  note:
    'About one acre. The gravel is not decorative: it is a high-resistivity ' +
    'surface layer that raises the resistance between a person’s feet and the ' +
    'earth, which is what keeps step and touch potentials survivable when ' +
    'fault current is flowing into the ground grid.',
} as const;

export const BAYS: SubstationBay[] = [
  { id: 'line1', kind: 'line', name: 'Metcalf No. 1, 115 kV',
    note: 'One of the two circuits feeding this station. Either one alone can carry the whole load, which is why there are two.' },
  { id: 'line2', kind: 'line', name: 'Metcalf No. 2, 115 kV',
    note: 'The second incoming circuit. Under normal conditions both are in service and share the load.' },
  { id: 'bus115', kind: 'bus', name: '115 kV bus',
    note: 'The common point on the high side. Everything at 115 kV in this station connects here.' },
  { id: 'bank1', kind: 'transformer', name: 'Bank 1, 115/12.47 kV',
    note: 'The transformer that does the real work of this station: 115,000 volts in, 12,470 volts out.' },
  { id: 'bank2', kind: 'transformer', name: 'Bank 2, 115/12.47 kV',
    note: 'The second bank. Either one can carry the station on its own for a while, which is what makes maintenance possible.' },
  { id: 'bus12', kind: 'bus', name: '12.47 kV bus',
    note: 'The low-voltage bus, split into two sections by a normally-open tie breaker so that a fault on one half does not take the other with it.' },
  { id: 'fdr1201', kind: 'feeder', name: 'Cherry Lane 1201',
    note: 'The feeder modelled pole by pole in this app. Everything past this breaker is out in the streets.' },
  { id: 'fdr1202', kind: 'feeder', name: 'Feeder 1202', note: 'A second distribution feeder.' },
  { id: 'fdr1203', kind: 'feeder', name: 'Feeder 1203', note: 'A third distribution feeder.' },
  { id: 'fdr1204', kind: 'feeder', name: 'Feeder 1204', note: 'A fourth distribution feeder.' },
  { id: 'cap', kind: 'capacitor', name: 'Station capacitor bank',
    note: 'Reactive support for the whole station, switched in three steps as the load rises.' },
  { id: 'station', kind: 'station-service', name: 'Station service',
    note: 'A small transformer supplying the station’s own lights, heaters, battery charger and control building. A substation needs electricity too.' },
];

/**
 * Everything in the yard.
 *
 * Yard coordinates: x east, y north, z above grade, in metres from the
 * south-west fence corner. Schematic coordinates: x across the diagram, y down
 * it, in arbitrary units where one unit is one "rung" of the drawing.
 */
export const ELEMENTS: SubstationElement[] = [
  // --- 115 kV incoming, line 1 ---------------------------------------------
  {
    id: 'L1_TERM', kind: 'line-terminal', name: 'Metcalf No. 1 line terminal',
    bay: 'line1', kV: 115, yard: [14, 52, 11.5], schematic: [1, 0],
    note: 'Where the incoming line lands on the dead-end structure and turns down into the yard.',
  },
  {
    id: 'L1_ARR', kind: 'arrester', name: 'Line 1 surge arresters',
    bay: 'line1', kV: 115, yard: [14, 48, 4.0], schematic: [1, 0.5],
    note: 'Three porcelain columns that do nothing at all until a lightning surge arrives, then conduct it harmlessly to earth and stop conducting again.',
    rating: '98 kV MCOV',
  },
  {
    id: 'L1_PT', kind: 'pt', name: 'Line 1 potential transformers',
    bay: 'line1', kV: 115, yard: [18, 48, 3.4], schematic: [2.1, 0.5],
    note: 'Scale the line voltage down to something a relay can measure safely.',
    ratio: '115000:120', devices: ['59', '27'],
  },
  {
    id: 'L1_DS_LINE', kind: 'disconnect', name: 'Line 1 line-side disconnect',
    bay: 'line1', kV: 115, yard: [14, 44, 6.4], schematic: [1, 1], closed: true,
    note: 'A visible break. It cannot interrupt load — its only job is to be unmistakably open so a crew can work on the line.',
  },
  {
    id: 'L1_CT', kind: 'ct', name: 'Line 1 current transformers',
    bay: 'line1', kV: 115, yard: [14, 40, 3.2], schematic: [1, 1.5],
    note: 'Scale the line current down from hundreds of amperes to five, so a relay can measure it without being destroyed by it.',
    ratio: '600:5', devices: ['21', '67'],
  },
  {
    id: 'L1_CB', kind: 'breaker', name: 'Line 1 circuit breaker',
    bay: 'line1', kV: 115, yard: [14, 36, 3.0], schematic: [1, 2], closed: true,
    note: 'The switch that can actually interrupt a fault. SF6 gas blows out the arc as the contacts part.',
    rating: '115 kV, 2000 A, 40 kA interrupting',
    devices: ['21', '67', '79'],
  },
  {
    id: 'L1_DS_BUS', kind: 'disconnect', name: 'Line 1 bus-side disconnect',
    bay: 'line1', kV: 115, yard: [14, 32, 6.4], schematic: [1, 2.6], closed: true,
    note: 'The other visible break, so the breaker itself can be isolated from the bus and worked on.',
  },

  // --- 115 kV incoming, line 2 ---------------------------------------------
  {
    id: 'L2_TERM', kind: 'line-terminal', name: 'Metcalf No. 2 line terminal',
    bay: 'line2', kV: 115, yard: [30, 52, 11.5], schematic: [4, 0],
    note: 'The second circuit’s dead-end structure: a steel frame taking the full mechanical pull of the incoming conductors, which is tonnes, so that the equipment below it takes none.',
  },
  {
    id: 'L2_ARR', kind: 'arrester', name: 'Line 2 surge arresters',
    bay: 'line2', kV: 115, yard: [30, 48, 4.0], schematic: [4, 0.5],
    note: 'Lightning protection for the second circuit. Three porcelain columns that conduct nothing at all until a surge arrives, then take it to earth and stop conducting again.', rating: '98 kV MCOV',
  },
  {
    id: 'L2_DS_LINE', kind: 'disconnect', name: 'Line 2 line-side disconnect',
    bay: 'line2', kV: 115, yard: [30, 44, 6.4], schematic: [4, 1], closed: true,
    note: 'Visible isolation for the second line. Open, it is unmistakably open — which is what a crew about to touch the conductor needs to see with their own eyes.',
  },
  {
    id: 'L2_CT', kind: 'ct', name: 'Line 2 current transformers',
    bay: 'line2', kV: 115, yard: [30, 40, 3.2], schematic: [4, 1.5],
    note: 'Current measurement for the second line’s protection. Six hundred amperes in the conductor becomes five in the relay circuit, which is a current a small instrument can survive.',
    ratio: '600:5', devices: ['21', '67'],
  },
  {
    id: 'L2_CB', kind: 'breaker', name: 'Line 2 circuit breaker',
    bay: 'line2', kV: 115, yard: [30, 36, 3.0], schematic: [4, 2], closed: true,
    note: 'The second line’s breaker. Either circuit can be taken out of service on its own, which is how a crew works on one while the station keeps running on the other.',
    rating: '115 kV, 2000 A, 40 kA interrupting', devices: ['21', '67', '79'],
  },
  {
    id: 'L2_DS_BUS', kind: 'disconnect', name: 'Line 2 bus-side disconnect',
    bay: 'line2', kV: 115, yard: [30, 32, 6.4], schematic: [4, 2.6], closed: true,
    note: 'Bus-side isolation for the second breaker, so the breaker itself can be separated from the live bus and worked on.',
  },

  // --- 115 kV bus -----------------------------------------------------------
  {
    id: 'BUS115', kind: 'bus', name: '115 kV bus',
    bay: 'bus115', kV: 115, yard: [22, 28, 7.6], schematic: [2.5, 3],
    span: { schematic: [0.5, 5.7], yardX: [8, 40] },
    note: 'Rigid aluminium tube on porcelain insulators, seven and a half metres up. Everything at 115 kV connects to it.',
    rating: '115 kV, 2000 A', devices: ['87B'],
  },
  {
    id: 'BUS115_PT', kind: 'pt', name: '115 kV bus potential transformers',
    bay: 'bus115', kV: 115, yard: [36, 28, 3.4], schematic: [5.4, 3],
    note: 'Measures the bus voltage, which is what the transformer tap changer is ultimately trying to control.',
    ratio: '115000:120', devices: ['59', '27'],
  },

  // --- transformer bank 1 ---------------------------------------------------
  {
    id: 'T1_DS_HV', kind: 'disconnect', name: 'Bank 1 high-side disconnect',
    bay: 'bank1', kV: 115, yard: [14, 24, 6.4], schematic: [1, 3.6], closed: true,
    note: 'Isolates the transformer from the 115 kV bus.',
  },
  {
    id: 'T1_CT_HV', kind: 'ct', name: 'Bank 1 high-side current transformers',
    bay: 'bank1', kV: 115, yard: [14, 21, 3.2], schematic: [1, 4.1],
    note: 'One half of the differential protection: it measures what goes IN.',
    ratio: '300:5', devices: ['87T'],
  },
  {
    id: 'T1', kind: 'transformer', name: 'Bank 1',
    bay: 'bank1', kV: 115, yard: [14, 17, 2.4], schematic: [1, 5],
    note: 'Twenty-eight megavolt-amperes of transformer: a steel tank of oil, a laminated core, two windings and a tap changer. It weighs perhaps sixty tonnes.',
    rating: '28 MVA, 115/12.47 kV, Dyn1, 8.5 % Z, ±10 % OLTC',
    devices: ['87T', '51', '49', '63'],
  },
  {
    id: 'T1_CT_LV', kind: 'ct', name: 'Bank 1 low-side current transformers',
    bay: 'bank1', kV: 12.47, yard: [14, 13, 2.2], schematic: [1, 5.9],
    note: 'The other half of the differential: it measures what comes OUT. If in and out do not match, the fault is inside the transformer, and the protection operates in milliseconds.',
    ratio: '2000:5', devices: ['87T', '51'],
  },
  {
    id: 'T1_CB_LV', kind: 'breaker', name: 'Bank 1 low-side breaker',
    bay: 'bank1', kV: 12.47, yard: [14, 10, 1.8], schematic: [1, 6.4], closed: true,
    note: 'Disconnects the transformer from the 12.47 kV bus.',
    rating: '15 kV, 2000 A, 25 kA interrupting', devices: ['51', '51N'],
  },

  // --- transformer bank 2 ---------------------------------------------------
  {
    id: 'T2_DS_HV', kind: 'disconnect', name: 'Bank 2 high-side disconnect',
    bay: 'bank2', kV: 115, yard: [30, 24, 6.4], schematic: [4, 3.6], closed: true,
    note: 'Isolates the second transformer from the 115 kV bus. It cannot interrupt load — the breaker does that first, and then this is opened to make the isolation visible.',
  },
  {
    id: 'T2_CT_HV', kind: 'ct', name: 'Bank 2 high-side current transformers',
    bay: 'bank2', kV: 115, yard: [30, 21, 3.2], schematic: [4, 4.1],
    note: 'The high-side half of the second bank’s differential protection: it measures what goes IN.', ratio: '300:5', devices: ['87T'],
  },
  {
    id: 'T2', kind: 'transformer', name: 'Bank 2',
    bay: 'bank2', kV: 115, yard: [30, 17, 2.4], schematic: [4, 5],
    note: 'The second bank, identical to the first. Either one can carry the whole station for a while, which is what makes it possible to take the other out for maintenance.',
    rating: '28 MVA, 115/12.47 kV, Dyn1, 8.5 % Z, ±10 % OLTC',
    devices: ['87T', '51', '49', '63'],
  },
  {
    id: 'T2_CT_LV', kind: 'ct', name: 'Bank 2 low-side current transformers',
    bay: 'bank2', kV: 12.47, yard: [30, 13, 2.2], schematic: [4, 5.9],
    note: 'The low-side half of the second bank’s differential protection: it measures what comes OUT. If in and out disagree, the fault is inside the tank.', ratio: '2000:5', devices: ['87T', '51'],
  },
  {
    id: 'T2_CB_LV', kind: 'breaker', name: 'Bank 2 low-side breaker',
    bay: 'bank2', kV: 12.47, yard: [30, 10, 1.8], schematic: [4, 6.4], closed: true,
    note: 'Disconnects the second transformer from the 12.47 kV bus, and clears a fault on the transformer’s low side before the bus has to.',
    rating: '15 kV, 2000 A, 25 kA interrupting', devices: ['51', '51N'],
  },

  // --- 12.47 kV switchgear --------------------------------------------------
  {
    id: 'BUS12', kind: 'bus', name: '12.47 kV bus',
    bay: 'bus12', kV: 12.47, yard: [22, 7, 4.2], schematic: [2.5, 7],
    span: { schematic: [0.3, 8.6], yardX: [6, 72] },
    note: 'The low-voltage bus. In a station this size it lives inside metal-clad switchgear rather than out in the open.',
    rating: '15 kV, 3000 A', devices: ['87B'],
  },
  {
    id: 'BUS12_TIE', kind: 'breaker', name: 'Bus tie breaker',
    bay: 'bus12', kV: 12.47, yard: [22, 7, 1.8], schematic: [2.5, 7.6], closed: false,
    note: 'Normally OPEN. It splits the 12.47 kV bus into two halves, one fed by each transformer, so a fault on one half does not take the other with it. Closing it lets one bank carry the whole station.',
    rating: '15 kV, 3000 A', devices: ['51'],
  },
  {
    id: 'BUS12_PT', kind: 'pt', name: '12.47 kV bus potential transformers',
    bay: 'bus12', kV: 12.47, yard: [40, 7, 2.0], schematic: [5.4, 7],
    note: 'Measures the bus voltage. This is the signal the tap changers and the capacitor controls are both watching.',
    ratio: '12470:120', devices: ['59', '27'],
  },

  // --- feeders --------------------------------------------------------------
  ...(['1201', '1202', '1203', '1204'] as const).map((n, i): SubstationElement => ({
    id: `FDR${n}_CB`, kind: 'breaker', name: `Feeder ${n} breaker`,
    bay: `fdr${n}`, kV: 12.47,
    yard: [10 + i * 11, 4, 1.8], schematic: [0.5 + i * 1.6, 8.4], closed: true,
    note: n === '1201'
      ? 'The breaker protecting Cherry Lane 1201. Everything past it is out in the streets, and it is the device that clears a fault out there.'
      : `The breaker protecting feeder ${n}.`,
    rating: '15 kV, 1200 A, 25 kA interrupting',
    devices: ['50', '51', '50N', '51N', '79'],
  })),
  ...(['1201', '1202', '1203', '1204'] as const).map((n, i): SubstationElement => ({
    id: `FDR${n}_CT`, kind: 'ct', name: `Feeder ${n} current transformers`,
    bay: `fdr${n}`, kV: 12.47,
    yard: [10 + i * 11, 2, 1.6], schematic: [0.5 + i * 1.6, 9],
    note: 'What the feeder’s overcurrent protection is actually measuring.',
    ratio: '600:5', devices: ['50', '51', '50N', '51N'],
  })),

  // --- capacitor bank and station service -----------------------------------
  {
    id: 'CAP_CB', kind: 'breaker', name: 'Capacitor bank breaker',
    bay: 'cap', kV: 12.47, yard: [56, 7, 1.8], schematic: [7, 7.6], closed: true,
    note: 'Switches the station capacitor bank in and out. It operates several times a day, following the load.',
    rating: '15 kV, 600 A', devices: ['51'],
  },
  {
    id: 'CAP', kind: 'capacitor', name: 'Station capacitor bank',
    bay: 'cap', kV: 12.47, yard: [56, 3, 2.6], schematic: [7, 8.4],
    note: 'Three racks of capacitor cans. They supply reactive power to the whole station, which keeps the 12.47 kV bus voltage up and keeps the transformers from having to carry it.',
    rating: '3.6 MVAr in three 1.2 MVAr steps',
  },
  {
    id: 'SST', kind: 'transformer', name: 'Station service transformer',
    bay: 'station', kV: 12.47, yard: [68, 10, 1.6], schematic: [8.4, 7.6],
    note: 'A small transformer supplying the station’s own needs: control power, lighting, transformer cooling fans, the battery charger that keeps the relays alive when everything else is dead.',
    rating: '75 kVA, 12.47 kV / 240–120 V',
  },
  {
    id: 'GROUND_GRID', kind: 'ground-grid', name: 'Ground grid',
    bay: 'station', kV: 0, yard: [43, 27, -0.5], schematic: [4.4, 9.4],
    note: 'A mesh of bare copper buried half a metre down, bonded to every steel structure and every equipment case. When fault current flows into the earth here, the grid is what keeps the ground under a person’s feet at roughly the same potential as the steel they might be touching.',
    rating: '4/0 bare copper on a 6 m mesh, with driven rods at the corners',
  },
];

/**
 * How the equipment is connected, as a one-line diagram.
 *
 * These are the connections the drawing shows, which is not quite the same as
 * the buses the power flow solves: the solver does not care that there is a
 * disconnect switch between the breaker and the bus, because a closed
 * disconnect is a piece of wire. The drawing cares, because a person standing
 * in the yard has to know which piece of metal is safe to touch.
 */
export const CONNECTIONS: [string, string][] = [
  ['L1_TERM', 'L1_ARR'], ['L1_ARR', 'L1_PT'], ['L1_ARR', 'L1_DS_LINE'],
  ['L1_DS_LINE', 'L1_CT'], ['L1_CT', 'L1_CB'], ['L1_CB', 'L1_DS_BUS'],
  ['L1_DS_BUS', 'BUS115'],

  ['L2_TERM', 'L2_ARR'], ['L2_ARR', 'L2_DS_LINE'],
  ['L2_DS_LINE', 'L2_CT'], ['L2_CT', 'L2_CB'], ['L2_CB', 'L2_DS_BUS'],
  ['L2_DS_BUS', 'BUS115'],

  ['BUS115', 'BUS115_PT'],
  ['BUS115', 'T1_DS_HV'], ['T1_DS_HV', 'T1_CT_HV'], ['T1_CT_HV', 'T1'],
  ['T1', 'T1_CT_LV'], ['T1_CT_LV', 'T1_CB_LV'], ['T1_CB_LV', 'BUS12'],

  ['BUS115', 'T2_DS_HV'], ['T2_DS_HV', 'T2_CT_HV'], ['T2_CT_HV', 'T2'],
  ['T2', 'T2_CT_LV'], ['T2_CT_LV', 'T2_CB_LV'], ['T2_CB_LV', 'BUS12'],

  ['BUS12', 'BUS12_TIE'], ['BUS12', 'BUS12_PT'],
  ['BUS12', 'FDR1201_CB'], ['FDR1201_CB', 'FDR1201_CT'],
  ['BUS12', 'FDR1202_CB'], ['FDR1202_CB', 'FDR1202_CT'],
  ['BUS12', 'FDR1203_CB'], ['FDR1203_CB', 'FDR1203_CT'],
  ['BUS12', 'FDR1204_CB'], ['FDR1204_CB', 'FDR1204_CT'],
  ['BUS12', 'CAP_CB'], ['CAP_CB', 'CAP'],
  ['BUS12', 'SST'],
];

/**
 * The protection scheme, by ANSI/IEEE C37.2 device number.
 *
 * The point of the numbering is that it is universal: an engineer who has never
 * seen this station can read "87T" on a drawing and know exactly what it does,
 * anywhere in the world. That is worth far more than a friendly name would be.
 */
export interface ProtectionFunction {
  device: string;
  name: string;
  what: string;
  /** What it protects, and how it decides. */
  how: string;
  /** Roughly how fast it operates. */
  speed: string;
  appliesTo: string[];
}

export const PROTECTION: ProtectionFunction[] = [
  {
    device: '87T', name: 'Transformer differential',
    what: 'Protects the transformer itself.',
    how:
      'Compares the current going in with the current coming out, corrected for ' +
      'the turns ratio. In normal operation they match. If they do not, the ' +
      'missing current is going somewhere it should not — a fault inside the ' +
      'tank — and there is no reason to wait.',
    speed: 'Under one cycle to decide; the breaker opens in two or three more.',
    appliesTo: ['T1', 'T2'],
  },
  {
    device: '87B', name: 'Bus differential',
    what: 'Protects the busbar.',
    how:
      'The same idea applied to a bus: everything flowing in must equal ' +
      'everything flowing out. A bus fault is the most severe fault a station ' +
      'can have, because every source feeds it at once.',
    speed: 'Under one cycle.',
    appliesTo: ['BUS115', 'BUS12'],
  },
  {
    device: '51', name: 'Time-overcurrent',
    what: 'Backup protection for almost everything.',
    how:
      'Trips when the current has been too high for too long, on an inverse ' +
      'curve: the bigger the overcurrent, the sooner it acts. The delay is ' +
      'what lets devices in series be COORDINATED, so the one nearest the ' +
      'fault operates first and nothing else has to.',
    speed: 'A fraction of a second to several seconds, depending on how large the current is.',
    appliesTo: ['T1', 'T2', 'T1_CB_LV', 'T2_CB_LV', 'FDR1201_CB', 'BUS12_TIE', 'CAP_CB'],
  },
  {
    device: '50', name: 'Instantaneous overcurrent',
    what: 'Fast clearing for close-in faults.',
    how:
      'Trips immediately above a threshold set high enough that only a fault ' +
      'near the device can reach it. A fault further away produces less current ' +
      'because of the impedance in between, which is exactly what lets one ' +
      'setting distinguish "near" from "far".',
    speed: 'Immediate: one to two cycles plus breaker time.',
    appliesTo: ['FDR1201_CB'],
  },
  {
    device: '50N / 51N', name: 'Ground overcurrent',
    what: 'Catches faults to earth that the phase elements would miss.',
    how:
      'Watches the sum of the three phase currents. In a balanced circuit that ' +
      'sum is zero; anything else is current returning through the earth, which ' +
      'means a conductor is touching something it should not be. It can be set ' +
      'far more sensitively than the phase elements because normal load barely ' +
      'shows up in it.',
    speed: 'As 50 and 51, applied to the residual current.',
    appliesTo: ['FDR1201_CB', 'T1_CB_LV', 'T2_CB_LV'],
  },
  {
    device: '79', name: 'Automatic reclosing',
    what: 'Tries again.',
    how:
      'Most faults on an overhead line are momentary — a branch blown across ' +
      'the wires, a bird, a flashover in wind-driven rain. De-energising the ' +
      'line for half a second lets the arc go out; reclosing then restores ' +
      'supply with nobody noticing more than a flicker. If the fault is still ' +
      'there the breaker trips again, and after two or three attempts it gives ' +
      'up and stays open.',
    speed: 'First attempt after about half a second, then longer intervals.',
    appliesTo: ['FDR1201_CB', 'L1_CB', 'L2_CB'],
  },
  {
    device: '21', name: 'Distance',
    what: 'Transmission line protection.',
    how:
      'Measures voltage and current together and computes the apparent ' +
      'impedance to the fault. Because impedance is proportional to distance ' +
      'along the line, the relay effectively knows HOW FAR AWAY the fault is, ' +
      'and can be set to operate instantly for anything in the first eighty ' +
      'per cent of the line and to wait for anything beyond.',
    speed: 'One to two cycles in its first zone.',
    appliesTo: ['L1_CB', 'L2_CB'],
  },
  {
    device: '67', name: 'Directional overcurrent',
    what: 'Overcurrent that knows which way the fault is.',
    how:
      'Compares the phase of the current against the voltage to work out which ' +
      'direction the fault current is flowing. On a circuit fed from both ends, ' +
      'a relay without this would trip for faults behind it as well as in ' +
      'front.',
    speed: 'As the overcurrent element it supervises.',
    appliesTo: ['L1_CB', 'L2_CB'],
  },
  {
    device: '49', name: 'Thermal overload',
    what: 'Protects the transformer’s insulation from cooking slowly.',
    how:
      'Models the winding temperature from the load and the ambient, rather ' +
      'than measuring current alone. A transformer can carry well above ' +
      'nameplate for a short time and not at all for a long one, and this is ' +
      'the element that knows the difference.',
    speed: 'Minutes to hours. It is watching heat, not current.',
    appliesTo: ['T1', 'T2'],
  },
  {
    device: '63', name: 'Sudden pressure',
    what: 'Catches an internal fault by its mechanical effect.',
    how:
      'An arc inside an oil-filled tank vaporises oil and produces a pressure ' +
      'wave almost instantly. A relay watching for that wave can detect a ' +
      'winding fault before the electrical quantities have moved far enough for ' +
      'the differential to be sure.',
    speed: 'A few cycles, and often the first thing to operate.',
    appliesTo: ['T1', 'T2'],
  },
  {
    device: '27 / 59', name: 'Under- and overvoltage',
    what: 'Watches the voltage itself.',
    how:
      'Undervoltage (27) detects a collapse; overvoltage (59) detects a rise, ' +
      'which most often means something has been switched in that should not ' +
      'be, or load has been lost.',
    speed: 'Seconds, deliberately, so a momentary dip does not trip anything.',
    appliesTo: ['BUS115_PT', 'BUS12_PT', 'L1_PT'],
  },
];

export const elementById = new Map(ELEMENTS.map((e) => [e.id, e]));
export const bayById = new Map(BAYS.map((b) => [b.id, b]));
export const protectionByDevice = new Map(PROTECTION.map((p) => [p.device, p]));

/** Every protection function that watches a given element. */
export const protectionFor = (elementId: string): ProtectionFunction[] =>
  PROTECTION.filter((p) => p.appliesTo.includes(elementId));
