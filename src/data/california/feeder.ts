/**
 * Cherry Lane 1201 — one distribution feeder, modelled pole by pole.
 *
 * This is the part of the model that makes the whole thing land. Everything
 * above it is infrastructure most people will never see; this is the wire along
 * the street, and at the end of it is a socket in a wall.
 *
 * IT IS IN THE SAME NETWORK CASE AS THE TRANSMISSION SYSTEM. That is a
 * deliberate and slightly expensive choice: it means a single power flow solves
 * from the Oregon border to a kitchen outlet, and conservation closes across
 * the whole chain rather than being asserted level by level. A separate
 * feeder-only solve, fed from a fixed source voltage, would be easier and would
 * quietly break the claim the project is making.
 *
 * WHAT A DISTRIBUTION FEEDER IS
 *
 * Out of the substation comes a three-phase circuit at 12.47 kV between phases,
 * which is 7.2 kV from any one phase to neutral. The neutral is earthed at
 * every pole — the "four-wire multigrounded wye" — which is what lets a single
 * phase and the neutral be tapped off on their own to serve a street. The
 * three-phase MAIN runs the length of the feeder; single-phase LATERALS branch
 * off it wherever the houses are, each protected by its own fuse so that a
 * branch failing does not take the main down.
 *
 * Along the way: a VOLTAGE REGULATOR, because the far end would otherwise sag
 * below what equipment tolerates; and a CAPACITOR BANK, because the motors on
 * the feeder need reactive power and it is far cheaper to make it here than to
 * carry it from a generator.
 *
 * At the end of a lateral, a SERVICE TRANSFORMER drops 7.2 kV to 240/120 V and
 * a few houses are connected to it. That transformer is the last piece of the
 * power system anybody is likely to see from the ground.
 */

import { Bus, Branch, Load, ShuntDevice } from '../../core/network.js';
import { lineParameters, lineToPerUnit } from '../../core/lines.js';
import { SYSTEM_BASE_MVA, makeBusId, TRANSFORMER_CLASSES } from './build.js';
import { haversineKm } from './geography.js';

/** Nominal voltages on the feeder. ANSI C84.1 distribution classes. */
export const FEEDER_KV = 12.47;
export const SERVICE_KV = 0.24;

/**
 * The line-to-neutral voltage, which is what a single-phase lateral actually
 * runs at. 12.47 / √3 = 7.2 kV — the √3 that turns up everywhere in
 * three-phase work, here doing something concrete.
 */
export const FEEDER_LN_KV = FEEDER_KV / Math.sqrt(3);

export type FeederPhase = 'ABC' | 'A' | 'B' | 'C';

export interface FeederNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Which phases are present here. The main is three-phase; laterals are not. */
  phases: FeederPhase;
  /** Distance along the feeder from the substation, km. Filled in by the builder. */
  distanceKm?: number;
  /** What is at this pole, in plain language. */
  note?: string;
}

export interface FeederSection {
  from: string;
  to: string;
  /** Conductor id from the CONDUCTORS table. */
  conductor: string;
  phases: FeederPhase;
  /** Overhead unless stated. Underground cable is drawn differently. */
  underground?: boolean;
}

export interface FeederSpotLoad {
  node: string;
  /** Peak real demand at this point, kW. */
  peakKW: number;
  powerFactor: number;
  /** How many customers this represents, for the sense-of-scale readouts. */
  customers: number;
  loadClass: 'residential' | 'commercial' | 'industrial';
  note?: string;
}

/**
 * The route.
 *
 * Coordinates run southeast out of Eden Vale substation into a residential part
 * of south San Jose. The geometry is invented; the SHAPE is characteristic —
 * a three-phase backbone down a main road, with single-phase laterals branching
 * into the streets either side.
 */
