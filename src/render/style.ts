/**
 * The visual language, in one place. docs/style.md explains every entry.
 *
 * Rules (from the brief): ground and ink only; voltage class by weight and dash
 * pattern, never hue; one signal colour that means "something is wrong", always
 * paired with a pattern or mark; no gradients, glows, shadows, rounded cards.
 */

export const GROUND = '#EFECE4';
export const INK = '#14161A';
/** The one signal colour. Only for: over limit, out of range, fault, load shed, no solution. */
export const SIGNAL = '#D93A1E';

/** Ink mixed toward ground, for context that is present but not the subject. */
export function inkTint(amount: number): string {
  const g = hex(GROUND);
  const k = hex(INK);
  const m = g.map((gv, i) => Math.round(gv + (k[i]! - gv) * amount));
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export const INK_60 = inkTint(0.6);
export const INK_35 = inkTint(0.35);
export const INK_15 = inkTint(0.15);

export function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgb01(c: string): [number, number, number] {
  const [r, g, b] = hex(c);
  return [r / 255, g / 255, b / 255];
}

/**
 * Dash patterns in screen px: [on, off, on, off]. A zero-length pattern is solid.
 * Index into DASH_PATTERNS is what line instances carry.
 */
export const DASH = {
  solid: 0,
  long: 1, // long dash
  dashDot: 2, // chain line
  short: 3, // short dash
  dot: 4, // dotted
  hidden: 5, // hidden-edge convention in technical drawing
} as const;
export type DashName = keyof typeof DASH;

export const DASH_PATTERNS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0, 0],
  [18, 5, 18, 5],
  [14, 4, 2.5, 4],
  [7, 4, 7, 4],
  [1.5, 3, 1.5, 3],
  [5, 3, 5, 3],
];

/**
 * Voltage classes. Weight in CSS px at the default pen scale. Heaviest is the
 * highest voltage. The order and the patterns are the legend's order.
 */
export interface VoltageClass {
  id: string;
  label: string;
  /** Nominal line-to-line voltage range in kV that falls in this class. */
  kvMin: number;
  kvMax: number;
  /** The class's representative nominal voltage, kV line-to-line (for the key). */
  kvNominal: number;
  weight: number;
  dash: DashName;
  role: string;
}

export const VOLTAGE_CLASSES: readonly VoltageClass[] = [
  { id: 'ehv500', label: '500 kV', kvMin: 345, kvMax: 800, kvNominal: 500, weight: 3.4, dash: 'solid', role: 'Bulk transmission' },
  { id: 'hv230', label: '230 kV', kvMin: 200, kvMax: 345, kvNominal: 230, weight: 2.1, dash: 'solid', role: 'Transmission' },
  { id: 'hv115', label: '115 kV', kvMin: 100, kvMax: 200, kvNominal: 115, weight: 1.6, dash: 'long', role: 'Transmission' },
  { id: 'sub69', label: '60–70 kV', kvMin: 44, kvMax: 100, kvNominal: 60, weight: 1.3, dash: 'dashDot', role: 'Subtransmission' },
  { id: 'mv12', label: '4–35 kV', kvMin: 2.4, kvMax: 44, kvNominal: 12.47, weight: 1.1, dash: 'solid', role: 'Primary distribution' },
  { id: 'lv240', label: '120/240 V', kvMin: 0, kvMax: 2.4, kvNominal: 0.24, weight: 0.8, dash: 'short', role: 'Secondary / service' },
];

export function voltageClassFor(kvLL: number): VoltageClass {
  for (const c of VOLTAGE_CLASSES) if (kvLL >= c.kvMin && kvLL < c.kvMax) return c;
  return VOLTAGE_CLASSES[VOLTAGE_CLASSES.length - 1]!;
}

/** Stroke weights for things that are not conductors. */
export const PEN = {
  hairline: 0.6,
  fine: 0.8,
  thin: 1.0,
  medium: 1.4,
  bold: 2.0,
  outline: 1.2, // equipment outlines in iso
  coast: 0.8,
} as const;

/** Flows the key draws chevron samples for, MW. */
export const FLOW_LEGEND_MW = [500, 2000] as const;

/** Scale-bar lengths the sheet may choose from, metres (the sheet shows km from 1000 up). */
export const SCALE_STEPS_M = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000] as const;
