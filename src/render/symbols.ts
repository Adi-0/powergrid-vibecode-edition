/**
 * One-line diagram symbology.
 *
 * These are the symbols a person will meet again on a real utility drawing, a
 * relay panel or a textbook, drawn the way those drawings draw them. That is
 * the whole point: someone who learns a bespoke set of friendly icons here
 * would have to unlearn them the moment they opened a real single-line diagram.
 *
 * WHERE A STANDARD EXISTS, IT IS USED. The synchronous machine is a circle. The
 * two-winding transformer is two interlocking circles. A bus is a heavy bar. A
 * circuit breaker is a square. A disconnect switch is a blade that opens away
 * from its contact. A capacitor is two parallel plates, a reactor a coil, a
 * load an arrow leaving the bus. Device numbers on protection follow ANSI/IEEE
 * C37.2.
 *
 * WHERE NO STANDARD EXISTS — and there is none for distinguishing a wind farm
 * from a solar farm on a one-line — a mark is placed inside the machine circle
 * and declared in the legend, rather than reaching for colour. The legend is
 * always present, because a reader cannot decode an encoding they were never
 * shown.
 *
 * Each symbol is authored as a path in a normalised box from -1 to +1 and then
 * mapped onto the ground plane at a constant size in screen pixels, so it draws
 * the same size at every zoom level and still occludes correctly against the
 * geometry around it.
 */

import { LineSegment } from './line-batch.js';
import { IsoCamera } from './iso.js';

/** A symbol path: a list of polylines in the normalised box. */
export type SymbolPath = readonly (readonly [number, number][])[];

/** Build a regular polygon approximation of a circle, as one closed polyline. */
function circlePath(radius: number, segments = 28, cx = 0, cy = 0): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t)]);
  }
  return pts;
}

/** Arc from a0 to a1 radians. Used for reactor coils and transformer windings. */
function arcPath(
  radius: number, a0: number, a1: number, segments = 12, cx = 0, cy = 0
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = a0 + ((a1 - a0) * i) / segments;
    pts.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t)]);
  }
  return pts;
}