export const FEEDER_NODES: FeederNode[] = [
  { id: 'F00', name: 'Getaway', lat: 37.2700, lon: -121.8300, phases: 'ABC',
    note: 'Where the feeder leaves the substation fence. The breaker protecting it is inside, a few metres away.' },
  { id: 'F01', name: 'Pole 1201-1', lat: 37.2697, lon: -121.8270, phases: 'ABC' },
  { id: 'F02', name: 'Pole 1201-2', lat: 37.2694, lon: -121.8240, phases: 'ABC' },
  { id: 'F03', name: 'Recloser R1', lat: 37.2692, lon: -121.8210, phases: 'ABC',
    note: 'A recloser: a breaker that tries again. Most faults on an overhead line are momentary — a branch, a bird — and clear themselves once the arc is de-energised.' },
  { id: 'F04', name: 'Pole 1201-4', lat: 37.2690, lon: -121.8180, phases: 'ABC' },
  { id: 'F05', name: 'Regulator', lat: 37.2689, lon: -121.8150, phases: 'ABC',
    note: 'A step voltage regulator: an autotransformer with a tap changer, holding the voltage downstream of it inside range whatever the load does upstream.' },
  { id: 'F06', name: 'Pole 1201-6', lat: 37.2687, lon: -121.8120, phases: 'ABC' },
  { id: 'F07', name: 'Pole 1201-7', lat: 37.2684, lon: -121.8090, phases: 'ABC' },
  { id: 'F08', name: 'Capacitor bank', lat: 37.2681, lon: -121.8060, phases: 'ABC',
    note: 'Three capacitors on a pole, switched by a controller watching the local voltage. They supply the reactive power the motors downstream need, so it does not have to be carried from the substation.' },
  { id: 'F09', name: 'Pole 1201-9', lat: 37.2678, lon: -121.8030, phases: 'ABC' },
  { id: 'F10', name: 'Pole 1201-10', lat: 37.2675, lon: -121.8000, phases: 'ABC' },
  { id: 'F11', name: 'Tie point', lat: 37.2672, lon: -121.7970, phases: 'ABC',
    note: 'A normally-open switch to the next feeder. Closing it after a fault is how supply is restored to the far end while the damaged section is repaired.' },

  // --- laterals ---------------------------------------------------------
  // They run at right angles to the main, which is what a street grid does and
  // which also means that on an isometric drawing the main and its laterals
  // fall on two different axes and can be told apart without a legend.
  { id: 'L1A', name: 'Alder Street', lat: 37.2712, lon: -121.8240, phases: 'A',
    note: 'A single-phase lateral: one phase wire and the neutral, tapped off the main to serve a street.' },
  { id: 'L1B', name: 'Alder Street end', lat: 37.2730, lon: -121.8240, phases: 'A' },
  { id: 'L2A', name: 'Birch Avenue', lat: 37.2669, lon: -121.8120, phases: 'B' },
  { id: 'L2B', name: 'Birch Avenue end', lat: 37.2651, lon: -121.8120, phases: 'B' },
  { id: 'L3A', name: 'Cherry Lane', lat: 37.2702, lon: -121.8090, phases: 'C',
    note: 'The lateral this feeder is named after. The modelled service is at the far end of it.' },
  { id: 'L3B', name: 'Cherry Lane end', lat: 37.2720, lon: -121.8090, phases: 'C' },
  { id: 'L4A', name: 'Dogwood Court', lat: 37.2660, lon: -121.8030, phases: 'A' },
  { id: 'L5A', name: 'Elm Way', lat: 37.2693, lon: -121.8000, phases: 'B' },

  // --- the modelled service ---------------------------------------------
  { id: 'SVC_LV', name: 'Cherry Lane pad-mount — secondary', lat: 37.2722, lon: -121.8087, phases: 'A',
    note: 'The secondary terminals of the last transformer in the chain: 240 V across the two outer conductors, 120 V from either one to the centre tap. This is the deepest point the power flow solves to; everything past it is single-phase and is worked out in the open.' },
];

/**
 * The sections.
 *
 * The main is 336.4 kcmil ACSR — a common distribution backbone conductor, good
 * for about 530 amperes, which at 12.47 kV is roughly 11 MVA. Laterals are 1/0,
 * because a street of houses never needs more than a couple of megawatts and
 * smaller conductor is cheaper to hang.
 */
