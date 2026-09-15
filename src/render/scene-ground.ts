/**
 * The place the network runs through.
 *
 * Until this layer existed, every drawing in the app was line work floating on
 * blank paper. That is how a schematic looks, and it is wrong for this project:
 * the whole claim is that you are LOOKING AT a power system, and a power system
 * is not in a void. It is down a street, behind a fence, between houses.
 *
 * So this draws the ground the feeder runs over — the street grid it follows,
 * the blocks it serves, the footprints of the buildings on them, and the fence
 * and access road of the substation it comes out of. None of it is electrical
 * and none of it is ever labelled. It exists to give scale and place, and it is
 * drawn at the lightest weight in the palette so it never competes with the
 * conductors: at a glance it is texture, and only on a second look is it houses.
 *
 * IT IS INVENTED, and the honesty register says so. The feeder route is
 * synthetic, so the streets around it are too. What is real is the SHAPE: block
 * sizes, lot widths and setbacks are the ordinary dimensions of American
 * suburban development, so the sense of scale a reader takes away is right even
 * though the particular houses are not.
 */

import { Vector3 } from 'three';
import { LineSegment } from './line-batch.js';
import { IsoCamera } from './iso.js';
import { INK } from './style.js';
import { FEEDER_NODES } from '../data/california/feeder.js';
import { nodeGround } from './scene-feeder.js';

/** Ordinary dimensions of American suburban development, in metres. */
const BLOCK = {
  /** Spacing of streets running the same way as the feeder's main. */
  alongM: 130,
  /** Spacing of the cross streets. */
  acrossM: 95,
  /** Half-width of the carriageway. */
  roadHalfM: 5.5,
  /** How far a house sits back from the kerb. */
  setbackM: 7,
  /** Footprint of one house. */
  houseM: [11, 14] as [number, number],
  /** Gap between neighbouring lots. */
  lotPitchM: 17,
};

/** How far either side of the feeder the neighbourhood is drawn. */
const EXTENT_M = 620;

export interface GroundDrawOptions {
  opacity?: number;
  /** Drawn only when a house is at least this many pixels across. */
  camera: IsoCamera;
}

interface Basis {
  /** Unit vector along the feeder's main, on the ground. */
  along: Vector3;
  /** Unit vector at right angles to it, on the ground. */
  across: Vector3;
  origin: Vector3;
}

/**
 * The grid's axes, taken from the feeder itself.
 *
 * The streets have to line up with the wires, because in the real world the
 * wires were put up along the streets. Deriving the basis from the route rather
 * than from the world axes means the two can never drift apart.
 */
function basis(): Basis {
  const a = nodeGround(FEEDER_NODES.find((n) => n.id === 'F00')!);
  const b = nodeGround(FEEDER_NODES.find((n) => n.id === 'F11')!);
  const along = b.clone().sub(a).setY(0).normalize();
  const across = new Vector3(-along.z, 0, along.x);
  // Centred on the middle of the route, so the grid reaches equally both ways.
  const origin = a.clone().lerp(b, 0.5);
  return { along, across, origin };
}

const BASIS = basis();

const at = (u: number, v: number): Vector3 =>
  BASIS.origin.clone()
    .addScaledVector(BASIS.along, u)
    .addScaledVector(BASIS.across, v);

/** Half the length of the route, plus a margin, in metres. */
const HALF_LENGTH_M = (() => {
  const a = nodeGround(FEEDER_NODES.find((n) => n.id === 'F00')!);
  const b = nodeGround(FEEDER_NODES.find((n) => n.id === 'F11')!);
  return a.distanceTo(b) / 2 + 250;
})();

export interface GroundDrawResult {
  segments: LineSegment[];
  bounds: { min: { x: number; z: number }; max: { x: number; z: number } };
}

/** The extent of the neighbourhood, for the compositor's culling. */
export function groundBounds(): GroundDrawResult['bounds'] {
  const corners = [
    at(-HALF_LENGTH_M, -EXTENT_M), at(HALF_LENGTH_M, -EXTENT_M),
    at(-HALF_LENGTH_M, EXTENT_M), at(HALF_LENGTH_M, EXTENT_M),
  ];
  return {
    min: { x: Math.min(...corners.map((c) => c.x)), z: Math.min(...corners.map((c) => c.z)) },
    max: { x: Math.max(...corners.map((c) => c.x)), z: Math.max(...corners.map((c) => c.z)) },
  };
}

