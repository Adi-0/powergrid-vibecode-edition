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

// ---------------------------------------------------------------------------
// Where the people are
// ---------------------------------------------------------------------------

/**
 * Demand, as a dot-density map.
 *
 * The transmission drawing shows where the wires go and says nothing about why
 * they go there. At region scale that is the whole question: the network is
 * shaped the way it is because of where the load is, and with only line work on
 * the page a reader has no way to see that.
 *
 * So each dot is a fixed quantity of peak demand, scattered around the site
 * that carries it. Dot density is the oldest honest way to draw a quantity on a
 * map — it does not claim a boundary, it does not need a colour scale, and
 * counting the dots gives the number back. The legend says what one dot is
 * worth, so it is readable rather than decorative.
 *
 * WHAT IT IS NOT: a map of where the cities are. It is where the MODEL puts its
 * load, which is at the substations that serve those cities. The scatter radius
 * is a drawing choice, not data, and the honesty register says so.
 */
export const MW_PER_DOT = 25;

/** Deterministic, so the scatter does not shimmer from frame to frame. */
function hashed(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

export interface DemandSite {
  id: string;
  ground: Vector3;
  /** Demand at the hour being drawn, MW. Decides HOW MANY dots are drawn. */
  loadMW: number;
  /** Demand at annual peak, MW. Decides HOW FAR the scatter reaches. */
  peakLoadMW: number;
}

/**
 * Every dot a site will ever need, in the order they fill in.
 *
 * The scatter has to be STABLE. Load varies through the day, and generating it
 * from the megawatts on show re-rolled the dice every hour: the dots jittered
 * like static as the reader scrubbed, and every still frame of it looked
 * perfect. So the extent comes from the site's ANNUAL PEAK, which is a property
 * of the place and does not move; the positions are generated once and sorted
 * from the centre outward; and the hour decides only how many of them are
 * drawn.
 *
 * A city then grows and shrinks with demand through the day, from the middle,
 * which is both steady to look at and the right thing for a dot-density map to
 * do when the quantity it is drawing changes.
 */
const dotCache = new Map<string, Vector3[]>();

/** Up to this many dots per site, so one huge load cannot swamp a frame. */
const MAX_DOTS = 420;

function dotsFor(site: DemandSite): Vector3[] {
  const hit = dotCache.get(site.id);
  if (hit) return hit;

  const radius = scatterRadiusM(site.peakLoadMW);
  const rand = hashed(site.id);
  const out: { p: Vector3; r: number }[] = [];
  for (let i = 0; i < MAX_DOTS; i++) {
    const angle = rand() * Math.PI * 2;
    // Square root of a uniform gives an even areal density rather than a
    // clump at the centre.
    const r = radius * Math.sqrt(rand());
    out.push({
      p: new Vector3(
        site.ground.x + r * Math.cos(angle), 0, site.ground.z + r * Math.sin(angle)),
      r,
    });
  }
  out.sort((a, b) => a.r - b.r);
  const points = out.map((o) => o.p);
  dotCache.set(site.id, points);
  return points;
}

/**
 * The scatter of one site, in screen pixels across, below which it is not drawn.
 *
 * A dot map only says anything if the dots are separate. Seen from far enough
 * away that a whole city is twenty pixels wide, four hundred dots land on top of
 * each other, the site's own symbol sits over the middle of them, and the result
 * is a smudge that carries no count and no shape — while still costing a
 * thousand primitives a frame. So a place's demand appears only once there is
 * room to read it, which is the same rule the houses and the pole names follow.
 */
const DOTS_MIN_RADIUS_PX = 42;
const DOTS_FULL_RADIUS_PX = 88;

/** How far the scatter for a site reaches, world metres. */
function scatterRadiusM(peakLoadMW: number): number {
  // Bigger loads spread further, because a bigger load is a bigger place —
  // but a load centre is compact, and too wide a scatter turns a city into a
  // haze that says nothing.
  return 1_800 + 520 * Math.sqrt(Math.max(0, peakLoadMW));
}

export function drawDemandDots(
  sites: Iterable<DemandSite>,
  opacity: number,
  view: { min: { x: number; z: number }; max: { x: number; z: number } } | null,
  metresPerPixel: number
): LineSegment[] {
  const segments: LineSegment[] = [];
  if (opacity <= 0.004) return segments;

  const cull = view ? (() => {
    const cx = (view.min.x + view.max.x) / 2;
    const cz = (view.min.z + view.max.z) / 2;
    const reach = 0.5 * Math.hypot(
      view.max.x - view.min.x, view.max.z - view.min.z) + 20_000;
    return { cx, cz, reach };
  })() : null;

  for (const site of sites) {
    if (site.loadMW < MW_PER_DOT) continue;
    if (cull && Math.hypot(site.ground.x - cull.cx, site.ground.z - cull.cz)
      > cull.reach + 40_000) continue;

    const radiusPx = scatterRadiusM(site.peakLoadMW) / metresPerPixel;
    const near = Math.min(1, Math.max(0,
      (radiusPx - DOTS_MIN_RADIUS_PX)
      / (DOTS_FULL_RADIUS_PX - DOTS_MIN_RADIUS_PX)));
    if (near <= 0.02) continue;

    const want = Math.min(MAX_DOTS, Math.round(site.loadMW / MW_PER_DOT));
    const all = dotsFor(site);
    for (let i = 0; i < want && i < all.length; i++) {
      const d = all[i];
      if (cull && Math.hypot(d.x - cull.cx, d.z - cull.cz) > cull.reach) continue;
      // A dot is a zero-length stroke, which the line batch renders as a round
      // cap — one primitive, no special case.
      segments.push({
        a: [d.x, 0, d.z], b: [d.x, 0, d.z],
        widthPx: 1.6, color: INK.inkFaint, opacity: opacity * near,
      });
    }
  }
  return segments;
}
