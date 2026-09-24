import type * as THREE from 'three';
import { LineBatch, type Vec3 } from '../render/lines';
import { INK, INK_35, INK_60, PEN, type VoltageClass } from '../render/style';
import type { IsoCamera } from '../render/iso';
import type { Snapshot } from '../model/snapshot';
import type { XfmrPlate, XfmrState } from '../model/xfmrState';
import { COMPONENTS } from '../data/components';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_ISO, PERSIST, Sketch } from './sketch';
import { ghostBox, transformer, vcyl, xfAxes, type XfAxes, type XfBody } from './kit';

/**
 * The Transformer level: one power transformer, cut open on the vertical plane through
 * its three limbs, drawn in the frame of the yard it stands in (it unfolds in place).
 *
 * What it shows, from the inside out:
 * - the core: three limbs of stacked steel sheets joined by yokes at top and bottom,
 *   the sheets meeting in mitred joints; its section shows the sheets;
 * - on each limb, the windings, concentric: lowest voltage innermost. Their section
 *   shows each turn as a small block — drawn in the ratio of the windings' voltages
 *   (every turn on a limb carries the same voltage, so a winding's voltage is its
 *   number of turns times the volts per turn), and each winding's radial build the same
 *   (its ampere-turns balance the other's), so a turn's cross-section is in proportion
 *   to the current it carries;
 * - the leads from the bushings down to the windings; a tap changer, if it has one;
 * - the oil: warmed by the windings' losses, it rises through the ducts between the
 *   windings, flows out over the top into the radiators, cools, sinks and returns
 *   along the bottom. Chevrons carry the heat, in kW.
 * - the flux: arrows along the core, alternating at a stated fraction of 60 Hz, one
 *   phase per limb, 120° apart; in the yokes, the sums (the three add to zero, so they
 *   close through each other and no return limb is needed). Their size follows the
 *   high-side voltage (flux ∝ V/f), not the load.
 *
 * Proportions are schematic (a typical core-form design, not this unit's drawings).
 */

type Role = 'hv' | 'lv' | 'series' | 'common' | 'tertiary' | 'tap';

export interface Winding {
  role: Role;
  name: string;
  conn: 'Y' | 'D' | 'auto';
  /** Voltage across one phase's winding, kV (line-to-neutral for wye, line-to-line for delta). */
  kv: number;
  /** Turns drawn (in the ratio of kv; the tapped winding: one block per step). */
  turns: number;
  /** Radial build relative to a main winding. */
  build: number;
  ri: number;
  ro: number;
}

/** The windings on each limb, innermost first, from the vector group. */
export function windingsOf(p: XfmrPlate): Winding[] {
  const m = /^(YN|Y|D)(a|yn|y|d)\d+(?:(d|yn|y)\d+)?$/.exec(p.vectorGroup);
  const s3 = Math.sqrt(3);
  const hvY = !m || m[1] !== 'D';
  const lvCode = m?.[2] ?? 'yn';
  const tert = m?.[3] === 'd';
  const out: Array<Omit<Winding, 'turns' | 'ri' | 'ro'>> = [];
  if (tert) out.push({ role: 'tertiary', name: 'Tertiary winding (Δ)', conn: 'D', kv: p.tertiaryKV ?? 13.8, build: 0.55 });
  if (lvCode === 'a') {
    out.push({ role: 'common', name: 'Common winding', conn: 'auto', kv: p.lvKV / s3, build: 1 });
    out.push({ role: 'series', name: 'Series winding', conn: 'auto', kv: (p.hvKV - p.lvKV) / s3, build: 1 });
  } else {
    const lvY = lvCode.startsWith('y');
    out.push({ role: 'lv', name: 'Low-voltage winding', conn: lvY ? 'Y' : 'D', kv: lvY ? p.lvKV / s3 : p.lvKV, build: 1 });
    out.push({ role: 'hv', name: 'High-voltage winding', conn: hvY ? 'Y' : 'D', kv: hvY ? p.hvKV / s3 : p.hvKV, build: 1 });
  }
  const main = out.filter((w) => w.role !== 'tertiary');
  const perTurn = Math.max(...main.map((w) => w.kv)) / COMPONENTS.drawnTurns;
  const ws: Winding[] = out.map((w) => ({ ...w, turns: Math.max(2, Math.round(w.kv / perTurn)), ri: 0, ro: 0 }));
  if (p.ltc) ws.push({ role: 'tap', name: 'Tapped winding', conn: 'Y', kv: 0, turns: p.ltc.maxSteps, build: 0.4, ri: 0, ro: 0 });
  return ws;
}