/** A sine wave, the conventional mark for alternating current inside a circle. */
function sinePath(halfWidth: number, amplitude: number, segments = 24): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pts.push([
      -halfWidth + 2 * halfWidth * t,
      amplitude * Math.sin(t * Math.PI * 2),
    ]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// The symbol set
// ---------------------------------------------------------------------------

export interface SymbolDefinition {
  id: string;
  /** Name as it appears in the legend. */
  name: string;
  /** One line of plain language, for the legend and for hover. */
  blurb: string;
  path: SymbolPath;
  /** Whether the standard for this symbol is real or invented here. */
  provenance: 'standard' | 'convention-of-this-app';
}

const GENERATOR_CIRCLE = circlePath(0.78);

/** A synchronous machine: a circle. Universal on one-line diagrams. */
export const SYM_GENERATOR: SymbolDefinition = {
  id: 'generator', name: 'Generator',
  blurb: 'A machine that turns mechanical rotation into electricity. The circle is the standard symbol on any one-line diagram.',
  path: [GENERATOR_CIRCLE, sinePath(0.42, 0.24)],
  provenance: 'standard',
};

/** Two interlocking circles: a two-winding transformer. */
export const SYM_TRANSFORMER: SymbolDefinition = {
  id: 'transformer', name: 'Transformer',
  blurb: 'Changes voltage from one level to another. Two interlocking circles are the two windings, magnetically coupled.',
  path: [circlePath(0.52, 26, 0, 0.36), circlePath(0.52, 26, 0, -0.36)],
  provenance: 'standard',
};

/** A heavy bar: a bus, the common connection point inside a substation. */
export const SYM_BUS: SymbolDefinition = {
  id: 'bus', name: 'Bus',
  blurb: 'A busbar: the metal bar everything at one voltage inside a substation connects to. Think of it as the junction where circuits meet.',
  path: [[[-1, 0], [1, 0]]],
  provenance: 'standard',
};

/** A square: a circuit breaker. */
export const SYM_BREAKER: SymbolDefinition = {
  id: 'breaker', name: 'Circuit breaker',
  blurb: 'A switch built to interrupt fault current. It is what actually disconnects a faulted circuit, on command from a protective relay.',
  path: [[[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6], [-0.6, -0.6]]],
  provenance: 'standard',
};

/** A blade opening away from its contact: a disconnect switch. */
export const SYM_DISCONNECT: SymbolDefinition = {
  id: 'disconnect', name: 'Disconnect switch',
  blurb: 'A visible break. It cannot interrupt load, only isolate equipment that is already dead, so a crew can see it is safe to work on.',
  path: [[[0, -1], [0, -0.45]], [[0, -0.45], [0.62, 0.62]], [[0, 0.45], [0, 1]]],
  provenance: 'standard',
};

/** Two parallel plates: a shunt capacitor bank. */
export const SYM_CAPACITOR: SymbolDefinition = {
  id: 'capacitor', name: 'Capacitor bank',
  blurb: 'Supplies reactive power where it is needed, so it does not have to be carried over the network. Holds voltage up under load.',
  path: [[[0, 1], [0, 0.18]], [[-0.7, 0.18], [0.7, 0.18]], [[-0.7, -0.18], [0.7, -0.18]], [[0, -0.18], [0, -1]]],
  provenance: 'standard',
};

/** A coil: a shunt reactor. */
export const SYM_REACTOR: SymbolDefinition = {
  id: 'reactor', name: 'Shunt reactor',
  blurb: 'Absorbs reactive power. Long high-voltage lines produce it whether anyone wants it or not, and without reactors the voltage would run too high.',
  path: [
    [[0, 1], [0, 0.6]],
    arcPath(0.3, Math.PI / 2, -Math.PI / 2, 10, -0.3, 0.3),
    arcPath(0.3, Math.PI / 2, -Math.PI / 2, 10, -0.3, -0.3),
    [[0, -0.6], [0, -1]],
  ],
  provenance: 'standard',
};

/** An arrow leaving the bus: load. */
export const SYM_LOAD: SymbolDefinition = {
  id: 'load', name: 'Load',
  blurb: 'Everything that uses the electricity: houses, factories, air conditioning, this screen.',
  path: [[[0, 0.9], [0, -0.5]], [[-0.42, -0.1], [0, -0.9], [0.42, -0.1]]],
  provenance: 'standard',
};

/** A battery: two plates of unequal length, the standard cell symbol. */
export const SYM_BATTERY: SymbolDefinition = {
  id: 'battery', name: 'Battery storage',
  blurb: 'Stores electricity and gives it back later. Charges when power is cheap and plentiful, discharges into the evening peak.',
  path: [
    [[0, 1], [0, 0.34]], [[-0.7, 0.34], [0.7, 0.34]], [[-0.34, 0.06], [0.34, 0.06]],
    [[-0.7, -0.22], [0.7, -0.22]], [[-0.34, -0.5], [0.34, -0.5]], [[0, -0.5], [0, -1]],
  ],
  provenance: 'standard',
};

// --- Generation-type marks, placed inside the machine circle -----------------
// No standard exists for these. Each is declared in the legend.

const MARK_SOLAR: SymbolPath = [
  [[-0.38, 0.26], [0.38, 0.26]], [[-0.38, 0], [0.38, 0]], [[-0.38, -0.26], [0.38, -0.26]],
  [[-0.38, 0.26], [-0.38, -0.26]], [[0.38, 0.26], [0.38, -0.26]],
  [[0, 0.26], [0, -0.26]],
];

const MARK_WIND: SymbolPath = [
  [[0, 0], [0, 0.42]], [[0, 0], [0.36, -0.21]], [[0, 0], [-0.36, -0.21]],
];

const MARK_HYDRO: SymbolPath = [
  [[-0.42, 0.14], [-0.21, -0.06], [0, 0.14], [0.21, -0.06], [0.42, 0.14]],
  [[-0.42, -0.24], [-0.21, -0.44], [0, -0.24], [0.21, -0.44], [0.42, -0.24]],
];

const MARK_STEAM: SymbolPath = [
  arcPath(0.2, -Math.PI / 2, Math.PI / 2, 8, 0, 0.0),
  arcPath(0.2, Math.PI / 2, (3 * Math.PI) / 2, 8, 0, -0.4),
  [[0, 0.44], [0, 0.2]],
];

const MARK_NUCLEAR: SymbolPath = [
  circlePath(0.12, 12),
  arcPath(0.34, 0.35, 1.75, 8), arcPath(0.34, 2.44, 3.84, 8), arcPath(0.34, 4.53, 5.93, 8),
];

const MARK_GEOTHERMAL: SymbolPath = [
  [[-0.42, -0.34], [0.42, -0.34]],
  [[-0.2, -0.34], [-0.2, 0.0], [-0.34, 0.2]],
  [[0.08, -0.34], [0.08, 0.1], [0.24, 0.32]],
];

const MARK_IMPORT: SymbolPath = [
  [[-0.46, 0], [0.34, 0]], [[0.06, 0.26], [0.42, 0], [0.06, -0.26]],
];

export type MachineMark =
  | 'solar' | 'wind' | 'hydro' | 'steam' | 'nuclear' | 'geothermal' | 'import' | 'none';

export const MACHINE_MARKS: Record<MachineMark, { path: SymbolPath; name: string; blurb: string }> = {
  solar: { path: MARK_SOLAR, name: 'Photovoltaic', blurb: 'Sunlight to electricity directly, with no moving parts and no rotating mass.' },
  wind: { path: MARK_WIND, name: 'Wind', blurb: 'A turbine driven by moving air, connected to the grid through power electronics.' },
  hydro: { path: MARK_HYDRO, name: 'Hydro', blurb: 'Falling water turning a turbine. The fastest-responding thing on the system.' },
  steam: { path: MARK_STEAM, name: 'Thermal / combined cycle', blurb: 'Fuel burned to make heat, heat to make steam or hot gas, and that to turn a turbine.' },
  nuclear: { path: MARK_NUCLEAR, name: 'Nuclear', blurb: 'Fission heat making steam. Runs flat out and does not follow demand.' },
  geothermal: { path: MARK_GEOTHERMAL, name: 'Geothermal', blurb: 'Steam drawn from hot rock underground.' },
  import: { path: MARK_IMPORT, name: 'Intertie', blurb: 'Not a plant: a connection to the neighbouring system, where power arrives from outside the state.' },
  none: { path: [], name: '', blurb: '' },
};

/** Every symbol that appears in the legend, in the order it is shown. */
export const LEGEND_SYMBOLS: SymbolDefinition[] = [
  SYM_GENERATOR, SYM_TRANSFORMER, SYM_BUS, SYM_BREAKER,
  SYM_DISCONNECT, SYM_CAPACITOR, SYM_REACTOR, SYM_LOAD, SYM_BATTERY,
];

// ---------------------------------------------------------------------------
// Placing symbols in the world
// ---------------------------------------------------------------------------

export interface SymbolPlacement {
  /** Anchor point in world space. */
  x: number;
  y: number;
  z: number;
  /** Half-size of the symbol in screen pixels. */
  sizePx: number;
  widthPx: number;
  color: string;
  opacity?: number;
  /** Rotation in the ground plane, radians, applied in screen space. */
  rotation?: number;
}

/**
 * Convert a symbol path to world-space line segments lying in the ground plane,
 * sized so that it draws at exactly `sizePx` half-width on screen.
 */
export function placeSymbol(
  path: SymbolPath,
  place: SymbolPlacement,
  basis: { rightX: number; rightZ: number; downX: number; downZ: number },
  out: LineSegment[]
): void {
  const c = Math.cos(place.rotation ?? 0);
  const s = Math.sin(place.rotation ?? 0);
  const toWorld = (px: number, py: number): [number, number, number] => {
    // Rotate in screen space, scale to pixels, then map pixels to the ground.
    const sx = (px * c - py * s) * place.sizePx;
    const sy = (px * s + py * c) * place.sizePx;
    // Screen y is DOWN, and symbol y is up, so negate.
    return [
      place.x + basis.rightX * sx + basis.downX * -sy,
      place.y,
      place.z + basis.rightZ * sx + basis.downZ * -sy,
    ];
  };

  for (const poly of path) {
    for (let i = 0; i + 1 < poly.length; i++) {
      out.push({
        a: toWorld(poly[i][0], poly[i][1]),
        b: toWorld(poly[i + 1][0], poly[i + 1][1]),
        widthPx: place.widthPx,
        color: place.color,
        ...(place.opacity !== undefined ? { opacity: place.opacity } : {}),
      });
    }
  }
}

/** Convenience: place a symbol using a camera's current ground basis. */
export function placeSymbolWithCamera(
  path: SymbolPath,
  place: SymbolPlacement,
  camera: IsoCamera,
  out: LineSegment[]
): void {
  placeSymbol(path, place, camera.groundBasis(), out);
}

/**
 * Render a symbol path into a standalone SVG string, for the legend.
 *
 * The legend must show the same marks the drawing uses, from the same source,
 * or it drifts out of date the first time a symbol changes.
 */
export function symbolToSVG(path: SymbolPath, size = 26, stroke = '#14161A', width = 1.3): string {
  const half = size / 2;
  const map = (p: readonly [number, number]) =>
    `${(half + p[0] * half * 0.82).toFixed(2)},${(half - p[1] * half * 0.82).toFixed(2)}`;
  const polylines = path
    .map((poly) => `<polyline points="${poly.map(map).join(' ')}" />`)
    .join('');
  return (
    `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" ` +
    `fill="none" stroke="${stroke}" stroke-width="${width}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${polylines}</svg>`
  );
}
