/**
 * 14 Cherry Lane — the service view. The end of the zoom tree.
 *
 * Twenty metres of wire, drawn at about two centimetres per pixel, which is
 * roughly the scale of an electrician's drawing. Nothing here is exaggerated:
 * the transformer pad is a metre across because a transformer pad is a metre
 * across, and the socket is at the height a socket is at.
 *
 * THE DRAWING IS A CONTINUATION, NOT A NEW SUBJECT. The pad-mounted transformer
 * at the left of it is the same object that appears at the end of Cherry Lane
 * in the feeder view, at the same world coordinates. Zooming in far enough from
 * the feeder arrives here; there is no cut and no separate model.
 *
 * WHAT IS SOLVED AND WHAT IS CALCULATED. The voltage at the transformer's
 * secondary terminals comes from the same power flow that solved the whole
 * state. Everything past those terminals is single-phase, so it is worked out
 * in the open with the standard voltage-drop formula rather than pretended into
 * the balanced solver. Both facts are on the drawing.
 */

import { Vector2, Vector3 } from 'three';
import { SolvedCase } from '../core/results.js';
import {
  SERVICE_NODES, SERVICE_RUNS, SERVICE_SITE, ServiceNode, ServiceSolution,
  LV_CONDUCTORS, C84_1,
} from '../data/california/service.js';
import { project } from '../data/california/geography.js';
import { LineSegment } from './line-batch.js';
import { LabelSpec } from './labels.js';
import { IsoCamera } from './iso.js';
import {
  INK, SIGNAL, SELECTION, LAYOUT, voltageClass, TextDetail,
} from './style.js';
import { toWorld } from './world.js';
import { SYM_TRANSFORMER, SYM_BREAKER, placeSymbol, SymbolPath } from './symbols.js';
import {
  HOUSE, DEVICE_SIZE_M, houseShellEdges, houseRoofEdges, houseFloorSolids,
  houseWallSolids, houseOpeningEdges, vergeEdges, neighbourEdges,
  neighbourSolids, otherLateralEdges, serviceVolumeFor, serviceSolidsFor,
} from './service-volumes.js';
import { volumeSegments, washSegments } from './yard-volumes.js';
import { PickTarget } from './scene-system.js';

/** The transformer pad, in world coordinates. Everything else is relative. */
export const SERVICE_ORIGIN: Vector3 = toWorld(
  project(SERVICE_SITE.lat, SERVICE_SITE.lon), 0
);

/** World position of a service node. */
/** The voltage classes this drawing puts on the page. See SYSTEM_KV_DRAWN. */
export const SERVICE_KV_DRAWN = [0.24];

export function serviceNodePosition(n: ServiceNode): Vector3 {
  return new Vector3(
    SERVICE_ORIGIN.x + n.at[0],
    n.at[2],
    SERVICE_ORIGIN.z - n.at[1]
  );
}

// ---------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------

function ring(r: number, segments = 22): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

/** A revenue meter: the glass dome with the disc behind it. */
const SYM_METER: SymbolPath = [
  ring(0.95),
  ring(0.62),
  [[-0.34, 0.12], [0.34, 0.12]],
  [[-0.34, -0.12], [0.34, -0.12]],
  [[-0.2, 0.36], [0.2, 0.36]],
];

/** A distribution panel: the enclosure, the two bus bars, the breaker rows. */
const SYM_PANEL: SymbolPath = [
  [[-0.8, 1], [0.8, 1], [0.8, -1], [-0.8, -1], [-0.8, 1]],
  [[-0.18, 0.78], [-0.18, -0.78]],
  [[0.18, 0.78], [0.18, -0.78]],
  [[-0.72, 0.5], [-0.24, 0.5]], [[0.24, 0.5], [0.72, 0.5]],
  [[-0.72, 0.16], [-0.24, 0.16]], [[0.24, 0.16], [0.72, 0.16]],
  [[-0.72, -0.18], [-0.24, -0.18]], [[0.24, -0.18], [0.72, -0.18]],
  [[-0.72, -0.52], [-0.24, -0.52]], [[0.24, -0.52], [0.72, -0.52]],
];

