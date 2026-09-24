import { Complex } from '../../physics/complex';
import { CMatrix } from '../../physics/linalg';
import { lineConstants, type WirePosition } from '../../physics/lineconstants';
import type { DBranch, DCapacitor, DLoad, DNode, DistNetwork, Phase } from '../../physics/dist/network';
import { network } from '../../physics/dist/network';
import type { SourceId } from '../sources';

/**
 * EVERGREEN 1105 — the one fully modelled distribution feeder, all the way to a wall
 * outlet. (PG&E names circuits by substation and a four-digit number whose first two
 * digits give the voltage class; "11xx" is 12 kV. The feeder itself is synthetic.)
 *
 *  Evergreen substation: the 60 kV subtransmission bus, a 60 kV Δ / 12.47 kV grounded-
 *  wye bank with an on-load tap changer, the 12 kV bus (with three other feeders
 *  lumped as load), and feeder breaker CB-1105.
 *  Feeder: a 3-phase, 4-wire multigrounded-wye trunk of 556.5 kcmil ACSR heading east
 *  about 3.3 km, a line recloser, a step-voltage regulator bank, a switched capacitor
 *  bank, a 3-phase spur to a grocery store, and ten fused single-phase laterals of 1/0
 *  ACSR, each with pole-top center-tapped transformers, 120/240 V triplex secondaries,
 *  service drops, and homes with meters (some with rooftop solar).
 *
 * Positions are metres in the feeder's own frame: x east, z south, origin at the
 * substation. Geometry is plausible, not a survey.
 */

const FT = 0.3048;
const w = (xft: number, yft: number, conductor: WirePosition['conductor'], role: WirePosition['role'], label: string): WirePosition => ({
  x: xft * FT,
  y: yft * FT,
  conductor,
  role,
  label,
});

/** Primary constructions (the IEEE 13-node spacings, with this feeder's conductors). */
export const FEEDER_CONSTRUCTIONS = {
  trunk: {
    label: '3-phase, 4-wire crossarm: 556.5 kcmil ACSR phases, 4/0 ACSR neutral',
    wires: [
      w(0, 28, 'ACSR_556_DOVE', 'phase', 'a'),
      w(2.5, 28, 'ACSR_556_DOVE', 'phase', 'b'),
      w(7, 28, 'ACSR_556_DOVE', 'phase', 'c'),
      w(4, 24, 'ACSR_4_0_PENGUIN', 'neutral', 'n'),
    ],
  },
  lateral: {
    label: '1-phase, 2-wire pole top: 1/0 ACSR phase and neutral',
    wires: [w(0.5, 29, 'ACSR_1_0_RAVEN', 'phase', 'x'), w(0, 24, 'ACSR_1_0_RAVEN', 'neutral', 'n')],
  },
  secondary: {
    // Triplex: two insulated 1/0 AA legs twisted round a 1/0 ACSR neutral messenger.
    // Centre-to-centre 0.528 in (conductor 0.368 in + two 80 mil insulation layers).
    label: '120/240 V triplex: two 1/0 AA insulated legs on a 1/0 ACSR neutral',
    wires: [
      w(0, 20, 'AA_1_0', 'phase', '1'),
      w(0.044, 20, 'AA_1_0', 'phase', '2'),
      w(0.022, 20 - 0.0381, 'ACSR_1_0_RAVEN', 'neutral', 'n'),
    ],
  },
} as const;

export const WIRING_12AWG = {
  label: '12 AWG copper branch circuit (hot and neutral)',
  /** Ω/km per conductor at 20 °C (AWG table). */
  r_ohm_per_km: 5.21,
  x_ohm_per_km: 0.1,
  src: 'estimate' as SourceId,
};

