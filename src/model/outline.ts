import outlineJson from '../assets/geo/outline.json';
import { project } from './geo';

/**
 * State outlines (Natural Earth, public domain, bundled — never fetched at runtime),
 * projected into the system frame (km east, km south of the origin).
 */
interface OutlineFile {
  source: string;
  regions: Record<string, number[][][]>;
  cuts: number[][][];
  lakes: Array<{ name: string; ring: number[][] }>;
}
const file = outlineJson as unknown as OutlineFile;

export type Ring = Array<[number, number]>;

export interface Outlines {
  source: string;
  /** California's rings (mainland first, then islands), in km. */
  california: Ring[];
  neighbours: Array<{ id: string; rings: Ring[] }>;
  /** Where the neighbouring states are cut off (drawn as break lines). */
  cuts: Ring[];
  lakes: Array<{ name: string; ring: Ring }>;
}

const proj = (r: number[][]): Ring => r.map(([lon, lat]) => project(lat!, lon!));

export function outlines(): Outlines {
  const ca = (file.regions['CA'] ?? []).map(proj).sort((a, b) => b.length - a.length);
  const neighbours = ['OR', 'NV', 'AZ', 'BC'].filter((k) => file.regions[k]).map((k) => ({ id: k, rings: file.regions[k]!.map(proj) }));
  return {
    source: file.source,
    california: ca,
    neighbours,
    cuts: (file.cuts ?? []).map(proj),
    lakes: file.lakes.map((l) => ({ name: l.name, ring: proj(l.ring) })),
  };
}

/**
 * Line segments bucketed on a coarse grid, for "is this point on that boundary?"
 * questions asked once per outline edge when the sheet is built.
 */
export class SegmentIndex {
  private readonly cells = new Map<string, number[]>();
  private readonly segs: number[] = [];

  constructor(
    lines: readonly Ring[],
    closed: boolean,
    private readonly cell = 20,
  ) {
    for (const r of lines) {
      const n = closed ? r.length : r.length - 1;
      for (let i = 0; i < n; i++) {
        const a = r[i]!;
        const b = r[(i + 1) % r.length]!;
        const k = this.segs.length / 4;
        this.segs.push(a[0], a[1], b[0], b[1]);
        const [i0, i1] = [Math.floor(Math.min(a[0], b[0]) / cell), Math.floor(Math.max(a[0], b[0]) / cell)];
        const [j0, j1] = [Math.floor(Math.min(a[1], b[1]) / cell), Math.floor(Math.max(a[1], b[1]) / cell)];
        for (let ci = i0; ci <= i1; ci++)
          for (let cj = j0; cj <= j1; cj++) {
            const key = `${ci},${cj}`;
            const list = this.cells.get(key);
            if (list) list.push(k);
            else this.cells.set(key, [k]);
          }
      }
    }
  }

  /** Is (x, z) within `tol` km of any segment? (`tol` must not exceed the cell size.) */
  near(x: number, z: number, tol: number): boolean {
    const ci = Math.floor(x / this.cell);
    const cj = Math.floor(z / this.cell);
    const s = this.segs;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        for (const k of this.cells.get(`${ci + di},${cj + dj}`) ?? []) {
          const ax = s[4 * k]!;
          const az = s[4 * k + 1]!;
          const dx = s[4 * k + 2]! - ax;
          const dz = s[4 * k + 3]! - az;
          const L2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
          if (Math.hypot(ax + t * dx - x, az + t * dz - z) < tol) return true;
        }
      }
    return false;
  }
}
