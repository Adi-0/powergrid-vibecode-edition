import type * as THREE from 'three';
import { LineBatch, type Vec3 } from '../render/lines';
import { INK, INK_15, INK_60, PEN, type VoltageClass } from '../render/style';
import type { IsoCamera } from '../render/iso';
import type { Snapshot } from '../model/snapshot';
import type { CapBankState } from '../model/capState';
import { COMPONENTS } from '../data/components';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_ISO, PERSIST, Sketch } from './sketch';
import { GHOST } from './kit';
import type { CanPlace } from './capkit';

/**
 * The Capacitor can level: one can of a bank, cut open on the plane through its
 * terminals, drawn where it stands in its tier (it unfolds in place).
 *
 * Inside the sealed case, in insulating fluid, a stack of elements: each a pair of
 * long aluminium foils with thin plastic film between them, wound up and pressed flat.
 * One element is drawn pulled out of the stack, the end of its winding unrolled: two
 * plates, very large and very close together — which is all a capacitor is.
 *
 * What moves is the can's own solved state, slowed `slowdown` times: the charge on the
 * two plates (+ on one, − on the other, swapping each half cycle, in proportion to the
 * voltage across the can), the electric field in the film between them (arrows from
 * + to −), and the energy into and out of the can along its terminals (chevrons, in
 * and out twice a cycle). The film is drawn thousands of times thicker than it is.
 */

type P3 = [number, number, number];

export class CanLevel implements Level {
  readonly kind = 'capunit' as const;
  readonly unitKm = 0.001;
  readonly needsDetail = false;
  readonly flowScale = FLOW_SCALES.capunit;
  readonly north = NORTH_ISO;
  readonly labels: LabelSpec[] = [];
  readonly sk: Sketch;
  readonly seat: Vec3;
  state: CapBankState | null = null;
  private morphValue = 1;
  private field = new LineBatch('can-field');
  private arrows: Array<{ segs: number[]; e: number; n: number }> = [];
  private charge = new LineBatch('can-charge');
  /** Marks on the upper and lower plate: plus (two strokes each) and minus (one). */
  private marks: Array<{ plus: number[]; minus: number[]; upper: boolean }> = [];
  private flows: number[] = [];
  private travel = 0;
  private lastTime = -1;
  private extent: Vec3[] = [];
  private strip: { h: number; g: number };

