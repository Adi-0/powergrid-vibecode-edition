import * as THREE from 'three';
import { LineBatch, type LineStyle, type Vec3 } from '../render/lines';
import { FaceBatch, BOX_EDGES, BOX_FACES, boxCorners } from '../render/faces';
import { FlowBatch } from '../render/flow';
import { INK, PEN } from '../render/style';
import type { Symbol } from '../render/symbols';
import type { IsoCamera } from '../render/iso';
import type { FrameInfo, Selection } from './level';

/**
 * A drawing kit for the levels below the transmission system: equipment as boxes
 * (ground-coloured faces for hidden-line removal, ink edges), conductors as strokes,
 * one-line symbols as screen-constant glyphs, power as chevrons — every piece of it
 * able to fold into a single point (the node the level occupies one level up) and
 * unfold again, in a staggered order the level chooses.
 *
 * Plan coordinates are metres east and north of the level's origin. A map-like level
 * (the feeder) turns them 45° as the System frame does, so north is up the screen; an
 * equipment drawing (substation, service) keeps them square to the frame so the camera
 * sees every box at 45°.
 */
export const R = Math.SQRT1_2;
/** (east, height, north) in metres → frame point, north up the screen (maps: the feeder). */
export const en = (e: number, h: number, n: number): Vec3 => [(e + n) * R, h, (e - n) * R];
/**
 * (east, height, north) → frame point with the plan square to the frame, so the camera
 * sees it at 45° and every box shows two sides and its top — the drawing of equipment
 * (substation, service). North then points to the upper right.
 */
export const enIso = (e: number, h: number, n: number): Vec3 => [e, h, -n];
/** North as a unit vector in the frame's ground plane, for each plan convention. */
export const NORTH_MAP: [number, number] = [R, -R];
export const NORTH_ISO: [number, number] = [0, -1];

interface Target {
  sel: Selection;
  pts: Vec3[];
  box?: boolean;
}

export class Sketch {
  readonly group = new THREE.Group();
  readonly faces = new FaceBatch('sk-faces');
  readonly lines = new LineBatch('sk-lines');
  readonly glyphs = new LineBatch('sk-glyphs');
  readonly marks = new LineBatch('sk-marks');
  readonly flow = new FlowBatch('sk-flow');
  /** Where everything folds to. */
  anchor: Vec3 = [0, 0, 0];
  /** When the next items unfold, in [0, 0.5] of the morph. */
  stagger = 0;
  private targets: Target[] = [];

  /** `plan`: how (east, height, north) become frame points — `en` or `enIso`. */
  constructor(readonly plan: (e: number, h: number, n: number) => Vec3 = en) {
    this.glyphs.mesh.renderOrder = 30;
    this.marks.mesh.renderOrder = 31;
    this.group.add(this.faces.mesh, this.lines.mesh, this.flow.mesh, this.glyphs.mesh, this.marks.mesh);
  }

  private fold(s: LineStyle): LineStyle {
    return { collapse: this.anchor, stagger: this.stagger, ...s };
  }

  seg(a: Vec3, b: Vec3, s: LineStyle): number {
    return this.lines.segment(a, b, this.fold(s));
  }

  poly(pts: Vec3[], s: LineStyle, closed = false): [number, number] {
    const first = this.lines.count;
    for (let i = 0; i + 1 < pts.length + (closed ? 1 : 0); i++) this.seg(pts[i]!, pts[(i + 1) % pts.length]!, s);
    return [first, this.lines.count - first];
  }

  /** A box standing on (e, h, n) with its size along east, up and north. Returns its corners. */
  box(e: number, h: number, n: number, se: number, sh: number, sn: number, s: LineStyle = { width: PEN.outline, color: INK }): Vec3[] {
    const c = boxCorners(-se / 2, 0, -sn / 2, se / 2, sh, sn / 2).map(([x, y, z]) => this.plan(e + x, h + y, n + z));
    const f = { collapse: this.anchor, stagger: this.stagger };
    for (const q of BOX_FACES) this.faces.quad(c[q[0]]!, c[q[1]]!, c[q[2]]!, c[q[3]]!, f);
    for (const [i, j] of BOX_EDGES) this.seg(c[i]!, c[j]!, s);
    return c;
  }

  symbol(at: Vec3, sym: Symbol, width: number, dx = 0, dy = 0, color = INK): [number, number] {
    const first = this.glyphs.count;
    sym.polys.forEach((poly, i) =>
      this.glyphs.glyph(
        at,
        poly.map(([x, y]) => [x + dx, y + dy] as [number, number]),
        { width, color, collapse: this.anchor, stagger: this.stagger },
        sym.closed[i],
      ),
    );
    return [first, this.glyphs.count - first];
  }

  /** A chevron train along a conductor (set by the level on each snapshot). */
  flowSeg(a: Vec3, b: Vec3, side = 0): number {
    return this.flow.segment(a, b, { sizePx: 0, speed: 0, side, color: INK, alpha: 0 });
  }

  /** Register something the reader can pick: a polyline, or a box by its corners. */
  target(sel: Selection, pts: Vec3[], box = false): void {
    this.targets.push({ sel, pts, box });
  }

  pick(sx: number, sy: number, cam: IsoCamera): Selection | null {
    const v = new THREE.Vector3();
    const p = new THREE.Vector2();
    let best: Selection | null = null;
    let bestD = 8;
    for (const t of this.targets) {
      const sp = t.pts.map((w) => {
        cam.worldToScreen(v.set(w[0], w[1], w[2]).applyMatrix4(this.group.matrixWorld), p);
        return [p.x, p.y] as [number, number];
      });
      let d = Infinity;
      if (t.box) {
        const xs = sp.map((q) => q[0]);
        const ys = sp.map((q) => q[1]);
        if (sx >= Math.min(...xs) && sx <= Math.max(...xs) && sy >= Math.min(...ys) && sy <= Math.max(...ys)) d = 0;
      } else if (sp.length === 1) d = Math.hypot(sp[0]![0] - sx, sp[0]![1] - sy);
      else
        for (let i = 0; i + 1 < sp.length; i++) {
          const [ax, ay] = sp[i]!;
          const [bx, by] = sp[i + 1]!;
          const dx = bx - ax;
          const dy = by - ay;
          const L2 = dx * dx + dy * dy || 1;
          const u = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / L2));
          d = Math.min(d, Math.hypot(ax + u * dx - sx, ay + u * dy - sy));
        }
      if (d < bestD || (d === 0 && bestD > 0)) {
        bestD = d;
        best = t.sel;
      }
    }
    return best;
  }

  commit(): void {
    this.faces.commit();
    this.lines.commit();
    this.glyphs.commit();
    this.marks.commit();
    this.flow.commit();
  }

  /** 0: folded into the anchor; 1: unfolded. Chevrons appear only once it has unfolded. */
  set morph(m: number) {
    this.lines.morph = m;
    this.glyphs.morph = m;
    this.marks.morph = m;
    this.faces.morph = m;
    this.flow.opacity = Math.max(0, Math.min(1, (m - 0.85) / 0.15));
    this.marks.opacity = Math.max(0, Math.min(1, (m - 0.85) / 0.15));
  }

  frame(o: FrameInfo): void {
    for (const b of [this.lines, this.glyphs, this.marks]) b.frame(o);
    this.flow.frame(o.width, o.height, o.pixelRatio, o.time);
    this.faces.frame(o.pixelRatio);
  }
}
