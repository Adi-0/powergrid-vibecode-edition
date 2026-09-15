/**
 * Cherry Lane 1201 — the feeder view.
 *
 * Three kilometres of street, drawn at the height the wires actually hang.
 *
 * WHAT CHANGES AT THIS LEVEL. Above here a circuit is an abstraction: a line
 * between two places, one branch in a matrix. Here it is a physical object with
 * poles holding it up, and the drawing says so — every node is a pole, every
 * pole has a crossarm, the three-phase main carries three conductors and a
 * single-phase lateral carries one and a neutral. The vertical exaggeration
 * used at system scale is retired: a distribution pole really is about eleven
 * metres tall, and at three metres per pixel the drawing can simply show that.
 *
 * WHAT THE VIEW IS FOR. The voltage falls along a feeder, because current
 * through impedance drops voltage. Everything on this drawing that is not wire
 * exists to manage that fall: a regulator a third of the way down that lifts
 * the voltage back up, a capacitor bank two thirds of the way down that supplies
 * the reactive current locally so it does not have to be carried from the
 * substation, and a recloser that decides whether a fault is worth interrupting
 * supply over. The voltage profile plot beside the drawing is the same
 * information as a graph, and it is the one plot every distribution engineer
 * draws first.
 */

import { Vector3 } from 'three';
import { SolvedCase } from '../core/results.js';
import {
  FEEDER_NODES, FEEDER_SECTIONS, FEEDER_LOADS, FEEDER_REGULATOR,
  FEEDER_CAPACITOR, MODELLED_SERVICE, FeederNode, feederBusId, sectionLengthKm,
} from '../data/california/feeder.js';
import { SITES } from '../data/california/sites.js';
import { project } from '../data/california/geography.js';
import { LineSegment } from './line-batch.js';
import { LabelSpec } from './labels.js';
import { IsoCamera } from './iso.js';
import { INK, SIGNAL, SELECTION, LAYOUT, voltageClass } from './style.js';
import { toWorld } from './world.js';
import {
  SYM_TRANSFORMER, SYM_BREAKER, SYM_CAPACITOR, SYM_LOAD, placeSymbol, SymbolPath,
} from './symbols.js';
import { PickTarget } from './scene-system.js';
import { flowMark } from './flow.js';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * Pole and conductor heights, metres above grade. These are ordinary US
 * distribution construction: a 45-foot class 4 pole set 6 feet in the ground,
 * with the primary crossarm near the top and any secondary below it.
 */
export const POLE = {
  heightM: 11.6,
  /** The three-phase primary, on a crossarm. */
  primaryM: 10.4,
  /** A single-phase lateral, which needs no crossarm and hangs lower. */
  lateralM: 9.6,
  /** Phase spacing on the crossarm, metres. */
  phaseSpacingM: 1.1,
  /** The neutral, below the primary, bonded to earth at every pole. */
  neutralM: 8.2,
  /** Secondary, from a service transformer to the houses. */
  secondaryM: 6.4,
} as const;

/** World position of a feeder node's base. */
export function nodeGround(n: FeederNode): Vector3 {
  return toWorld(project(n.lat, n.lon), 0);
}

const conductorHeight = (n: FeederNode): number =>
  n.id === 'SVC_LV' ? POLE.secondaryM
    : n.phases === 'ABC' ? POLE.primaryM : POLE.lateralM;

export interface FeederGeometry {
  nodes: Map<string, { node: FeederNode; ground: Vector3; top: Vector3 }>;
  sections: {
    from: string; to: string; a: Vector3; b: Vector3;
    branchId: string; kV: number; lengthKm: number; threePhase: boolean;
    underground: boolean;
  }[];
  bounds: { min: { x: number; z: number }; max: { x: number; z: number } };
  /** Where the substation fence is, so the feeder visibly leaves somewhere. */
  substation: Vector3;
}