  constructor(
    readonly place: CanPlace,
    plan: (e: number, h: number, n: number) => Vec3,
    readonly name: string,
    private readonly stateOf: (s: Snapshot) => CapBankState | null,
    readonly classes: VoltageClass[],
    readonly key: string,
    /** The grid shunt bank it belongs to, and that bank's level key. */
    readonly shunt: number,
    readonly bankKey: string,
  ) {
    const sk = (this.sk = new Sketch(plan));
    const C = COMPONENTS.capacitor;
    const c = C.can;
    const { e: ec, h: h0, n: nc } = place;
    const P = (e: number, h: number, n: number): Vec3 => sk.plan(e, h, n);
    const part = (what: string): Selection => ({ kind: 'part', id: key, what }) as Selection;
    const e1 = ec + c.t / 2;
    const ea = ec - c.t / 2;
    const n0 = nc - c.w / 2;
    const n1 = nc + c.w / 2;
    const top = h0 + c.h;
    this.seat = plan(ec, h0 + c.h / 2, nc);
    sk.anchor = plan(ec, h0 + c.h / 2, nc);
    const fs = () => ({ collapse: sk.anchor, stagger: sk.stagger });
    const wall = { width: PEN.outline, color: INK };
    const cutEdge = { width: PEN.bold, color: INK };
    const fine = { width: PEN.fine, color: INK };
    const hair = { width: PEN.hairline, color: INK };

    // ---- the case, cut on the plane through its terminals: the far half stands
    sk.stagger = PERSIST;
    sk.faces.quad(P(e1, h0, n0), P(e1, h0, n1), P(e1, top, n1), P(e1, top, n0), fs());
    for (const n of [n0, n1]) sk.faces.quad(P(ec, h0, n), P(e1, h0, n), P(e1, top, n), P(ec, top, n), fs());
    sk.faces.quad(P(ec, h0, n0), P(e1, h0, n0), P(e1, h0, n1), P(ec, h0, n1), fs());
    sk.faces.quad(P(ec, top, n0), P(e1, top, n0), P(e1, top, n1), P(ec, top, n1), fs());
    sk.poly([P(ec, top, n0), P(e1, top, n0), P(e1, top, n1), P(ec, top, n1)], wall);
    sk.seg(P(e1, h0, n1), P(e1, top, n1), wall);
    sk.seg(P(e1, h0, n0), P(e1, top, n0), wall);
    sk.seg(P(e1, h0, n0), P(ec, h0, n0), wall);
    sk.seg(P(e1, h0, n0), P(e1, h0, n1), { width: PEN.fine, color: INK });
    // the section's edges
    sk.poly([P(ec, h0, n0), P(ec, top, n0)], cutEdge);
    sk.poly([P(ec, h0, n1), P(ec, top, n1)], cutEdge);
    sk.seg(P(ec, h0, n0), P(ec, h0, n1), cutEdge);
    sk.seg(P(ec, top, n0), P(ec, top, n1), cutEdge);
    // the near half, cut away
    sk.poly([P(ec, top, n0), P(ea, top, n0), P(ea, top, n1), P(ec, top, n1)], GHOST);
    sk.poly([P(ec, h0, n0), P(ea, h0, n0), P(ea, h0, n1), P(ec, h0, n1)], GHOST);
    for (const n of [n0, n1]) sk.seg(P(ea, h0, n), P(ea, top, n), GHOST);
    // the terminals, on the plane of the cut
    const tn = [nc - c.w / 4, nc + c.w / 4];
    for (const n of tn) sk.seg(P(ec, top, n), P(ec, top + c.bush, n), fine);
    sk.target(part('case'), [P(ea, h0, n0), P(e1, top, n1)], true);
    sk.target(part('bushing'), [P(ec, top, tn[0]!), P(ec, top + c.bush, tn[1]!)], true);

    // ---- inside: the pack of elements in section, in its insulating wrap
    sk.stagger = 0.1;
    const N = C.elements;
    const pull = Math.floor(N / 2);
    const pb = h0 + 0.05;
    const pt = top - 0.1;
    const eh = (pt - pb) / N;
    const pn0 = n0 + 0.02;
    const pn1 = n1 - 0.02;
    sk.poly([P(ec, pb - 0.015, pn0 - 0.008), P(ec, pt + 0.015, pn0 - 0.008), P(ec, pt + 0.015, pn1 + 0.008), P(ec, pb - 0.015, pn1 + 0.008)], hair, true);
    for (let i = 0; i < N; i++) {
      if (i === pull) continue;
      const a = pb + i * eh + 0.004;
      const b = pb + (i + 1) * eh - 0.004;
      sk.faces.quad(P(ec, a, pn0), P(ec, a, pn1), P(ec, b, pn1), P(ec, b, pn0), { ...fs(), color: INK_15 });
      sk.poly([P(ec, a, pn0), P(ec, a, pn1), P(ec, b, pn1), P(ec, b, pn0)], fine, true);
      // the winding's turns, seen edge-on in the section
      for (const u of [0.33, 0.66]) sk.seg(P(ec, a + (b - a) * u, pn0 + 0.01), P(ec, a + (b - a) * u, pn1 - 0.01), hair);
    }
    sk.target(part('element'), [P(ec, pb, pn0), P(e1, pt, pn1)], true);
    // leads from the terminals down to the pack, and the discharge resistor across them
    sk.stagger = 0.2;
    for (const n of tn) sk.seg(P(ec, top, n), P(ec, pt + 0.015, n), fine);
    const zh = top - 0.045;
    const zig: Vec3[] = [P(ec, zh, tn[0]!)];
    const zn = 7;
    for (let i = 1; i < zn; i++) zig.push(P(ec, zh + (i % 2 ? 0.018 : -0.018), tn[0]! + ((tn[1]! - tn[0]!) * i) / zn));
    zig.push(P(ec, zh, tn[1]!));
    sk.poly(zig, fine);
    sk.target(part('resistor'), [P(ec, zh - 0.03, tn[0]!), P(ec, zh + 0.03, tn[1]!)], true);

    // ---- one element, drawn out of the pack toward the viewer, the end of its winding unrolled
    sk.stagger = 0.3;
    const xe = ea - 0.45;
    const xt = c.t - 0.03;
    const xh = pb + (pull + 0.5) * eh;
    sk.box(xe, xh - eh / 2 + 0.004, nc, xt, eh - 0.008, pn1 - pn0, fine);
    sk.target(part('element'), [P(xe - xt / 2, xh - eh / 2, pn0), P(xe + xt / 2, xh + eh / 2, pn1)], true);
    // its path out, as an exploded view draws one
    sk.seg(P(xe + xt / 2 + 0.03, xh, nc), P(ec - 0.01, xh, nc), { width: PEN.hairline, color: INK_60, dash: 'hidden' });
    // the unrolled length: two foils, film between (its gap drawn far wider than it is)
    const g = 0.2;
    const fx = xe - xt / 2;
    const L = 0.62;
    const fx1 = fx - L;
    this.strip = { h: xh, g };
    const plate = (hp: number, from: number) => {
      const out: Vec3[] = [P(fx, from, pn0), P(fx - 0.08, hp, pn0), P(fx1, hp, pn0), P(fx1, hp, pn1), P(fx - 0.08, hp, pn1), P(fx, from, pn1)];
      sk.poly(out, { width: PEN.medium, color: INK });
      sk.seg(P(fx - 0.08, hp, pn0), P(fx - 0.08, hp, pn1), fine);
      // a few hairlines across it, as a drawing shades a sheet
      for (let i = 1; i <= 3; i++) {
        const ee = fx - 0.08 - ((L - 0.08) * i) / 4;
        sk.seg(P(ee, hp, pn0), P(ee, hp, pn1), hair);
      }
    };
    plate(xh + g / 2, xh + eh / 2 - 0.006);
    plate(xh - g / 2, xh - eh / 2 + 0.006);
    // the film between, dashed
    sk.poly([P(fx - 0.08, xh, pn0 + 0.01), P(fx1 + 0.01, xh, pn0 + 0.01), P(fx1 + 0.01, xh, pn1 - 0.01), P(fx - 0.08, xh, pn1 - 0.01)], { width: PEN.hairline, color: INK_60, dash: 'hidden' }, true);
    sk.target(part('plate'), [P(fx1, xh + g / 2, pn0), P(fx, xh + g / 2, pn1)], true);
    sk.target(part('plate'), [P(fx1, xh - g / 2, pn0), P(fx, xh - g / 2, pn1)], true);
    sk.target(part('film'), [P(fx1, xh - g / 4, pn0), P(fx - 0.08, xh + g / 4, pn1)], true);

    // ---- the field between the plates, and the charge on them: set every frame
    this.field.mesh.renderOrder = 32;
    this.charge.mesh.renderOrder = 32;
    sk.group.add(this.field.mesh, this.charge.mesh);
    const fst = { width: 2, color: INK, collapse: sk.anchor, stagger: 0.4 };
    for (const u of [0.2, 0.42, 0.64, 0.86])
      for (const w of [0.3, 0.7]) {
        const e = fx - 0.08 - (L - 0.08) * u;
        const n = pn0 + (pn1 - pn0) * w;
        this.arrows.push({ e, n, segs: [0, 1, 2].map(() => this.field.segment(sk.anchor, sk.anchor, fst)) });
      }
    this.field.commit();
    const mst = { width: 1.8, color: INK, collapse: sk.anchor, stagger: 0.4 };
    // on the plates' facing sides, where the charge gathers; the marks stand upright, square
    // to the view (screen-horizontal is plan (e − n)), between the field's arrows
    const r = 0.025;
    const sx = r * Math.SQRT1_2;
    for (const upper of [true, false]) {
      const hp = xh + (upper ? 1 : -1) * (g / 2 - r * 1.4);
      for (const u of [0.12, 0.31, 0.5, 0.69, 0.88])
        for (const w of [0.18, 0.82]) {
          const e = fx - 0.08 - (L - 0.08) * u;
          const n = pn0 + (pn1 - pn0) * w;
          const minus = [this.charge.segment(P(e - sx, hp, n + sx), P(e + sx, hp, n - sx), mst)];
          const plus = [this.charge.segment(P(e - sx, hp, n + sx), P(e + sx, hp, n - sx), mst), this.charge.segment(P(e, hp - r, n), P(e, hp + r, n), mst)];
          this.marks.push({ plus, minus, upper });
        }
    }
    this.charge.commit();

    // ---- energy into and out of the can, along its terminals
    sk.stagger = 0.35;
    for (const n of tn) this.flows.push(sk.flowSeg(P(ec, top + c.bush, n), P(ec, top + 0.02, n)));

    // ---- names
    this.labels.push({ id: 'can:case', text: 'Sealed steel case, full of insulating fluid', anchor: P(e1, h0 + 0.15, n1), priority: 6, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'can:pack', text: 'Elements: foil and film wound flat, stacked', anchor: P(ec, pb + 2.5 * eh, n1 - 0.05), priority: 8, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'can:element', text: 'One element, drawn out, its winding part unrolled', anchor: P(xe, xh + eh / 2, pn1), priority: 7, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'can:plateA', text: 'Aluminium foil: one plate', anchor: P(fx1, xh + g / 2, pn0), priority: 9, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'can:plateB', text: 'The other plate', anchor: P(fx1, xh - g / 2, pn0), priority: 9, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'can:film', text: 'Plastic film between: the field is in it (far thinner than drawn)', anchor: P(fx1, xh, pn1), priority: 8, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'can:resistor', text: 'Discharge resistor', anchor: P(ec, zh, nc), priority: 6, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'can:terminals', text: 'Terminals', anchor: P(ec, top + c.bush, tn[1]!), priority: 5, minZoom: 0, kind: 'equip' });

    // fit: the can, its terminals, and what is drawn out of it
    for (const e of [fx1 - 0.05, e1]) for (const n of [n0, n1]) this.extent.push(P(e, h0, n), P(e, top + c.bush, n));
    sk.stagger = 0;
    sk.commit();
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  get tau(): number {
    return Math.max(0, this.lastTime) / COMPONENTS.slowdown;
  }

  /** The voltage across the can as a fraction of its peak, and the power into it, kW (phase a's can). */
  private now(): { v: number; p: number } {
    const st = this.state;
    if (!st || st.vCan <= 0) return { v: 0, p: 0 };
    const th = (st.vaDeg * Math.PI) / 180;
    const x = st.omega * this.tau + th;
    const v = Math.cos(x);
    const i = Math.cos(x + Math.PI / 2);
    // p = v·i with both at their peaks: √2|V|·√2|I|·cos·cos = 2·Q_can·cos x·cos(x + 90°)
    return { v, p: 2 * st.qCan * v * i };
  }

  applySnapshot(s: Snapshot): void {
    this.state = this.stateOf(s);
    this.show(0);
  }

  private show(dt: number): void {
    const { v, p } = this.now();
    const sk = this.sk;
    const { h, g } = this.strip;
    // field arrows from the + plate to the − plate, as long as the field is strong
    const len = Math.abs(v) * g * 0.8;
    const dir = v >= 0 ? -1 : 1;
    for (const a of this.arrows) {
      const y0 = h - (dir * len) / 2;
      const y1 = h + (dir * len) / 2;
      const hd = Math.min(0.025, len * 0.35);
      const tip = sk.plan(a.e, y1, a.n);
      this.field.setEnds(a.segs[0]!, sk.plan(a.e, y0, a.n), tip);
      this.field.setEnds(a.segs[1]!, tip, sk.plan(a.e - hd * 0.6, y1 - dir * hd, a.n));
      this.field.setEnds(a.segs[2]!, tip, sk.plan(a.e + hd * 0.6, y1 - dir * hd, a.n));
      for (const s of a.segs) this.field.setAlpha(s, len > 0.004 ? 1 : 0);
    }
    // the charge: + on the upper plate while the voltage is positive, − on the lower
    const q = Math.min(1, Math.abs(v) * 1.2);
    for (const m of this.marks) {
      const positive = m.upper === v >= 0;
      for (const s of m.plus) this.charge.setAlpha(s, positive ? q : 0);
      for (const s of m.minus) this.charge.setAlpha(s, positive ? 0 : q);
    }
    // energy along the terminals
    const sc = this.flowScale;
    const st = this.state;
    const on = !!st && st.vCan > 0;
    this.travel += chevronSpeedFor(p, sc) * dt;
    for (const fl of this.flows)
      sk.flow.set(fl, { sizePx: chevronSizeFor(p, sc), speed: (p >= 0 ? 1 : -1) * 1e-6, phase: -this.travel, side: 0, color: INK, alpha: on ? Math.min(1, (2.5 * Math.abs(p)) / Math.max(1e-9, st!.qCan)) : 0 });
  }

  highlight(_sel: Selection | null): Set<string> | null {
    return null;
  }

  pick(sx: number, sy: number, cam: IsoCamera): Selection | null {
    return this.sk.pick(sx, sy, cam);
  }

  frame(o: FrameInfo): void {
    const dt = this.lastTime < 0 ? 0 : Math.max(0, o.time - this.lastTime);
    this.lastTime = o.time;
    this.show(dt);
    this.sk.frame(o);
    this.field.frame(o);
    this.charge.frame(o);
  }

  set morph(m: number) {
    this.morphValue = m;
    this.sk.morph = m;
    this.field.morph = m;
    this.charge.morph = m;
    const shown = Math.max(0, Math.min(1, (m - 0.85) / 0.15));
    this.field.opacity = shown;
    this.charge.opacity = shown;
  }

  get morph(): number {
    return this.morphValue;
  }

  fitPoints(): Vec3[] {
    return this.extent;
  }
}

export type { P3 };
