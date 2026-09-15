/**
 * The visual language.
 *
 * Every colour, weight, dash pattern and type size in the app comes from here.
 * The reference is technical drawing — patent illustration, axonometric
 * architectural section, cutaway engineering diagram — not a dashboard. The
 * rules that matter, and the reasoning, are written out in docs/style.md.
 *
 * Three rules govern everything below:
 *
 *  1. VOLTAGE CLASS IS ENCODED BY LINE WEIGHT AND DASH PATTERN, NEVER BY HUE.
 *     A drawing that uses colour for voltage cannot be photocopied, cannot be
 *     read by a colour-blind reader, and cannot then use colour for anything
 *     that matters. Weight is the primary encoding; dash separates the
 *     transmission classes from the distribution classes.
 *
 *  2. SATURATED COLOUR MEANS EXACTLY ONE THING: SOMETHING IS WRONG. Over a
 *     thermal limit, outside voltage bounds, faulted, de-energised, shed. One
 *     signal colour, used rarely, so that when it appears it is unmissable.
 *
 *  3. DEPTH COMES FROM LINE WEIGHT AND OCCLUSION. No gradients, no glows, no
 *     drop shadows, no rounded cards.
 */

// ---------------------------------------------------------------------------
// Ink and ground
// ---------------------------------------------------------------------------

export const INK = {
  /** The paper. Warm off-white, the colour of drafting stock. */
  ground: '#EFECE4',
  /** The pen. Near-black with a trace of blue, as printing ink is. */
  ink: '#14161A',
  /** Structural line work that must recede: hidden edges, construction lines. */
  inkFaint: '#8E8B84',
  /** The faintest readable mark: grids, ticks, the coastline. */
  inkGhost: '#C8C4BA',
  /** Secondary text and units. */
  inkMuted: '#5C5953',
  /** A slightly darker ground, for the inside of a fenced yard or a panel. */
  groundShade: '#E5E1D7',
  /** Ground colour used for hidden-line removal faces. Must match `ground`. */
  occluder: '#EFECE4',
} as const;

/**
 * The one signal colour. Vermilion — the red of a drafting pencil's correction
 * mark and of every warning label ever printed on equipment.
 *
 * It appears ONLY for: over thermal limit, outside voltage limits, faulted,
 * protection operated, load shed, out of service. Nothing else may use it.
 */
export const SIGNAL = {
  alarm: '#C4341B',
  /** A wash of the same hue, for filling an area rather than stroking it. */
  alarmWash: 'rgba(196, 52, 27, 0.14)',
  /** Approaching a limit but not past it — the same hue, held back. */
  warn: '#C4341B',
  warnAlpha: 0.45,
} as const;

/**
 * The single permitted second accent: the user's own selection.
 *
 * This is not a violation of rule 2. A selection highlight is not a claim about
 * the power system; it is the cursor. It is deliberately a cool hue so that it
 * can never be confused with the alarm colour.
 */
export const SELECTION = {
  stroke: '#1B4E8C',
  wash: 'rgba(27, 78, 140, 0.10)',
} as const;

// ---------------------------------------------------------------------------
// Voltage classes
// ---------------------------------------------------------------------------

export interface VoltageClassStyle {
  /** Nominal system voltage, kV. ANSI C84.1. */
  kV: number;
  /** Short label as it appears in the legend and on the drawing. */
  label: string;
  /** Stroke width in CSS pixels, held constant on screen regardless of zoom. */
  weightPx: number;
  /**
   * Dash pattern in CSS pixels, `[on, off]`. Empty means solid.
   * Transmission is drawn solid; distribution is dashed, which is the
   * convention on utility system maps and also separates the two families at a
   * glance when they appear in the same view.
   */
  dashPx: number[];
  /** One line a beginner can read. */
  blurb: string;
}

/**
 * The weight scale, built before anything was drawn.
 *
 * The ratios matter more than the absolute values: each step down is roughly
 * 0.65 of the one above, which is the smallest ratio that stays legible side by
 * side at normal viewing distance. Anything closer and 230 kV stops reading as
 * lighter than 500 kV.
 */