export function buildFeederGeometry(): FeederGeometry {
  const nodes = new Map<string, { node: FeederNode; ground: Vector3; top: Vector3 }>();
  for (const n of FEEDER_NODES) {
    const ground = nodeGround(n);
    nodes.set(n.id, {
      node: n,
      ground,
      top: new Vector3(ground.x, conductorHeight(n), ground.z),
    });
  }

  const sections: FeederGeometry['sections'] = [];
  for (const s of FEEDER_SECTIONS) {
    const a = nodes.get(s.from);
    const b = nodes.get(s.to);
    if (!a || !b) continue;
    sections.push({
      from: s.from, to: s.to, a: a.top, b: b.top,
      branchId: `FDR_${s.from}_${s.to}`,
      kV: 12.47,
      lengthKm: sectionLengthKm(s),
      threePhase: s.phases === 'ABC',
      underground: s.underground === true,
    });
  }
  // The service transformer's drop, which is the last span in the drawing.
  const from = nodes.get(MODELLED_SERVICE.fromNode);
  const to = nodes.get(MODELLED_SERVICE.toNode);
  if (from && to) {
    sections.push({
      from: MODELLED_SERVICE.fromNode, to: MODELLED_SERVICE.toNode,
      a: from.top, b: to.top,
      branchId: 'SVC_TRANSFORMER', kV: 0.24, lengthKm: 0.03,
      threePhase: false, underground: false,
    });
  }

  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const v of nodes.values()) {
    minX = Math.min(minX, v.ground.x); maxX = Math.max(maxX, v.ground.x);
    minZ = Math.min(minZ, v.ground.z); maxZ = Math.max(maxZ, v.ground.z);
  }
  const pad = 90;
  const site = SITES.edenvale;
  return {
    nodes, sections,
    bounds: {
      min: { x: minX - pad, z: minZ - pad },
      max: { x: maxX + pad, z: maxZ + pad },
    },
    substation: toWorld(project(site.lat, site.lon), 0),
  };
}

// ---------------------------------------------------------------------------
// Symbols this view needs that no other view does
// ---------------------------------------------------------------------------

/** A recloser: a breaker with the reclosing device number beside it. */
const SYM_RECLOSER: SymbolPath = SYM_BREAKER.path;

/** A step voltage regulator: the autotransformer symbol, an arrow through a coil. */
const SYM_REGULATOR: SymbolPath = [
  ...circle(0.62),
  [[-0.95, -0.85], [0.85, 0.78]],
  [[0.85, 0.78], [0.45, 0.72]],
  [[0.85, 0.78], [0.78, 0.36]],
];

/** A fused cutout, which is what protects a lateral where it leaves the main. */
const SYM_CUTOUT: SymbolPath = [
  [[0, 1], [0, 0.45]],
  [[-0.28, 0.45], [0.28, 0.45], [0.28, -0.45], [-0.28, -0.45], [-0.28, 0.45]],
  [[0, -0.45], [0, -1]],
  [[-0.28, 0.2], [0.28, -0.2]],
];

function circle(r: number, segments = 18): [number, number][][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return [pts];
}

/** Which equipment sits at which node. */
const EQUIPMENT: Record<string, { path: SymbolPath; sizePx: number; label: string }> = {
  F03: { path: SYM_RECLOSER, sizePx: 13, label: 'device 79 — reclosing' },
  [FEEDER_REGULATOR.node]: {
    path: SYM_REGULATOR, sizePx: 15,
    label: `±${FEEDER_REGULATOR.rangePercent} % in ${FEEDER_REGULATOR.steps} steps`,
  },
  [FEEDER_CAPACITOR.node]: {
    path: SYM_CAPACITOR.path, sizePx: 14,
    label: `${FEEDER_CAPACITOR.kVAr} kVAr, switched`,
  },
  F11: { path: SYM_CUTOUT, sizePx: 12, label: 'normally open' },
};

const LATERAL_HEADS = new Set(
  FEEDER_SECTIONS.filter((s) => s.phases !== 'ABC').map((s) => s.from)
);

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export interface FeederDrawOptions {
  selectedId?: string | null;
  hoveredId?: string | null;
  showFlow?: boolean;
  /** 0 hides the view entirely, 1 draws it at full strength. */
  opacity?: number;
  /**
   * Draw a stand-in for the substation the feeder leaves. Switched off when
   * the substation view is itself on screen, which happens in the overlap
   * between the two levels — otherwise the station is named twice.
   */
  showSubstation?: boolean;
  /** A bus the reader has put a fault on, marked in the one signal colour. */
  faultBusId?: string | null;
}