/** The core and windings' dimensions in the tank's own axes (see kit's XfAxes). */
export interface CoreGeom {
  pitch: number;
  /** Limb centres along u. */
  uk: [number, number, number];
  /** Limb half-width (u) and half-depth (v). */
  rc: number;
  dc: number;
  /** Core bottom and top, yoke height. */
  hB: number;
  hT: number;
  hy: number;
  /** Windings' bottom and top. */
  h0: number;
  h1: number;
  windings: Winding[];
}

export function coreGeom(X: XfAxes, p: XfmrPlate): CoreGeom {
  const pitch = 0.3 * X.su;
  const rOut = 0.44 * pitch;
  const rc = 0.36 * rOut;
  const hy = 1.6 * rc;
  const hB = 0.62;
  const hT = X.lid - 0.5;
  const window = hT - hB - 2 * hy;
  const h0 = hB + hy + 0.07 * window;
  const h1 = hT - hy - 0.07 * window;
  const windings = windingsOf(p);
  // radial build: a gap to the limb, then windings with oil ducts between
  const gap0 = 0.3;
  const duct = 0.42;
  const units = gap0 + windings.reduce((a, w) => a + w.build, 0) + duct * (windings.length - 1);
  const unit = (rOut - rc * 1.05) / units;
  let r = rc * 1.05 + gap0 * unit;
  for (const w of windings) {
    w.ri = r;
    w.ro = r + w.build * unit;
    r = w.ro + duct * unit;
  }
  return { pitch, uk: [X.u0 - pitch, X.u0, X.u0 + pitch], rc, dc: 0.8 * rc, hB, hT, hy, h0, h1, windings };
}

interface FluxArrow {
  /** Centre (u, h) in the section, direction (du, dh) for positive flux, which flux. */
  u: number;
  h: number;
  du: number;
  dh: number;
  /** Flux = Σ w_k φ_k over the three limbs. */
  w: [number, number, number];
  segs: [number, number, number];
}

export class TransformerLevel implements Level {
  readonly kind = 'transformer' as const;
  readonly unitKm = 0.001;
  readonly flowScale = FLOW_SCALES.transformer;
  readonly north = NORTH_ISO;
  readonly labels: LabelSpec[] = [];
  readonly sk: Sketch;
  readonly seat: Vec3;
  readonly name: string;
  readonly X: XfAxes;
  readonly core: CoreGeom;
  private morphValue = 1;
  private flux = new LineBatch('xf-flux');
  /** Each winding's current in the section: ⊙ out of the cut, ⊗ into it (a circle, a dot, a cross). */
  private current = new LineBatch('xf-current');
  private currentMarks: Array<{ limb: number; sign: number; circle: number[]; dot: number[]; cross: number[] }> = [];
  private phi = 0;
  private arrows: FluxArrow[] = [];
  private fluxAmp = 0;
  private oil: Array<{ flow: number; share: number }> = [];
  private dial: { seg: number; centre: Vec3; r: number; at: (a: number) => Vec3 } | null = null;
  private extent: Vec3[] = [];
  state: XfmrState | null = null;

  constructor(
    readonly plate: XfmrPlate,
    readonly body: XfBody,
    plan: (e: number, h: number, n: number) => Vec3,
    private readonly stateOf: (s: Snapshot) => XfmrState | null,
    readonly classes: VoltageClass[],
    readonly needsDetail: boolean,
    /** The tap changer's motor drive cabinet, drawn cut away with the near half. */
    drive?: { e: number; h: number; n: number; se: number; sh: number; sn: number },
  ) {
    this.name = plate.name;
    const sk = (this.sk = new Sketch(plan));
    const X = (this.X = xfAxes(body));
    const { su, sv, u0, v0, lid, at } = X;
    const Pt = (u: number, h: number, v: number): Vec3 => sk.plan(...at(u, h, v));
    this.seat = sk.plan(body.e, 0, body.n);
    sk.anchor = Pt(u0, lid * 0.5, v0);
    const id = plate.key;
    const part = (what: string, sub?: string): Selection => ({ kind: 'part', id, what, ...(sub ? { sub } : {}) }) as Selection;

    // ---- the shell, cut open: drawn where the yard draws the whole transformer
    sk.stagger = PERSIST;
    const xf = transformer(sk, body.e, body.n, body.se, body.sh, body.sn, body.f, body.hvSide, body.alongN, true);
    if (drive) ghostBox(sk, drive.e, drive.h, drive.n, drive.se, drive.sh, drive.sn);

    const G = (this.core = coreGeom(X, plate));
    const { uk, rc, dc, hB, hT, hy, h0, h1 } = G;
    const uL = uk[0] - rc;
    const uR = uk[2] + rc;
    const fs = () => ({ collapse: sk.anchor, stagger: sk.stagger });
    const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color?: string) => sk.faces.quad(a, b, c, d, { ...fs(), ...(color ? { color } : {}) });
    const rectV = (u0r: number, u1r: number, ha: number, hb: number, v: number, color?: string) => quad(Pt(u0r, ha, v), Pt(u1r, ha, v), Pt(u1r, hb, v), Pt(u0r, hb, v), color);
    const outline = { width: PEN.outline, color: INK };
    const cutLine = { width: PEN.medium, color: INK };
    const hair = { width: PEN.hairline, color: INK_60 };

