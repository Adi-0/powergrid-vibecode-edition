/**
 * Metcalf Energy Center — the plant view.
 *
 * WHAT IS DIFFERENT ABOUT THIS LEVEL. Everywhere else in this app the subject
 * is electrical and the drawing's line weights carry voltage class. Here most
 * of what moves is not electricity at all: it is fuel, hot gas, steam and
 * cooling water, and the interesting fact about each stream is HOW MUCH ENERGY
 * IS IN IT.
 *
 * So thermal streams are drawn as DUCTS — a pair of parallel lines with a gap
 * between them proportional to the power they carry — and electrical streams
 * stay single strokes at their voltage class weight. That is not a decorative
 * distinction. A duct carrying twice the gas really is bigger, plant drawings
 * really do show ducts as ducts, and it keeps line weight meaning exactly one
 * thing on the conductors, where the rule matters.
 *
 * The result is that the shape of the energy chain is visible without reading a
 * number: the exhaust duct out of a gas turbine is enormous, the stack is
 * narrow, and the pipe to the cooling tower is wider than everything electrical
 * on the site put together. That last one is the fact worth carrying away.
 */

import { Vector3 } from 'three';
import { SolvedCase } from '../core/results.js';
import { Generator } from '../core/network.js';
import {
  PLANT_ITEMS, PLANT_FLOWS, PLANT_SITE, PlantItem,
  energyChain, PlantEnergyChain,
} from '../data/california/plant.js';
import { SITES } from '../data/california/sites.js';
import { project } from '../data/california/geography.js';
import { LineSegment } from './line-batch.js';
import { LabelSpec } from './labels.js';
import { IsoCamera } from './iso.js';
import { INK, SIGNAL, SELECTION, LAYOUT, voltageClass } from './style.js';
import { toWorld } from './world.js';
import {
  SYM_GENERATOR, SYM_TRANSFORMER, placeSymbol, SymbolPath,
} from './symbols.js';
import { PickTarget } from './scene-system.js';

/** The south-west corner of the site, in world metres. */
export const PLANT_ORIGIN: Vector3 = (() => {
  const s = SITES.metcalf;
  const p = toWorld(project(s.lat, s.lon), 0);
  return new Vector3(p.x - PLANT_SITE.widthM / 2, 0, p.z + PLANT_SITE.depthM / 2);
})();

/** World position of a plant item. */
export function plantItemPosition(i: PlantItem): Vector3 {
  return new Vector3(
    PLANT_ORIGIN.x + i.at[0],
    i.at[2],
    PLANT_ORIGIN.z - i.at[1]
  );
}

