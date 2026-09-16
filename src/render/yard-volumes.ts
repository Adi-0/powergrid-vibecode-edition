/**
 * The equipment in the yard, as objects rather than as glyphs.
 *
 * A single-line diagram uses SYMBOLS: flat, screen-aligned, standing for a
 * device without describing it. That is exactly right at zero morph and exactly
 * wrong at full morph, where the same flat marks read as annotations pinned
 * over a drawing rather than as things standing in a yard. It is why a correct
 * substation drawing still looked like scattered icons with nothing connected
 * to anything.
 *
 * So at full morph each device is drawn as a VOLUME in the isometric world: a
 * transformer tank with radiators and bushings, a breaker with its interrupter
 * columns, a disconnect with its insulator stacks and blade. The two
 * representations cross-fade with the morph, so sliding from Diagram to Yard
 * turns a symbol into the object it stands for — which is the transition the
 * brief cares most about, and the one this view was failing to deliver.
 *
 * DIMENSIONS ARE REAL, in metres, and they are the ordinary sizes for the
 * voltage class: a 115 kV breaker is about 4 m tall, a 20 MVA transformer tank
 * about 5 m long. Nothing here is exaggerated, so the yard reads at the same
 * scale as everything else in the model.
 */

import { Vector2, Vector3 } from 'three';
import { LineSegment } from './line-batch.js';
import { INK } from './style.js';
import {
  Edge, Quad, v, boxEdges, post, insulatorEdges as insulator, facingQuads,
} from './volumes.js';
import { IsoCamera } from './iso.js';

export type { Edge } from './volumes.js';

/**
 * What each kind of equipment looks like, standing on the ground at `p`.
 *
 * `p` is the device's terminal height — where the conductor meets it — so each
 * body is built DOWNWARD from there onto its own foundation. That keeps the
 * conductor routing and the volumes agreeing with each other without either
 * knowing about the other.
 */
export function volumeFor(kind: string, p: Vector3, kV: number): Edge[] {
  const ground = v(p.x, 0, p.z);
  const big = kV > 50;

  switch (kind) {
    case 'transformer': {
      // Tank, radiator bank down one side, and a bushing to each terminal.
      const tankH = 3.2;
      const tank = v(p.x, 0.4, p.z);
      const out = boxEdges(tank, 5.4, tankH, 3.0);
      const radiator = v(p.x, 0.9, p.z + 2.1);
      out.push(...boxEdges(radiator, 4.4, 2.2, 0.5));
      // Fins, which is what a radiator bank actually looks like.
      for (let i = -2; i <= 2; i++) {
        const x = p.x + i * 0.9;
        out.push([v(x, 1.0, p.z + 1.9), v(x, 3.1, p.z + 1.9)]);
      }
      // Bushings on the lid, tall side and short side.
      out.push(...insulator(v(p.x - 1.5, 0.4 + tankH, p.z), 2.6, 4));
      out.push(...insulator(v(p.x + 1.5, 0.4 + tankH, p.z), 1.4, 3));
      // The plinth it sits on.
      out.push(...boxEdges(v(p.x, 0, p.z), 6.0, 0.4, 3.6));
      return out;
    }

    case 'breaker': {
      // A dead-tank breaker: a horizontal tank on legs with an interrupter
      // bushing rising to each terminal.
      const tankY = big ? 1.8 : 1.1;
      const out = boxEdges(v(p.x, tankY, p.z), big ? 4.2 : 2.4, 1.1, 1.2);
      for (const dx of [-1.4, 1.4]) {
        out.push(...insulator(
          v(p.x + dx * (big ? 1 : 0.6), tankY + 1.1, p.z), big ? 2.2 : 1.2, big ? 4 : 2));
      }
      // Legs.
      for (const dx of [-1.5, 1.5]) {
        for (const dz of [-0.4, 0.4]) {
          out.push(post(v(p.x + dx * (big ? 1 : 0.6), 0, p.z + dz), tankY));
        }
      }
      return out;
    }

    case 'disconnect': {
      // Two insulator stacks on a frame, with the blade lying between them.
      const frameY = Math.max(0.4, p.y - (big ? 2.6 : 1.6));
      const stackH = p.y - frameY;
      const out: Edge[] = [];
      for (const dx of [-1.3, 1.3]) {
        out.push(...insulator(v(p.x + dx, frameY, p.z), stackH, big ? 4 : 3));
        out.push(post(v(p.x + dx, 0, p.z), frameY));
      }
      out.push([v(p.x - 1.3, frameY, p.z), v(p.x + 1.3, frameY, p.z)]);
      // The blade, drawn closed: a bar between the two stack tops.
      out.push([v(p.x - 1.3, p.y, p.z), v(p.x + 1.3, p.y, p.z)]);
      return out;
    }

    case 'ct':
    case 'pt': {
      // A single porcelain column with the instrument head on top.
      const headH = 0.8;
      const out = insulator(ground, Math.max(0.6, p.y - headH), big ? 5 : 3);
      out.push(...boxEdges(v(p.x, Math.max(0.6, p.y - headH), p.z), 1.1, headH, 1.1));
      return out;
    }

    case 'arrester':
      return insulator(ground, Math.max(0.8, p.y), big ? 5 : 3);

    case 'capacitor': {
      // A rack of cans, which is what a station bank is.
      const out = boxEdges(v(p.x, 0.5, p.z), 3.6, 2.4, 1.4);
      for (let i = -1; i <= 1; i++) {
        out.push(...boxEdges(v(p.x + i * 1.1, 0.7, p.z), 0.7, 1.9, 0.7));
      }
      for (const dx of [-1.6, 1.6]) out.push(post(v(p.x + dx, 0, p.z), 0.5));
      return out;
    }

    case 'line-terminal': {
      // The take-off structure the incoming line lands on: a portal of two
      // legs and a crossarm, with the line hung off it on insulator strings.
      //
      // Drawn plainly. An earlier version put lattice bracing on the legs and
      // it came out as a thicket — at this scale the bracing is finer than the
      // conductors and reads as noise, so the structure says "steel frame" and
      // stops there.
      const h = Math.max(6, p.y);
      const out: Edge[] = [];
      for (const dz of [-3.4, 3.4]) {
        out.push(post(v(p.x, 0, p.z + dz), h));
        // A foot, so it lands on something.
        out.push([v(p.x - 0.7, 0, p.z + dz), v(p.x + 0.7, 0, p.z + dz)]);
        // One knee brace up to the crossarm, which is what actually holds a
        // portal square.
        out.push([
          v(p.x, h - 2.2, p.z + dz),
          v(p.x, h, p.z + dz - Math.sign(dz) * 2.2),
        ]);
      }
      out.push([v(p.x, h, p.z - 3.4), v(p.x, h, p.z + 3.4)]);
      // Three suspension strings, one per phase, hanging from the crossarm.
      for (const dz of [-2.0, 0, 2.0]) {
        out.push(...insulator(v(p.x, h - 1.8, p.z + dz), 1.8, 3));
      }
      return out;
    }

    case 'regulator': {
      // A tank with a control cabinet bolted to the side of it.
      const out = boxEdges(v(p.x, 0.3, p.z), 2.2, 1.8, 1.6);
      out.push(...boxEdges(v(p.x + 1.4, 0.3, p.z), 0.6, 1.2, 0.8));
      out.push(...boxEdges(v(p.x, 0, p.z), 2.6, 0.3, 2.0));
      return out;
    }

    default:
      return [];
  }
}