export const EVERGREEN = {
  /** Distribution substation bank. */
  bank: { kva: 30000, kvHighLL: 60, kvLowLL: 12.47, zpu: new Complex(0.004, 0.08), vectorGroup: 'Dyn1' },
  /** Tap changer: hold the 12 kV bus at 123 V on a 120 V base (1.025 pu), 2 V band. */
  ltc: { vset: 123, band: 2, stepPct: 0.625, maxSteps: 16 },
  /** The three other feeders on this bank, lumped: peak MW and power factor. */
  otherFeedersPeakMW: 18,
  otherFeedersPF: 0.97,
  serviceZpu: new Complex(0.012, 0.018),
  capacitor: { kvarPerPhase: 100 },
  src: 'estimate' as SourceId,
};

export interface HomeSpec {
  id: string;
  meter: string; // secondary node id
  transformer: string;
  x: number;
  z: number;
  /** Scale on the average-home profile (households differ). */
  scale: number;
  /** Fraction of the 120 V load on leg 1 (the rest is on leg 2). */
  leg1: number;
  /** Rooftop solar, kW AC (0 = none). */
  pvKW: number;
}

export interface FeederLayout {
  pos: Map<string, { x: number; z: number }>;
  homes: HomeSpec[];
  /** Pole-top transformers: id, primary node, phase, kVA. */
  transformers: Array<{ id: string; primary: string; secondary: string; phase: Phase; kva: number; lateral: string }>;
  laterals: Array<{ id: string; tap: string; phase: Phase; nodes: string[]; fuse: string }>;
  trunk: string[];
  /** The home whose wall outlet the chain ends at. */
  outlet: { home: string; node: string; panel: string; lengthM: number; applianceW: number };
  devices: Array<{ id: string; kind: 'breaker' | 'recloser' | 'fuse' | 'regulator' | 'capacitor' | 'transformer'; branchOrNode: string }>;
}

/** Deterministic pseudo-random numbers (the layout must be the same every time). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const VLN_PRI = 12470 / Math.sqrt(3);

/**
 * Build the feeder's topology and static elements. Loads are attached separately for
 * each time of day (see src/model/feeder.ts).
 */