export const FEEDER_SECTIONS: FeederSection[] = [
  { from: 'F00', to: 'F01', conductor: 'linnet', phases: 'ABC', underground: true },
  { from: 'F01', to: 'F02', conductor: 'linnet', phases: 'ABC' },
  { from: 'F02', to: 'F03', conductor: 'linnet', phases: 'ABC' },
  { from: 'F03', to: 'F04', conductor: 'linnet', phases: 'ABC' },
  { from: 'F04', to: 'F05', conductor: 'linnet', phases: 'ABC' },
  { from: 'F05', to: 'F06', conductor: 'linnet', phases: 'ABC' },
  { from: 'F06', to: 'F07', conductor: 'linnet', phases: 'ABC' },
  { from: 'F07', to: 'F08', conductor: 'linnet', phases: 'ABC' },
  { from: 'F08', to: 'F09', conductor: 'linnet', phases: 'ABC' },
  { from: 'F09', to: 'F10', conductor: 'linnet', phases: 'ABC' },
  { from: 'F10', to: 'F11', conductor: 'linnet', phases: 'ABC' },

  { from: 'F02', to: 'L1A', conductor: 'raven', phases: 'A' },
  { from: 'L1A', to: 'L1B', conductor: 'raven', phases: 'A' },
  { from: 'F06', to: 'L2A', conductor: 'raven', phases: 'B' },
  { from: 'L2A', to: 'L2B', conductor: 'raven', phases: 'B' },
  { from: 'F07', to: 'L3A', conductor: 'raven', phases: 'C' },
  { from: 'L3A', to: 'L3B', conductor: 'raven', phases: 'C' },
  { from: 'F09', to: 'L4A', conductor: 'raven', phases: 'A' },
  { from: 'F10', to: 'L5A', conductor: 'raven', phases: 'B' },
];

/**
 * Where the load actually sits.
 *
 * Peak demand on this feeder is about 7.1 MW across 1,585 customers — a little
 * under 4.5 kW each at the moment they all peak together, which is what the
 * coincidence factor is about: each of those houses has a service capable of
 * 24 kW and peaks on its own at five or six, and they do not all do it at the
 * same moment. The factors panel computes that ratio rather than asserting it.
 */
export const FEEDER_LOADS: FeederSpotLoad[] = [
  { node: 'F01', peakKW: 420, powerFactor: 0.95, customers: 40, loadClass: 'commercial',
    note: 'A shopping strip near the substation.' },
  { node: 'F03', peakKW: 310, powerFactor: 0.94, customers: 6, loadClass: 'industrial',
    note: 'A light-industrial unit. Motor load, which is why its power factor is poorer.' },
  { node: 'F04', peakKW: 540, powerFactor: 0.97, customers: 130, loadClass: 'residential' },
  { node: 'F06', peakKW: 610, powerFactor: 0.97, customers: 150, loadClass: 'residential' },
  { node: 'F08', peakKW: 480, powerFactor: 0.96, customers: 115, loadClass: 'residential' },
  { node: 'F09', peakKW: 390, powerFactor: 0.97, customers: 95, loadClass: 'residential' },
  { node: 'F10', peakKW: 350, powerFactor: 0.97, customers: 85, loadClass: 'residential' },
  { node: 'F11', peakKW: 180, powerFactor: 0.97, customers: 45, loadClass: 'residential' },

  { node: 'L1A', peakKW: 640, powerFactor: 0.96, customers: 155, loadClass: 'residential' },
  { node: 'L1B', peakKW: 520, powerFactor: 0.97, customers: 125, loadClass: 'residential' },
  { node: 'L2A', peakKW: 590, powerFactor: 0.96, customers: 140, loadClass: 'residential' },
  { node: 'L2B', peakKW: 430, powerFactor: 0.97, customers: 105, loadClass: 'residential' },
  { node: 'L3A', peakKW: 500, powerFactor: 0.96, customers: 120, loadClass: 'residential' },
  { node: 'L3B', peakKW: 340, powerFactor: 0.97, customers: 82, loadClass: 'residential',
    note: 'The rest of Cherry Lane, apart from the one house modelled in full.' },
  { node: 'L4A', peakKW: 460, powerFactor: 0.97, customers: 112, loadClass: 'residential' },
  { node: 'L5A', peakKW: 280, powerFactor: 0.97, customers: 68, loadClass: 'residential' },
];