/**
 * Fill the camera-facing faces of a solid with strokes in the colour of the
 * paper, so that what is behind it is hidden.
 *
 * Spacing is worked out in SCREEN pixels, not in metres: a face six metres
 * across needs two strokes at the scale of a yard and forty at the scale of a
 * bushing, and the wash has to stay opaque at both. Each stroke is drawn wider
 * than the gap to its neighbour, so there is no ruling visible in the fill.
 */
export function washSegments(
  quads: readonly Quad[], camera: IsoCamera, opacity = 1,
  color: string = INK.occluder
): LineSegment[] {
  const out: LineSegment[] = [];
  const a2 = new Vector2();
  const b2 = new Vector2();
  const STEP_PX = 5;

  for (const q of facingQuads([...quads], camera.direction)) {
    // How far the face runs across the page, so the stroke count follows the
    // zoom rather than the metres.
    camera.worldToScreen(q[0], a2);
    camera.worldToScreen(q[1], b2);
    const wPx = a2.distanceTo(b2);
    camera.worldToScreen(q[3], b2);
    const hPx = a2.distanceTo(b2);
    if (wPx < 0.5 && hPx < 0.5) continue;
    // Sweep along whichever pair of edges is shorter on screen, so the strokes
    // run the long way and there are fewer of them.
    const alongW = wPx >= hPx;
    const sweepPx = alongW ? hPx : wPx;
    const runPx = alongW ? wPx : hPx;

    // A WASH MUST NOT SPILL OFF ITS OWN FACE.
    //
    // The first version put a stroke on each edge of the face and gave every
    // stroke the same generous width, which on a boiler twenty metres across
    // is invisible and on the eighty-millimetre lid of a pad-mounted
    // transformer erases the cabinet under it. Strokes are inset by half a
    // step and sized to the step they cover, so neighbours overlap by a pixel
    // and a half — enough that no ruling shows — while the outermost stroke
    // hangs less than a pixel over the edge.
    const n = Math.min(160, Math.max(1, Math.ceil(sweepPx / STEP_PX)));
    const widthPx = sweepPx / n + 1.5;
    // The capsule's end caps are round, so they reach half a width past each
    // endpoint. Pull the ends in by that much.
    const inset = runPx > 1e-3 ? Math.min(0.45, widthPx / 2 / runPx) : 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p0 = alongW
        ? q[0].clone().lerp(q[3], t) : q[0].clone().lerp(q[1], t);
      const p1 = alongW
        ? q[1].clone().lerp(q[2], t) : q[3].clone().lerp(q[2], t);
      const a = p0.clone().lerp(p1, inset);
      const b = p1.clone().lerp(p0, inset);
      out.push({
        a: [a.x, a.y, a.z], b: [b.x, b.y, b.z],
        widthPx, color, opacity,
      });
    }
  }
  return out;
}

/** Turn edges into segments at one opacity and weight. */
export function volumeSegments(
  edges: Edge[], widthPx: number, color: string, opacity: number
): LineSegment[] {
  return edges.map(([a, b]) => ({
    a: [a.x, a.y, a.z] as [number, number, number],
    b: [b.x, b.y, b.z] as [number, number, number],
    widthPx, color, opacity,
  }));
}

export const YARD_INK = INK.ink;