/** The generator in the case that this plant is. */
export function plantGenerator(solved: SolvedCase): Generator | undefined {
  return solved.net.generators.find(
    (g) => g.bus.startsWith('METCALF') && g.kind === 'gas-cc'
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

/** A turbine: the wedge of a bladed rotor, as a machine drawing shows it. */
const SYM_TURBINE: SymbolPath = [
  [[-0.9, -0.55], [-0.9, 0.55], [0.9, 0.9], [0.9, -0.9], [-0.9, -0.55]],
  [[-0.9, 0], [0.9, 0]],
];

/** A boiler: tube banks in a duct, which is what a heat recovery boiler is. */
const SYM_HRSG: SymbolPath = [
  [[-0.95, -0.9], [-0.95, 0.9], [0.95, 0.9], [0.95, -0.9], [-0.95, -0.9]],
  [[-0.55, -0.9], [-0.55, 0.9]],
  [[-0.15, -0.9], [-0.15, 0.9]],
  [[0.3, -0.9], [0.3, 0.9]],
];

/** A stack, seen as the circular section it is. */
const SYM_STACK: SymbolPath = [ring(0.6), ring(0.3)];

/** A condenser: a shell with tubes through it. */
const SYM_CONDENSER: SymbolPath = [
  [[-0.95, -0.5], [-0.95, 0.5], [0.95, 0.5], [0.95, -0.5], [-0.95, -0.5]],
  [[-0.95, 0.18], [0.95, 0.18]],
  [[-0.95, -0.18], [0.95, -0.18]],
];

/** A cooling tower: the fan cells of a mechanical-draught tower. */
const SYM_TOWER: SymbolPath = [
  [[-0.95, -0.6], [-0.95, 0.6], [0.95, 0.6], [0.95, -0.6], [-0.95, -0.6]],
  ...[-0.6, -0.2, 0.2, 0.6].map((x) =>
    ring(0.22).map(([a, b]) => [a + x, b] as [number, number])),
];

/** The gas supply: a valve on a pipe. */
const SYM_FUEL: SymbolPath = [
  [[-0.9, 0], [-0.35, 0]],
  [[-0.35, -0.5], [-0.35, 0.5], [0.35, -0.5], [0.35, 0.5], [-0.35, -0.5]],
  [[0.35, 0], [0.9, 0]],
  [[0, 0], [0, 0.75]],
  [[-0.4, 0.75], [0.4, 0.75]],
];

/** The switchyard: a bus with bays dropping off it. */
const SYM_SWITCHYARD: SymbolPath = [
  [[-0.95, 0.5], [0.95, 0.5]],
  [[-0.6, 0.5], [-0.6, -0.6]], [[0, 0.5], [0, -0.6]], [[0.6, 0.5], [0.6, -0.6]],
  [[-0.78, -0.2], [-0.42, -0.2], [-0.42, -0.5], [-0.78, -0.5], [-0.78, -0.2]],
  [[-0.18, -0.2], [0.18, -0.2], [0.18, -0.5], [-0.18, -0.5], [-0.18, -0.2]],
  [[0.42, -0.2], [0.78, -0.2], [0.78, -0.5], [0.42, -0.5], [0.42, -0.2]],
];

const SYMBOL_FOR: Record<PlantItem['kind'], SymbolPath> = {
  'gas-turbine': SYM_TURBINE,
  'steam-turbine': SYM_TURBINE,
  hrsg: SYM_HRSG,
  stack: SYM_STACK,
  condenser: SYM_CONDENSER,
  'cooling-tower': SYM_TOWER,
  generator: SYM_GENERATOR.path,
  transformer: SYM_TRANSFORMER.path,
  switchyard: SYM_SWITCHYARD,
  fuel: SYM_FUEL,
};

const SIZE_FOR: Record<PlantItem['kind'], number> = {
  'gas-turbine': 20, 'steam-turbine': 22, hrsg: 19, stack: 11,
  condenser: 16, 'cooling-tower': 24, generator: 14, transformer: 14,
  switchyard: 20, fuel: 13,
};

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export interface PlantDrawOptions {
  selectedId?: string | null;
  hoveredId?: string | null;
  opacity?: number;
}

export interface PlantDrawResult {
  segments: LineSegment[];
  labels: LabelSpec[];
  picks: PickTarget[];
  /** The chain the labels were drawn from, so a panel can show the same one. */
  chain: PlantEnergyChain;
}

interface Mark { seg: LineSegment; depth: number; haloPx?: number }

const HALO_PAD_PX = 1.4;

/**
 * How wide a duct is drawn, in screen pixels, for a given thermal power.
 *
 * Proportional to the square root of the power, so that the AREA of the duct on
 * the page tracks the energy in it. That is how a duct actually scales — a pipe
 * carrying four times the flow at the same velocity has twice the diameter —
 * and it keeps the largest stream from being twenty times the width of the
 * smallest on a page they both have to fit on.
 */
const ductWidthPx = (mw: number, referenceMW: number): number =>
  referenceMW > 0 ? 3 + 17 * Math.sqrt(Math.max(0, mw) / referenceMW) : 3;

export function drawPlant(
  solved: SolvedCase,
  camera: IsoCamera,
  options: PlantDrawOptions = {}
): PlantDrawResult {
  const g = plantGenerator(solved);
  const netMW = g ? g.pMW : 0;
  const chain = energyChain(
    g ?? ({ heatRateBtuPerKWh: 7300 } as Generator), netMW
  );

  const alpha = options.opacity ?? 1;
  const basis = camera.groundBasis();
  const marks: Mark[] = [];
  const labels: LabelSpec[] = [];
  const picks: PickTarget[] = [];
  const scratch: LineSegment[] = [];
  const dir = camera.direction;
  const depthOf = (p: Vector3): number => -(p.x * dir.x + p.y * dir.y + p.z * dir.z);
  const selected = options.selectedId ?? null;
  const hovered = options.hoveredId ?? null;

  const fade = (s: LineSegment): LineSegment =>
    alpha >= 1 ? s : { ...s, opacity: (s.opacity ?? 1) * alpha };
  const mark = (seg: LineSegment, depth: number, haloPx?: number) =>
    marks.push(haloPx !== undefined
      ? { seg: fade(seg), depth, haloPx }
      : { seg: fade(seg), depth });

  const pos = new Map<string, Vector3>();
  for (const i of PLANT_ITEMS) pos.set(i.id, plantItemPosition(i));
  const byStage = new Map(chain.flows.map((f) => [f.id, f]));

  // --- the site boundary ----------------------------------------------------
  {
    const corners: [number, number][] = [
      [0, 0], [PLANT_SITE.widthM, 0],
      [PLANT_SITE.widthM, PLANT_SITE.depthM], [0, PLANT_SITE.depthM], [0, 0],
    ];
    for (let i = 0; i + 1 < corners.length; i++) {
      const a = new Vector3(
        PLANT_ORIGIN.x + corners[i][0], 0, PLANT_ORIGIN.z - corners[i][1]);
      const b = new Vector3(
        PLANT_ORIGIN.x + corners[i + 1][0], 0, PLANT_ORIGIN.z - corners[i + 1][1]);
      mark({
        a: [a.x, 0, a.z], b: [b.x, 0, b.z],
        widthPx: 1.0, color: INK.inkGhost,
      }, Number.MAX_SAFE_INTEGER - 20);
    }
  }

  // --- buildings, as footprints at their true size --------------------------
  for (const i of PLANT_ITEMS) {
    if (!i.sizeM) continue;
    const p = pos.get(i.id)!;
    const [w, d] = i.sizeM;
    const corners: [number, number][] = [
      [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2],
    ];
    const isSelected = selected === i.id;
    for (let k = 0; k + 1 < corners.length; k++) {
      mark({
        a: [p.x + corners[k][0], 0, p.z - corners[k][1]],
        b: [p.x + corners[k + 1][0], 0, p.z - corners[k + 1][1]],
        widthPx: isSelected ? 1.6 : 1.0,
        color: isSelected ? SELECTION.stroke : INK.inkFaint,
      }, Number.MAX_SAFE_INTEGER - 18);
    }
    // One corner post, to give the footprint a height without drawing a box
    // that would outweigh everything inside it.
    if (i.at[2] > 1) {
      mark({
        a: [p.x - w / 2, 0, p.z + d / 2], b: [p.x - w / 2, i.at[2], p.z + d / 2],
        widthPx: 0.8, color: INK.inkGhost,
      }, Number.MAX_SAFE_INTEGER - 17);
    }
  }

  // --- the energy streams ---------------------------------------------------
  const reference = chain.fuelMW;
  for (const [fromId, toId, stage] of PLANT_FLOWS) {
    const a = pos.get(fromId);
    const b = pos.get(toId);
    if (!a || !b) continue;
    const flow = byStage.get(stage);
    const mw = flow ? flow.mw : 0;
    const depth = depthOf(a.clone().lerp(b, 0.5));
    const isSelected = selected === fromId || selected === toId;
    const color = isSelected ? SELECTION.stroke : INK.ink;

    if (stage === 'export' || stage === 'gt-generator' || stage === 'st-generator') {
      // Electrical: a single stroke at its voltage class weight, exactly as
      // everywhere else in the app.
      // Generator leads run at GENERATOR voltage, not at distribution voltage.
      // They were drawn at 12.47 kV, which gave them the dashed pattern the
      // legend reserves for the wires along a street — an 18 kV isolated-phase
      // bus three metres long is not that, and saying so in the one visual
      // code the app has was a straightforward lie.
      const kV = fromId.startsWith('GSU') || toId === 'SWITCHYARD' ? 230 : 18;
      const cls = voltageClass(kV);
      mark({
        a: [a.x, a.y, a.z], b: [b.x, b.y, b.z],
        widthPx: cls.weightPx * 1.6 * (isSelected ? 1.5 : 1),
        color,
        ...(cls.dashPx.length === 2
          ? { dash: [cls.dashPx[0], cls.dashPx[1]] as [number, number] } : {}),
      }, depth, HALO_PAD_PX);
    } else {
      // Thermal: a duct, drawn as its two walls with the gap between them
      // proportional to the square root of the power it carries.
      //
      // The walls alone did not work. Two thin lines a centimetre apart read
      // as two lines, not as one stream, so the claim the panel makes — that
      // the widths ARE the energy — was invisible in the drawing that was
      // supposed to be making it. A pale core between the walls turns the pair
      // into a band, which is what a section through a duct looks like and
      // what the eye compares.
      const widthPx = ductWidthPx(mw, reference);
      const perp = perpendicularOnGround(camera, a, b, widthPx / 2);
      mark({
        a: [a.x, a.y, a.z], b: [b.x, b.y, b.z],
        widthPx, color: INK.inkGhost, opacity: 0.55,
      }, depth + 2);
      for (const sign of [-1, 1]) {
        mark({
          a: [a.x + perp.x * sign, a.y, a.z + perp.z * sign],
          b: [b.x + perp.x * sign, b.y, b.z + perp.z * sign],
          widthPx: 1.1 * (isSelected ? 1.6 : 1),
          color,
        }, depth, HALO_PAD_PX);
      }
    }

    picks.push({
      id: `${fromId}>${toId}`, kind: 'circuit',
      world: a.clone(), worldB: b.clone(),
      radiusPx: LAYOUT.pickRadiusPx,
    });
  }

  // --- the equipment --------------------------------------------------------
  for (const i of PLANT_ITEMS) {
    const p = pos.get(i.id)!;
    const isSelected = selected === i.id;
    const isHovered = hovered === i.id;
    const size = SIZE_FOR[i.kind] * (isSelected || isHovered ? 1.25 : 1);
    const depth = depthOf(p) - 1e4;
    const color = isSelected ? SELECTION.stroke : INK.ink;

    marks.push({
      seg: fade({
        a: [p.x, p.y, p.z], b: [p.x, p.y, p.z],
        widthPx: size * 1.85, color: INK.occluder,
      }),
      depth: depth - 1,
    });
    placeSymbol(SYMBOL_FOR[i.kind], {
      x: p.x, y: p.y, z: p.z, sizePx: size,
      widthPx: 1.35 * (isSelected ? 1.4 : 1), color,
    }, basis, scratch);
    for (const seg of scratch) marks.push({ seg: fade(seg), depth: depth - 2 });
    scratch.length = 0;

    if (p.y > 1) {
      mark({
        a: [p.x, 0, p.z], b: [p.x, p.y, p.z],
        widthPx: 0.8, color: INK.inkGhost,
      }, depth + 1);
    }

    // ONE number per caption, and "% of fuel" said once rather than eighteen
    // times. Every item carried both its megawatts and its share of the fuel,
    // so the drawing came out under two columns of near-identical text and the
    // repetition drowned the one figure that differs between them.
    const stream = i.stage ? byStage.get(i.stage) : undefined;
    const emphasised = isSelected || isHovered;

    // Eighteen standing captions over a drawing this size is a page of text
    // with a diagram behind it. Only the things that make the cycle a cycle
    // keep a name; a generator sits against the turbine that drives it and a
    // step-up transformer against the generator, so both are legible from
    // their neighbours and answer on hover.
    if (!emphasised && !NAMED_IN_PLANT.has(i.kind)) {
      picks.push({
        id: i.id, kind: 'site', world: p.clone(),
        radiusPx: LAYOUT.pickRadiusPx * 1.2,
      });
      continue;
    }
    const value = emphasised && stream
      ? `${formatPower(stream.mw)} · ${(stream.fraction * 100).toFixed(1)} % of the fuel`
      : stream ? formatPower(stream.mw)
        : emphasised && i.rating ? i.rating : undefined;
    labels.push({
      id: `plant:${i.id}`,
      world: p,
      text: i.name,
      ...(value ? { value } : {}),
      priority: plantPriority(i) + (emphasised ? 5000 : 0),
      tone: isSelected ? 'selected' : 'normal',
    });

    picks.push({
      id: i.id, kind: 'site', world: p.clone(),
      radiusPx: LAYOUT.pickRadiusPx * 1.2,
    });
  }

  // --- the station's own headline -------------------------------------------
  labels.push({
    id: 'plant:site',
    world: new Vector3(
      PLANT_ORIGIN.x + PLANT_SITE.widthM / 2, 0,
      PLANT_ORIGIN.z + 16
    ),
    text: 'Metcalf Energy Center',
    value: netMW > 0
      ? `${formatPower(netMW)} out · ${(chain.efficiency * 100).toFixed(1)} % efficient`
      : 'off — no fuel burning',
    priority: 960,
    tone: 'muted',
  });

  void SIGNAL;

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
  return { segments, labels, picks, chain };
}

/**
 * A ground-plane vector perpendicular ON SCREEN to a run, of a given screen
 * length. The same construction the crossarms and the parallel circuits use:
 * take the perpendicular in screen space and map it back through the camera's
 * ground basis, or an isometric projection shears it.
 */
function perpendicularOnGround(
  camera: IsoCamera, a: Vector3, b: Vector3, px: number
): { x: number; z: number } {
  const basis = camera.groundBasis();
  const sa = camera.worldToScreen(a);
  const sb = camera.worldToScreen(b);
  const dx = sb.x - sa.x;
  const dy = sb.y - sa.y;
  const len = Math.hypot(dx, dy) || 1;
  // Rotate the screen direction by 90°, scale to the width we want, then map
  // those screen pixels back onto the ground.
  const sx = (-dy / len) * px;
  const sy = (dx / len) * px;
  return {
    x: basis.rightX * sx + basis.downX * sy,
    z: basis.rightZ * sx + basis.downZ * sy,
  };
}

const formatPower = (mw: number): string =>
  Math.abs(mw) >= 1000 ? `${(mw / 1000).toFixed(2)} GW` : `${mw.toFixed(0)} MW`;

/**
 * What keeps a standing label in the plant.
 *
 * The four stages of the cycle and the two places energy leaves it: burn,
 * recover, expand, reject. Everything else is identified by what it is bolted
 * to.
 */
const NAMED_IN_PLANT = new Set<PlantItem['kind']>([
  'gas-turbine', 'hrsg', 'steam-turbine', 'condenser', 'cooling-tower',
  'switchyard', 'fuel',
]);

function plantPriority(i: PlantItem): number {
  return i.kind === 'gas-turbine' ? 900
    : i.kind === 'steam-turbine' ? 880
    : i.kind === 'cooling-tower' ? 840
    : i.kind === 'hrsg' ? 820
    : i.kind === 'generator' ? 700
    : i.kind === 'switchyard' ? 640
    : i.kind === 'condenser' ? 620
    : i.kind === 'transformer' ? 500
    : i.kind === 'fuel' ? 480
    : 300;
}

/** Bounds of the plant site, for framing and culling. */
export function plantBounds(): {
  min: { x: number; z: number }; max: { x: number; z: number };
} {
  const pad = 20;
  return {
    min: { x: PLANT_ORIGIN.x - pad, z: PLANT_ORIGIN.z - PLANT_SITE.depthM - pad },
    max: { x: PLANT_ORIGIN.x + PLANT_SITE.widthM + pad, z: PLANT_ORIGIN.z + pad },
  };
}