    // ---- the core
    sk.stagger = 0.08;
    // behind the section: the top of the upper yoke, the end of the core, the lower yoke's top in the windows
    quad(Pt(uL, hT, v0), Pt(uR, hT, v0), Pt(uR, hT, v0 + dc), Pt(uL, hT, v0 + dc));
    quad(Pt(uL, hB, v0), Pt(uL, hT, v0), Pt(uL, hT, v0 + dc), Pt(uL, hB, v0 + dc));
    for (const [a, b] of [
      [uk[0] + rc, uk[1] - rc],
      [uk[1] + rc, uk[2] - rc],
    ] as const) {
      quad(Pt(a, hB + hy, v0), Pt(b, hB + hy, v0), Pt(b, hB + hy, v0 + dc), Pt(a, hB + hy, v0 + dc));
      quad(Pt(a, hT - hy, v0), Pt(b, hT - hy, v0), Pt(b, hT - hy, v0 + dc), Pt(a, hT - hy, v0 + dc));
      sk.seg(Pt(a, hB + hy, v0 + dc), Pt(b, hB + hy, v0 + dc), { width: PEN.fine, color: INK });
    }
    sk.poly([Pt(uL, hT, v0), Pt(uL, hT, v0 + dc), Pt(uR, hT, v0 + dc), Pt(uR, hT, v0)], outline);
    sk.poly([Pt(uL, hT, v0 + dc), Pt(uL, hB, v0 + dc), Pt(uL, hB, v0)], outline);
    // the section: yokes and limbs, ground-coloured, outlined as cut
    rectV(uL, uR, hB, hB + hy, v0);
    rectV(uL, uR, hT - hy, hT, v0);
    for (const u of uk) rectV(u - rc, u + rc, hB + hy, hT - hy, v0);
    sk.poly([Pt(uL, hB, v0), Pt(uR, hB, v0), Pt(uR, hT, v0), Pt(uL, hT, v0)], cutLine, true);
    for (const [a, b] of [
      [uk[0] + rc, uk[1] - rc],
      [uk[1] + rc, uk[2] - rc],
    ] as const)
      sk.poly([Pt(a, hB + hy, v0), Pt(b, hB + hy, v0), Pt(b, hT - hy, v0), Pt(a, hT - hy, v0)], cutLine, true);
    // the sheets: mitred joints at the corners, a V where the middle limb meets each yoke,
    // and the sheets' edges (six to a member) running between the joints
    const S = 6;
    const vs = v0 - 0.004;
    const topJ = (u: number): number => (u <= uk[0] + rc ? hT - (hy * (u - uL)) / (2 * rc) : u >= uk[2] - rc ? hT - (hy * (uR - u)) / (2 * rc) : hT - (hy * Math.abs(u - uk[1])) / rc);
    const botJ = (u: number): number => hB + hT - topJ(u);
    sk.seg(Pt(uL, hT, vs), Pt(uk[0] + rc, hT - hy, vs), hair);
    sk.seg(Pt(uR, hT, vs), Pt(uk[2] - rc, hT - hy, vs), hair);
    sk.seg(Pt(uL, hB, vs), Pt(uk[0] + rc, hB + hy, vs), hair);
    sk.seg(Pt(uR, hB, vs), Pt(uk[2] - rc, hB + hy, vs), hair);
    for (const s of [-1, 1]) {
      sk.seg(Pt(uk[1] + s * rc, hT - hy, vs), Pt(uk[1], hT, vs), hair);
      sk.seg(Pt(uk[1] + s * rc, hB + hy, vs), Pt(uk[1], hB, vs), hair);
    }
    for (const u of uk)
      for (let j = 1; j < S; j++) {
        const x = u - rc + (2 * rc * j) / S;
        sk.seg(Pt(x, botJ(x), vs), Pt(x, topJ(x), vs), hair);
      }
    for (let j = 1; j < S; j++) {
      const d = (hy * j) / S; // depth into the yoke from its outer face
      for (const [hh, yoke] of [
        [hT - d, 'top'],
        [hB + d, 'bot'],
      ] as const) {
        const k = yoke === 'top' ? d : d; // distance from the outer edge
        const left = uL + (2 * rc * k) / hy;
        const right = uR - (2 * rc * k) / hy;
        const midL = uk[1] - (rc * k) / hy;
        const midR = uk[1] + (rc * k) / hy;
        sk.seg(Pt(left, hh, vs), Pt(midL, hh, vs), hair);
        sk.seg(Pt(midR, hh, vs), Pt(right, hh, vs), hair);
      }
    }
    sk.target(part('core'), [Pt(uL, hB, v0), Pt(uR, hT, v0), Pt(uL, hT, v0 + dc), Pt(uR, hB, v0)], true);
    this.labels.push({ id: 'xf:core', text: 'Core: thin steel sheets, stacked', anchor: Pt(uk[1] + G.pitch * 0.5, hT, v0), priority: 9, minZoom: 0, kind: 'equip' });

