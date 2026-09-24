import type * as THREE from 'three';
import { LineBatch, type Vec3 } from '../render/lines';
import { INK, INK_35, INK_60, PEN, voltageClassFor, type VoltageClass } from '../render/style';
import type { IsoCamera } from '../render/iso';
import type { Snapshot } from '../model/snapshot';
import type { PoleTopState } from '../model/poletopState';
import { COMPONENTS } from '../data/components';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_ISO, PERSIST, Sketch, enIso } from './sketch';
import { GHOST, insulator } from './kit';

/**
 * The Pole-top level: the transformer on one pole, cut open on the vertical plane
 * through its axis, in the Service level's frame (it unfolds where the can hangs).
 *
 * Inside the can, a shell-form core: two loops of steel sheet side by side, their
 * shared middle leg through the coil. The coil, in section on both sides of that leg:
 * the secondary innermost, in two halves one above the other, and the primary outside
 * it. Turns are drawn in their real ratio — sixty primary turns for every secondary
 * turn in each half — so a secondary turn is sixty times the cross-section of a primary
 * one: it carries sixty times the current.
 *
 * The primary comes in on the bushing on the lid (H1); its other end is bonded to the
 * tank and the neutral (H2). The secondary's three leads come out on the side: X1 and
 * X3, the ends, and X2, the centre tap, bonded to the tank, grounded, and carried on as
 * the neutral. Each leg to neutral is half the secondary (120 V), and across both legs
 * the whole of it (240 V). Chevrons carry each leg's power out to the secondary; flux
 * arrows show the core's flux up the middle leg and back down the two outer ones.
 */

const CAN = { e: 0.9, n: 0, h: 8.6, r: 0.42, half: 0.8 };

export class PoleTopLevel implements Level {
  readonly kind = 'poletop' as const;
  readonly unitKm = 0.001;
  readonly needsDetail = true;
  readonly flowScale = FLOW_SCALES.poletop;
  readonly north = NORTH_ISO;
  readonly labels: LabelSpec[] = [];
  readonly sk = new Sketch(enIso);
  readonly seat: Vec3 = enIso(CAN.e, 0, CAN.n);
  readonly name: string;
  private morphValue = 1;
  private flux = new LineBatch('pt-flux');
  private arrows: Array<{ e: number; h: number; de: number; dh: number; w: number; segs: [number, number, number] }> = [];
  private fluxAmp = 0;
  private legFlows: [number, number] = [-1, -1];
  private extent: Vec3[] = [];
  /** The coil's dimensions, for the inspector (turns drawn). */
  readonly turns = { primary: COMPONENTS.poletop.drawnPrimary, secondaryHalf: COMPONENTS.poletop.drawnHalf };
  state: PoleTopState | null = null;

