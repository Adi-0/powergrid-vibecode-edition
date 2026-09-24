import * as THREE from 'three';
import { LineBatch, type LineStyle, type Vec3 } from '../render/lines';
import { FaceBatch, BOX_EDGES, BOX_FACES, boxCorners } from '../render/faces';
import { FlowBatch } from '../render/flow';
import { INK, PEN } from '../render/style';
import type { Symbol } from '../render/symbols';
import { projectToView, type IsoCamera } from '../render/iso';
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
/**
 * North as a unit vector in the frame's ground plane. Every level shares the System
 * frame's orientation (north up the sheet), so a level can sit inside the one above it
 * without turning; an equipment drawing is laid out square to the frame, which puts
 * its site grid ("plant north", `enIso`'s n) 45° west of true north.
 */
export const NORTH_MAP: [number, number] = [R, -R];
export const NORTH_ISO: [number, number] = NORTH_MAP;
/** Stagger for a stroke that never folds: something the level above draws in the same place. */
export const PERSIST = -1;

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
  constructor(public plan: (e: number, h: number, n: number) => Vec3 = en) {
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

  /**
   * A cylinder lying along east (a shaft, a stator frame), drawn as a technical drawing
   * draws one: its two end circles and the two silhouette lines the camera sees, over
   * ground-coloured faces for hidden-line removal. `cut` removes an angular window
   * (radians, about the axis, 0 = up, positive toward north) to show what is inside;
   * `inner` is the bore radius the cut exposes. Returns the silhouette points for picking.
   */
  cylinder(e0: number, e1: number, h: number, n: number, r: number, s: LineStyle = { width: PEN.outline, color: INK }, opts: { cut?: [number, number]; inner?: number; sides?: number } = {}): Vec3[] {
    const N = opts.sides ?? 36;
    const pt = (e: number, t: number, rr = r): Vec3 => this.plan(e, h + rr * Math.cos(t), n + rr * Math.sin(t));
    const inCut = (t: number) => {
      if (!opts.cut) return false;
      const [a, b] = opts.cut;
      const x = ((t - a) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      return x < (((b - a) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    };
    const f = { collapse: this.anchor, stagger: this.stagger };
    const ts = Array.from({ length: N + 1 }, (_, i) => (2 * Math.PI * i) / N);
    // faces: the barrel outside the cut, and the end caps (annuli when cut open)
    for (let i = 0; i < N; i++) {
      const tm = (ts[i]! + ts[i + 1]!) / 2;
      if (inCut(tm)) continue;
      this.faces.quad(pt(e0, ts[i]!), pt(e1, ts[i]!), pt(e1, ts[i + 1]!), pt(e0, ts[i + 1]!), f);
      const ri = opts.cut ? (opts.inner ?? 0) : 0;
      for (const e of [e0, e1]) this.faces.quad(pt(e, ts[i]!, ri), pt(e, ts[i]!), pt(e, ts[i + 1]!), pt(e, ts[i + 1]!, ri), f);
    }
    if (opts.cut && opts.inner)
      for (let i = 0; i < N; i++) if (!inCut((ts[i]! + ts[i + 1]!) / 2)) this.faces.quad(pt(e0, ts[i]!, opts.inner), pt(e1, ts[i]!, opts.inner), pt(e1, ts[i + 1]!, opts.inner), pt(e0, ts[i + 1]!, opts.inner), f);
    // end circles (outer arcs outside the cut; the bore where it shows)
    for (let i = 0; i < N; i++) {
      const tm = (ts[i]! + ts[i + 1]!) / 2;
      if (inCut(tm)) continue;
      for (const e of [e0, e1]) this.seg(pt(e, ts[i]!), pt(e, ts[i + 1]!), s);
    }
    if (opts.cut && opts.inner) {
      for (let i = 0; i < N; i++) if (!inCut((ts[i]! + ts[i + 1]!) / 2)) for (const e of [e0, e1]) this.seg(pt(e, ts[i]!, opts.inner), pt(e, ts[i + 1]!, opts.inner), { ...s, width: s.width * 0.8 });
      for (const t of opts.cut) {
        // the cut's faces: the shell's thickness along both edges, hatched as cut
        // material is in a section drawing (thin lines at 45°)
        this.faces.quad(pt(e0, t, opts.inner), pt(e1, t, opts.inner), pt(e1, t), pt(e0, t), f);
        this.seg(pt(e0, t), pt(e1, t), s);
        this.seg(pt(e0, t, opts.inner), pt(e1, t, opts.inner), s);
        const w = r - opts.inner;
        const hatch = { width: PEN.hairline, color: s.color };
        for (let e = e0 - w; e < e1; e += w * 0.45) {
          const a0 = Math.max(e, e0);
          const a1 = Math.min(e + w, e1);
          if (a1 <= a0) continue;
          const r0 = opts.inner + (a0 - e);
          const r1 = opts.inner + (a1 - e);
          this.seg(pt(a0, t, r0), pt(a1, t, r1), hatch);
        }
      }
    }
    // silhouettes: where the barrel turns away from the camera (extremes across the axis on screen)
    const [ax, ay] = projectToView(...this.plan(e0, h, n));
    const [bx, by] = projectToView(...this.plan(e1, h, n));
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    let tMin = 0;
    let tMax = 0;
    let dMin = Infinity;
    let dMax = -Infinity;
    for (let i = 0; i < 720; i++) {
      const t = (2 * Math.PI * i) / 720;
      const [px, py] = projectToView(...pt(e0, t));
      const d = (px - ax) * nx + (py - ay) * ny;
      if (d < dMin) (dMin = d), (tMin = t);
      if (d > dMax) (dMax = d), (tMax = t);
    }
    const sil: Vec3[] = [];
    for (const t of [tMin, tMax]) {
      sil.push(pt(e0, t), pt(e1, t));
      if (!inCut(t)) this.seg(pt(e0, t), pt(e1, t), s);
    }
    return sil;
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