export interface FeederDrawResult {
  segments: LineSegment[];
  labels: LabelSpec[];
  picks: PickTarget[];
}

interface Mark { seg: LineSegment; depth: number; haloPx?: number }

const HALO_PAD_PX = 1.4;

export function drawFeeder(
  geometry: FeederGeometry,
  solved: SolvedCase,
  camera: IsoCamera,
  options: FeederDrawOptions = {}
): FeederDrawResult {
  const alpha = options.opacity ?? 1;
  const marks: Mark[] = [];
  const labels: LabelSpec[] = [];
  const picks: PickTarget[] = [];
  const scratch: LineSegment[] = [];
  const basis = camera.groundBasis();
  const dir = camera.direction;
  const depthOf = (p: Vector3): number => -(p.x * dir.x + p.y * dir.y + p.z * dir.z);
  const selected = options.selectedId ?? null;
  const hovered = options.hoveredId ?? null;
  const showFlow = options.showFlow !== false;

  const fade = (s: LineSegment): LineSegment =>
    alpha >= 1 ? s : { ...s, opacity: (s.opacity ?? 1) * alpha };
  const mark = (seg: LineSegment, depth: number, haloPx?: number) =>
    marks.push(haloPx !== undefined ? { seg: fade(seg), depth, haloPx } : { seg: fade(seg), depth });

  const loadByNode = new Map(FEEDER_LOADS.map((l) => [l.node, l]));

  // --- the street, as a construction line ---------------------------------
  // Faintest possible: it orients the reader and says nothing electrical.
  const mainNodes = FEEDER_NODES.filter((n) => n.id.startsWith('F'));
  for (let i = 0; i + 1 < mainNodes.length; i++) {
    const a = geometry.nodes.get(mainNodes[i].id)!.ground;
    const b = geometry.nodes.get(mainNodes[i + 1].id)!.ground;
    mark({
      a: [a.x, 0, a.z], b: [b.x, 0, b.z],
      widthPx: 0.7, color: INK.inkGhost,
    }, Number.MAX_SAFE_INTEGER - 20);
  }

  // --- the substation the feeder comes out of ------------------------------
  if (options.showSubstation !== false) {
    const o = geometry.substation;
    const half = 43;
    const corners: [number, number][] = [
      [-half, -27], [half, -27], [half, 27], [-half, 27], [-half, -27],
    ];
    for (let i = 0; i + 1 < corners.length; i++) {
      mark({
        a: [o.x + corners[i][0], 0, o.z + corners[i][1]],
        b: [o.x + corners[i + 1][0], 0, o.z + corners[i + 1][1]],
        widthPx: 1.0, color: INK.inkFaint,
      }, Number.MAX_SAFE_INTEGER - 18);
    }
    labels.push({
      id: 'feeder:substation', world: new Vector3(o.x, 4, o.z),
      text: 'Eden Vale substation', value: 'the feeder starts here',
      priority: 950, tone: 'muted',
    });
    picks.push({
      id: 'edenvale', kind: 'site', world: new Vector3(o.x, 0, o.z),
      radiusPx: LAYOUT.pickRadiusPx * 1.5,
    });
  }

  // --- poles ---------------------------------------------------------------
  for (const { node, ground, top } of geometry.nodes.values()) {
    if (node.id === 'SVC_LV') continue;
    const depth = depthOf(ground);
    mark({
      a: [ground.x, 0, ground.z], b: [ground.x, POLE.heightM, ground.z],
      widthPx: 1.2, color: INK.inkFaint,
    }, depth, HALO_PAD_PX);
    // A crossarm, drawn only where there is one: three phases need it, one
    // phase does not. The drawing distinguishes them because the field does.
    if (node.phases === 'ABC') {
      const arm = 1.6;
      const perp = perpendicularInGround(camera, arm);
      mark({
        a: [ground.x - perp.x, top.y + 0.5, ground.z - perp.z],
        b: [ground.x + perp.x, top.y + 0.5, ground.z + perp.z],
        widthPx: 1.1, color: INK.inkFaint,
      }, depth - 1, HALO_PAD_PX);
    }
  }

  // --- conductors ----------------------------------------------------------
  for (const s of geometry.sections) {
    const flow = solved.branchById.get(s.branchId);
    const cls = voltageClass(s.kV);
    const isSelected = selected === s.branchId;
    const over = flow ? Math.abs(flow.loading) > 1 : false;
    const out = flow ? !flow.inService : false;
    const color = out ? SIGNAL.alarm : over ? SIGNAL.alarm
      : isSelected ? SELECTION.stroke : INK.ink;
    const width = cls.weightPx * (s.threePhase ? 1.5 : 1) * (isSelected ? 1.8 : 1);
    const a: [number, number, number] = [s.a.x, s.a.y, s.a.z];
    const b: [number, number, number] = [s.b.x, s.b.y, s.b.z];
    const depth = depthOf(s.a.clone().lerp(s.b, 0.5));

    // The dash pattern is the voltage-class encoding the legend states, so it
    // is drawn here too even though every conductor in this view is
    // distribution: a rule that is only obeyed where it happens to be useful
    // is not a rule, and a reader who arrives here from the region view has
    // just been told what a dashed line means.
    const classDash: [number, number] = [s.kV > 1 ? 7 : 2.5, s.kV > 1 ? 3.5 : 2];
    mark({
      a, b, widthPx: width, color,
      dash: out ? [3, 5] : s.underground ? [4, 3] : classDash,
      ...(out ? { opacity: 0.85 } : {}),
    }, depth, HALO_PAD_PX);

    // The neutral, under the primary, present at every pole because this is a
    // four-wire multigrounded system and that is what makes a single-phase
    // lateral possible at all.
    if (s.kV > 1) {
      mark({
        a: [s.a.x, POLE.neutralM, s.a.z], b: [s.b.x, POLE.neutralM, s.b.z],
        widthPx: 0.8, color: INK.inkFaint,
      }, depth + 0.5);
    }

    if (showFlow) {
      const fm = flowMark(a, b, width, flow);
      if (fm) marks.push({ seg: fade(fm), depth: depth - 1e-3 });
    }

    picks.push({
      id: s.branchId, kind: 'circuit',
      world: s.a.clone(), worldB: s.b.clone(),
      radiusPx: LAYOUT.pickRadiusPx,
    });
  }

  // --- equipment and load ---------------------------------------------------
  for (const { node, ground, top } of geometry.nodes.values()) {
    const busId = feederBusId(node.id);
    const bus = solved.busById.get(busId);
    const isSelected = selected === node.id || selected === busId;
    const isHovered = hovered === node.id || hovered === busId;
    const violation = bus?.voltageViolation ?? null;
    const color = isSelected ? SELECTION.stroke : violation ? SIGNAL.alarm : INK.ink;
    const depth = depthOf(top) - 1e4;

      // The fault, if the reader has put one here. A cross through the pole in
    // the one colour this app uses for "something is wrong" — and nothing else
    // on the drawing changes, because the power flow still shows the system as
    // it was in the cycle before.
    if (options.faultBusId === busId) {
      const r = 13;
      for (const [dx, dy] of [[-1, -1], [-1, 1]] as [number, number][]) {
        placeSymbol([[[dx * 1, dy * 1], [-dx * 1, -dy * 1]]], {
          x: top.x, y: top.y, z: top.z, sizePx: r,
          widthPx: 2.4, color: SIGNAL.alarm,
        }, basis, scratch);
      }
      for (const seg of scratch) marks.push({ seg: fade(seg), depth: depth - 6 });
      scratch.length = 0;
      labels.push({
        id: `feeder:fault:${node.id}`,
        world: top,
        text: 'Fault here',
        value: 'the drawing still shows the cycle before it',
        priority: 9000,
        tone: 'alarm',
      });
    }

  const kit = EQUIPMENT[node.id];
    if (kit) {
      marks.push({
        seg: fade({
          a: [top.x, top.y, top.z], b: [top.x, top.y, top.z],
          widthPx: kit.sizePx * 2.0, color: INK.occluder,
        }),
        depth: depth - 1,
      });
      placeSymbol(kit.path, {
        x: top.x, y: top.y, z: top.z,
        sizePx: kit.sizePx * (isSelected || isHovered ? 1.25 : 1),
        widthPx: 1.35 * (isSelected ? 1.4 : 1), color,
      }, basis, scratch);
      for (const seg of scratch) marks.push({ seg: fade(seg), depth: depth - 2 });
      scratch.length = 0;
    } else if (LATERAL_HEADS.has(node.id)) {
      // A fused cutout where the lateral taps off the main.
      placeSymbol(SYM_CUTOUT, {
        x: top.x, y: top.y - 0.9, z: top.z, sizePx: 8,
        widthPx: 1.0, color: INK.inkFaint,
      }, basis, scratch);
      for (const seg of scratch) marks.push({ seg: fade(seg), depth: depth - 2 });
      scratch.length = 0;
    }

    // The service transformer at the end of Cherry Lane.
    if (node.id === MODELLED_SERVICE.fromNode) {
      placeSymbol(SYM_TRANSFORMER.path, {
        x: top.x, y: POLE.secondaryM + 0.8, z: top.z, sizePx: 12,
        widthPx: 1.4, color: selected === 'SVC_TRANSFORMER' ? SELECTION.stroke : INK.ink,
      }, basis, scratch);
      for (const seg of scratch) marks.push({ seg: fade(seg), depth: depth - 3 });
      scratch.length = 0;
    }

    // Load, drawn as the arrow down off the conductor that it is.
    const spot = loadByNode.get(node.id);
    if (spot) {
      const pDrawn = solved.net.loads.find((l) => l.id === `FDRLD_${node.id}`);
      placeSymbol(SYM_LOAD.path, {
        x: ground.x, y: 2.4, z: ground.z, sizePx: 9,
        widthPx: 1.1, color: INK.inkMuted,
      }, basis, scratch);
      for (const seg of scratch) marks.push({ seg: fade(seg), depth: depth - 1 });
      scratch.length = 0;
      mark({
        a: [ground.x, 3.6, ground.z], b: [ground.x, top.y - 0.4, ground.z],
        widthPx: 0.9, color: INK.inkFaint,
      }, depth + 2);
      void pDrawn;
    }

    // --- labels -------------------------------------------------------------
    if (!bus) continue;
    const km = node.distanceKm ?? 0;
    const live = node.id === 'SVC_LV'
      ? `${(bus.vpu * 240).toFixed(1)} V · ${bus.vpu.toFixed(4)} pu`
      : `${bus.vpu.toFixed(4)} pu · ${km.toFixed(2)} km`;
    labels.push({
      id: `feeder:${node.id}`,
      world: top,
      text: node.name,
      value: kit ? `${live} · ${kit.label}` : live,
      priority: labelPriority(node, kit !== undefined, isSelected || isHovered),
      tone: isSelected ? 'selected' : violation ? 'alarm' : 'normal',
    });

    picks.push({
      id: node.id, kind: 'site', world: top.clone(),
      radiusPx: LAYOUT.pickRadiusPx * (kit ? 1.3 : 0.9),
    });
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
  return { segments, labels, picks };
}

/**
 * A vector of length `metres` lying in the ground plane, perpendicular ON
 * SCREEN to the feeder's run.
 *
 * A crossarm placed by taking the perpendicular in world coordinates and using
 * it as if it were a screen direction fans out wrongly under an isometric
 * projection — the same mistake that made parallel transmission circuits splay.
 * The fix is the same: take the perpendicular in screen space and map it back
 * through the camera's ground basis.
 */
function perpendicularInGround(
  camera: IsoCamera, metres: number
): { x: number; z: number } {
  const b = camera.groundBasis();
  // The screen-space direction of world east, normalised, rotated 90°.
  const ex = b.rightX, ez = b.rightZ;
  const len = Math.hypot(ex, ez) || 1;
  return { x: (-ez / len) * metres, z: (ex / len) * metres };
}

function labelPriority(n: FeederNode, hasEquipment: boolean, emphasised: boolean): number {
  const base =
    n.id === 'SVC_LV' ? 900 :
    hasEquipment ? 800 :
    n.id === 'F00' ? 700 :
    n.phases === 'ABC' ? 400 : 300;
  return base + (emphasised ? 5000 : 0);
}
