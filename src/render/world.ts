/**
 * Placing the network in world space.
 *
 * Geography arrives as kilometres east and north of a projection origin. World
 * space is metres, with X east, Z south (north is -Z) and Y up.
 *
 * VERTICAL LAYERING, AND AN HONEST NOTE ABOUT IT
 *
 * At the system and region levels the voltage classes are drawn at different
 * heights, so the 500 kV backbone floats above the 230 kV network and the
 * hierarchy is visible as physical layering rather than asserted in a legend.
 * Crossings then resolve correctly: the higher circuit occludes the lower one,
 * which is what hidden-line removal is for.
 *
 * Those heights are NOT real. A 500 kV tower is about 50 metres tall; at a
 * scale where the whole state fits on a screen that is three hundredths of a
 * pixel. So the separation is specified in SCREEN PIXELS and converted to world
 * metres at the current zoom, which keeps the layers legible at every scale the
 * system view is used at. This is the same device a geological cross-section
 * uses when it exaggerates the vertical scale, and like that drawing, this one
 * says so: the legend carries the exaggeration, and it is in the model-honesty
 * register.
 *
 * Below the region level the exaggeration is retired and true heights are used,
 * because at substation scale a busbar really is eight metres up and the
 * drawing can simply say so.
 */

import { Vector3 } from 'three';
import { project } from '../data/california/geography.js';
import { Site } from '../data/california/sites.js';

/** Convert projected kilometres to world metres. */
export function toWorld(km: { x: number; y: number }, heightM = 0): Vector3 {
  return new Vector3(km.x * 1000, heightM, -km.y * 1000);
}

/** World position of a site on the ground plane. */
export function siteGround(site: Site): Vector3 {
  return toWorld(project(site.lat, site.lon), 0);
}

/**
 * Height of each voltage class above the ground, in SCREEN PIXELS at the
 * current zoom.
 *
 * The gaps have to be large enough that a 500 kV circuit and a 230 kV circuit
 * following the SAME corridor are clearly apart on the page. They very often
 * do follow the same corridor, because the right-of-way was bought once. If the
 * layers sit close together the hidden-line removal does its job correctly and
 * the upper circuit simply erases the lower one for its whole length, which is
 * true to the geometry and useless as a drawing.
 *
 * A height h projects up the page by h·cos(35.26°) ≈ 0.816 h, so these values
 * give roughly 20 px between the 500 kV and 230 kV layers and 13 px between
 * 230 kV and 115 kV — comfortably more than the width of a halo.
 */
export const LAYER_HEIGHT_PX: Record<number, number> = {
  500: 52,
  230: 28,
  115: 12,
  12.47: 3,
  0.24: 0,
};

/** The nearest layer height for a nominal voltage, in screen pixels. */
export function layerHeightPx(kV: number): number {
  let best = 0;
  let bestDiff = Infinity;
  for (const [k, px] of Object.entries(LAYER_HEIGHT_PX)) {
    const d = Math.abs(Math.log(kV / Number(k)));
    if (d < bestDiff) {
      bestDiff = d;
      best = px;
    }
  }
  return best;
}

/**
 * The vertical exaggeration currently in force, as a plain multiple, so the
 * legend can state it. At system zoom the 500 kV layer sits 30 px up, which at
 * 1,600 metres per pixel is 48 km — against a real tower height of about 50 m,
 * an exaggeration of roughly 1,000x.
 */
export function verticalExaggeration(metresPerPixel: number, realHeightM = 50): number {
  return (LAYER_HEIGHT_PX[500] * metresPerPixel) / realHeightM;
}

/**
 * Screen-space separation between two voltage layers, in pixels. Used to check
 * that the layers really are further apart than a halo is wide.
 */
export const layerSeparationPx = (kvA: number, kvB: number): number =>
  Math.abs(layerHeightPx(kvA) - layerHeightPx(kvB)) * Math.cos(Math.atan(1 / Math.SQRT2));

/** World-space bounds of a set of points, on the ground plane. */
export function boundsOf(points: readonly Vector3[]): {
  min: { x: number; z: number };
  max: { x: number; z: number };
} {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { min: { x: minX, z: minZ }, max: { x: maxX, z: maxZ } };
}

/**
 * Offset parallel circuits so they can be told apart.
 *
 * Three circuits on the same route are three separate pieces of equipment that
 * can be switched and can fail independently, and the whole lesson of Path 15
 * is that there are three of them. Drawing them on top of each other would hide
 * that. They are spread perpendicular to the route by a constant screen-space
 * distance, which keeps the spacing readable at every zoom.
 */
export function circuitOffsetPx(index: number, total: number, spacingPx = 6.4): number {
  if (total <= 1) return 0;
  return (index - (total - 1) / 2) * spacingPx;
}