  constructor(
    readonly transformerId: string,
    readonly kva: number,
    /** Where the secondary's three wires meet the triplex along the street (this frame). */
    readonly secondaryAt: Vec3,
    private readonly stateOf: (s: Snapshot) => PoleTopState | null,
  ) {
    const sk = this.sk;
    this.name = `Transformer ${transformerId.slice(2)}, opened`;
    const { e: ce, n: cn, h: ch, r, half } = CAN;
    const P = (e: number, h: number, n: number): Vec3 => enIso(e, h, n);
    sk.anchor = P(ce, ch, cn);
    const part = (what: string, sub?: string): Selection => ({ kind: 'part', id: `pt:${transformerId}`, what, ...(sub ? { sub } : {}) }) as Selection;
    const fs = () => ({ collapse: sk.anchor, stagger: sk.stagger });
    const N = 32;
    const at = (t: number, h: number, rr = r): Vec3 => P(ce + rr * Math.cos(t), h, cn + rr * Math.sin(t));
    const lo = ch - half;
    const hi = ch + half;

    // ---- the can, cut on the plane through its axis: the back half stands, the front half and the lid are an outline
    sk.stagger = PERSIST;
    for (let i = 0; i < N; i++) {
      const t0 = (2 * Math.PI * i) / N;
      const t1 = (2 * Math.PI * (i + 1)) / N;
      const back = Math.sin((t0 + t1) / 2) > 0;
      if (back) {
        sk.faces.quad(at(t0, lo), at(t1, lo), at(t1, hi), at(t0, hi), fs());
        sk.faces.tri(P(ce, lo, cn), at(t0, lo), at(t1, lo), fs());
        sk.seg(at(t0, hi), at(t1, hi), { width: PEN.outline, color: INK });
        sk.seg(at(t0, lo), at(t1, lo), { width: PEN.fine, color: INK });
      } else {
        sk.seg(at(t0, hi), at(t1, hi), GHOST);
        sk.seg(at(t0, lo), at(t1, lo), GHOST);
      }
    }
    // the cut edges, heavy; the far silhouette; the near one in outline
    for (const t of [0, Math.PI]) sk.seg(at(t, lo), at(t, hi), { width: PEN.bold, color: INK });
    sk.seg(at(Math.PI, lo), at(0, lo), { width: PEN.bold, color: INK });
    sk.seg(at((5 * Math.PI) / 4, lo), at((5 * Math.PI) / 4, hi), GHOST);
    // the bracket that hangs it on the pole, and the primary bushing on the lid
    sk.seg(P(ce - r, ch + 0.5, cn), P(0.1, ch + 0.5, cn), { width: PEN.thin, color: INK });
    sk.seg(P(ce - r, ch - 0.5, cn), P(0.1, ch - 0.5, cn), { width: PEN.thin, color: INK });
    insulator(sk, [ce, hi, cn], [ce, hi + 0.45, cn], 0.12);
    insulator(sk, [ce, hi, cn], [ce, hi - 0.18, cn], 0.08);

    // ---- the core: shell form, the section through its middle leg
    sk.stagger = 0.1;
    const W = 0.72;
    const H = 0.98;
    const D = 0.12; // half its depth
    const c = 0.085; // an outer leg's width; the middle leg is twice it
    const e0 = ce - W / 2;
    const e1 = ce + W / 2;
    const b0 = ch - 0.66;
    const b1 = b0 + H;
    const quad = (a: Vec3, b: Vec3, cc: Vec3, d: Vec3, color?: string) => sk.faces.quad(a, b, cc, d, { ...fs(), ...(color ? { color } : {}) });
    const rect = (x0: number, x1: number, y0: number, y1: number, n: number, color?: string) => quad(P(x0, y0, n), P(x1, y0, n), P(x1, y1, n), P(x0, y1, n), color);
    const cut = { width: PEN.medium, color: INK };
    const hair = { width: PEN.hairline, color: INK_60 };
    // behind the section: the top yoke's top, the core's west end
    quad(P(e0, b1, cn), P(e1, b1, cn), P(e1, b1, cn + D), P(e0, b1, cn + D));
    quad(P(e0, b0, cn), P(e0, b1, cn), P(e0, b1, cn + D), P(e0, b0, cn + D));
    sk.poly([P(e0, b1, cn), P(e0, b1, cn + D), P(e1, b1, cn + D), P(e1, b1, cn)], { width: PEN.outline, color: INK });
    sk.poly([P(e0, b1, cn + D), P(e0, b0, cn + D), P(e0, b0, cn)], { width: PEN.outline, color: INK });
    // the section: yokes and three legs, and the two windows between
    const wL = [e0 + c, ce - c] as const;
    const wR = [ce + c, e1 - c] as const;
    rect(e0, e1, b0, b0 + c, cn);
    rect(e0, e1, b1 - c, b1, cn);
    for (const [x0, x1] of [
      [e0, e0 + c],
      [ce - c, ce + c],
      [e1 - c, e1],
    ] as const)
      rect(x0, x1, b0 + c, b1 - c, cn);
    sk.poly([P(e0, b0, cn), P(e1, b0, cn), P(e1, b1, cn), P(e0, b1, cn)], cut, true);
    for (const [x0, x1] of [wL, wR]) sk.poly([P(x0, b0 + c, cn), P(x1, b0 + c, cn), P(x1, b1 - c, cn), P(x0, b1 - c, cn)], cut, true);
    // the sheets: wound loops, so they run round each window — a few nested outlines
    const vs = cn - 0.003;
    for (let k = 1; k < 4; k++) {
      const d = (c * k) / 4;
      for (const [x0, x1] of [
        [e0 + d, ce - d],
        [ce + d, e1 - d],
      ] as const)
        sk.poly([P(x0, b0 + d, vs), P(x1, b0 + d, vs), P(x1, b1 - d, vs), P(x0, b1 - d, vs)], hair, true);
    }
    sk.target(part('core'), [P(e0, b0, cn), P(e1, b1, cn)], true);
    this.labels.push({ id: 'pt:core', text: 'Core: two loops of steel sheet', anchor: P(e0 + 0.1, b1, cn + D), priority: 8, minZoom: 0, kind: 'equip' });

    // ---- the coil round the middle leg, in both windows: secondary inside (two halves), primary outside
    sk.stagger = 0.2;
    const ts = 0.06;
    const tp = 0.06;
    const g0 = 0.01;
    const duct = 0.014;
    const y0 = b0 + c + 0.02;
    const y1 = b1 - c - 0.02;
    const ym = (y0 + y1) / 2;
    const coil = (side: -1 | 1) => {
      const inner = side < 0 ? ce - c - g0 : ce + c + g0;
      const sec = side < 0 ? [inner - ts, inner] : [inner, inner + ts];
      const pri = side < 0 ? [sec[0]! - duct - tp, sec[0]! - duct] : [sec[1]! + duct, sec[1]! + duct + tp];
      return { sec: sec as [number, number], pri: pri as [number, number] };
    };
    for (const side of [-1, 1] as const) {
      const { sec, pri } = coil(side);
      // the secondary: two halves, each one turn of wide conductor, meeting at the centre tap
      for (const [a, b] of [
        [y0, ym - 0.004],
        [ym + 0.004, y1],
      ] as const) {
        rect(sec[0], sec[1], a, b, cn);
        rect(sec[0] + 0.004, sec[1] - 0.004, a + 0.004, b - 0.004, vs, INK_35);
        sk.poly([P(sec[0], a, cn), P(sec[1], a, cn), P(sec[1], b, cn), P(sec[0], b, cn)], { width: PEN.thin, color: INK }, true);
      }
      sk.target(part('winding', 'secondary'), [P(sec[0], y0, cn), P(sec[1], y1, cn)], true);
      // the primary: sixty turns of fine wire
      rect(pri[0], pri[1], y0, y1, cn);
      sk.poly([P(pri[0], y0, cn), P(pri[1], y0, cn), P(pri[1], y1, cn), P(pri[0], y1, cn)], { width: PEN.thin, color: INK }, true);
      const n = this.turns.primary;
      const dh = (y1 - y0) / n;
      for (let j = 0; j < n; j++) rect(pri[0] + 0.006, pri[1] - 0.006, y0 + j * dh + dh * 0.18, y0 + (j + 1) * dh - dh * 0.18, vs, INK_35);
      sk.target(part('winding', 'primary'), [P(pri[0], y0, cn), P(pri[1], y1, cn)], true);
    }
    const L = coil(-1);
    this.labels.push({ id: 'pt:pri', text: 'Primary: many turns of fine wire', anchor: P((L.pri[0] + L.pri[1]) / 2, y1, cn), priority: 9, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'pt:sec', text: 'Secondary: two halves of a few thick turns', anchor: P((L.sec[0] + L.sec[1]) / 2, y0, cn), priority: 9, minZoom: 0, kind: 'equip' });

    // ---- leads: H1 down to the primary, H2 to the tank; X1, X2 (the centre tap), X3 out the side
    sk.stagger = 0.3;
    const lead = { width: PEN.medium, color: INK };
    const priL = (L.pri[0] + L.pri[1]) / 2;
    sk.poly([P(ce, hi - 0.18, cn), P(ce, b1 + 0.06, cn - 0.01), P(priL, b1 + 0.02, cn - 0.01), P(priL, y1, cn)], lead);
    const R = coil(1);
    const priR = (R.pri[0] + R.pri[1]) / 2;
    sk.poly([P(priR, y0, cn), P(priR, lo + 0.05, cn - 0.01), P(ce + r * 0.9, lo + 0.05, cn)], lead);
    this.labels.push({ id: 'pt:h2', text: 'H2: bonded to the tank', anchor: P(ce + r * 0.8, lo + 0.05, cn), priority: 5, minZoom: 0, kind: 'equip', prov: 'data:notation.C57.12.terminals' });
    const xs = [125, 145, 165].map((d) => (d * Math.PI) / 180);
    const xh = ch - 0.42;
    const tips: Vec3[] = [];
    const bases: Vec3[] = [];
    xs.forEach((t) => {
      const b: [number, number, number] = [ce + r * Math.cos(t), xh, cn + r * Math.sin(t)];
      const tip: [number, number, number] = [ce + (r + 0.13) * Math.cos(t), xh, cn + (r + 0.13) * Math.sin(t)];
      insulator(sk, b, tip, 0.05);
      tips.push(P(...tip));
      bases.push(P(...b));
    });
    const secL = (L.sec[0] + L.sec[1]) / 2;
    // inside: from the ends and the middle of the secondary to the three bushings
    sk.poly([P(secL, y1, cn - 0.005), P(secL, y1 + 0.03, cn - 0.005), bases[0]!], lead);
    sk.poly([P(L.sec[0], ym, cn - 0.005), bases[1]!], lead);
    sk.poly([P(secL, y0, cn - 0.005), P(secL, y0 - 0.03, cn - 0.005), bases[2]!], lead);
    // X2 bonded to the tank (a strap), and on as the neutral
    sk.seg(tips[1]!, P(ce + r * Math.cos(xs[1]!), xh - 0.25, cn + r * Math.sin(xs[1]!)), { width: PEN.fine, color: INK });
    // outside: the three wires to the triplex along the street (the Service level draws them too)
    sk.stagger = PERSIST;
    const lv = voltageClassFor(0.24);
    const legs = [0, 1, 2].map((i) => {
      const a = tips[i]!;
      const b: Vec3 = [this.secondaryAt[0], this.secondaryAt[1] + (i - 1) * 0.05, this.secondaryAt[2]];
      sk.seg(a, b, { width: i === 1 ? lv.weight : lv.weight + 0.4, color: INK });
      return [a, b] as [Vec3, Vec3];
    });
    this.legFlows = [sk.flowSeg(legs[0]![0], legs[0]![1]), sk.flowSeg(legs[2]![0], legs[2]![1])];
    sk.stagger = 0.3;
    sk.target(part('bushing', 'X'), [tips[0]!, tips[2]!, ...bases]);
    sk.target(part('bushing', 'H'), [P(ce, hi, cn), P(ce, hi + 0.45, cn)]);
    this.labels.push({ id: 'pt:x', text: 'X1 · X2 (neutral) · X3', anchor: tips[1]!, priority: 8, minZoom: 0, kind: 'equip', prov: 'data:notation.C57.12.terminals' });
    this.labels.push({ id: 'pt:h1', text: 'H1: from the lateral', anchor: P(ce, hi + 0.45, cn), priority: 7, minZoom: 0, kind: 'equip', prov: 'data:notation.C57.12.terminals' });
    this.labels.push({ id: 'pt:oil', text: 'Oil: insulates and cools', anchor: P(ce + 0.2, b1 + 0.25, cn + 0.2), priority: 4, minZoom: 0, kind: 'equip' });
    sk.target(part('tank'), [P(ce - r, lo, cn), P(ce + r, hi, cn)], true);

    // ---- flux: up the middle leg, back down each outer leg, half each way round the yokes
    this.flux.mesh.renderOrder = 32;
    sk.group.add(this.flux.mesh);
    const fl = { width: 2, color: INK, collapse: sk.anchor, stagger: 0.4 };
    const mk = (e: number, h: number, de: number, dh: number, w: number) => {
      const a = P(e, h, cn - 0.02);
      this.arrows.push({ e, h, de, dh, w, segs: [this.flux.segment(a, a, fl), this.flux.segment(a, a, fl), this.flux.segment(a, a, fl)] });
    };
    const mid = (b0 + b1) / 2;
    mk(ce, mid + 0.16, 0, 1, 1);
    mk(ce, mid - 0.16, 0, 1, 1);
    mk(e0 + c / 2, mid, 0, 1, -0.5);
    mk(e1 - c / 2, mid, 0, 1, -0.5);
    mk((ce + e1) / 2, b1 - c / 2, 1, 0, 0.5);
    mk((ce + e0) / 2, b1 - c / 2, 1, 0, -0.5);
    mk((ce + e1) / 2, b0 + c / 2, 1, 0, -0.5);
    mk((ce + e0) / 2, b0 + c / 2, 1, 0, 0.5);
    this.flux.commit();

    for (const e of [ce - r - 0.25, ce + r + 0.15]) for (const n of [cn - r - 0.1, cn + r + 0.1]) this.extent.push(P(e, lo - 0.1, n), P(e, hi + 0.5, n));
    sk.stagger = 0;
    sk.commit();
  }