    // ---- the windings, innermost first
    const N = 24;
    G.windings.forEach((w, wi) => {
      sk.stagger = 0.16 + wi * 0.04;
      const a0 = w.role === 'tap' ? h0 + (h1 - h0) * 0.2 : h0;
      const a1 = w.role === 'tap' ? h1 - (h1 - h0) * 0.2 : h1;
      const thin = { width: w.role === 'tertiary' || w.role === 'tap' ? PEN.fine : PEN.thin, color: INK };
      for (const u of uk) {
        const ring = (r: number, t: number, h: number): Vec3 => Pt(u + r * Math.cos(t), h, v0 + r * Math.sin(t));
        // behind the section: the far half's outside (faces), its top (a half ring), the silhouette
        for (let i = 0; i < N; i++) {
          const t0 = (Math.PI * i) / N;
          const t1 = (Math.PI * (i + 1)) / N;
          quad(ring(w.ro, t0, a0), ring(w.ro, t1, a0), ring(w.ro, t1, a1), ring(w.ro, t0, a1));
          quad(ring(w.ri, t0, a1), ring(w.ro, t0, a1), ring(w.ro, t1, a1), ring(w.ri, t1, a1));
          sk.seg(ring(w.ro, t0, a1), ring(w.ro, t1, a1), thin);
          sk.seg(ring(w.ri, t0, a1), ring(w.ri, t1, a1), { width: PEN.fine, color: INK });
          if (t0 >= (3 * Math.PI) / 4 - 1e-9) sk.seg(ring(w.ro, t0, a0), ring(w.ro, t1, a0), thin);
        }
        sk.seg(ring(w.ro, (3 * Math.PI) / 4, a0), ring(w.ro, (3 * Math.PI) / 4, a1), thin);
        // the section: both sides of the limb, each turn a block
        for (const s of [-1, 1]) {
          const x0 = s < 0 ? u - w.ro : u + w.ri;
          const x1 = s < 0 ? u - w.ri : u + w.ro;
          rectV(x0, x1, a0, a1, v0);
          sk.poly([Pt(x0, a0, v0), Pt(x1, a0, v0), Pt(x1, a1, v0), Pt(x0, a1, v0)], thin, true);
          const dh = (a1 - a0) / w.turns;
          const ga = Math.min(0.14 * dh, 0.03);
          const gr = 0.12 * (x1 - x0);
          for (let j = 0; j < w.turns; j++) rectV(x0 + gr, x1 - gr, a0 + j * dh + ga, a0 + (j + 1) * dh - ga, vs, INK_35);
          sk.target(part('winding', w.role), [Pt(x0, a0, v0), Pt(x1, a1, v0)], true);
        }
      }
      // name it once, on the first limb's near side
      const lu = uk[0] - (w.ri + w.ro) / 2;
      this.labels.push({ id: `xf:w:${w.role}`, text: w.name, anchor: Pt(lu, a1, v0), priority: 8 - wi * 0.5, minZoom: 0, kind: 'equip' });
    });