/**
 * A NEMA 5-15R receptacle, drawn as its own face.
 *
 * The two slots are different widths and that is not decoration: the wide one
 * is the NEUTRAL and the narrow one is the HOT, so a plug with a polarised
 * blade can only go in one way round, and the switch in a lamp is guaranteed to
 * interrupt the live conductor rather than the return.
 */
const SYM_OUTLET: SymbolPath = [
  [[-0.9, 1], [0.9, 1], [0.9, -1], [-0.9, -1], [-0.9, 1]],
  // narrow slot: hot
  [[-0.42, 0.62], [-0.42, 0.06]],
  // wide slot: neutral
  [[0.34, 0.62], [0.34, 0.06]], [[0.5, 0.62], [0.5, 0.06]],
  [[0.34, 0.62], [0.5, 0.62]], [[0.34, 0.06], [0.5, 0.06]],
  // round pin: equipment ground
  ring(0.17).map(([x, y]) => [x * 1 + 0.04, y * 1 - 0.42] as [number, number]),
];

/** A grounding electrode: the earth symbol, pointing down into the ground. */
const SYM_ELECTRODE: SymbolPath = [
  [[0, 1], [0, 0]],
  [[-0.7, 0], [0.7, 0]],
  [[-0.44, -0.3], [0.44, -0.3]],
  [[-0.18, -0.6], [0.18, -0.6]],
];

const SYMBOL_FOR: Record<ServiceNode['kind'], SymbolPath> = {
  transformer: SYM_TRANSFORMER.path,
  meter: SYM_METER,
  panel: SYM_PANEL,
  breaker: SYM_BREAKER.path,
  outlet: SYM_OUTLET,
  'ground-rod': SYM_ELECTRODE,
  appliance: SYM_OUTLET,
};

/**
 * How big a called-out symbol is drawn, in pixels.
 *
 * Smaller than they were, because they are now ANNOTATION on a structure
 * rather than the thing itself: a symbol bigger than the object it names is
 * the flat-icon drawing this level was rebuilt to get away from.
 */
const SIZE_FOR: Record<ServiceNode['kind'], number> = {
  transformer: 18, meter: 13, panel: 18, breaker: 11,
  outlet: 15, 'ground-rod': 12, appliance: 13,
};

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export interface ServiceDrawOptions {
  selectedId?: string | null;
  hoveredId?: string | null;
  opacity?: number;
  /** How much type to carry. See TextDetail. */
  detail?: TextDetail;
}

export interface ServiceDrawResult {
  segments: LineSegment[];
  labels: LabelSpec[];
  picks: PickTarget[];
}

interface Mark { seg: LineSegment; depth: number; haloPx?: number }

const HALO_PAD_PX = 1.5;

/**
 * A SYMBOL IS WHAT YOU DRAW WHEN THE THING ITSELF IS TOO SMALL TO READ.
 *
 * Every device here is now built at its real size, and over a structure a
 * symbol is a label on something the reader can already see. But the sizes in
 * one service span three orders of magnitude: the pad-mounted transformer is
 * a metre and a half across and the breaker handle inside the panel is forty
 * millimetres, and at the scale that fits the whole run on the page that is
 * twenty-eight pixels and one.
 *
 * So the standard symbol appears for exactly as long as it is needed. Below
 * this many pixels a device is called out with its symbol on a leader, the
 * way a detail is called out on any drawing; above it the symbol goes and the
 * object speaks for itself. Zooming in therefore does what the reader expects
 * of zooming in: notation gives way to the thing.
 */
const CALLOUT_BELOW_PX = 34;

/** A trench is not a device and has no symbol; its `kind` is a placeholder. */
const NEVER_CALLED_OUT = new Set(['LATERAL_MID']);

/** How far a called-out symbol stands off the thing it names, in pixels. */
const CALLOUT_PX = 30;

/**
 * How far behind its own edges a solid's paper-coloured fill sits, metres.
 *
 * The plant uses a third of a metre. This drawing is a hundred times closer
 * in, so the offset has to shrink with it or the fill of one object lands in
 * front of the edges of the next.
 */
