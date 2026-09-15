/**
 * Where the state is, so the network has somewhere to be.
 *
 * The coastline was already in the drawing, as a single hairline. A hairline
 * polygon does not read as a coast — it reads as a shape — and with nothing
 * else on the page the whole system view came out as line work floating on
 * blank paper.
 *
 * So the Pacific side gets the convention engraved maps have used for three
 * hundred years: a few lines running parallel to the shore, stepping seaward
 * and fading as they go. It costs a handful of strokes, it is unmistakably
 * water without a drop of colour or a square inch of fill, and it turns the
 * outline into a coast — which turns the drawing into a place.
 *
 * The coastline itself is real: US Census Bureau cartographic boundary data.
 * What is drawn here is a rendering convention applied to it, not invented
 * geography, and no line here claims to be anything but "the sea is this way".
 */

import { Vector3 } from 'three';
import { LineSegment } from './line-batch.js';
import { INK } from './style.js';
import { CALIFORNIA_OUTLINE } from '../data/california/outline.js';
import { project } from '../data/california/geography.js';
import { toWorld } from './world.js';

/**
 * The Pacific coast, as the tail of the state boundary.
 *
 * The boundary polygon starts at the Oregon corner, runs east along the
 * northern border, south down the Nevada and Arizona lines, west along the
 * Mexican border, and then north up the coast back to where it started. So
 * everything from the southernmost point to the end IS the coast, and finding
 * it needs no hand-maintained index that could drift away from the data.
 */
const COAST: Vector3[] = (() => {
  let southIdx = 0;
  for (let i = 0; i < CALIFORNIA_OUTLINE.length; i++) {
    if (CALIFORNIA_OUTLINE[i][1] < CALIFORNIA_OUTLINE[southIdx][1]) southIdx = i;
  }
  return CALIFORNIA_OUTLINE
    .slice(southIdx)
    .map(([lon, lat]) => toWorld(project(lat, lon), 0));
})();

/** How far out each shore line sits, in metres, and how strongly it is drawn. */
const SHORE_LINES: { offsetM: number; opacity: number }[] = [
  { offsetM: 3_500, opacity: 0.55 },
  { offsetM: 9_000, opacity: 0.34 },
  { offsetM: 16_000, opacity: 0.20 },
  { offsetM: 25_000, opacity: 0.11 },
];

/**
 * The seaward normal at each vertex, averaged from the segments either side.
 *
 * Travelling north up the west coast, the sea is on the left. Averaging the
 * two adjacent segment normals keeps the offset lines smooth round a headland
 * instead of splaying at every corner.
 */
function seawardNormals(path: Vector3[]): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i < path.length; i++) {
    const before = path[Math.max(0, i - 1)];
    const after = path[Math.min(path.length - 1, i + 1)];
    const dx = after.x - before.x;
    const dz = after.z - before.z;
    const len = Math.hypot(dx, dz) || 1;
    // Rotate the direction of travel a quarter turn to the seaward side.
    out.push(new Vector3(dz / len, 0, -dx / len));
  }
  return out;
}

const NORMALS = seawardNormals(COAST);

export interface TerrainDrawResult {
  segments: LineSegment[];
}

export function drawTerrain(
  opacity: number,
  view: { min: { x: number; z: number }; max: { x: number; z: number } } | null
): TerrainDrawResult {
  const segments: LineSegment[] = [];
  if (opacity <= 0.004) return { segments };

  const cull = view ? (() => {
    const cx = (view.min.x + view.max.x) / 2;
    const cz = (view.min.z + view.max.z) / 2;
    const reach = 0.5 * Math.hypot(
      view.max.x - view.min.x, view.max.z - view.min.z) + 40_000;
    return { cx, cz, reach };
  })() : null;

  const near = (a: Vector3, b: Vector3): boolean => {
    if (!cull) return true;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    return Math.hypot(mx - cull.cx, mz - cull.cz) <= cull.reach;
  };

  for (const shore of SHORE_LINES) {
    for (let i = 0; i + 1 < COAST.length; i++) {
      const a = COAST[i].clone().addScaledVector(NORMALS[i], shore.offsetM);
      const b = COAST[i + 1].clone().addScaledVector(NORMALS[i + 1], shore.offsetM);
      if (!near(a, b)) continue;
      segments.push({
        a: [a.x, 0, a.z], b: [b.x, 0, b.z],
        widthPx: 0.7, color: INK.inkGhost, opacity: opacity * shore.opacity,
      });
    }
  }

  return { segments };
}

/** Extent of the coast plus its shore lines, for the compositor. */
export function terrainBounds(): {
  min: { x: number; z: number }; max: { x: number; z: number };
} {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const pad = SHORE_LINES[SHORE_LINES.length - 1].offsetM;
  for (const p of COAST) {
    minX = Math.min(minX, p.x - pad); maxX = Math.max(maxX, p.x + pad);
    minZ = Math.min(minZ, p.z - pad); maxZ = Math.max(maxZ, p.z + pad);
  }
  return { min: { x: minX, z: minZ }, max: { x: maxX, z: maxZ } };
}