export function buildEvergreen(): { net: DistNetwork; layout: FeederLayout } {
  const rand = rng(1105);
  const nodes: DNode[] = [];
  const branches: DBranch[] = [];
  const caps: DCapacitor[] = [];
  const pos = new Map<string, { x: number; z: number }>();
  const P3: Phase[] = [0, 1, 2];
  const addNode = (id: string, kind: DNode['kind'], phases: Phase[], vbase: number, x: number, z: number) => {
    nodes.push({ id, kind, phases, vbaseLN: vbase });
    pos.set(id, { x, z });
  };
  const trunkLC = lineConstants(FEEDER_CONSTRUCTIONS.trunk.wires);
  const latLC = lineConstants(FEEDER_CONSTRUCTIONS.lateral.wires);
  const secLC = lineConstants(FEEDER_CONSTRUCTIONS.secondary.wires);
  const seg = (id: string, from: string, to: string, phases: Phase[], lenM: number, lc: typeof trunkLC, cfg: string, withShunt = true): DBranch => {
    const Z = new CMatrix(3, 3);
    const Y = new CMatrix(3, 3);
    const km = lenM / 1000;
    phases.forEach((p, i) =>
      phases.forEach((q, j) => {
        Z.set(p, q, lc.zabc.get(i, j).scale(km));
        if (withShunt) Y.set(p, q, lc.yabc.get(i, j).scale(km));
      }),
    );
    return { kind: 'line', id, from, to, phases, Z, Y, lengthFt: lenM / FT, config: cfg };
  };

  // ---- substation
  addNode('EV-60', 'primary', P3, 60000 / Math.sqrt(3), -60, 0);
  addNode('EV-12', 'primary', P3, VLN_PRI, -20, 0);
  branches.push({
    kind: 'transformer',
    id: 'EV-BANK',
    from: 'EV-60',
    to: 'EV-12',
    conn: 'DYg',
    kva: EVERGREEN.bank.kva,
    kvHighLL: EVERGREEN.bank.kvHighLL,
    kvLowLL: EVERGREEN.bank.kvLowLL,
    zpu: EVERGREEN.bank.zpu,
    ltc: 1,
  });
  addNode('F0', 'primary', P3, VLN_PRI, 40, 0);
  branches.push({ kind: 'switch', id: 'CB-1105', from: 'EV-12', to: 'F0', phases: P3, closed: true });

  // ---- trunk
  const trunkX = [40, 400, 900, 950, 1500, 2100, 2150, 2700, 3300];
  const trunkIds = ['F0', 'F1', 'F2', 'F2R', 'F3', 'F4', 'F4R', 'F5', 'F6'];
  for (let i = 1; i < trunkIds.length; i++) addNode(trunkIds[i]!, 'primary', P3, VLN_PRI, trunkX[i]!, 0);
  for (let i = 1; i < trunkIds.length; i++) {
    const a = trunkIds[i - 1]!;
    const b = trunkIds[i]!;
    if (b === 'F2R') branches.push({ kind: 'switch', id: 'RCL-1', from: a, to: b, phases: P3, closed: true });
    else if (b === 'F4R')
      branches.push({
        kind: 'regulator',
        id: 'REG-1',
        from: a,
        to: b,
        phases: P3,
        taps: [0, 0, 0],
        control: { vset: 122, band: 2, ptRatio: 60, ctPrimary: 200, r: 2, x: 4 },
      });
    else branches.push(seg(`${a}-${b}`, a, b, P3, trunkX[i]! - trunkX[i - 1]!, trunkLC, 'trunk'));
  }
  caps.push({ id: 'CAP-1', node: 'F5', phases: P3, kvarPerPhase: EVERGREEN.capacitor.kvarPerPhase, vRatedLN: 7200, closed: true });

  // ---- 3-phase spur to the grocery store
  addNode('C1', 'primary', P3, VLN_PRI, 1500, -160);
  branches.push(seg('F3-C1', 'F3', 'C1', P3, 160, trunkLC, 'trunk'));
  addNode('C1-480', 'primary', P3, 480 / Math.sqrt(3), 1500, -175);
  branches.push({ kind: 'transformer', id: 'XF-C1', from: 'C1', to: 'C1-480', conn: 'YgYg', kva: 300, kvHighLL: 12.47, kvLowLL: 0.48, zpu: new Complex(0.012, 0.045) });

  // ---- laterals and services
  const laterals: FeederLayout['laterals'] = [];
  const transformers: FeederLayout['transformers'] = [];
  const homes: HomeSpec[] = [];
  const latDefs: Array<[string, string, Phase, number]> = [
    // id, tap node, phase, direction (−1 north, +1 south)
    ['L1', 'F1', 0, -1],
    ['L2', 'F1', 1, 1],
    ['L3', 'F2', 2, -1],
    ['L4', 'F3', 0, 1],
    ['L5', 'F3', 1, -1],
    ['L6', 'F4', 2, -1],
    ['L7', 'F4', 0, 1],
    ['L8', 'F5', 1, -1],
    ['L9', 'F5', 2, 1],
    ['L10', 'F6', 0, -1],
  ];
  for (const [lid, tap, phase, dir] of latDefs) {
    const tp = pos.get(tap)!;
    const nX = 5 + Math.floor(rand() * 3); // 5–7 transformers
    const fuseNode = `${lid}-0`;
    addNode(fuseNode, 'primary', [phase], VLN_PRI, tp.x, tp.z + dir * 15);
    branches.push({ kind: 'switch', id: `FU-${lid}`, from: tap, to: fuseNode, phases: [phase], closed: true });
    const latNodes = [fuseNode];
    let prev = fuseNode;
    for (let k = 1; k <= nX; k++) {
      const nid = `${lid}-${k}`;
      const z = tp.z + dir * (15 + k * 85);
      addNode(nid, 'primary', [phase], VLN_PRI, tp.x, z);
      branches.push(seg(`${prev}-${nid}`, prev, nid, [phase], 85, latLC, 'lateral'));
      latNodes.push(nid);
      prev = nid;
      // pole-top transformer and its secondary
      const kva = rand() < 0.5 ? 25 : 50;
      const tid = `T-${lid}-${k}`;
      const sx = `${tid}-X`;
      addNode(sx, 'secondary', [0, 1], 120, tp.x + 3, z);
      branches.push({ kind: 'centertap', id: tid, from: nid, to: sx, phase, kva, kvPrimaryLN: 7.2, zpu: EVERGREEN.serviceZpu });
      transformers.push({ id: tid, primary: nid, secondary: sx, phase, kva, lateral: lid });
      // secondary spans either side along the street
      const spans: Array<[string, number]> = [
        [sx, 0],
        [`${tid}-XN`, -35],
        [`${tid}-XS`, 35],
      ];
      for (const [sid, dz] of spans.slice(1)) {
        addNode(sid, 'secondary', [0, 1], 120, tp.x + 3, z + dz);
        branches.push(seg(`${sx}-${sid}`, sx, sid, [0, 1], 35, secLC, 'secondary', false));
      }
      // homes: each on a service drop from one of the three secondary points
      const nHomes = kva === 25 ? 4 + Math.floor(rand() * 3) : 7 + Math.floor(rand() * 3);
      for (let h = 0; h < nHomes; h++) {
        const [at, dz] = spans[h % 3]!;
        const side = h % 2 === 0 ? 1 : -1;
        const hid = `H-${lid}-${k}-${h + 1}`;
        const hx = tp.x + 3 + side * 28;
        const hz = z + dz + (Math.floor(h / 3) - 0.5) * 12;
        addNode(hid, 'secondary', [0, 1], 120, hx, hz);
        const drop = 22 + rand() * 12;
        branches.push(seg(`${at}-${hid}`, at, hid, [0, 1], drop, secLC, 'drop', false));
        homes.push({
          id: hid,
          meter: hid,
          transformer: tid,
          x: hx,
          z: hz,
          scale: 0.7 + rand() * 0.7,
          leg1: 0.4 + rand() * 0.2,
          pvKW: rand() < 0.35 ? 4 + Math.round(rand() * 3) : 0,
        });
      }
    }
    laterals.push({ id: lid, tap, phase, nodes: latNodes, fuse: `FU-${lid}` });
  }

  // ---- the home whose wall outlet the chain ends at
  const home = homes.find((h) => h.transformer === 'T-L5-2') ?? homes[0]!;
  const outletNode = `${home.id}-OUTLET`;
  const hp = pos.get(home.id)!;
  addNode(outletNode, 'secondary', [0], 120, hp.x, hp.z);
  const Zw = new CMatrix(3, 3);
  const L = 18; // m of cable from the panel to the outlet
  // hot + neutral in series (round trip), on leg 1
  Zw.set(0, 0, new Complex(WIRING_12AWG.r_ohm_per_km, WIRING_12AWG.x_ohm_per_km).scale((2 * L) / 1000));
  branches.push({ kind: 'line', id: `${home.id}-CIRCUIT`, from: home.id, to: outletNode, phases: [0], Z: Zw, Y: new CMatrix(3, 3), lengthFt: L / FT, config: '12AWG' });

  const net = network('EV-60', nodes, branches, [], caps);
  const layout: FeederLayout = {
    pos,
    homes,
    transformers,
    laterals,
    trunk: trunkIds,
    outlet: { home: home.id, node: outletNode, panel: home.id, lengthM: L, applianceW: 1500 },
    devices: [
      { id: 'EV-BANK', kind: 'transformer', branchOrNode: 'EV-BANK' },
      { id: 'CB-1105', kind: 'breaker', branchOrNode: 'CB-1105' },
      { id: 'RCL-1', kind: 'recloser', branchOrNode: 'RCL-1' },
      { id: 'REG-1', kind: 'regulator', branchOrNode: 'REG-1' },
      { id: 'CAP-1', kind: 'capacitor', branchOrNode: 'F5' },
      ...laterals.map((l) => ({ id: l.fuse, kind: 'fuse' as const, branchOrNode: l.fuse })),
    ],
  };
  return { net, layout };
}

export type { DLoad };