  stateFor(s: Snapshot): PoleTopState | null {
    return this.stateOf(s);
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  get classes(): VoltageClass[] {
    return [voltageClassFor(12.47), voltageClassFor(0.24)];
  }

  applySnapshot(s: Snapshot): void {
    const st = (this.state = this.stateOf(s));
    const on = !!st && st.on;
    this.fluxAmp = on ? st!.vPpu : 0;
    const sc = this.flowScale;
    [st?.p1 ?? 0, st?.p2 ?? 0].forEach((w, i) => {
      const kw = on ? w / 1000 : 0;
      this.sk.flow.set(this.legFlows[i]!, { sizePx: chevronSizeFor(kw, sc), speed: chevronSpeedFor(kw, sc) * Math.sign(kw), side: 0, color: INK, alpha: Math.abs(kw) > 0.005 ? 1 : 0 });
    });
  }

  highlight(_sel: Selection | null): Set<string> | null {
    return null;
  }

  pick(sx: number, sy: number, cam: IsoCamera): Selection | null {
    return this.sk.pick(sx, sy, cam);
  }

  frame(o: FrameInfo): void {
    this.sk.frame(o);
    this.flux.frame(o);
    const w = (2 * Math.PI * COMPONENTS.fHz) / COMPONENTS.slowdown;
    const phi = this.fluxAmp * Math.cos(w * o.time);
    const Lmax = 0.13;
    for (const a of this.arrows) {
      const f = a.w * phi;
      const len = Math.min(1.2, Math.abs(f)) * Lmax;
      const s = Math.sign(f) || 1;
      const de = a.de * s;
      const dh = a.dh * s;
      const P = (e: number, h: number): Vec3 => enIso(e, h, CAN.n - 0.02);
      const tip = P(a.e + (de * len) / 2, a.h + (dh * len) / 2);
      const hl = 0.4 * len;
      const be = a.e + (de * len) / 2 - de * hl;
      const bh = a.h + (dh * len) / 2 - dh * hl;
      this.flux.setEnds(a.segs[0], P(a.e - (de * len) / 2, a.h - (dh * len) / 2), tip);
      this.flux.setEnds(a.segs[1], P(be - dh * hl * 0.6, bh + de * hl * 0.6), tip);
      this.flux.setEnds(a.segs[2], P(be + dh * hl * 0.6, bh - de * hl * 0.6), tip);
      for (const sg of a.segs) this.flux.setAlpha(sg, len > 0.006 ? 1 : 0);
    }
  }

  set morph(m: number) {
    this.morphValue = m;
    this.sk.morph = m;
    this.flux.morph = m;
    this.flux.opacity = Math.max(0, Math.min(1, (m - 0.85) / 0.15));
  }

  get morph(): number {
    return this.morphValue;
  }

  fitPoints(): Vec3[] {
    return this.extent;
  }
}

/** Where the can hangs, in the Service level's frame (for the Service level to hide its own copy). */
export const POLETOP_CAN = CAN;