/**
 * The one service modelled all the way down.
 *
 * A 50 kVA pad-mounted transformer serving twelve houses on Cherry Lane, one of
 * which is number 14. At peak the twelve together draw about 38 kW — a little
 * over 3 kW each — because they do not all run the oven at the same moment.
 */
export const MODELLED_SERVICE = {
  transformerKVA: 50,
  fromNode: 'L3B',
  toNode: 'SVC_LV',
  housesServed: 12,
  peakKW: 38,
  powerFactor: 0.98,
  note:
    'A pad-mounted transformer on a concrete plinth. 7.2 kV in on one side, ' +
    '240 V out on the other with a centre tap that becomes the neutral — which ' +
    'is why a house has both 240 V for the dryer and 120 V for everything else.',
} as const;

/** The voltage regulator at F05. */
export const FEEDER_REGULATOR = {
  node: 'F05',
  /** Regulation range, ± per cent, in 32 steps of 0.625 %. ANSI C57.15. */
  rangePercent: 10,
  steps: 32,
  /** The voltage it tries to hold downstream, in per-unit. */
  setpointPU: 1.025,
  /** Which tap it is currently on, −16 to +16. Set by the solver's tap logic. */
  defaultTap: 6,
  note:
    'An autotransformer with a motor-driven tap changer. It watches the voltage ' +
    'downstream and moves one step at a time — each step is 0.625 %, and there ' +
    'are sixteen either way, so it can lift or drop the voltage by a tenth.',
} as const;

/** The switched capacitor bank at F08. */
export const FEEDER_CAPACITOR = {
  node: 'F08',
  kVAr: 1200,
  /** Switched on local voltage, like the transmission banks. */
  switchThreshold: 0.55,
  note:
    '1,200 kVAr in three 400 kVAr cans on a pole. Switched in when the feeder ' +
    'is loaded and out when it is not, because the same bank that holds the ' +
    'voltage up at six in the evening would push it too high at four in the ' +
    'morning.',
} as const;

// ---------------------------------------------------------------------------
// Building the electrical model
// ---------------------------------------------------------------------------

export interface FeederModel {
  buses: Bus[];
  branches: Branch[];
  loads: Load[];
  shunts: ShuntDevice[];
  /** Distance from the substation to each node, km, along the wire. */
  distanceKm: Map<string, number>;
  /** The bus id each feeder node maps to. */
  busOf: Map<string, string>;
  /** Total peak demand on the feeder, kW. */
  peakKW: number;
  totalCustomers: number;
}

const nodeById = new Map(FEEDER_NODES.map((n) => [n.id, n]));

/** Bus id for a feeder node. Distinct namespace from the transmission buses. */
export const feederBusId = (nodeId: string): string =>
  nodeId === 'SVC_LV' ? 'SVC_LV' : `FDR_${nodeId}`;

/** Length of a section, km. Overhead lines follow the street, so no circuity. */
export function sectionLengthKm(s: FeederSection): number {
  const a = nodeById.get(s.from);
  const b = nodeById.get(s.to);
  if (!a || !b) throw new Error(`feeder section ${s.from}–${s.to}: unknown node`);
  return haversineKm(a, b);
}

/**
 * Distance from the substation to every node, measured along the wire.
 *
 * This is the x-axis of the voltage profile, which is the single most useful
 * plot in distribution engineering: it shows the voltage falling away from the
 * substation, the regulator lifting it back up, and whether the far end is
 * inside the range a customer's equipment is entitled to.
 */
function computeDistances(): Map<string, number> {
  const adjacency = new Map<string, { to: string; km: number }[]>();
  for (const s of FEEDER_SECTIONS) {
    const km = sectionLengthKm(s);
    (adjacency.get(s.from) ?? adjacency.set(s.from, []).get(s.from)!).push({ to: s.to, km });
    (adjacency.get(s.to) ?? adjacency.set(s.to, []).get(s.to)!).push({ to: s.from, km });
  }
  const dist = new Map<string, number>([['F00', 0]]);
  const queue = ['F00'];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const edge of adjacency.get(cur) ?? []) {
      if (dist.has(edge.to)) continue;
      dist.set(edge.to, dist.get(cur)! + edge.km);
      queue.push(edge.to);
    }
  }
  // The service hangs off the end of Cherry Lane.
  dist.set('SVC_LV', (dist.get(MODELLED_SERVICE.fromNode) ?? 0) + 0.03);
  return dist;
}