const WASH_BEHIND_M = 0.02;

export function drawService(
  solved: SolvedCase,
  service: ServiceSolution,
  camera: IsoCamera,
  options: ServiceDrawOptions = {}
): ServiceDrawResult {
  const alpha = options.opacity ?? 1;
  const detail: TextDetail = options.detail ?? 'normal';
  const marks: Mark[] = [];
  const labels: LabelSpec[] = [];
  const picks: PickTarget[] = [];
  const scratch: LineSegment[] = [];
  const basis = camera.groundBasis();
  const dir = camera.direction;
  const depthOf = (p: Vector3): number => -(p.x * dir.x + p.y * dir.y + p.z * dir.z);
  const selected = options.selectedId ?? null;
  const hovered = options.hoveredId ?? null;

  const fade = (s: LineSegment): LineSegment =>
    alpha >= 1 ? s : { ...s, opacity: (s.opacity ?? 1) * alpha };
  const mark = (seg: LineSegment, depth: number, haloPx?: number) =>
    marks.push(haloPx !== undefined ? { seg: fade(seg), depth, haloPx } : { seg: fade(seg), depth });
  const midOf = (seg: LineSegment): Vector3 => new Vector3(
    (seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2, (seg.a[2] + seg.b[2]) / 2);
  const a2 = new Vector2();
  const b2 = new Vector2();

  const pos = new Map<string, Vector3>();
  for (const n of SERVICE_NODES) pos.set(n.id, serviceNodePosition(n));

  // --- the house, as a cutaway ----------------------------------------------
  //
  // It used to be a ghost footprint with four corner posts and a ridge, which
  // against the neighbourhood drawn behind it was indistinguishable from any
  // other house on the street — so the end of the chain, the thing the whole
  // zoom is travelling towards, happened in a void, and the equipment floated
  // in the middle of it joined by lines.
  //
  // It is a building now: a slab, four walls at their real thickness, and the
  // roof frame lifted off so that the inside is in view. The reasoning for
  // removing exactly one plane, and for where each device therefore has to
  // sit, is in service-volumes.ts.
  const o = SERVICE_ORIGIN;

  for (const seg of washSegments(houseFloorSolids(o), camera, 1, INK.groundShade)) {
    marks.push({ seg: fade(seg), depth: depthOf(midOf(seg)) + WASH_BEHIND_M });
  }
  for (const seg of washSegments(houseWallSolids(o), camera)) {
    marks.push({ seg: fade(seg), depth: depthOf(midOf(seg)) + WASH_BEHIND_M });
  }
  for (const seg of volumeSegments(houseShellEdges(o), 1.0, INK.inkMuted, 1)) {
    marks.push({
      seg: fade(seg), depth: depthOf(midOf(seg)), haloPx: HALO_PAD_PX,
    });
  }
  // THE ROOF IS DRAWN AS A PHANTOM, in the long dash that every drawing
  // office uses for a part shown in a position it is not in — a removed
  // component, an alternate position, a section taken away. Solid, it read as
  // a wireframe pyramid hovering over the house and the reader had to be told
  // it was a cutaway; dashed, it says so itself.
  //
  // It carries NO halo either: a halo is an instruction to erase what is
  // behind, and everything behind the roof is the subject.
  const phantom = (seg: LineSegment): LineSegment =>
    ({ ...seg, dash: [7, 4] as [number, number] });
  for (const seg of volumeSegments(houseRoofEdges(o), 0.9, INK.inkFaint, 1)) {
    marks.push({ seg: fade(phantom(seg)), depth: depthOf(midOf(seg)) });
  }
  // One neighbour, and the laterals to the rest of the street.
  for (const seg of washSegments(neighbourSolids(o), camera)) {
    marks.push({ seg: fade(seg), depth: depthOf(midOf(seg)) + WASH_BEHIND_M });
  }
  for (const seg of volumeSegments(neighbourEdges(o), 0.85, INK.inkFaint, 1)) {
    marks.push({
      seg: fade(seg), depth: depthOf(midOf(seg)), haloPx: HALO_PAD_PX,
    });
  }
  for (const seg of volumeSegments(otherLateralEdges(o), 1.0, INK.inkGhost, 1)) {
    marks.push({ seg: fade(phantom(seg)), depth: depthOf(midOf(seg)) });
  }
  // The door and the windows sit ON the wall, so they sort with it.
  for (const seg of volumeSegments(houseOpeningEdges(o), 0.8, INK.inkFaint, 1)) {
    marks.push({ seg: fade(seg), depth: depthOf(midOf(seg)) });
  }
  for (const seg of volumeSegments(vergeEdges(o), 0.8, INK.inkGhost, 1)) {
    marks.push({ seg: fade(seg), depth: Number.MAX_SAFE_INTEGER - 21 });
  }

  // --- the runs ------------------------------------------------------------
  const stepByRun = new Map(
    [...service.serviceSteps, ...service.branchSteps].map((s) => [s.runId, s])
  );
  for (const run of SERVICE_RUNS) {
    const a = pos.get(run.from);
    const b = pos.get(run.to);
    if (!a || !b) continue;
    const step = stepByRun.get(`${run.from}_${run.to}`);
    const cls = voltageClass(run.volts || 0.24);
    const id = `${run.from}_${run.to}`;
    const isSelected = selected === id;
    const conductor = LV_CONDUCTORS[run.conductor];
    const overloaded = step !== undefined && conductor !== undefined
      && step.currentA > conductor.ampacityA;
    const color = overloaded ? SIGNAL.alarm : isSelected ? SELECTION.stroke
      : run.volts === 0 ? INK.inkFaint : INK.ink;
    const width = (run.volts >= 240 ? cls.weightPx * 1.9 : cls.weightPx * 1.5)
      * (isSelected ? 1.8 : 1);
    const buried = a.y < 0 || b.y < 0;

    // A RUN IS DRAWN IN PIECES, so that the building can get in front of it.
    //
    // Painter's order sorts a stroke by one depth, and a wire that leaves a
    // meter outside a wall and lands on a panel inside it is on both sides of
    // that wall at once. Drawn whole it was either wholly in front of the
    // house or wholly behind it, and both are wrong. Split into pieces about
    // a wire's length of screen apart, each piece sorts on its own and the
    // service-entrance conductors disappear into the wall and come out inside
    // it, which is what they do.
    //
    // The pieces overlap by more than a halo is wide, or every joint would be
    // nibbled by its neighbour's halo into a dotted line. The dash phase runs
    // on from piece to piece, so a buried run is one dashed line rather than
    // several restarting ones.
    camera.worldToScreen(a, a2);
    camera.worldToScreen(b, b2);
    const lenPx = Math.max(1e-3, a2.distanceTo(b2));
    const pieces = Math.min(64, Math.max(1, Math.round(lenPx / 26)));
    const overlap = pieces > 1 ? 1.5 / lenPx : 0;
    for (let k = 0; k < pieces; k++) {
      const t0 = Math.max(0, k / pieces - overlap);
      const t1 = Math.min(1, (k + 1) / pieces + overlap);
      const pa = a.clone().lerp(b, t0);
      const pb = a.clone().lerp(b, t1);
      mark({
        a: [pa.x, pa.y, pa.z], b: [pb.x, pb.y, pb.z],
        widthPx: Math.max(0.9, width), color,
        ...(buried
          ? { dash: [3.5, 3] as [number, number], dashPhase: t0 * lenPx }
          : {}),
      }, depthOf(pa.clone().lerp(pb, 0.5)), HALO_PAD_PX);
    }

    if (step) {
      const idle = step.currentA < 0.005;
      if (detail === 'minimal' && !isSelected) {
        // The wires keep their names on hover only; at this setting the chain
        // is the equipment, and what runs between it answers when asked.
      } else labels.push({
        id: `svc:run:${id}`,
        world: a.clone().lerp(b, 0.5),
        text: `${run.name} — ${conductor?.size ?? ''}`,
        value: idle
          ? 'nothing switched on'
          : `${step.currentA.toFixed(1)} A · −${step.dropV.toFixed(2)} V`,
        priority: isSelected ? 5400 : 320,
        tone: isSelected ? 'selected' : 'muted',
        // The wires below the chain, the things they join above it.
        side: 'below',
      });
    }

    picks.push({
      id, kind: 'circuit', world: a.clone(), worldB: b.clone(),
      radiusPx: LAYOUT.pickRadiusPx,
      hover: {
        text: `${run.name} — ${conductor?.size ?? ''}`,
        ...(step
          ? {
              value: step.currentA < 0.005 ? 'nothing switched on'
                : `${step.currentA.toFixed(1)} A · −${step.dropV.toFixed(2)} V`,
            }
          : {}),
        alarm: overloaded,
      },
    });
  }

  // --- the equipment --------------------------------------------------------
  // The transformer's own loading comes from the solver, not from the
  // arithmetic below it: it is a branch in the case like any other. One car
  // charger in one of twelve houses can push a 50 kVA pad-mount past its
  // nameplate, and when it does, this is where that shows.
  const padFlow = solved.branchById.get('SVC_TRANSFORMER');
  const padOverloaded = padFlow !== undefined && Math.abs(padFlow.loading) > 1;

  const voltsAt: Record<string, number> = {
    PAD: service.secondaryV,
    LATERAL_MID: service.serviceSteps[0]?.toV ?? service.secondaryV,
    METER: service.serviceSteps[1]?.toV ?? service.secondaryV,
    PANEL: service.panelV,
    BRK_KITCHEN: service.branchSteps[0]?.toV ?? service.panelLegV,
    OUTLET: service.outletV,
  };

  for (const n of SERVICE_NODES) {
    const p = pos.get(n.id)!;
    const isSelected = selected === n.id;
    const isHovered = hovered === n.id;
    const v = voltsAt[n.id];
    const outOfRange = n.id === 'PAD'
      ? padOverloaded
      : n.id === 'OUTLET'
        ? !service.withinRangeA
        : n.kind === 'meter' && v !== undefined
          ? v / 2 < C84_1.serviceRangeA[0] || v / 2 > C84_1.serviceRangeA[1]
          : false;
    const color = isSelected ? SELECTION.stroke : outOfRange ? SIGNAL.alarm : INK.ink;
    const size = SIZE_FOR[n.kind] * (isSelected || isHovered ? 1.25 : 1);
    const depth = depthOf(p) - 1e4;

    // The thing itself, at its own size, on the wall it is actually on.
    for (const seg of washSegments(serviceSolidsFor(n, p, o), camera)) {
      marks.push({ seg: fade(seg), depth: depthOf(midOf(seg)) + WASH_BEHIND_M });
    }
    const volume = serviceVolumeFor(n, p, o);
    for (const seg of volumeSegments(
      volume, isSelected ? 1.7 : 1.15, color, 1
    )) {
      // ANYTHING BELOW GRADE IS DASHED, the same convention the buried runs
      // use, so the rod and the trench read as being in the earth rather than
      // as standing in a hole.
      const m = midOf(seg);
      marks.push({
        seg: fade(m.y < -0.02 ? { ...seg, dash: [3, 2.5] as [number, number] } : seg),
        depth: depthOf(m),
        haloPx: HALO_PAD_PX,
      });
    }

    const builtPx = (DEVICE_SIZE_M[n.id] ?? 0) / camera.metresPerPixel;
    const calledOut = !NEVER_CALLED_OUT.has(n.id) && builtPx < CALLOUT_BELOW_PX;
    const anchor = calledOut
      ? new Vector3(p.x, p.y + CALLOUT_PX * camera.metresPerPixel, p.z)
      : p;

    if (calledOut) {
      const sym = anchor;
      mark({
        a: [p.x, p.y, p.z], b: [sym.x, sym.y, sym.z],
        widthPx: 0.6, color: INK.inkFaint,
      }, depth + 2);
      marks.push({
        seg: fade({
          a: [sym.x, sym.y, sym.z], b: [sym.x, sym.y, sym.z],
          widthPx: size * 1.85, color: INK.occluder,
        }),
        depth: depth - 1,
      });
      placeSymbol(SYMBOL_FOR[n.kind], {
        x: sym.x, y: sym.y, z: sym.z, sizePx: size,
        widthPx: 1.3 * (isSelected ? 1.4 : 1), color,
      }, basis, scratch);
      for (const seg of scratch) marks.push({ seg: fade(seg), depth: depth - 2 });
      scratch.length = 0;
    }

    const reading = n.id === 'PAD' && padFlow
      ? `${v!.toFixed(2)} V · ${(padFlow.sMaxMVA * 1000).toFixed(1)} of ` +
        `${(padFlow.sMaxMVA * 1000 / Math.max(1e-9, Math.abs(padFlow.loading))).toFixed(0)} kVA`
      : v !== undefined ? `${v.toFixed(2)} V`
      : n.rating;

    picks.push({
      id: n.id, kind: 'site', world: anchor.clone(),
      radiusPx: LAYOUT.pickRadiusPx * (n.kind === 'panel' ? 1.6 : 1.1),
      hover: {
        text: n.name,
        ...(reading ? { value: reading } : {}),
        alarm: outOfRange,
      },
    });

    labels.push({
      id: `svc:${n.id}`,
      world: anchor,
      text: n.name,
      ...(reading && !(detail === 'minimal' && !isSelected && !isHovered)
        ? { value: reading } : {}),
      side: 'above',
      priority: servicePriority(n) + (isSelected || isHovered ? 5000 : 0),
      tone: isSelected ? 'selected' : outOfRange ? 'alarm' : 'normal',
    });
  }

  void solved;

  marks.sort((a, b) => b.depth - a.depth);
  const segments: LineSegment[] = [];
  for (const m of marks) {
    if (m.haloPx !== undefined && m.haloPx > 0) {
      segments.push({
        a: m.seg.a, b: m.seg.b,
        widthPx: m.seg.widthPx + m.haloPx,
        color: INK.occluder,
        ...(m.seg.dash ? { dash: m.seg.dash } : {}),
        // A HALO CARRIES THE OPACITY OF THE STROKE IT BACKS, not the scene's.
        //
        // A halo is an instruction to erase, and an erasure at full strength
        // behind a stroke that is barely there is the same mistake as a pale
        // wide band: half way through the substation's morph the yard's tanks
        // were rubbing out the conductors behind them before they had appeared
        // themselves.
        ...(m.seg.opacity !== undefined && m.seg.opacity < 1
          ? { opacity: m.seg.opacity } : {}),
      });
    }
    segments.push(m.seg);
  }
  return { segments, labels, picks };
}

function servicePriority(n: ServiceNode): number {
  return n.kind === 'outlet' ? 950
    : n.kind === 'panel' ? 900
    : n.kind === 'transformer' ? 850
    : n.kind === 'meter' ? 800
    : n.kind === 'breaker' ? 600
    : 400;
}

/** Bounds of the service drawing, for framing. */
/** Ridge of the house, metres — the tallest thing in the service drawing. */
export const SERVICE_HEIGHT_M = HOUSE.ridgeM + 0.2;

export function serviceBounds(): {
  min: { x: number; z: number; y?: number };
  max: { x: number; z: number; y?: number };
} {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const consider = (x: number, z: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  };
  for (const n of SERVICE_NODES) {
    const p = serviceNodePosition(n);
    consider(p.x, p.z);
  }
  for (const e of HOUSE.east) {
    for (const n of HOUSE.north) consider(SERVICE_ORIGIN.x + e, SERVICE_ORIGIN.z - n);
  }
  // A NARROW MARGIN, because this level is the one that is short of room.
  //
  // The whole service is twenty metres of wire seen against a page that also
  // carries the voltage profile along the bottom, and three metres of empty
  // lawn on every side cost a third of the scale — which is the difference
  // between a main panel that is a rectangle and one that is a panel.
  const pad = 1.2;
  return {
    min: { x: minX - pad, z: minZ - pad, y: 0 },
    max: { x: maxX + pad, z: maxZ + pad, y: SERVICE_HEIGHT_M },
  };
}