    // ---- the current in each winding, marked on its section: ⊙ coming out of the cut toward
    // the viewer, ⊗ going in. Current round a limb comes out on one side and goes in on the
    // other; the high side's and the low side's are always opposite (their ampere-turns
    // balance). The tertiary carries none.
    this.current.mesh.renderOrder = 32;
    sk.group.add(this.current.mesh);
    const cst = { width: 1.3, color: INK, collapse: sk.anchor, stagger: 0.4 };
    const vm = v0 - 0.03;
    G.windings.forEach((w) => {
      if (w.role === 'tertiary') return;
      const wsign = w.role === 'hv' || w.role === 'series' ? 1 : -1;
      const a0 = w.role === 'tap' ? h0 + (h1 - h0) * 0.2 : h0;
      const a1 = w.role === 'tap' ? h1 - (h1 - h0) * 0.2 : h1;
      uk.forEach((u, limb) => {
        for (const s of [-1, 1]) {
          const x0 = s < 0 ? u - w.ro : u + w.ri;
          const x1 = s < 0 ? u - w.ri : u + w.ro;
          const cu = (x0 + x1) / 2;
          const rm = Math.min(0.32 * (x1 - x0), 0.06 * (a1 - a0));
          const marks = w.role === 'tap' ? [0.5] : [0.22, 0.5, 0.78];
          for (const f of marks) {
            const ch = a0 + (a1 - a0) * f;
            const P = (du: number, dh: number): Vec3 => Pt(cu + du, ch + dh, vm);
            const circle: number[] = [];
            for (let i = 0; i < 14; i++) {
              const t0 = (2 * Math.PI * i) / 14;
              const t1 = (2 * Math.PI * (i + 1)) / 14;
              circle.push(this.current.segment(P(rm * Math.cos(t0), rm * Math.sin(t0)), P(rm * Math.cos(t1), rm * Math.sin(t1)), cst));
            }
            const d = rm * 0.22;
            const dot = [this.current.segment(P(-d, 0), P(0, d), { ...cst, width: 2 }), this.current.segment(P(0, d), P(d, 0), { ...cst, width: 2 }), this.current.segment(P(d, 0), P(0, -d), { ...cst, width: 2 }), this.current.segment(P(0, -d), P(-d, 0), { ...cst, width: 2 })];
            const x = rm * 0.62;
            const cross = [this.current.segment(P(-x, -x), P(x, x), cst), this.current.segment(P(-x, x), P(x, -x), cst)];
            // positive current (the high side's, into its terminal) comes out of the cut on the limb's −u side
            this.currentMarks.push({ limb, sign: wsign * -s, circle, dot, cross });
          }
        }
      });
    });
    this.current.commit();
    this.labels.push({ id: 'xf:current', text: 'Currents: ⊙ out of the cut, ⊗ into it', anchor: Pt(uk[2]! + G.windings[G.windings.length - 1]!.ro, h0, v0), priority: 7, minZoom: 0, kind: 'equip' });

    // ---- leads from the bushings down to the windings
    sk.stagger = 0.34;
    const outer = G.windings.filter((w) => w.role !== 'tap' && w.role !== 'tertiary');
    const hvW = outer[outer.length - 1]!;
    const lvW = outer[0]!;
    const hvSorted = [...xf.hv].sort((a, b) => (body.alongN ? a[0] - b[0] : a[2] - b[2]));
    const lvSorted = [...xf.lv].sort((a, b) => (body.alongN ? a[0] - b[0] : a[2] - b[2]));
    const vH = v0 + body.hvSide * sv * 0.28;
    const vL = v0 - body.hvSide * sv * 0.28;
    const leadW = (c: VoltageClass | undefined) => Math.max(0.9, (c?.weight ?? 1.4) * 0.5);
    const [clsH, clsL] = [classes[0], classes[1] ?? classes[0]];
    for (let p = 0; p < 3; p++) {
      const u = uk[p]!;
      const rH = (hvW.ri + hvW.ro) / 2;
      const rL = (lvW.ri + lvW.ro) / 2;
      const endH: Vec3 = vH > v0 ? Pt(u, h1, v0 + rH) : Pt(u - rH, h1, v0);
      const endL: Vec3 = vL > v0 ? Pt(u, h1, v0 + rL) : Pt(u - rL, h1, v0);
      const hLead = [Pt(u, lid - 0.9 * body.f, vH), vH > v0 ? Pt(u, h1 + 0.3, v0 + rH) : Pt(u - rH, h1 + 0.35, v0 - 0.02), endH];
      const lLead = [Pt(u, lid - 0.6 * body.f, vL), vL > v0 ? Pt(u, h1 + 0.45, v0 + rL) : Pt(u - rL, h1 + 0.45, v0 - 0.02), endL];
      sk.poly(hLead, { width: leadW(clsH), color: INK });
      sk.poly(lLead, { width: leadW(clsL), color: INK });
      sk.target(part('bushing', 'hv'), [sk.plan(...hvSorted[p]!), hLead[0]!, ...hLead]);
      sk.target(part('bushing', 'lv'), [sk.plan(...lvSorted[p]!), lLead[0]!, ...lLead]);
    }
    this.labels.push({ id: 'xf:bush:hv', text: plate.vectorGroup.startsWith('YNa') ? 'Bushings, high side (H)' : 'High-voltage bushings', anchor: sk.plan(...hvSorted[2]!), priority: 6, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'xf:bush:lv', text: plate.vectorGroup.startsWith('YNa') ? 'Bushings, low side (X)' : 'Low-voltage bushings', anchor: sk.plan(...lvSorted[0]!), priority: 6, minZoom: 0, kind: 'equip' });