/** Reactive power from real power and power factor: Q = P·tan(arccos(pf)). */
const qFromPF = (p: number, pf: number): number => p * Math.tan(Math.acos(pf));

/**
 * Build the feeder as buses, branches, loads and shunts to be merged into the
 * transmission case.
 *
 * ONE SIMPLIFICATION IS LOAD-BEARING HERE and is recorded in the honesty
 * register: the feeder is solved as a BALANCED positive-sequence circuit, even
 * though single-phase laterals make a real feeder genuinely unbalanced. A
 * single-phase lateral is modelled as a three-phase circuit carrying a third of
 * the load, which gets the voltage drop along it about right and says nothing
 * at all about the neutral current, which is the thing unbalance is really
 * about.
 */
export function buildFeeder(): FeederModel {
  const distanceKm = computeDistances();
  const buses: Bus[] = [];
  const branches: Branch[] = [];
  const loads: Load[] = [];
  const shunts: ShuntDevice[] = [];
  const busOf = new Map<string, string>();

  for (const n of FEEDER_NODES) {
    const isService = n.id === 'SVC_LV';
    const id = feederBusId(n.id);
    busOf.set(n.id, id);
    buses.push({
      id,
      name: `${n.name} (${isService ? '240 V' : '12.47 kV'})`,
      type: 'PQ',
      baseKV: isService ? SERVICE_KV : FEEDER_KV,
      // ANSI C84.1 Range A for utilisation voltage is 114–126 V on a 120 V
      // base: 0.95 to 1.05. Service voltage is held a little tighter.
      vMin: isService ? 0.95 : 0.95,
      vMax: isService ? 1.05 : 1.05,
      area: 'bay',
    });
  }

  // --- the sections ------------------------------------------------------
  for (const s of FEEDER_SECTIONS) {
    const km = sectionLengthKm(s);
    const p = lineParameters(s.conductor, 'dist-12-crossarm');
    const pu = lineToPerUnit(p, km, FEEDER_KV, SYSTEM_BASE_MVA);
    const single = s.phases !== 'ABC';
    branches.push({
      id: `FDR_${s.from}_${s.to}`,
      name: `${nodeById.get(s.from)!.name} – ${nodeById.get(s.to)!.name}`,
      from: feederBusId(s.from),
      to: feederBusId(s.to),
      r: pu.r,
      x: pu.x,
      b: pu.b,
      // A single-phase lateral carries a third of what a three-phase circuit
      // of the same conductor would.
      ratingMVA: single ? pu.ratingMVA / 3 : pu.ratingMVA,
      ratingEmergencyMVA: (single ? pu.ratingMVA / 3 : pu.ratingMVA) * 1.25,
      kind: s.underground ? 'cable' : 'line',
      inService: true,
      lengthKm: km,
      conductor: s.conductor,
    });
  }

  // --- the voltage regulator --------------------------------------------
  // Modelled as a transformer branch with an off-nominal tap. An inserted node
  // separates "before the regulator" from "after", which is what makes the
  // step visible on the voltage profile.
  const regNode = FEEDER_REGULATOR.node;
  const regBus = `FDR_${regNode}_REG`;
  buses.push({
    id: regBus,
    name: 'Regulator output (12.47 kV)',
    type: 'PQ', baseKV: FEEDER_KV, vMin: 0.95, vMax: 1.05, area: 'bay',
  });
  // Rewire everything downstream of the regulator onto its output bus.
  const downstream = new Set(['F06', 'F07', 'F08', 'F09', 'F10', 'F11']);
  for (const br of branches) {
    if (br.from === feederBusId(regNode) && downstream.has(br.id.split('_')[2])) {
      br.from = regBus;
    }
  }
  const stepPU = FEEDER_REGULATOR.rangePercent / 100 / (FEEDER_REGULATOR.steps / 2);
  branches.push({
    id: 'FDR_REGULATOR',
    name: `Step voltage regulator — ±${FEEDER_REGULATOR.rangePercent} % in ` +
      `${FEEDER_REGULATOR.steps} steps of ${(stepPU * 100).toFixed(3)} %`,
    from: feederBusId(regNode),
    to: regBus,
    // A regulator is an autotransformer: its series impedance is small.
    r: 0.0002 * (SYSTEM_BASE_MVA / 10),
    x: 0.0010 * (SYSTEM_BASE_MVA / 10),
    b: 0,
    ratingMVA: 10,
    ratingEmergencyMVA: 13,
    kind: 'transformer',
    inService: true,
    // Tap BELOW 1.0 on the from side raises the to side: the Ybus divides the
    // from-side self term by the tap, so a tap of 0.96 lifts the output by ~4 %.
    tap: 1 - FEEDER_REGULATOR.defaultTap * stepPU,
    vectorGroup: 'regulator',
  });

  // --- the service transformer and the secondary -------------------------
  const svc = MODELLED_SERVICE;
  const zMag = TRANSFORMER_CLASSES.service.percentZ / 100;
  const k = TRANSFORMER_CLASSES.service.xOverR;
  const xSvc = (zMag * k) / Math.sqrt(1 + k * k);
  const rSvc = xSvc / k;
  const scale = SYSTEM_BASE_MVA / (svc.transformerKVA / 1000);
  branches.push({
    id: 'SVC_TRANSFORMER',
    name: `Service transformer — ${svc.transformerKVA} kVA, 12.47 kV / 240 V`,
    from: feederBusId(svc.fromNode),
    to: feederBusId(svc.toNode),
    r: rSvc * scale,
    x: xSvc * scale,
    b: 0,
    ratingMVA: svc.transformerKVA / 1000,
    ratingEmergencyMVA: (svc.transformerKVA / 1000) * 1.5,
    kind: 'transformer',
    inService: true,
    vectorGroup: TRANSFORMER_CLASSES.service.vectorGroup,
  });

  // --- the loads ----------------------------------------------------------
  let peakKW = 0;
  let totalCustomers = 0;
  for (const l of FEEDER_LOADS) {
    peakKW += l.peakKW;
    totalCustomers += l.customers;
    loads.push({
      id: `FDRLD_${l.node}`,
      name: `${nodeById.get(l.node)!.name} load`,
      bus: feederBusId(l.node),
      pMW: l.peakKW / 1000,
      qMVAr: qFromPF(l.peakKW / 1000, l.powerFactor),
      loadClass: l.loadClass,
    });
  }
  peakKW += svc.peakKW;
  totalCustomers += svc.housesServed;
  loads.push({
    id: 'SVC_LOAD',
    name: `${svc.housesServed} houses on Cherry Lane`,
    bus: feederBusId(svc.toNode),
    pMW: svc.peakKW / 1000,
    qMVAr: qFromPF(svc.peakKW / 1000, svc.powerFactor),
    loadClass: 'residential',
  });

  // --- the capacitor bank -------------------------------------------------
  shunts.push({
    id: 'FDR_CAP',
    name: `${FEEDER_CAPACITOR.kVAr} kVAr pole-mounted capacitor bank`,
    bus: feederBusId(FEEDER_CAPACITOR.node),
    qMVAr: FEEDER_CAPACITOR.kVAr / 1000,
    inService: true,
    kind: 'capacitor',
    switchThreshold: FEEDER_CAPACITOR.switchThreshold,
    note: FEEDER_CAPACITOR.note,
  });

  for (const n of FEEDER_NODES) n.distanceKm = distanceKm.get(n.id) ?? 0;

  return { buses, branches, loads, shunts, distanceKm, busOf, peakKW, totalCustomers };
}

/** The substation bus the feeder hangs off. */
export const FEEDER_SOURCE_BUS = makeBusId('edenvale', FEEDER_KV);