export function drawGround(options: GroundDrawOptions): GroundDrawResult {
  const alpha = options.opacity ?? 1;
  const mpp = options.camera.metresPerPixel;
  const segments: LineSegment[] = [];
  if (alpha <= 0.004) return { segments, bounds: groundBounds() };

  // How present the ground is at a point, 0 at the edges of the neighbourhood
  // and 1 through the middle of it.
  //
  // Without this the grid ends in a hard rectangle, which is worse than having
  // no grid at all: a straight edge with nothing beyond it reads as a mistake,
  // where a fade reads as a drawing that stops caring.
  const presence = (u: number, v: number): number => {
    const fu = 1 - Math.min(1, Math.abs(u) / HALF_LENGTH_M) ** 3;
    const fv = 1 - Math.min(1, Math.abs(v) / EXTENT_M) ** 2;
    return Math.max(0, Math.min(1, fu * fv));
  };

  // A street drawn as a run of short spans, each at its own strength, so the
  // whole grid dissolves into the paper instead of stopping at a border.
  const SPANS = 26;
  const street = (
    u0: number, v0: number, u1: number, v1: number, widthPx: number
  ): void => {
    for (let i = 0; i < SPANS; i++) {
      const t0 = i / SPANS;
      const t1 = (i + 1) / SPANS;
      const mid = (t0 + t1) / 2;
      const f = presence(u0 + (u1 - u0) * mid, v0 + (v1 - v0) * mid);
      if (f <= 0.02) continue;
      const a = at(u0 + (u1 - u0) * t0, v0 + (v1 - v0) * t0);
      const b = at(u0 + (u1 - u0) * t1, v0 + (v1 - v0) * t1);
      segments.push({
        a: [a.x, a.y, a.z], b: [b.x, b.y, b.z],
        widthPx, color: INK.inkGhost, opacity: alpha * f,
      });
    }
  };

  // --- the street grid -----------------------------------------------------
  // Kerb lines rather than centre lines: a road reads as a road because it is
  // a gap of constant width, not because there is a line down the middle of it.
  const nAlong = Math.ceil(EXTENT_M / BLOCK.alongM);
  for (let i = -nAlong; i <= nAlong; i++) {
    const v = i * BLOCK.alongM;
    for (const off of [-BLOCK.roadHalfM, BLOCK.roadHalfM]) {
      street(-HALF_LENGTH_M, v + off, HALF_LENGTH_M, v + off, 0.7);
    }
  }
  const nAcross = Math.ceil(HALF_LENGTH_M / BLOCK.acrossM);
  for (let i = -nAcross; i <= nAcross; i++) {
    const u = i * BLOCK.acrossM;
    for (const off of [-BLOCK.roadHalfM, BLOCK.roadHalfM]) {
      street(u + off, -EXTENT_M, u + off, EXTENT_M, 0.7);
    }
  }

  // --- the buildings -------------------------------------------------------
  // Only once a house would be more than about six pixels across. Below that
  // they are indistinguishable from noise and cost thousands of segments.
  const housePx = BLOCK.houseM[0] / mpp;
  if (housePx < 3.5) return { segments, bounds: groundBounds() };

  const houseAlpha = alpha * Math.min(1, (housePx - 3.5) / 5);
  const rect = (centre: Vector3, halfU: number, halfV: number, f: number): void => {
    const p = [
      centre.clone().addScaledVector(BASIS.along, -halfU).addScaledVector(BASIS.across, -halfV),
      centre.clone().addScaledVector(BASIS.along, halfU).addScaledVector(BASIS.across, -halfV),
      centre.clone().addScaledVector(BASIS.along, halfU).addScaledVector(BASIS.across, halfV),
      centre.clone().addScaledVector(BASIS.along, -halfU).addScaledVector(BASIS.across, halfV),
    ];
    for (let i = 0; i < 4; i++) {
      segments.push({
        a: [p[i].x, p[i].y, p[i].z],
        b: [p[(i + 1) % 4].x, p[(i + 1) % 4].y, p[(i + 1) % 4].z],
        widthPx: 0.7, color: INK.inkGhost, opacity: houseAlpha * f,
      });
    }
  };

  // Lots face the streets that run the same way as the main, on both sides.
  for (let i = -nAlong; i <= nAlong; i++) {
    const v = i * BLOCK.alongM;
    for (const side of [-1, 1]) {
      const vHouse = v + side * (BLOCK.roadHalfM + BLOCK.setbackM + BLOCK.houseM[1] / 2);
      if (Math.abs(vHouse) > EXTENT_M) continue;
      for (let u = -HALF_LENGTH_M + BLOCK.lotPitchM; u < HALF_LENGTH_M; u += BLOCK.lotPitchM) {
        // Leave the cross streets clear.
        const nearCross = Math.abs(
          u - Math.round(u / BLOCK.acrossM) * BLOCK.acrossM
        ) < BLOCK.roadHalfM + 6;
        if (nearCross) continue;
        const f = presence(u, vHouse);
        if (f <= 0.05) continue;
        rect(at(u, vHouse), BLOCK.houseM[0] / 2, BLOCK.houseM[1] / 2, f);
      }
    }
  }

  return { segments, bounds: groundBounds() };
}