    // ---- the tap changer (on-load): in the tank at the near end, the taps led to it
    if (plate.ltc) {
      sk.stagger = 0.38;
      const tu = u0 - su / 2 + 0.5;
      const tv = v0 + 0.26 * sv;
      const [te, , tn] = at(tu, 0, tv);
      vcyl(sk, te, tn, 0.28, lid, hB);
      const tapW = G.windings.find((w) => w.role === 'tap')!;
      for (let p = 0; p < 3; p++) {
        const u = uk[p]!;
        for (let j = 0; j < 3; j++) {
          const r = tapW.ro;
          const t = Math.PI / 2 + 0.25 + j * 0.18;
          const h = h1 - (h1 - h0) * (0.28 + j * 0.16);
          sk.poly([Pt(u + r * Math.cos(t), h, v0 + r * Math.sin(t)), Pt(tu + 0.28, h + 0.1 * p, tv - 0.05)], { width: PEN.hairline, color: INK });
        }
      }
      // its position indicator on the head: 2 × steps + 1 marks round three quarters of a circle
      const centre = Pt(tu, lid + 0.02, tv);
      const r = 0.22;
      const atA = (a: number): Vec3 => Pt(tu + r * Math.cos(a), lid + 0.02, tv + r * Math.sin(a));
      const n = plate.ltc.maxSteps;
      for (let k = -n; k <= n; k++) {
        const a = this.dialAngle(k, n);
        const inner = k % 4 === 0 ? 0.62 : 0.8;
        sk.seg(Pt(tu + r * inner * Math.cos(a), lid + 0.02, tv + r * inner * Math.sin(a)), atA(a), { width: PEN.hairline, color: INK });
      }
      const seg = sk.seg(centre, atA(this.dialAngle(0, n)), { width: PEN.medium, color: INK });
      this.dial = { seg, centre, r, at: (a) => Pt(tu + r * 0.9 * Math.cos(a), lid + 0.02, tv + r * 0.9 * Math.sin(a)) };
      sk.target(part('tapchanger'), [Pt(tu, hB, tv), Pt(tu, lid, tv)]);
      this.labels.push({ id: 'xf:oltc', text: 'Tap changer', anchor: Pt(tu, lid + 0.3, tv), priority: 7, minZoom: 0, kind: 'equip' });
    }

