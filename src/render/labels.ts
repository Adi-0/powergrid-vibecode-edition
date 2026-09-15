/**
 * Screen-space labels with a collision-avoiding layout pass.
 *
 * Labels are DOM elements over the canvas, not geometry in the scene. Two
 * reasons, both structural rather than convenient:
 *
 *  - TYPE MUST NOT BE PROJECTED. A label drawn as 3D geometry gets sheared by
 *    the isometric projection and becomes a different, worse typeface at every
 *    angle. On a technical drawing the lettering is always upright and always
 *    the same size; that is what makes it readable, and it is what the browser
 *    gives for free.
 *  - LEGIBILITY BEATS COMPLETENESS. Forty overlapping labels convey less than
 *    twelve placed ones. Each frame every candidate is projected, sorted by
 *    importance, and placed only if it does not collide with something already
 *    placed. What does not fit is dropped, not squeezed.
 *
 * Measurement is cached by text content, so the layout pass costs a few hundred
 * rectangle comparisons per frame and no reflow.
 */

import { Vector2, Vector3 } from 'three';
import { IsoCamera } from './iso.js';
import { LAYOUT, TYPE, INK, SIGNAL } from './style.js';

export type LabelTone = 'normal' | 'muted' | 'alarm' | 'selected';

export interface LabelSpec {
  id: string;
  /** Where in the world the label points at. */
  world: Vector3;
  text: string;
  /** Second line, usually a live value. Set in tabular figures. */
  value?: string;
  /**
   * Higher is placed first when labels compete for space. Use it to rank by
   * what the reader needs: a 500 kV switchyard outranks a 115 kV tap.
   */
  priority: number;
  tone?: LabelTone;
  /** Offset from the projected point, in pixels. Defaults to up and right. */
  offsetPx?: [number, number];
  /**
   * Which side of its subject the label prefers to sit on.
   *
   * Left unset the layout picks whichever of six positions is free, which is
   * right for a map of a state and wrong for a chain of equipment: see ABOVE
   * and BELOW below.
   */
  side?: 'above' | 'below';
  /**
   * How strongly to draw it, 0 to 1.
   *
   * Set by the compositor from the opacity of the scene the label came from.
   * Without it a scene fading out at a tenth of its strength still wrote its
   * captions at full black, so every transition was crossed by ghost text from
   * the level being left behind — which is most of what made the zoom feel
   * cluttered.
   */
  opacity?: number;
}

/**
 * A coarse map of where there is ink on the page.
 *
 * WHAT MADE THE MAP LOOK LIKE A MESS WAS NOT THE NUMBER OF LABELS. It was that
 * a caption would land in the middle of a five-circuit corridor while a hand's
 * width of empty paper sat beside it — the layout knew where the other LABELS
 * were and nothing whatever about the drawing it was writing on.
 *
 * So the drawing is rasterised, once per rebuild, into cells a dozen pixels
 * across, and a label picks the free position that covers the least ink. It is
 * deliberately coarse: this is choosing between four or six candidates, not
 * doing typography, and a fine grid would cost more than the decision is worth.
 */
export interface InkField {
  cells: Uint16Array;
  cols: number;
  rows: number;
  cell: number;
  /** The middle of the drawing, in screen pixels: where the ink actually is. */
  centreX: number;
  centreY: number;
}

const INK_CELL_PX = 12;

/**
 * Rasterise the drawing's segments into that map.
 *
 * Endpoints are projected and the line between them walked in cell-sized
 * steps. Long segments are capped: a five-hundred-kilometre circuit crossing
 * the page contributes its share and does not get to spend a thousand steps
 * doing it.
 */
/**
 * How strongly a stroke counts as something worth not writing over.
 *
 * A conductor is worth avoiding; the ghost line work of a street or a
 * coastline is scenery and a caption may sit on it, because at the feeder
 * scale the ground is EVERYWHERE and treating it as an obstacle would leave
 * the layout no clear paper at all to prefer.
 */
function weightOf(color: string): number {
  if (color === INK.inkGhost) return 1;
  if (color === INK.inkFaint || color === INK.inkMuted) return 2;
  return 3;
}

