import type { Grid } from '../model/grid';
import { projectToView } from '../render/iso';
import { voltageClassFor, type VoltageClass } from '../render/style';

/**
 * The circuits that leave a site, as the System sheet draws them: which way each one
 * goes and how far it is set off its corridor's centre line (parallel circuits are
 * drawn a few pixels apart). A level that draws the inside of a site (a yard, a plant,
 * a neighbourhood) runs each circuit out to a point on its true bearing, carrying the
 * same sideways offset, so the System's stroke picks it up there without a step.
 *
 * Every level shares the System frame's orientation (north up the sheet), so a
 * bearing in the System frame is the same direction in any level below it.
 */
export interface SiteExit {
  branch: number;
  kv: number;
  cls: VoltageClass;
  /** The site at the far end. */
  far: string;
  /** Unit vector toward the far site in the frame's ground plane (x, z). */
  dir: [number, number];
  /** The System's sideways offset for this circuit at this site, CSS px (x right, y up). */
  sidePx: [number, number];
}

export function siteCentre(grid: Grid, siteId: string): [number, number] {
  const b = grid.buses.find((x) => x.site.id === siteId)!;
  return [b.x, b.z];
}

export function siteExits(grid: Grid, siteId: string): SiteExit[] {
  const out: SiteExit[] = [];
  for (const br of grid.branches) {
    if (br.kind !== 'line') continue;
    const here = br.from.site.id === siteId ? 'from' : br.to.site.id === siteId ? 'to' : null;
    if (!here) continue;
    const far = here === 'from' ? br.to.site.id : br.from.site.id;
    const [ax, az] = siteCentre(grid, br.from.site.id);
    const [bx, bz] = siteCentre(grid, br.to.site.id);
    const [cx, cz] = siteCentre(grid, siteId);
    const [fx, fz] = siteCentre(grid, far);
    const L = Math.hypot(fx - cx, fz - cz) || 1;
    const cls = voltageClassFor(br.kv);
    // the System draws the circuit from its from-site to its to-site, offset along the
    // screen normal of that direction (see SystemLevel.sideOf)
    const n = br.circuitsInCorridor;
    const side = (br.circuit - (n + 1) / 2) * (cls.weight + 3);
    const [pax, pay] = projectToView(ax, 0, az);
    const [pbx, pby] = projectToView(bx, 0, bz);
    const pl = Math.hypot(pbx - pax, pby - pay) || 1;
    out.push({
      branch: br.index,
      kv: br.kv,
      cls,
      far,
      dir: [(fx - cx) / L, (fz - cz) / L],
      sidePx: [(-(pby - pay) / pl) * side, ((pbx - pax) / pl) * side],
    });
  }
  return out;
}

/** GLSL's smoothstep, for following a stroke's unfolding on the CPU. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