    // ---- the oil's path: up the ducts, out over the top, down the radiators, back along the bottom
    sk.stagger = 0.42;
    const vf = v0 - 0.03;
    const main = G.windings.filter((w) => w.role !== 'tap' && w.role !== 'tertiary');
    const rd = (main[0]!.ro + main[main.length - 1]!.ri) / 2;
    for (const u of uk) for (const s of [-1, 1]) this.oil.push({ flow: sk.flowSeg(Pt(u + s * rd, h0 + 0.1, vf), Pt(u + s * rd, h1 - 0.05, vf)), share: 1 / 6 });
    const finTop = 0.9 + body.sh * 0.72 - 0.25;
    const ht = hT + 0.22;
    const hbot = 0.5;
    for (const s of [-1, 1]) {
      const wallU = u0 + s * (su / 2);
      const radU = u0 + s * (su / 2 + 0.45);
      const from = s < 0 ? uk[0] + 0.001 : uk[2] - 0.001;
      this.oil.push({ flow: sk.flowSeg(Pt(uk[1], ht, vf), Pt(from + s * (wallU - from) * 0.95, ht, vf)), share: 1 / 2 });
      this.oil.push({ flow: sk.flowSeg(Pt(wallU, ht, vf), Pt(radU, finTop, vf)), share: 1 / 2 });
      this.oil.push({ flow: sk.flowSeg(Pt(radU, finTop, vf), Pt(radU, 1.15, vf)), share: 1 / 2 });
      this.oil.push({ flow: sk.flowSeg(Pt(radU, 1.15, vf), Pt(wallU - s * 0.2, hbot, vf)), share: 1 / 2 });
      this.oil.push({ flow: sk.flowSeg(Pt(wallU - s * 0.2, hbot, vf), Pt(uk[1] + s * 0.3, hbot, vf)), share: 1 / 2 });
    }
    // the radiators, the conservator: pick them, name them
    const radU = u0 - (su / 2 + 0.45);
    sk.target(part('radiator'), [Pt(radU, 0.9, v0), Pt(radU, finTop + 0.25, v0 + sv / 2), Pt(radU, 0.9, v0 + sv / 2), Pt(radU, finTop + 0.25, v0)], true);
    this.labels.push({ id: 'xf:rad', text: 'Radiators: the oil cools and sinks', anchor: Pt(radU, finTop + 0.25, v0 + sv * 0.3), priority: 7, minZoom: 0, kind: 'equip' });
    const cr = 0.18 + 0.05 * body.sh;
    const cu = u0 + su / 2 - 0.2 - cr;
    const cH = lid + 0.75 + cr;
    sk.target(part('conservator'), [Pt(cu, cH, v0 - 0.32 * sv), Pt(cu, cH, v0 + 0.32 * sv)]);
    this.labels.push({ id: 'xf:cons', text: 'Conservator: room for the oil to expand', anchor: Pt(cu, cH + cr, v0 + 0.32 * sv), priority: 5, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'xf:oil', text: 'Oil: rises as it warms', anchor: Pt(uk[1] + rd, (h0 + h1) / 2, v0), priority: 6, minZoom: 0, kind: 'equip' });
    sk.target(part('tank'), xf.tank, true);

    // ---- the flux: arrows along the core's centre lines, in front of the section
    this.flux.mesh.renderOrder = 32;
    sk.group.add(this.flux.mesh);
    const fl = { width: 2.2, color: INK, collapse: sk.anchor, stagger: 0.4 };
    const mk = (u: number, h: number, du: number, dh: number, w: [number, number, number]) => {
      const a = Pt(u, h, v0 - 0.05);
      const segs: [number, number, number] = [this.flux.segment(a, a, fl), this.flux.segment(a, a, fl), this.flux.segment(a, a, fl)];
      this.arrows.push({ u, h, du, dh, w, segs });
    };
    const win = hT - hB - 2 * hy;
    for (let p = 0; p < 3; p++) {
      const w: [number, number, number] = [0, 0, 0];
      w[p] = 1;
      for (const f of [-0.27, 0.27]) mk(uk[p]!, (hB + hT) / 2 + f * win, 0, 1, w);
    }
    // yokes, positive to +u: at the top, A's flux crosses to B and A + B (= −C) on to C; the bottom returns it
    mk((uk[0] + uk[1]) / 2, hT - hy / 2, 1, 0, [1, 0, 0]);
    mk((uk[1] + uk[2]) / 2, hT - hy / 2, 1, 0, [1, 1, 0]);
    mk((uk[0] + uk[1]) / 2, hB + hy / 2, 1, 0, [-1, 0, 0]);
    mk((uk[1] + uk[2]) / 2, hB + hy / 2, 1, 0, [-1, -1, 0]);
    this.flux.commit();

