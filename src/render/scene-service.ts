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

import { Vector3 } from 'three';
import { SolvedCase } from '../core/results.js';
import {
  SERVICE_NODES, SERVICE_RUNS, SERVICE_SITE, ServiceNode, ServiceSolution,
  LV_CONDUCTORS, C84_1,
} from '../data/california/service.js';
import { project } from '../data/california/geography.js';
import { LineSegment } from './line-batch.js';
import { LabelSpec } from './labels.js';
import { IsoCamera } from './iso.js';
import { INK, SIGNAL, SELECTION, LAYOUT, voltageClass } from './style.js';
import { toWorld } from './world.js';
import { SYM_TRANSFORMER, SYM_BREAKER, placeSymbol, SymbolPath } from './symbols.js';
import { PickTarget } from './scene-system.js';

/** The transformer pad, in world coordinates. Everything else is relative. */
export const SERVICE_ORIGIN: Vector3 = toWorld(
  project(SERVICE_SITE.lat, SERVICE_SITE.lon), 0
);

/** World position of a service node. */
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

const SIZE_FOR: Record<ServiceNode['kind'], number> = {
  transformer: 22, meter: 15, panel: 26, breaker: 11,
  outlet: 16, 'ground-rod': 12, appliance: 14,
};

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export interface ServiceDrawOptions {
  selectedId?: string | null;
  hoveredId?: string | null;
  opacity?: number;
}

export interface ServiceDrawResult {
  segments: LineSegment[];
  labels: LabelSpec[];
  picks: PickTarget[];
}

interface Mark { seg: LineSegment; depth: number; haloPx?: number }

const HALO_PAD_PX = 1.5;

/** The house footprint, metres from the transformer pad. Context, not physics. */
const HOUSE: [number, number][] = [
  [10.2, 2.6], [21.6, 2.6], [21.6, 14.2], [10.2, 14.2], [10.2, 2.6],
];

export function drawService(
  solved: SolvedCase,
  service: ServiceSolution,
  camera: IsoCamera,
  options: ServiceDrawOptions = {}
): ServiceDrawResult {
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

  const fade = (s: LineSegment): LineSegment =>
    alpha >= 1 ? s : { ...s, opacity: (s.opacity ?? 1) * alpha };
  const mark = (seg: LineSegment, depth: number, haloPx?: number) =>
    marks.push(haloPx !== undefined ? { seg: fade(seg), depth, haloPx } : { seg: fade(seg), depth });

  const pos = new Map<string, Vector3>();
  for (const n of SERVICE_NODES) pos.set(n.id, serviceNodePosition(n));

  // --- the house, as a construction outline -------------------------------
  const o = SERVICE_ORIGIN;
  for (let i = 0; i + 1 < HOUSE.length; i++) {
    const a = new Vector3(o.x + HOUSE[i][0], 0, o.z - HOUSE[i][1]);
    const b = new Vector3(o.x + HOUSE[i + 1][0], 0, o.z - HOUSE[i + 1][1]);
    mark({
      a: [a.x, 0, a.z], b: [b.x, 0, b.z],
      widthPx: 0.9, color: INK.inkGhost,
    }, Number.MAX_SAFE_INTEGER - 20);
    // Just the corner posts, not the whole box. A building drawn in full
    // outweighs every wire inside it, and the wires are the subject.
    mark({
      a: [a.x, 0, a.z], b: [a.x, 2.4, a.z],
      widthPx: 0.7, color: INK.inkGhost,
    }, Number.MAX_SAFE_INTEGER - 19);
  }

  // --- grade, as a hairline, so "buried" reads as buried ------------------
  mark({
    a: [o.x - 2, 0, o.z + 2], b: [o.x + 26, 0, o.z + 2],
    widthPx: 0.8, color: INK.inkGhost,
  }, Number.MAX_SAFE_INTEGER - 21);

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

    mark({
      a: [a.x, a.y, a.z], b: [b.x, b.y, b.z],
      widthPx: Math.max(0.9, width), color,
      ...(buried ? { dash: [3.5, 3] as [number, number] } : {}),
    }, depthOf(a.clone().lerp(b, 0.5)), HALO_PAD_PX);

    if (step) {
      const idle = step.currentA < 0.005;
      labels.push({
        id: `svc:run:${id}`,
        world: a.clone().lerp(b, 0.5),
        text: `${run.name} — ${conductor?.size ?? ''}`,
        value: idle
          ? 'nothing switched on'
          : `${step.currentA.toFixed(1)} A · −${step.dropV.toFixed(2)} V`,
        priority: isSelected ? 5400 : 320,
        tone: isSelected ? 'selected' : 'muted',
      });
    }

    picks.push({
      id, kind: 'circuit', world: a.clone(), worldB: b.clone(),
      radiusPx: LAYOUT.pickRadiusPx,
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

    marks.push({
      seg: fade({
        a: [p.x, p.y, p.z], b: [p.x, p.y, p.z],
        widthPx: size * 1.85, color: INK.occluder,
      }),
      depth: depth - 1,
    });
    placeSymbol(SYMBOL_FOR[n.kind], {
      x: p.x, y: p.y, z: p.z, sizePx: size,
      widthPx: (n.kind === 'panel' || n.kind === 'transformer' ? 1.5 : 1.3)
        * (isSelected ? 1.4 : 1),
      color,
    }, basis, scratch);
    for (const seg of scratch) marks.push({ seg: fade(seg), depth: depth - 2 });
    scratch.length = 0;

    // What holds it up, or what it is buried in.
    if (p.y > 0.2) {
      mark({
        a: [p.x, 0, p.z], b: [p.x, p.y, p.z],
        widthPx: 0.8, color: INK.inkGhost,
      }, depth + 1);
    }

    labels.push({
      id: `svc:${n.id}`,
      world: p,
      text: n.name,
      ...(n.id === 'PAD' && padFlow
        ? {
            value: `${v!.toFixed(2)} V · ${(padFlow.sMaxMVA * 1000).toFixed(1)} of ` +
              `${(padFlow.sMaxMVA * 1000 / Math.max(1e-9, Math.abs(padFlow.loading))).toFixed(0)} kVA`,
          }
        : v !== undefined ? { value: `${v.toFixed(2)} V` }
        : n.rating ? { value: n.rating } : {}),
      priority: servicePriority(n) + (isSelected || isHovered ? 5000 : 0),
      tone: isSelected ? 'selected' : outOfRange ? 'alarm' : 'normal',
    });

    picks.push({
      id: n.id, kind: 'site', world: p.clone(),
      radiusPx: LAYOUT.pickRadiusPx * (n.kind === 'panel' ? 1.6 : 1.1),
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
        ...(alpha < 1 ? { opacity: alpha } : {}),
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
export function serviceBounds(): {
  min: { x: number; z: number }; max: { x: number; z: number };
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
  for (const [x, y] of HOUSE) consider(SERVICE_ORIGIN.x + x, SERVICE_ORIGIN.z - y);
  const pad = 3;
  return {
    min: { x: minX - pad, z: minZ - pad },
    max: { x: maxX + pad, z: maxZ + pad },
  };
}