export function inkField(
  camera: IsoCamera,
  segments: readonly { a: [number, number, number]; b: [number, number, number];
    color?: string; opacity?: number }[],
  widthPx: number,
  heightPx: number
): InkField {
  const cell = INK_CELL_PX;
  const cols = Math.max(1, Math.ceil(widthPx / cell));
  const rows = Math.max(1, Math.ceil(heightPx / cell));
  const cells = new Uint16Array(cols * rows);
  const pa = new Vector2();
  const pb = new Vector2();
  const w = new Vector3();
  let sumX = 0;
  let sumY = 0;
  let sumW = 0;

  const put = (x: number, y: number, weight: number): void => {
    const cx = (x / cell) | 0;
    const cy = (y / cell) | 0;
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
    cells[cy * cols + cx] += weight;
    sumX += x * weight;
    sumY += y * weight;
    sumW += weight;
  };

  for (const seg of segments) {
    // Marks in the colour of the paper are not ink: the halo behind a
    // conductor and the disc behind a symbol are there to CLEAR the page.
    if ((seg.opacity ?? 1) < 0.2) continue;
    w.set(seg.a[0], seg.a[1], seg.a[2]);
    camera.worldToScreen(w, pa);
    w.set(seg.b[0], seg.b[1], seg.b[2]);
    camera.worldToScreen(w, pb);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const weight = weightOf(seg.color ?? INK.ink);
    const steps = Math.min(90, Math.max(1, Math.ceil(Math.hypot(dx, dy) / cell)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      put(pa.x + dx * t, pa.y + dy * t, weight);
    }
  }
  return {
    cells, cols, rows, cell,
    centreX: sumW > 0 ? sumX / sumW : widthPx / 2,
    centreY: sumW > 0 ? sumY / sumW : heightPx / 2,
  };
}

/**
 * The candidates, ordered so that a label goes outward only as a last resort.
 *
 *   1. beside its subject, on the side facing the drawing;
 *   2. at arm's length on that side, on a leader;
 *   3. beside its subject on the outward side;
 *   4. at arm's length outward.
 *
 * Within each group the most inward-facing direction comes first, so ties in
 * ink break towards the middle of the drawing rather than away from it.
 */
function inwardFirst(
  tries: readonly Placement[], at: Vector2, ink: InkField
): Placement[][] {
  const dx = ink.centreX - at.x;
  const dy = ink.centreY - at.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return [[...tries]];
  const ux = dx / len;
  const uy = dy / len;
  const facing = (p: Placement): number =>
    (p[0] * ux + p[1] * uy) / Math.hypot(p[0], p[1]);
  const byFacing = (a: Placement, b: Placement): number => facing(b) - facing(a);
  const inward = tries.filter((p) => facing(p) > 0.05).sort(byFacing);
  const outward = tries.filter((p) => facing(p) <= 0.05).sort(byFacing);
  const inwardFar = inward.map(([x, y]) => [x, y, 2.6] as Placement);
  // Three groups, tried in order. There is deliberately no fourth: a name that
  // fits nowhere inward and nowhere beside its point is dropped rather than
  // held out on a leader over open sea, where it reads as the name of the sea.
  return [inward, inwardFar, outward];
}

/** How much ink a rectangle would be written over. */
function inkUnder(field: InkField, r: Rect): number {
  const { cells, cols, rows, cell } = field;
  const x0 = Math.max(0, (r.x / cell) | 0);
  const y0 = Math.max(0, (r.y / cell) | 0);
  const x1 = Math.min(cols - 1, ((r.x + r.w) / cell) | 0);
  const y1 = Math.min(rows - 1, ((r.y + r.h) / cell) | 0);
  let sum = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) sum += cells[y * cols + x];
  }
  return sum;
}

export interface PlacedLabel {
  spec: LabelSpec;
  x: number;
  y: number;
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
}

export interface Rect { x: number; y: number; w: number; h: number }

const overlaps = (a: Rect, b: Rect, pad: number): boolean =>
  a.x - pad < b.x + b.w && a.x + a.w + pad > b.x &&
  a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;