export const VOLTAGE_CLASSES: VoltageClassStyle[] = [
  {
    kV: 500, label: '500 kV', weightPx: 3.2, dashPx: [],
    blurb:
      'The backbone. Extra-high voltage, used to move thousands of megawatts ' +
      'hundreds of kilometres with little loss.',
  },
  {
    kV: 230, label: '230 kV', weightPx: 2.1, dashPx: [],
    blurb:
      'The regional network. Collects power from plants and carries it into ' +
      'and around load centres.',
  },
  {
    kV: 115, label: '115 kV', weightPx: 1.4, dashPx: [],
    blurb:
      'Sub-transmission. The last high-voltage step before a distribution ' +
      'substation.',
  },
  {
    kV: 12.47, label: '12.47 kV', weightPx: 0.9, dashPx: [7, 3.5],
    blurb:
      'Distribution primary. The wires on the poles along an ordinary street.',
  },
  {
    kV: 0.24, label: '240 V', weightPx: 0.6, dashPx: [2.5, 2],
    blurb:
      'Service secondary. The drop from the pole to a building, and the ' +
      'voltage at the outlet.',
  },
];

/** Pick the style for a bus or branch of a given nominal voltage. */
export function voltageClass(kV: number): VoltageClassStyle {
  let best = VOLTAGE_CLASSES[VOLTAGE_CLASSES.length - 1];
  let bestDiff = Infinity;
  for (const c of VOLTAGE_CLASSES) {
    const d = Math.abs(Math.log(kV / c.kV));
    if (d < bestDiff) {
      bestDiff = d;
      best = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

/**
 * How power flow is drawn.
 *
 * Marks in the colour of the paper travel along the CORE of each conductor,
 * leaving a hairline of ink on either side. Their SPEED is proportional to
 * loading — the one motion in the app that carries information — and their
 * direction is the direction real power is actually going, which reverses when
 * the solution says it does.
 *
 * Flow is never shown by colour, and never by making the line thicker: the
 * line's thickness is already saying what voltage class it is, and one channel
 * cannot carry two meanings.
 */
export const FLOW = {
  /** Screen-space spacing between flow marks, px. */
  markSpacingPx: 15,
  /** Length of each mark as a fraction of the spacing. */
  markLengthFraction: 0.40,
  /**
   * How much narrower the travelling mark is than the conductor it runs inside.
   * This is what leaves a hairline of ink on each side, so the conductor still
   * reads as one continuous line of its own weight rather than as a dashed one.
   */
  coreInsetPx: 1.5,
  /** Screen pixels per second at 100 % loading. */
  maxSpeedPxPerSec: 46,
  /** Screen pixels per second at the lowest loading that still animates. */
  minSpeedPxPerSec: 5,
  /** Loading below which flow is not animated at all — it would be noise. */
  minLoadingToAnimate: 0.015,
  /** Opacity of the flow marks against the conductor. */
  opacity: 0.9,
} as const;

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * One typeface, in an engineering register: IBM Plex Sans, bundled rather than
 * loaded from a CDN so the app works offline and looks the same everywhere.
 * Plex was drawn for IBM with explicit reference to industrial and drafting
 * lettering, which is the register this wants, and it has proper tabular
 * figures — essential, because digits that change width while updating are
 * unreadable.
 *
 * There is no monospace face here, deliberately. Setting labels in monospace to
 * look technical is a costume; tabular figures in a real text face is what
 * engineering drawings actually use.
 */
export const TYPE = {
  family: "'IBM Plex Sans', ui-sans-serif, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif",
  /** Live numeric readouts. Tabular figures, so columns do not jitter. */
  readout: { size: 13, weight: 500, tracking: 0.01, tabular: true },
  /** Equipment labels on the drawing. */
  label: { size: 11, weight: 500, tracking: 0.02, tabular: true },
  /** Secondary annotation on the drawing: units, small values. */
  annotation: { size: 9.5, weight: 400, tracking: 0.03, tabular: true },
  /** Panel headings. */
  heading: { size: 12, weight: 600, tracking: 0.06, tabular: false },
  /** Body prose in panels. */
  body: { size: 13, weight: 400, tracking: 0, tabular: false },
} as const;

// ---------------------------------------------------------------------------
// Isometric projection
// ---------------------------------------------------------------------------

/**
 * The isometric view angle, as a single tunable constant.
 *
 * A true isometric projection looks down an axis equally inclined to all three
 * world axes. That happens at azimuth 45° and elevation arctan(1/√2) ≈ 35.264°,
 * at which the three axes project 120° apart on screen and equal world lengths
 * along them draw as equal screen lengths. Any other elevation is axonometric
 * but not isometric, and the giveaway is that a cube stops looking like a cube.
 */
export const ISOMETRIC = {
  azimuthDeg: 45,
  elevationDeg: (Math.atan(1 / Math.SQRT2) * 180) / Math.PI, // 35.26438968…
} as const;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const LAYOUT = {
  /** Minimum gap between two screen-space labels before one is dropped, px. */
  labelCollisionPaddingPx: 3,
  /** Distance a label sits from the thing it names, px. */
  labelOffsetPx: 13,
  /** Size of a site's symbol on screen, px. Constant regardless of zoom. */
  siteSymbolPx: 8.5,
  /** Hit radius for picking with a mouse, px. */
  pickRadiusPx: 11,
} as const;

/**
 * Zoom, expressed as metres of world per CSS pixel.
 *
 * Naming the levels matters: the zoom tree in the brief is a spatial hierarchy,
 * and each level has a scale at which it becomes readable and a scale past
 * which it stops being useful.
 */
export const ZOOM: {
  system: number; region: number; substation: number; feeder: number;
  service: number; plant: number; machine: number; min: number; max: number;
} = {
  /** Whole state in view: about a thousand kilometres across. */
  system: 1150,
  /** A region: individual circuits and the substations they tie together. */
  region: 165,
  /** Along one distribution feeder: a few kilometres of street. */
  feeder: 2.7,
  /**
   * Inside the fence of one substation: a yard 86 by 54 metres.
   *
   * Under the isometric projection a ground rectangle W by D projects to
   * (W+D)·cos45° wide and (W+D)·sin45°·cos(35.26°) tall, so this yard covers
   * about 860 by 700 pixels here — filling the page without touching the
   * panels at either side.
   */
  substation: 0.14,
  /**
   * One service: the transformer, the drop, the meter, the panel, one socket.
   * About twenty metres of wire and a house footprint around it, which under
   * the isometric projection covers roughly 860 by 700 pixels here.
   */
  service: 0.042,
  /**
   * One power station: a site 260 by 170 metres, which under the isometric
   * projection covers about 860 by 700 pixels here.
   */
  plant: 0.35,
  /**
   * One machine, in cross-section. The drawing is screen-aligned rather than
   * laid on the ground, so its size on the page is simply its radius over this.
   */
  machine: 0.05,
  /** Hard limits on the camera. */
  min: 0.004,
  max: 4200,
};

/**
 * The named places a reader can be.
 *
 * The first five are the brief's zoom tree, in electrical order. `plant` and
 * `machine` are a SECOND BRANCH off the system rather than a continuation of
 * the first: power comes out of a machine, through a plant, into the system,
 * and then down through substation, feeder and service to a socket. Which
 * branch the reader is on is a fact about where they went, not about how far
 * they have zoomed, so it is decided by which drawing is actually being
 * rendered rather than by scale alone.
 */
export type LevelId =
  | 'system' | 'region' | 'substation' | 'feeder' | 'service'
  | 'plant' | 'machine';

/**
 * Which level of the zoom tree a given scale corresponds to.
 *
 * Note the ORDER. The zoom tree in the brief is the electrical hierarchy —
 * region, then substation, then the feeder leaving it, then a service. Spatial
 * scale does not agree: a substation yard is ninety metres across and a feeder
 * is three kilometres, so purely by zoom the feeder sits BETWEEN the region and
 * the substation.
 *
 * Both orderings are real, and the app uses each where it belongs. Scale
 * decides how much detail to draw, which is what this function is for.
 * Which level the reader is IN — and therefore what the breadcrumb says and
 * what the model-honesty panel is filtered to — is decided by what they
 * descended into, because "inside Eden Vale substation" is a fact about where
 * they went, not about how far they have zoomed.
 */
export function levelForScale(metresPerPixel: number): LevelId {
  if (metresPerPixel > 600) return 'system';
  if (metresPerPixel > 20) return 'region';
  if (metresPerPixel > 0.6) return 'feeder';
  if (metresPerPixel > 0.05) return 'substation';
  return 'service';
}
