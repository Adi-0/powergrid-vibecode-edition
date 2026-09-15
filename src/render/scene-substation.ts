/**
 * Inside the fence at Eden Vale — the substation view.
 *
 * THE ONE IDEA THIS VIEW EXISTS FOR
 *
 * A substation has two representations, and the relationship between them is
 * the thing that is hard to learn. There is the YARD: gravel, steel structures,
 * porcelain insulators, a transformer the size of a lorry, laid out by the
 * constraints of clearance and access. And there is the SINGLE-LINE DIAGRAM:
 * the same station with all of that thrown away, keeping only what is connected
 * to what, which is all the electricity cares about.
 *
 * Every element here carries both positions, and the view interpolates between
 * them. Slide the control and the one-line diagram lying flat on the ground
 * stands up into the yard it describes, or the yard collapses back into the
 * drawing. That transition is the lesson: it makes abstraction visible instead
 * of asserted, which is the same thing the level transitions do one scale up.
 *
 * HOW THE TWO FRAMES ARE BUILT, WHICH IS NOT OBVIOUS
 *
 * At t = 1 every element is at its true yard coordinate: metres east and north
 * of the fence corner, at its real height above grade. No exaggeration — a
 * busbar really is seven and a half metres up and the drawing can simply say
 * so.
 *
 * At t = 0 the diagram must read as a DRAWING: horizontal buses, vertical bays,
 * right angles. Laying it flat on the isometric ground plane would shear it
 * into a parallelogram, which is exactly what a single-line diagram is not. So
 * the schematic frame is built from the camera's ground basis — the two ground
 * vectors that project to one screen pixel right and one screen pixel down.
 * Schematic coordinates are therefore SCREEN-ALIGNED while still living in the
 * world, so the diagram is square on the page, scales with zoom like everything
 * else, and can be interpolated to the yard without any change of
 * representation.
 */

import { Vector2, Vector3 } from 'three';
import { SolvedCase, BranchFlow } from '../core/results.js';
import {
  ELEMENTS, CONNECTIONS, SubstationElement, YARD, elementById, bayById,
  protectionFor,
} from '../data/california/substation.js';
import { SITES } from '../data/california/sites.js';
import { project } from '../data/california/geography.js';
import { LineSegment } from './line-batch.js';
import { LabelSpec } from './labels.js';
import { IsoCamera } from './iso.js';
import { INK, SIGNAL, SELECTION, LAYOUT, voltageClass } from './style.js';
import { toWorld } from './world.js';
import {
  SYM_TRANSFORMER, SYM_BREAKER, SYM_DISCONNECT, SYM_CAPACITOR, placeSymbol,
  SymbolPath,
} from './symbols.js';
import { PickTarget } from './scene-system.js';
import { flowMark } from './flow.js';
import { volumeFor, volumeSegments } from './yard-volumes.js';

/** The centre of the yard, in world metres. Both frames are built around it. */
export const SUBSTATION_CENTRE: Vector3 = (() => {
  const s = SITES.edenvale;
  return toWorld(project(s.lat, s.lon), 0);
})();

/**
 * One diagram unit, in metres of on-screen length.
 *
 * Chosen so that the whole diagram — nine units wide and ten deep — is about
 * the same size on the page as the yard it describes, which is what makes the
 * morph read as one object changing rather than two drawings swapping.
 */
/** The voltage classes this drawing puts on the page. See SYSTEM_KV_DRAWN. */
export const SUBSTATION_KV_DRAWN = [115, 12.47];

const SCHEMATIC_UNIT_M = 6.2;

/** Centre of the schematic in its own units, so it sits over the yard centre. */
const SCHEMATIC_CENTRE: [number, number] = [4.4, 5.0];

// ---------------------------------------------------------------------------
// The two frames
// ---------------------------------------------------------------------------

export interface SubstationFrame {
  /** Morph parameter after easing, 0 diagram, 1 yard. */
  t: number;
  /** Position of a point given in both frames. */
  place(schematic: readonly [number, number], yard: readonly [number, number, number]): Vector3;
}

/**
 * Build the frame for one draw.
 *
 * The ease is cubic in and out, so the drawing leaves the page slowly and
 * settles slowly. A linear morph reads as a slide; this reads as something
 * standing up.
 */
export function substationFrame(camera: IsoCamera, morph: number): SubstationFrame {
  const raw = Math.max(0, Math.min(1, morph));
  const t = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
  const basis = camera.groundBasis();
  const unitPx = SCHEMATIC_UNIT_M / camera.metresPerPixel;

  return {
    t,
    place(schematic, yard) {
      // Schematic: screen-aligned, so the diagram is square on the page.
      const sx = (schematic[0] - SCHEMATIC_CENTRE[0]) * unitPx;
      const sy = (schematic[1] - SCHEMATIC_CENTRE[1]) * unitPx;
      const dx = basis.rightX * sx + basis.downX * sy;
      const dz = basis.rightZ * sx + basis.downZ * sy;

      // Yard: true metres east and north of the fence corner, true height.
      const yx = yard[0] - YARD.widthM / 2;
      const yz = -(yard[1] - YARD.depthM / 2);

      return new Vector3(
        SUBSTATION_CENTRE.x + dx + (yx - dx) * t,
        yard[2] * t,
        SUBSTATION_CENTRE.z + dz + (yz - dz) * t
      );
    },
  };
}