/**
 * Candidate placements: which way from its subject a label may sit, and how
 * far, as a multiple of the standard offset.
 *
 * The first six are the ordinary ring, tried in the conventional order —
 * up-right, up-left, down-right, and so on. The rest are the same directions
 * at arm's length, tried only when the near ring is full: a name that cannot
 * sit beside its point is better held out on a leader than dropped, and better
 * held out over the subject than off the edge of it.
 */
type Placement = readonly [number, number, number];
const NEAR: Placement[] = [
  [1, -1, 1], [-1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, -1.6, 1], [0, 1.6, 1],
];
const PLACEMENTS: Placement[] = NEAR;

/**
 * The same candidates, restricted to one side.
 *
 * A drawing that is a CHAIN — a transformer, a meter, a panel, a socket, with a
 * length of wire between each — reads as scattered annotation when half its
 * captions land above the run and half below, and as a labelled diagram when
 * the things are named on one side and the wires between them on the other.
 * The layout still drops what does not fit; it just stops choosing sides at
 * random.
 *
 * A PREFERENCE, NOT A RESTRICTION. Both lists hold all six candidates and
 * differ only in order, so a caption with nowhere to go on its own side still
 * gets placed rather than dropped — losing the current and the volts dropped
 * along a wire to keep a tidy rhythm would be a bad trade.
 */
const ABOVE: Placement[] = [
  [1, -1, 1], [-1, -1, 1], [0, -1.6, 1], [1, 1, 1], [-1, 1, 1], [0, 1.6, 1],
];
const BELOW: Placement[] = [
  [1, 1, 1], [-1, 1, 1], [0, 1.6, 1], [1, -1, 1], [-1, -1, 1], [0, -1.6, 1],
];