    // fit: the tank with its radiators, conservator and bushings
    const top = lid + 2.2 * body.f;
    for (const u of [u0 - su / 2 - 1, u0 + su / 2 + 1]) for (const v of [v0 - sv / 2 - 0.6, v0 + sv / 2 + 0.6]) this.extent.push(Pt(u, 0, v), Pt(u, top, v));
    sk.stagger = 0;
    sk.commit();
  }

  /** The transformer's state in a solved interval. */
  stateFor(s: Snapshot): XfmrState | null {
    return this.stateOf(s);
  }

  /** The dial's angle for a tap step (in the tank's u–v plane), radians. */
  private dialAngle(step: number, n: number): number {
    return -Math.PI / 2 - ((step / n) * (3 * Math.PI)) / 4;
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  applySnapshot(s: Snapshot): void {
    const st = (this.state = this.stateOf(s));
    const sk = this.sk;
    const on = !!st?.on;
    // flux ∝ V/f: its size follows the high-side voltage
    this.fluxAmp = on ? st!.vH : 0;
    // the load current lags the voltage by the power-factor angle seen at the high side
    this.phi = on ? Math.atan2(st!.qH, st!.pH) : 0;
    // heat carried by the oil, kW, shared along its paths
    const kw = on ? Math.max(0, st!.loss * 1000) : 0;
    const sc = this.flowScale;
    for (const o of this.oil) {
      const v = kw * o.share;
      sk.flow.set(o.flow, { sizePx: chevronSizeFor(v, sc), speed: chevronSpeedFor(v, sc), side: 0, color: INK, alpha: v > 0.05 ? 1 : 0 });
    }
    if (this.dial && st?.step !== undefined && this.plate.ltc) sk.lines.setEnds(this.dial.seg, this.dial.centre, this.dial.at(this.dialAngle(st.step, this.plate.ltc.maxSteps)));
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
    this.current.frame(o);
    // one 60 Hz cycle shown over `slowdown / 60` seconds; phase A leads, B and C 120° behind
    const w = (2 * Math.PI * COMPONENTS.fHz) / COMPONENTS.slowdown;
    const phi = [0, 1, 2].map((k) => this.fluxAmp * Math.cos(w * o.time - (k * 2 * Math.PI) / 3));
    const { at } = this.X;
    const L = 2.1 * this.core.rc;
    const v = this.X.v0 - 0.05;
    for (const a of this.arrows) {
      const f = a.w[0] * phi[0]! + a.w[1] * phi[1]! + a.w[2] * phi[2]!;
      const len = Math.min(1.2, Math.abs(f)) * L;
      const s = Math.sign(f) || 1;
      const du = a.du * s;
      const dh = a.dh * s;
      const P = (u: number, h: number): Vec3 => this.sk.plan(...at(u, h, v));
      const tail = P(a.u - (du * len) / 2, a.h - (dh * len) / 2);
      const tip = P(a.u + (du * len) / 2, a.h + (dh * len) / 2);
      // the head: two strokes back from the tip at ±30°
      const hl = Math.min(0.4 * len, 0.5 * this.core.rc);
      const bu = a.u + (du * len) / 2 - du * hl;
      const bh = a.h + (dh * len) / 2 - dh * hl;
      const ou = -dh * hl * 0.58;
      const oh = du * hl * 0.58;
      this.flux.setEnds(a.segs[0], tail, tip);
      this.flux.setEnds(a.segs[1], P(bu + ou, bh + oh), tip);
      this.flux.setEnds(a.segs[2], P(bu - ou, bh - oh), tip);
      const vis = len > 0.04 ? 1 : 0;
      for (const sg of a.segs) this.flux.setAlpha(sg, vis);
    }
    // each limb's winding current: a quarter cycle ahead of its flux, less the power-factor
    // angle (flux lags the voltage by 90°, the current lags it by φ)
    const st = this.state;
    const carrying = !!st?.on && Math.hypot(st.pH, st.qH) > 1e-3;
    const i = [0, 1, 2].map((k) => Math.cos(w * o.time + Math.PI / 2 - this.phi - (k * 2 * Math.PI) / 3));
    for (const m of this.currentMarks) {
      const val = m.sign * i[m.limb]!;
      const a = carrying ? Math.min(1, 0.2 + Math.abs(val)) : 0;
      for (const s of m.circle) this.current.setAlpha(s, a);
      for (const s of m.dot) this.current.setAlpha(s, val > 0.05 ? a : 0);
      for (const s of m.cross) this.current.setAlpha(s, val < -0.05 ? a : 0);
    }
  }

  set morph(m: number) {
    this.morphValue = m;
    this.sk.morph = m;
    const shown = Math.max(0, Math.min(1, (m - 0.85) / 0.15));
    this.flux.morph = m;
    this.flux.opacity = shown;
    this.current.morph = m;
    this.current.opacity = shown;
  }

  get morph(): number {
    return this.morphValue;
  }

  fitPoints(): Vec3[] {
    return this.extent;
  }
}