/** Where one element sits at the current morph. */
const elementAt = (f: SubstationFrame, e: SubstationElement): Vector3 =>
  f.place(e.schematic, e.yard);

/** The two ends of a bus, which is the one element that is a span. */
function busEnds(f: SubstationFrame, e: SubstationElement): [Vector3, Vector3] {
  const span = e.span;
  if (!span) return [elementAt(f, e), elementAt(f, e)];
  return [
    f.place([span.schematic[0], e.schematic[1]], [span.yardX[0], e.yard[1], e.yard[2]]),
    f.place([span.schematic[1], e.schematic[1]], [span.yardX[1], e.yard[1], e.yard[2]]),
  ];
}

/**
 * Where a connection meets an element.
 *
 * For anything but a bus that is simply the element's own position. For a bus
 * it is the nearest point along the bar, which is what makes the diagram read
 * correctly: every bay drops vertically onto the bus rather than converging on
 * a single point, because that is how a bus works — it is a place, not a node.
 */
function attach(f: SubstationFrame, e: SubstationElement, towards: Vector3): Vector3 {
  if (e.kind !== 'bus' || !e.span) return elementAt(f, e);
  const [a, b] = busEnds(f, e);
  const ab = b.clone().sub(a);
  const len2 = ab.lengthSq();
  if (len2 < 1e-9) return a;
  const s = Math.max(0, Math.min(1, towards.clone().sub(a).dot(ab) / len2));
  return a.clone().addScaledVector(ab, s);
}

/** Hermite ease between two thresholds, for cross-fades that do not snap. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * How a conductor actually gets from one piece of equipment to another.
 *
 * Not in a straight line. A substation is built in bays, and the conductor runs
 * HORIZONTALLY at height along the bay and DROPS vertically to each device it
 * passes — a riser up from the equipment terminal, a span across, a riser down.
 * Everything in a yard is orthogonal, because everything is either hanging from
 * a structure or standing on a foundation.
 *
 * Drawing it as a straight three-dimensional diagonal was the single reason the
 * yard looked like unconnected scatter: the leads cut across the bays at angles
 * no conductor takes, so they read as stray marks rather than as bus work.
 *
 * The route collapses to a straight line on its own as the yard flattens into
 * the single-line diagram, because at zero morph every height is zero and both
 * elbows land on the endpoints. No special case, and no discontinuity in the
 * middle of the morph.
 */