export class LabelLayer {
  readonly element: HTMLDivElement;
  private readonly nodes = new Map<string, HTMLDivElement>();
  private readonly sizes = new Map<string, { w: number; h: number }>();
  private readonly leaders: SVGSVGElement;
  private lastPlaced: PlacedLabel[] = [];
  /**
   * Most labels to place at once. Beyond this the drawing stops being a
   * drawing and becomes a word search. What is dropped is always the least
   * important, never the nearest to the cursor, so the choice is stable as the
   * camera moves.
   */
  maxLabels = 46;
  /**
   * Gap demanded between two labels, px.
   *
   * Loosened when the reader has asked for everything: at that setting the
   * point is coverage, and packing tighter is the honest response to being
   * asked for more rather than dropping half of it on a spacing rule.
   */
  collisionPadding: number = LAYOUT.labelCollisionPaddingPx;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'label-layer';
    this.leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.leaders.setAttribute('class', 'label-leaders');
    this.element.appendChild(this.leaders);
    parent.appendChild(this.element);
  }

  /**
   * Project, rank, place what fits, hide the rest.
   *
   * `blocked` is the rectangles the panels are covering. A label placed under
   * one is not a faint label or a clipped label, it is an absent label that
   * still took the space some other label could have used — and the reader sees
   * a leader line coming out from under a panel and pointing at nothing.
   */
  layout(
    camera: IsoCamera,
    specs: readonly LabelSpec[],
    ink?: InkField,
    blocked: readonly Rect[] = []
  ): void {
    const placed: PlacedLabel[] = [];
    const seen = new Set<string>();

    const candidates: { spec: LabelSpec; px: Vector2 }[] = [];
    for (const spec of specs) {
      const px = camera.worldToScreen(spec.world, new Vector2());
      if (!camera.isOnScreen(px, 90)) continue;
      candidates.push({ spec, px });
    }
    // Most important first; ties broken by screen position so the layout does
    // not flicker between frames when two labels have equal priority.
    candidates.sort(
      (a, b) => b.spec.priority - a.spec.priority || a.px.y - b.px.y || a.px.x - b.px.x
    );

    // THE DRAWING NEVER WRITES THE SAME NUMBER TWICE.
    //
    // A substation single-line names a line terminal, its breaker, its
    // disconnect and the bus section behind it, and every one of them carries
    // the same current — so four captions in a row all read "13.7 MVA · 8 %",
    // three feeder breakers all read "1 of 3 · 18.9 MW together", and a
    // transformer and its low-side breaker say the same thing one above the
    // other. Repetition at that density does not reinforce anything; it buries
    // the numbers that ARE different, which are the ones worth reading.
    //
    // So a value line is written by whichever label ranks highest, and the rest
    // keep their names and drop the repeat. It is a layout rule rather than a
    // list of exceptions in each scene, so it cannot be forgotten in the next
    // scene somebody writes.
    const spokenValues = new Set<string>();

    /** Strip the second line, for a caption that will not otherwise fit. */
    const withoutValue = (spec: LabelSpec): LabelSpec => {
      const { value: _dropped, ...rest } = spec;
      return rest;
    };

    for (const { spec: raw, px } of candidates) {
      let spec = raw;
      if (spec.value !== undefined && spokenValues.has(spec.value)) {
        spec = withoutValue(spec);
      }
      let size = this.measure(spec);
      let put: PlacedLabel | null = null;
      // A LABEL GOES ON THE SIDE OF ITS SUBJECT THAT FACES THE DRAWING.
      //
      // Preferring the least ink, on its own, sends a caption to the emptiest
      // paper within reach — and the emptiest paper is off the edge of the
      // subject. On a map of California that meant San Diego, Imperial Valley
      // and Moss Landing captioned out at sea or over Mexico, each on a
      // hairline leader, reading as names for somewhere else entirely. Eleven
      // of thirty-three labels had their site inside the state and their own
      // text outside it.
      //
      // Cartographers have always pushed a coastal name inland. The inward
      // direction here is simply towards the middle of the ink, which every
      // scene has without knowing anything about geography.
      const tries = spec.side === 'above' ? ABOVE
        : spec.side === 'below' ? BELOW : PLACEMENTS;
      const groups = ink ? inwardFirst(tries, px, ink) : [[...tries]];

      // A NAME WITHOUT ITS NUMBER BEATS NO NAME AT ALL.
      //
      // A two-line caption needs about twice the room of a one-line one, and in
      // the corner of a map where six places sit inside forty kilometres that
      // is the difference between being placed and being dropped. Losing the
      // megawatts costs the reader a figure they can get by pointing at it;
      // losing the whole label costs them the knowledge that the place is
      // there. So every caption is tried twice, and the second attempt is the
      // name on its own.
      const attempts: LabelSpec[] =
        spec.value !== undefined ? [spec, withoutValue(spec)] : [spec];
      // The FIRST free position is not the best one. Candidates are ordered by
      // where a caption conventionally sits, and that order is the tie-break;
      // between them, the one written over the least drawing wins.
      // THE GROUP DECIDES THE SIDE; THE INK DECIDES THE SPOT WITHIN IT.
      //
      // Minimising ink across all candidates at once looks like the same thing
      // and is not: the emptiest paper within reach of a coastal site is the
      // sea, so least-ink always won there and the name went out to sea. Each
      // group is exhausted before the next is considered, and inside a group
      // the cleanest placement wins.
      for (const attempt of attempts) {
        size = this.measure(attempt);
        for (const group of groups) {
          let bestInk = Infinity;
          for (const [sx, sy, scale] of group) {
            const base = attempt.offsetPx ?? [LAYOUT.labelOffsetPx, LAYOUT.labelOffsetPx];
            const off = [base[0] * scale, base[1] * scale];
            const x = px.x
              + (sx >= 0 ? off[0] : -off[0] - size.w) + (sx === 0 ? -size.w / 2 : 0);
            const y = px.y + (sy >= 0 ? off[1] : -off[1] - size.h);
            const rect = { x, y, w: size.w, h: size.h };
            if (placed.some((p) => overlaps(rect, p, this.collisionPadding))) continue;
            if (blocked.some((b) => overlaps(rect, b, 2))) continue;
            const over = ink ? inkUnder(ink, rect) : 0;
            if (over < bestInk) {
              bestInk = over;
              put = {
                spec: attempt, x, y, w: size.w, h: size.h,
                anchorX: px.x, anchorY: px.y,
              };
            }
            if (over === 0) break;
          }
          if (put) break;
        }
        if (put) break;
      }
      // A value is only spoken for once it has actually been PLACED: a label
      // that collided and was dropped must not take its number down with it.
      if (!put) continue;
      if (put.spec.value !== undefined) spokenValues.add(put.spec.value);
      placed.push(put);
      seen.add(spec.id);
      if (placed.length >= this.maxLabels) break;
    }

    this.render(placed, seen);
    this.drawLeaders(placed);
    this.lastPlaced = placed;
  }

  /** Labels that were actually drawn last frame. */
  get placed(): readonly PlacedLabel[] {
    return this.lastPlaced;
  }

  private measure(spec: LabelSpec): { w: number; h: number } {
    const key = `${spec.text} ${spec.value ?? ''}`;
    const hit = this.sizes.get(key);
    if (hit) return hit;
    const node = this.node(spec.id);
    this.fill(node, spec);
    node.style.visibility = 'hidden';
    node.style.display = 'block';
    const size = { w: node.offsetWidth, h: node.offsetHeight };
    this.sizes.set(key, size);
    return size;
  }

  private node(id: string): HTMLDivElement {
    let n = this.nodes.get(id);
    if (!n) {
      n = document.createElement('div');
      n.className = 'map-label';
      this.element.appendChild(n);
      this.nodes.set(id, n);
    }
    return n;
  }

  private fill(node: HTMLDivElement, spec: LabelSpec): void {
    const tone = spec.tone ?? 'normal';
    if (node.dataset.text !== spec.text || node.dataset.value !== (spec.value ?? '')) {
      node.textContent = '';
      const name = document.createElement('span');
      name.className = 'map-label__name';
      name.textContent = spec.text;
      node.appendChild(name);
      if (spec.value) {
        const val = document.createElement('span');
        val.className = 'map-label__value';
        val.textContent = spec.value;
        node.appendChild(val);
      }
      node.dataset.text = spec.text;
      node.dataset.value = spec.value ?? '';
    }
    if (node.dataset.tone !== tone) {
      node.dataset.tone = tone;
      node.style.color =
        tone === 'alarm' ? SIGNAL.alarm :
        tone === 'muted' ? INK.inkMuted : INK.ink;
      node.style.fontWeight = String(tone === 'selected' ? 600 : TYPE.label.weight);
    }
  }

  private render(placed: PlacedLabel[], seen: Set<string>): void {
    for (const p of placed) {
      const node = this.node(p.spec.id);
      this.fill(node, p.spec);
      node.style.visibility = 'visible';
      node.style.display = 'block';
      node.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      const o = p.spec.opacity ?? 1;
      const oStr = o >= 0.999 ? '' : o.toFixed(2);
      if (node.dataset.op !== oStr) {
        node.dataset.op = oStr;
        node.style.opacity = oStr;
      }
    }
    for (const [id, node] of this.nodes) {
      if (!seen.has(id) && node.style.display !== 'none') node.style.display = 'none';
    }
  }

  /**
   * A hairline from the thing to its name, drawn only when the name has been
   * pushed far enough away that the association is no longer obvious. On a
   * technical drawing this is a leader, and it is the reason a crowded drawing
   * can still be read.
   */
  private drawLeaders(placed: PlacedLabel[]): void {
    const parts: string[] = [];
    for (const p of placed) {
      // Nearest point on the label box to the anchor.
      const cx = Math.max(p.x, Math.min(p.anchorX, p.x + p.w));
      const cy = Math.max(p.y, Math.min(p.anchorY, p.y + p.h));
      const d = Math.hypot(cx - p.anchorX, cy - p.anchorY);
      if (d < 7) continue;
      parts.push(
        `<line x1="${p.anchorX.toFixed(1)}" y1="${p.anchorY.toFixed(1)}" ` +
        `x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" />`
      );
    }
    this.leaders.innerHTML = parts.join('');
  }

  dispose(): void {
    this.element.remove();
    this.nodes.clear();
    this.sizes.clear();
  }
}