function leadRoute(a: Vector3, b: Vector3): Vector3[] {
  const h = Math.max(a.y, b.y);
  const up = new Vector3(a.x, h, a.z);
  const over = new Vector3(b.x, h, b.z);
  const out: Vector3[] = [a];
  for (const p of [up, over, b]) {
    if (p.distanceTo(out[out.length - 1]) > 1e-6) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Symbols for the equipment that has no system-view equivalent
// ---------------------------------------------------------------------------

function circle(r: number, segments = 20, cx = 0, cy = 0): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Current transformer: a ring around the conductor, which is what it is. */
const SYM_CT: SymbolPath = [
  circle(0.52), [[0, -1], [0, -0.52]], [[0, 0.52], [0, 1]],
];

/** Potential transformer: a winding tapped off to earth. */
const SYM_PT: SymbolPath = [
  [[0, 1], [0, 0.42]],
  circle(0.34, 14, 0, 0.08),
  [[0, -0.26], [0, -0.66]],
  [[-0.42, -0.66], [0.42, -0.66]],
  [[-0.26, -0.82], [0.26, -0.82]],
  [[-0.12, -0.96], [0.12, -0.96]],
];

/** Surge arrester: the standard spark-gap-and-block symbol. */
const SYM_ARRESTER: SymbolPath = [
  [[0, 1], [0, 0.5]],
  [[-0.38, 0.5], [0.38, 0.5], [0.38, -0.5], [-0.38, -0.5], [-0.38, 0.5]],
  [[-0.38, 0.5], [0.38, -0.5]],
  [[0, -0.5], [0, -0.78]],
  [[-0.42, -0.78], [0.42, -0.78]],
  [[-0.26, -0.9], [0.26, -0.9]],
  [[-0.12, -1], [0.12, -1]],
];

/** Where an overhead line lands: the dead-end structure, seen end on. */
const SYM_LINE_TERMINAL: SymbolPath = [
  [[-0.7, -0.8], [0, 0.9], [0.7, -0.8]],
  [[-0.45, -0.1], [0.45, -0.1]],
  [[0, 0.9], [0, -0.8]],
];

/** Ground grid: the earth symbol. */
const SYM_GROUND: SymbolPath = [
  [[0, 1], [0, 0]],
  [[-0.7, 0], [0.7, 0]],
  [[-0.45, -0.3], [0.45, -0.3]],
  [[-0.2, -0.6], [0.2, -0.6]],
];

const SYMBOL_FOR: Record<SubstationElement['kind'], SymbolPath | null> = {
  breaker: SYM_BREAKER.path,
  disconnect: SYM_DISCONNECT.path,
  transformer: SYM_TRANSFORMER.path,
  capacitor: SYM_CAPACITOR.path,
  ct: SYM_CT,
  pt: SYM_PT,
  arrester: SYM_ARRESTER,
  'line-terminal': SYM_LINE_TERMINAL,
  'ground-grid': SYM_GROUND,
  bus: null,       // drawn as a bar, not a symbol
  regulator: SYM_TRANSFORMER.path,
};

/** How big each kind of symbol is drawn, in screen pixels. */
const SIZE_FOR: Partial<Record<SubstationElement['kind'], number>> = {
  transformer: 17, breaker: 11, disconnect: 11, capacitor: 13,
  ct: 8, pt: 10, arrester: 10, 'line-terminal': 12, 'ground-grid': 12,
};

/**
 * Which elements are always named, and which wait to be asked.
 *
 * A station this size has thirty-five pieces of equipment in it. Naming all of
 * them at once produces a page of leader lines and teaches nothing. These are
 * the ones a reader needs to understand what the station DOES; the instrument
 * transformers, the disconnects and the arresters appear on hover, on
 * selection, or when the device numbers are switched on — which is exactly when
 * they start to matter.
 */
const ALWAYS_NAMED = new Set<SubstationElement['kind']>([
  'bus', 'transformer', 'breaker', 'capacitor', 'line-terminal', 'ground-grid',
]);

/**
 * How far above a device its name hangs once the yard has risen, in metres.
 *
 * Roughly the height of the volume, so the caption sits clear of the top of
 * the object rather than across the middle of it.
 */
const LABEL_CLEARANCE_M: Partial<Record<SubstationElement['kind'], number>> = {
  transformer: 7.0,
  breaker: 4.0,
  disconnect: 2.0,
  capacitor: 3.4,
  'line-terminal': 2.0,
  ct: 1.4,
  pt: 1.4,
  arrester: 1.2,
  regulator: 2.2,
};

// ---------------------------------------------------------------------------
// Live quantities
// ---------------------------------------------------------------------------

export interface LiveValue {
  /** What to print under the element's name. */
  text: string;
  /** The branch whose flow this element carries, for the flow marks. */
  flow?: BranchFlow;
  /** True when the solver says this thing is outside a limit. */
  alarm?: boolean;
}

const HV_BUS = 'EDENVALE_115';
const LV_BUS = 'EDENVALE_12';

/**
 * Bind each element to whatever the solver says about it.
 *
 * Nothing in this view is a fixed caption. A transformer's label says how many
 * megavolt-amperes are going through it at this moment, and it changes when the
 * hour changes, because it is read out of the same solved case the state view
 * is drawn from.
 */
export function substationLive(solved: SolvedCase): Map<string, LiveValue> {
  const out = new Map<string, LiveValue>();
  const fmtMVA = (f: BranchFlow): string =>
    `${f.sMaxMVA.toFixed(1)} MVA · ${(Math.abs(f.loading) * 100).toFixed(0)} %`;

  for (const [id, busId] of [['BUS115', HV_BUS], ['BUS12', LV_BUS]] as const) {
    const b = solved.busById.get(busId);
    if (!b) continue;
    out.set(id, {
      text: `${b.vkV.toFixed(1)} kV · ${b.vpu.toFixed(4)} pu`,
      alarm: b.voltageViolation !== null,
    });
  }

  // The two banks, and everything in series with each of them.
  for (const [n, ids] of [
    [1, ['T1', 'T1_CT_HV', 'T1_CT_LV', 'T1_CB_LV', 'T1_DS_HV']],
    [2, ['T2', 'T2_CT_HV', 'T2_CT_LV', 'T2_CB_LV', 'T2_DS_HV']],
  ] as const) {
    const f = solved.branchById.get(`T_${HV_BUS}_${LV_BUS}_${n}`);
    if (!f) continue;
    for (const id of ids) {
      out.set(id, { text: fmtMVA(f), flow: f, alarm: Math.abs(f.loading) > 1 });
    }
  }

  // The incoming circuits, whichever they turn out to be: found from the case
  // rather than named here, so the drawing cannot drift from the network.
  const incoming = solved.branches
    .filter((f) =>
      (f.from === HV_BUS || f.to === HV_BUS) &&
      solved.net.branches.find((b) => b.id === f.branchId)?.kind !== 'transformer')
    .sort((a, b) => a.branchId.localeCompare(b.branchId));
  incoming.forEach((f, i) => {
    const bay = i === 0 ? 'L1' : i === 1 ? 'L2' : null;
    if (!bay) return;
    for (const suffix of ['_CB', '_CT', '_DS_LINE', '_DS_BUS', '_TERM', '_ARR']) {
      out.set(`${bay}${suffix}`, {
        text: fmtMVA(f), flow: f, alarm: Math.abs(f.loading) > 1,
      });
    }
  });

  // Cherry Lane 1201, which is the feeder this app follows to its end.
  const getaway = solved.branchById.get('FDR_GETAWAY');
  if (getaway) {
    const mw = Math.abs(getaway.pFromMW) * 1000;
    for (const id of ['FDR1201_CB', 'FDR1201_CT']) {
      out.set(id, {
        text: `${mw.toFixed(0)} kW · ${getaway.iFromAmps.toFixed(0)} A`,
        flow: getaway, alarm: Math.abs(getaway.loading) > 1,
      });
    }
  }

  // The three feeders this app does not follow. They are in the solve as one
  // aggregate load, and the label says exactly that rather than printing a
  // nameplate voltage class as if it were a measurement.
  // Every load sitting directly on the station's low-voltage bus IS the other
  // three feeders: Cherry Lane's own load hangs off its poles, not off here.
  const others = solved.net.loads.find((l) => l.bus === LV_BUS);
  if (others) {
    for (const n of ['1202', '1203', '1204']) {
      out.set(`FDR${n}_CB`, { text: `1 of 3 · ${others.pMW.toFixed(1)} MW together` });
    }
  }

  // The station capacitor bank: how much of it is actually switched in, which
  // changes through the day and is the thing worth watching about it.
  const banks = (solved.net.shunts ?? []).filter((s) => s.bus === LV_BUS && s.kind === 'capacitor');
  if (banks.length > 0) {
    const inService = banks.filter((s) => s.inService);
    const bus = solved.busById.get(LV_BUS);
    const v2 = bus ? bus.vpu * bus.vpu : 1;
    const mvar = inService.reduce((a, s) => a + s.qMVAr, 0) * v2;
    const total = banks.reduce((a, s) => a + s.qMVAr, 0);
    const text = `${mvar.toFixed(2)} of ${total.toFixed(2)} MVAr in`;
    out.set('CAP', { text });
    out.set('CAP_CB', { text });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export interface SubstationDrawOptions {
  /** 0 = single-line diagram lying flat, 1 = the physical yard. */
  morph: number;
  selectedId?: string | null;
  hoveredId?: string | null;
  /** Show the ANSI device numbers beside the equipment they protect. */
  showProtection?: boolean;
  /** How strongly to draw the whole view, 0 to 1, for the level cross-fade. */
  opacity?: number;
  showFlow?: boolean;
  /**
   * A bus the reader has put a fault on.
   *
   * The feeder has always marked its faults and this view did not, so putting
   * a three-phase fault on the 12.47 kV busbar produced a panel full of fault
   * current beside a drawing with nothing wrong in it. The one place the
   * reader is looking for the fault is the bar it is on.
   */
  faultBusId?: string | null;
}

export interface SubstationDrawResult {
  segments: LineSegment[];
  labels: LabelSpec[];
  picks: PickTarget[];
  /** Where the fault mark was drawn, if one was, so the camera can keep it. */
  faultAt?: Vector3;
}

interface Mark { seg: LineSegment; depth: number; haloPx?: number }

const HALO_PAD_PX = 1.4;

/** See the note above: the class weights are scaled, the ratios are not. */
const WEIGHT_SCALE = 1.75;

export function drawSubstation(
  solved: SolvedCase,
  camera: IsoCamera,
  options: SubstationDrawOptions
): SubstationDrawResult {
  const frame = substationFrame(camera, options.morph);
  const t = frame.t;
  const alpha = options.opacity ?? 1;
  const basis = camera.groundBasis();
  const marks: Mark[] = [];
  const labels: LabelSpec[] = [];
  const picks: PickTarget[] = [];
  const scratch: LineSegment[] = [];
  const dir = camera.direction;
  const depthOf = (p: Vector3): number => -(p.x * dir.x + p.y * dir.y + p.z * dir.z);

  const fade = (seg: LineSegment): LineSegment =>
    alpha >= 1 ? seg : { ...seg, opacity: (seg.opacity ?? 1) * alpha };
  const mark = (seg: LineSegment, depth: number, haloPx?: number) =>
    marks.push(haloPx !== undefined
      ? { seg: fade(seg), depth, haloPx }
      : { seg: fade(seg), depth });

  const selected = options.selectedId ?? null;
  const hovered = options.hoveredId ?? null;
  const live = substationLive(solved);
  const showFlow = options.showFlow !== false;

  const pos = new Map<string, Vector3>();
  for (const e of ELEMENTS) pos.set(e.id, elementAt(frame, e));

  // --- the fence and the ground grid, once the yard has risen -------------
  if (t > 0.05) {
    const corners: [number, number][] = [
      [0, 0], [YARD.widthM, 0], [YARD.widthM, YARD.depthM], [0, YARD.depthM], [0, 0],
    ];
    for (let i = 0; i + 1 < corners.length; i++) {
      const a = frame.place([-3, -3], [corners[i][0], corners[i][1], 0]);
      const b = frame.place([-3, -3], [corners[i + 1][0], corners[i + 1][1], 0]);
      mark({
        a: [a.x, a.y, a.z], b: [b.x, b.y, b.z],
        widthPx: 1.1, color: INK.inkFaint, opacity: t,
      }, Number.MAX_SAFE_INTEGER - 10);
    }
    labels.push({
      id: 'sub:fence',
      world: frame.place([4.4, 11.4], [YARD.widthM / 2, -4, 0]),
      text: 'Eden Vale substation', value: `${YARD.widthM} × ${YARD.depthM} m`,
      priority: 940, tone: 'muted',
    });

    // --- the things in the yard that carry no current ---------------------
    //
    // THE ONE-LINE HAS NO PLACE FOR THESE, WHICH IS THE POINT.
    //
    // A single-line diagram draws what the current flows through, so there is
    // no symbol on it for the building the protection lives in or the road the
    // crew drives in on — and a yard drawn only from the one-line comes out as
    // equipment standing in an empty field, with a quarter of the fenced area
    // conspicuously containing nothing. They appear as the diagram stands up
    // into a yard and fade with it, which is a fair statement of what they are:
    // real, necessary, and not electrical.
    const yardLine = (
      a: [number, number, number], b: [number, number, number],
      widthPx: number, opacity: number
    ): void => {
      const pa = frame.place([-3, -3], a);
      const pb = frame.place([-3, -3], b);
      mark({
        a: [pa.x, pa.y, pa.z], b: [pb.x, pb.y, pb.z],
        widthPx, color: INK.inkFaint, opacity: opacity * t,
      }, depthOf(pa) - 0.5);
    };

    // The control house: relays, batteries, the SCADA link to the control
    // centre. Everything the protection view talks about is inside it.
    const house = { x: 60, y: 38, w: 9, d: 6.5, h: 3.4 };
    const hx0 = house.x - house.w / 2, hx1 = house.x + house.w / 2;
    const hy0 = house.y - house.d / 2, hy1 = house.y + house.d / 2;
    for (const hgt of [0, house.h]) {
      yardLine([hx0, hy0, hgt], [hx1, hy0, hgt], 1.0, 0.95);
      yardLine([hx1, hy0, hgt], [hx1, hy1, hgt], 1.0, 0.95);
      yardLine([hx1, hy1, hgt], [hx0, hy1, hgt], 1.0, 0.95);
      yardLine([hx0, hy1, hgt], [hx0, hy0, hgt], 1.0, 0.95);
    }
    for (const [cx, cy] of [[hx0, hy0], [hx1, hy0], [hx1, hy1], [hx0, hy1]]) {
      yardLine([cx, cy, 0], [cx, cy, house.h], 1.0, 0.95);
    }
    // A door on the side facing the equipment, so the building has a front.
    yardLine([hx0, house.y - 0.5, 0], [hx0, house.y - 0.5, 2.1], 0.8, 0.8);
    yardLine([hx0, house.y + 0.5, 0], [hx0, house.y + 0.5, 2.1], 0.8, 0.8);
    yardLine([hx0, house.y - 0.5, 2.1], [hx0, house.y + 0.5, 2.1], 0.8, 0.8);

    // The cable trench: every current transformer and every breaker in the
    // yard is wired back to this building through it.
    yardLine([hx0, house.y, 0.05], [24, house.y, 0.05], 0.8, 0.5);
    yardLine([24, house.y, 0.05], [24, 6, 0.05], 0.8, 0.5);

    // The access road and the gate in the south fence.
    yardLine([70, 0, 0], [70, 34, 0], 0.8, 0.45);
    yardLine([76, 0, 0], [76, 42, 0], 0.8, 0.45);
    yardLine([70, 34, 0], [hx1, house.y - 2, 0], 0.8, 0.45);

    labels.push({
      id: 'sub:control-house',
      world: frame.place([-3, -3], [house.x, house.y + 4, house.h]),
      text: 'Control house',
      value: 'relays, batteries, the link to the control centre',
      priority: 880, tone: 'muted',
    });
  } else {
    labels.push({
      id: 'sub:fence',
      world: frame.place([8.2, 0.9], [YARD.widthM / 2, YARD.depthM + 5, 0]),
      text: 'Eden Vale substation', value: 'single-line diagram',
      priority: 940, tone: 'muted',
    });
  }

  // --- the fault, if the reader has put one on a bus in this station -------
  let faultAt: Vector3 | undefined;
  if (options.faultBusId === HV_BUS || options.faultBusId === LV_BUS) {
    const id = options.faultBusId === HV_BUS ? 'BUS115' : 'BUS12';
    const e = elementById.get(id);
    if (e) {
      const [ea, eb] = busEnds(frame, e);
      const at = ea.clone().lerp(eb, 0.5);
      faultAt = at.clone();
      // A cross, in the one colour this app uses for "something is wrong".
      // Nothing else in the drawing changes: the power flow behind it is still
      // the cycle before the fault, and the panel says so.
      for (const [dx, dy] of [[-1, -1], [-1, 1]] as [number, number][]) {
        placeSymbol([[[dx, dy], [-dx, -dy]]], {
          x: at.x, y: at.y, z: at.z, sizePx: 15,
          widthPx: 2.6, color: SIGNAL.alarm,
        }, basis, scratch);
      }
      for (const seg of scratch) {
        mark(seg, Number.MIN_SAFE_INTEGER + 10);
      }
      scratch.length = 0;
      labels.push({
        id: 'sub:fault',
        world: at,
        text: 'Fault here',
        value: 'the drawing still shows the cycle before it',
        priority: 9000, tone: 'alarm',
      });
    }
  }

  // --- the connections ----------------------------------------------------
  for (const [aId, bId] of CONNECTIONS) {
    const ea = elementById.get(aId);
    const eb = elementById.get(bId);
    if (!ea || !eb) continue;
    const pa = pos.get(aId)!;
    const pb = pos.get(bId)!;
    const a = attach(frame, ea, pb);
    const b = attach(frame, eb, pa);
    const kV = Math.max(ea.kV, eb.kV);
    const cls = voltageClass(kV || 12.47);
    // A normally-open device is NOT a fault. It is drawn open — a visible gap
    // in the conductor — and never in the signal colour, which means exactly
    // one thing and does not mean this.
    const open = ea.closed === false || eb.closed === false;
    const flow = live.get(aId)?.flow ?? live.get(bId)?.flow;
    const sel = selected === aId || selected === bId;
    const width = cls.weightPx * WEIGHT_SCALE * (sel ? 1.5 : 1);

    // The dash pattern is part of the voltage-class encoding and the legend
    // states it, so it is applied here too: inside one station the weights of
    // 115 kV and 12.47 kV are close enough that weight alone would not
    // separate them. An open device overrides it with its own wider gap,
    // which is a different claim — not what class this is, but that the
    // conductor is broken.
    const classDash = cls.dashPx.length === 2
      ? [cls.dashPx[0], cls.dashPx[1]] as [number, number] : null;
    const color = sel ? SELECTION.stroke : open ? INK.inkFaint : INK.ink;
    const dash = open ? [2.5, 3.5] as [number, number]
      : classDash ? classDash : null;

    // Route it the way a conductor actually runs, and draw the run.
    const route = leadRoute(a, b);
    let longest = { len: -1, a: route[0], b: route[0] };
    for (let i = 0; i + 1 < route.length; i++) {
      const p0 = route[i];
      const p1 = route[i + 1];
      const len = p0.distanceTo(p1);
      if (len < 1e-6) continue;
      if (len > longest.len) longest = { len, a: p0, b: p1 };
      mark({
        a: [p0.x, p0.y, p0.z], b: [p1.x, p1.y, p1.z],
        widthPx: width, color,
        ...(dash ? { dash } : {}),
      }, depthOf(p0.clone().lerp(p1, 0.5)), HALO_PAD_PX);
    }

    // One flow mark, on the longest span of the run: a mark on a half-metre
    // riser is a dot, and a dot does not say which way anything is going.
    if (showFlow && !open && !classDash && longest.len > 0) {
      const p0 = longest.a;
      const p1 = longest.b;
      const fm = flowMark([p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z], width, flow);
      if (fm) marks.push({ seg: fade(fm), depth: depthOf(p0.clone().lerp(p1, 0.5)) - 1e-3 });
    }
  }

  // --- the equipment -------------------------------------------------------
  for (const e of ELEMENTS) {
    const p = pos.get(e.id)!;
    const isSelected = selected === e.id;
    const isHovered = hovered === e.id;
    const value = live.get(e.id);
    const open = e.closed === false;
    const color = isSelected ? SELECTION.stroke
      : value?.alarm ? SIGNAL.alarm
      : open ? INK.inkFaint : INK.ink;
    const emphasis = isSelected || isHovered ? 1.3 : 1;
    const depth = depthOf(p) - 1e4;

    if (e.kind === 'bus') {
      const [a, b] = busEnds(frame, e);
      const cls = voltageClass(e.kV);
      mark({
        a: [a.x, a.y, a.z], b: [b.x, b.y, b.z],
        // Heavy in the diagram, where the bus is the spine everything hangs
        // off; slimmer in the yard, where it is a tube twenty feet up and
        // should not outweigh the equipment standing under it.
        widthPx: cls.weightPx * WEIGHT_SCALE * (2.2 - 0.9 * t) * emphasis, color,
      }, depth, HALO_PAD_PX);
      // Insulator stacks holding it up, once the yard has risen.
      if (t > 0.2) {
        for (const s of [0.06, 0.5, 0.94]) {
          const at = a.clone().lerp(b, s);
          mark({
            a: [at.x, 0, at.z], b: [at.x, at.y, at.z],
            widthPx: 1.1, color: INK.inkFaint, opacity: t,
          }, depth + 1);
        }
      }
      picks.push({
        id: e.id, kind: 'circuit', world: a.clone(), worldB: b.clone(),
        radiusPx: LAYOUT.pickRadiusPx,
      });
    } else {
      // The symbol and the object it stands for, cross-faded by the morph.
      //
      // A flat screen-aligned glyph is exactly right on a single-line diagram
      // and exactly wrong standing in a yard, where it reads as a label pinned
      // over the drawing. So the glyph fades out as the yard rises and a real
      // volume — tank, bushings, insulator stacks — fades in behind it.
      const symbolAlpha = 1 - smoothstep(0.45, 0.92, t);
      const volumeAlpha = smoothstep(0.35, 0.85, t);

      if (volumeAlpha > 0.01) {
        const edges = volumeFor(e.kind, p, e.kV);
        if (edges.length > 0) {
          for (const seg of volumeSegments(
            edges, 1.0 * (isSelected ? 1.6 : 1), color, volumeAlpha
          )) {
            const mid = new Vector3(
              (seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2,
              (seg.a[2] + seg.b[2]) / 2);
            marks.push({ seg: fade(seg), depth: depthOf(mid) - 5 });
          }
        }
      }

      const path = SYMBOL_FOR[e.kind];
      if (path && symbolAlpha > 0.01) {
        const size = (SIZE_FOR[e.kind] ?? 11) * emphasis;
        placeSymbol(path, {
          x: p.x, y: p.y, z: p.z, sizePx: size,
          widthPx: (e.kind === 'transformer' ? 1.5 : 1.25) * (isSelected ? 1.5 : 1),
          color,
        }, basis, scratch);
        // A ground-coloured disc first, so the connections behind do not
        // scribble through the symbol.
        marks.push({
          seg: fade({
            a: [p.x, p.y, p.z], b: [p.x, p.y, p.z],
            widthPx: size * 1.9, color: INK.occluder, opacity: symbolAlpha,
          }),
          depth: depth - 1,
        });
        for (const seg of scratch) {
          marks.push({
            seg: fade({ ...seg, opacity: (seg.opacity ?? 1) * symbolAlpha }),
            depth: depth - 2,
          });
        }
        scratch.length = 0;
      }
      // Something to stand on, while the volume is still fading in.
      if (t > 0.2 && p.y > 0.3 && volumeAlpha < 0.99) {
        mark({
          a: [p.x, 0, p.z], b: [p.x, p.y, p.z],
          widthPx: 0.9, color: INK.inkFaint, opacity: t * 0.9 * (1 - volumeAlpha),
        }, depth + 1);
      }
      picks.push({
        id: e.id, kind: 'site', world: p.clone(),
        radiusPx: LAYOUT.pickRadiusPx * (e.kind === 'transformer' ? 1.6 : 0.9),
      });
    }

    // --- labels -----------------------------------------------------------
    const emphasised = isSelected || isHovered;
    const devices = options.showProtection ? protectionFor(e.id) : [];
    // In the YARD there is a volume under every one of these labels, and
    // naming all of them buries the drawing under its own captions. Once the
    // yard has risen, only the things somebody would point at from the gate
    // keep a standing label; the rest answer on hover.
    const majorInYard = e.kind === 'bus' || e.kind === 'transformer'
      || e.kind === 'line-terminal';
    const named = emphasised || devices.length > 0
      || (t > 0.6 ? majorInYard : ALWAYS_NAMED.has(e.kind));
    if (!named) continue;

    const second = devices.length > 0
      ? devices.map((d) => d.device).join(' · ')
      : value?.text
        ?? (open ? 'normally open' : e.ratio ?? e.rating?.split(',')[0]);
    // A bus is named at the END of the bar, never at its middle: a label
    // placed over a busbar has the heaviest line in the drawing struck
    // through it, and no amount of offset fixes that on a horizontal bar.
    // Clear of the object rather than on top of it: a caption struck through
    // by the thing it names is worse than no caption.
    const clearance = t > 0.3 && e.kind !== 'bus'
      ? LABEL_CLEARANCE_M[e.kind] ?? 2.0 : 0;
    labels.push({
      id: `sub:${e.id}`,
      world: e.kind === 'bus' ? beyondEnd(busEnds(frame, e), camera)
        : clearance > 0 ? new Vector3(p.x, p.y + clearance * t, p.z) : p,
      text: e.name,
      ...(second ? { value: second } : {}),
      priority: labelPriority(e, emphasised),
      tone: isSelected ? 'selected' : value?.alarm ? 'alarm' : 'normal',
    });
    void bayById;
  }

  // --- the ground grid, drawn as a buried mesh ---------------------------
  if (t > 0.35) {
    const step = 12;
    const depth = Number.MAX_SAFE_INTEGER - 5;
    const fadeIn = (t - 0.35) / 0.65;
    for (let x = step; x < YARD.widthM; x += step) {
      const a = frame.place([-3, -3], [x, 0, -0.5]);
      const b = frame.place([-3, -3], [x, YARD.depthM, -0.5]);
      mark({
        a: [a.x, a.y, a.z], b: [b.x, b.y, b.z],
        widthPx: 0.6, color: INK.inkGhost, opacity: fadeIn,
      }, depth);
    }
    for (let y = step; y < YARD.depthM; y += step) {
      const a = frame.place([-3, -3], [0, y, -0.5]);
      const b = frame.place([-3, -3], [YARD.widthM, y, -0.5]);
      mark({
        a: [a.x, a.y, a.z], b: [b.x, b.y, b.z],
        widthPx: 0.6, color: INK.inkGhost, opacity: fadeIn,
      }, depth);
    }
  }

  marks.sort((a, b) => b.depth - a.depth);
  const segments: LineSegment[] = [];
  for (const m of marks) {
    if (m.haloPx !== undefined && m.haloPx > 0) {
      segments.push({
        a: m.seg.a, b: m.seg.b,
        widthPx: m.seg.widthPx + m.haloPx,
        color: INK.occluder,
        ...(m.seg.dash ? { dash: m.seg.dash } : {}),
        ...(alpha < 1 ? { opacity: alpha } : {}),
      });
    }
    segments.push(m.seg);
  }
  return { segments, labels, picks, ...(faultAt ? { faultAt } : {}) };
}

/**
 * A point a fixed number of SCREEN pixels past the end of a bar.
 *
 * A fraction of the bar's own length is not enough: half way through the morph
 * the bar is short and the label lands back on it. The offset has to be in the
 * units the collision layout works in, which are pixels, so the amount of world
 * to move is measured by projecting the bar and scaling.
 */
function beyondEnd(
  [a, b]: [Vector3, Vector3], camera: IsoCamera, px = 76
): Vector3 {
  const pa = camera.worldToScreen(a, new Vector2());
  const pb = camera.worldToScreen(b, new Vector2());
  const screenLen = pa.distanceTo(pb);
  if (screenLen < 1e-3) return a.clone();
  return a.clone().addScaledVector(a.clone().sub(b), px / screenLen);
}

/**
 * Which labels get placed first.
 *
 * The transformer is the reason the station exists, so it outranks everything.
 * Then the things that switch, then the things that measure — which is roughly
 * the order in which a person learning the station needs them.
 */
function labelPriority(e: SubstationElement, emphasised: boolean): number {
  const base =
    e.kind === 'transformer' ? 800 :
    e.kind === 'bus' ? 780 :
    e.id === 'FDR1201_CB' ? 720 :
    e.kind === 'breaker' ? 600 :
    e.kind === 'capacitor' ? 550 :
    e.kind === 'line-terminal' ? 460 :
    e.kind === 'disconnect' ? 400 :
    e.kind === 'arrester' ? 300 :
    e.kind === 'ground-grid' ? 280 : 200;
  return base + (emphasised ? 5000 : 0);
}

/** Bounds of the substation at a given morph, for framing and culling. */
/**
 * How far the yard stands up, metres.
 *
 * Taken from the elements themselves — the tallest thing in an eleven-kilovolt
 * distribution yard is the take-off structure the incoming line lands on — plus
 * the insulator strings and the conductor that hangs above it. The camera needs
 * this to frame the yard as the solid it is rather than as its own footprint.
 */
export const YARD_HEIGHT_M =
  Math.max(...ELEMENTS.map((e) => e.yard[2])) + 3;

export function substationBounds(_morph: number): {
  min: { x: number; z: number; y?: number };
  max: { x: number; z: number; y?: number };
} {
  // THE FENCE, PLUS A COUPLE OF PACES OUTSIDE IT.
  //
  // This box is what the camera frames and what the compositor culls against,
  // so it has to be the size of the subject. It used to be a square as wide as
  // the yard is long, with a further tenth on top, which is more than twice the
  // area of the station — and framing that box is what left the yard sitting
  // small in the corner of an empty page.
  //
  // The schematic frame is scaled to land inside the same box, because the
  // morph between the two is meant to read as one station changing rather than
  // as two drawings of different sizes swapping over.
  const pad = 7;
  return {
    min: {
      x: SUBSTATION_CENTRE.x - YARD.widthM / 2 - pad,
      z: SUBSTATION_CENTRE.z - YARD.depthM / 2 - pad,
      y: 0,
    },
    max: {
      x: SUBSTATION_CENTRE.x + YARD.widthM / 2 + pad,
      z: SUBSTATION_CENTRE.z + YARD.depthM / 2 + pad,
      y: YARD_HEIGHT_M,
    },
  };
}

/** Kept for callers that want the old name. */
export const SUBSTATION_ORIGIN = SUBSTATION_CENTRE;
