import type * as THREE from 'three';
import { LineBatch, type Vec3 } from '../render/lines';
import { INK, INK_15, INK_35, INK_60, PEN, voltageClassFor, type VoltageClass } from '../render/style';
import type { IsoCamera } from '../render/iso';
import type { Snapshot } from '../model/snapshot';
import type { Feeder } from '../model/feeder';
import type { RegState } from '../model/regState';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_ISO, PERSIST, Sketch, enIso } from './sketch';
import { GHOST, insulator } from './kit';
import { EN, POLE } from './feeder';

/**
 * The Regulator level: feeder 1105's step-voltage regulator bank, where it stands on
 * the trunk (it unfolds in the Feeder's frame). Three single-phase units on a platform
 * between two poles beside the line, one per phase; the line is carried down to each
 * unit's source bushing (S) and back up from its load bushing (L), and a bypass switch
 * on the crossarm, open, would let crews take the bank out. The control cabinet hangs
 * on the pole.
 *
 * The unit nearest the viewer is cut open on the plane through its axis. Below: the
 * core, and on it the shunt winding (across the line) and the series winding, a tenth
 * of its turns, tapped in eight sections. Above, standing face-on behind the cut, the
 * tap changer: a reversing switch that turns the series winding's slice of voltage to
 * add (raise) or subtract (lower), and a selector whose two fingers step along the
 * eight taps; where they bridge two taps the preventive autotransformer between them
 * gives the half step. Sixteen positions each way, 0.625 % each: ±10 %.
 *
 * What moves is the solution's tap: the fingers and the dial on each cover turn to the
 * position the feeder solve chose for that phase. A change of tap between intervals is
 * shown turning. Chevrons carry each phase's real power down to the unit and back up.
 */

type P3 = [number, number, number];

const G = {
  /** The cluster beside the trunk: its offset south of the line, the platform's height. */
  n: -3.6,
  deck: 4.2,
  /** A unit: tank radius, its height, spacing along the line. */
  r: 0.42,
  h: 1.5,
  pitch: 1.6,
  /** The trunk's phases on the crossarm, across the line. */
  arm: 1.3,
};

export class RegulatorLevel implements Level {
  readonly kind = 'regulator' as const;
  readonly unitKm = 0.001;
  readonly needsDetail = true;
  readonly flowScale = FLOW_SCALES.regulator;
  readonly north = NORTH_ISO;
  readonly labels: LabelSpec[] = [];
  readonly sk = new Sketch(enIso);
  readonly seat: Vec3;
  readonly name = 'Voltage regulator REG-1';
  readonly classes: VoltageClass[] = [voltageClassFor(12.47)];
  state: RegState | null = null;
  private morphValue = 1;
  private moving = new LineBatch('reg-moving');
  /** The selector's two fingers and the reversing switch's blade (the cut unit), and each cover dial's hand. */
  private fingers: [number, number] = [-1, -1];
  private rev = -1;
  private hands: number[] = [];
  private shown = [0, 0, 0];
  private target = [0, 0, 0];
  private flows: Array<[number, number]> = [];
  private lastTime = -1;
  private extent: Vec3[] = [];
  private sel: { e: number; h: number; n: number; R: number };
  private stepClock = 0;
  private revAt: { e: number; h: number; n: number };
  private dials: Array<{ e: number; h: number; n: number }> = [];
  /** Where each unit stands (east), and the platform's centre. */
  readonly units: number[];
  readonly at: Vec3;

  /** Where the bank stands in the Feeder's frame (its portal's anchor): beside the trunk at the regulator's node. */
  static anchorIn(feeder: Feeder): Vec3 {
    const [eR, nR] = EN(feeder.layout.pos.get('F4R')!);
    // at the units themselves, up on their platform, so a zoom toward them is drawn to them
    return enIso(eR, G.deck + G.h / 2, nR + G.n);
  }

  constructor(
    feeder: Feeder,
    private readonly stateOf: (s: Snapshot) => RegState | null,
  ) {
    const sk = this.sk;
    const P = (e: number, h: number, n: number): Vec3 => enIso(e, h, n);
    const [eR, nR] = EN(feeder.layout.pos.get('F4R')!);
    const nC = nR + G.n;
    this.at = P(eR, 0, nC);
    this.seat = RegulatorLevel.anchorIn(feeder);
    sk.anchor = P(eR, G.deck + G.h / 2, nC);
    const part = (what: string, sub?: string): Selection => ({ kind: 'part', id: 'reg:REG-1', what, ...(sub ? { sub } : {}) }) as Selection;
    const fs = () => ({ collapse: sk.anchor, stagger: sk.stagger });
    const thin = { width: PEN.thin, color: INK };
    const fine = { width: PEN.fine, color: INK };
    const hair = { width: PEN.hairline, color: INK_60 };
    const steel = { width: PEN.fine, color: INK_60 };
    const units = (this.units = [0, 1, 2].map((u) => eR + (u - 1) * G.pitch));
    const hb = G.deck + 0.15;
    const hT = hb + G.h;

    // ---- the structure: two poles, the platform, the bypass switches on the crossarm
    sk.stagger = PERSIST;
    for (const pe of [eR - 2.7, eR + 2.7]) sk.seg(P(pe, 0, nC), P(pe, POLE - 1.5, nC), { width: 2.2, color: INK });
    sk.box(eR, G.deck, nC, 5.6, 0.15, 1.9, steel);
    for (const pe of [eR - 2.7, eR + 2.7]) sk.seg(P(pe, G.deck, nC), P(pe, G.deck - 1.2, nC + 0.9), steel);
    const phaseN = [-1, 0, 1].map((p) => nR + p * G.arm);
    const bypass: number[] = [];
    phaseN.forEach((n) => {
      // the line dead-ended either side of the pole; the bypass blade between, open
      sk.seg(P(eR + 0.5, POLE, n), P(eR + 0.1, POLE + 0.55, n), thin);
      bypass.push(sk.seg(P(eR - 0.5, POLE, n), P(eR - 0.5, POLE + 0.1, n), thin));
    });
    sk.target(part('bypass'), [P(eR - 0.6, POLE, phaseN[0]!), P(eR + 0.6, POLE + 0.6, phaseN[2]!)], true);
    void bypass;

    // ---- the three units: tank, fins, cover, bushings S, L and SL, the position dial
    const N = 32;
    const ring = (ce: number, cn: number, h: number, r: number, t: number): Vec3 => P(ce + r * Math.cos(t), h, cn + r * Math.sin(t));
    const cut = 0; // the unit nearest the viewer (least east)
    const sTop: P3[] = [];
    const lTop: P3[] = [];
    units.forEach((ce, u) => {
      const open = u === cut;
      for (let i = 0; i < N; i++) {
        const t0 = (2 * Math.PI * i) / N;
        const t1 = (2 * Math.PI * (i + 1)) / N;
        const back = Math.sin((t0 + t1) / 2) > 0;
        if (!open || back) {
          sk.faces.quad(ring(ce, nC, hb, G.r, t0), ring(ce, nC, hb, G.r, t1), ring(ce, nC, hT, G.r, t1), ring(ce, nC, hT, G.r, t0), fs());
          if (!open) sk.faces.tri(P(ce, hT, nC), ring(ce, nC, hT, G.r, t0), ring(ce, nC, hT, G.r, t1), fs());
          sk.seg(ring(ce, nC, hT, G.r, t0), ring(ce, nC, hT, G.r, t1), { width: PEN.outline, color: INK });
          sk.seg(ring(ce, nC, hb, G.r, t0), ring(ce, nC, hb, G.r, t1), fine);
        } else {
          sk.seg(ring(ce, nC, hT, G.r, t0), ring(ce, nC, hT, G.r, t1), GHOST);
          sk.seg(ring(ce, nC, hb, G.r, t0), ring(ce, nC, hb, G.r, t1), GHOST);
        }
      }
      // silhouettes (the camera looks along +e +n: the outline edges at 135° and 315°)
      for (const t of [(3 * Math.PI) / 4, (7 * Math.PI) / 4]) {
        const onBack = Math.sin(t) > 0;
        sk.seg(ring(ce, nC, hb, G.r, t), ring(ce, nC, hT, G.r, t), open && !onBack ? GHOST : { width: PEN.outline, color: INK });
      }
      if (open) {
        for (const t of [0, Math.PI]) sk.seg(ring(ce, nC, hb, G.r, t), ring(ce, nC, hT, G.r, t), { width: PEN.bold, color: INK });
        sk.seg(ring(ce, nC, hb, G.r, Math.PI), ring(ce, nC, hb, G.r, 0), { width: PEN.bold, color: INK });
        sk.seg(ring(ce, nC, hT, G.r, Math.PI), ring(ce, nC, hT, G.r, 0), { width: PEN.bold, color: INK });
      }
      // cooling fins round the back
      for (const t of [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) {
        const a = ring(ce, nC, hb + 0.2, G.r, t);
        const b = ring(ce, nC, hb + 0.2, G.r + 0.22, t);
        const c = ring(ce, nC, hT - 0.25, G.r + 0.22, t);
        const d = ring(ce, nC, hT - 0.25, G.r, t);
        sk.poly([a, b, c, d], { width: PEN.hairline, color: INK }, false);
      }
      // bushings: S toward the source (east), L toward the load (west), SL the common
      const s: P3 = [ce + 0.2, hT, nC + 0.14];
      const l: P3 = [ce - 0.2, hT, nC + 0.14];
      const sl: P3 = [ce + 0.02, hT, nC + 0.28];
      insulator(sk, s, [s[0], hT + 0.55, s[2]], 0.08);
      insulator(sk, l, [l[0], hT + 0.55, l[2]], 0.08);
      insulator(sk, sl, [sl[0], hT + 0.3, sl[2]], 0.06);
      sTop.push([s[0], hT + 0.55, s[2]]);
      lTop.push([l[0], hT + 0.55, l[2]]);
      // SL to the neutral and ground, down the pole side
      sk.poly([P(sl[0], hT + 0.3, sl[2]), P(sl[0], hT + 0.3, nC + 0.95), P(sl[0], G.deck, nC + 0.95)], hair);
      // the position dial on the cover, toward the viewer
      const dial = { e: ce - 0.12, h: hT + 0.01, n: nC - 0.2 };
      this.dials.push(dial);
      const dr = 0.1;
      const pts: Vec3[] = [];
      for (let i = 0; i <= 24; i++) pts.push(P(dial.e + dr * Math.cos((2 * Math.PI * i) / 24), dial.h, dial.n + dr * Math.sin((2 * Math.PI * i) / 24)));
      sk.poly(pts, fine);
      // ticks: neutral, and the ends of raise and lower
      for (const a of [-135, 0, 135]) {
        const [x, y] = dialDir(a);
        sk.seg(P(dial.e + 0.75 * dr * x, dial.h, dial.n + 0.75 * dr * y), P(dial.e + dr * x, dial.h, dial.n + dr * y), fine);
      }
      sk.target(part('unit', `${u}`), [P(ce - G.r, hb, nC - G.r), P(ce + G.r, hT + 0.55, nC + G.r)], true);
      sk.target(part('dial', `${u}`), [P(dial.e - dr, dial.h, dial.n - dr), P(dial.e + dr, dial.h + 0.02, dial.n + dr)], true);
    });
    // the line down to each unit and back up
    units.forEach((_, u) => {
      const n = phaseN[u]!;
      sk.seg(P(eR + 0.5, POLE, n), P(...sTop[u]!), thin);
      sk.seg(P(...lTop[u]!), P(eR - 0.5, POLE, n), thin);
    });
    // the control cabinet on the east pole, its cable up to the units
    const cab = { e: eR + 2.7, h: 1.4, n: nC - 0.35 };
    sk.box(cab.e, cab.h, cab.n, 0.45, 0.65, 0.3);
    sk.poly([P(cab.e, cab.h + 0.65, cab.n), P(cab.e, G.deck - 0.1, cab.n), P(units[2]!, G.deck - 0.1, cab.n)], hair);
    sk.target(part('control'), [P(cab.e - 0.25, cab.h, cab.n - 0.2), P(cab.e + 0.25, cab.h + 0.65, cab.n + 0.2)], true);

    // ---- inside the cut unit: core, shunt and series windings
    sk.stagger = 0.12;
    const ce = units[cut]!;
    const cn = nC;
    const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color?: string) => sk.faces.quad(a, b, c, d, { ...fs(), ...(color ? { color } : {}) });
    const rect = (x0: number, x1: number, y0: number, y1: number, color?: string) => quad(P(x0, y0, cn), P(x1, y0, cn), P(x1, y1, cn), P(x0, y1, cn), color);
    const box = (x0: number, x1: number, y0: number, y1: number, s: { width: number; color: string } = { width: PEN.medium, color: INK }) => sk.poly([P(x0, y0, cn), P(x1, y0, cn), P(x1, y1, cn), P(x0, y1, cn)], s, true);
    const W = 0.56;
    const c = 0.06;
    const e0 = ce - W / 2;
    const e1 = ce + W / 2;
    const b0 = hb + 0.08;
    const b1 = hb + 0.76;
    // shell form: yokes and three legs in section, the coil round the middle leg
    rect(e0, e1, b0, b0 + c);
    rect(e0, e1, b1 - c, b1);
    for (const [x0, x1] of [
      [e0, e0 + c],
      [ce - c, ce + c],
      [e1 - c, e1],
    ] as const)
      rect(x0, x1, b0 + c, b1 - c);
    box(e0, e1, b0, b1);
    for (const [x0, x1] of [
      [e0 + c, ce - c],
      [ce + c, e1 - c],
    ] as const)
      box(x0, x1, b0 + c, b1 - c);
    sk.target(part('core'), [P(e0, b0, cn), P(e1, b1, cn)], true);
    // the coil, both sides of the middle leg: shunt winding inside (many fine turns), series outside (eight thick sections)
    const wy0 = b0 + c + 0.03;
    const wy1 = b1 - c - 0.03;
    const shuntTurns = 40;
    for (const sgn of [-1, 1]) {
      const xi = ce + sgn * (c + 0.012);
      const xm = ce + sgn * (c + 0.06);
      const xo = ce + sgn * (c + 0.1);
      for (let k = 0; k < shuntTurns; k++) {
        const y0 = wy0 + ((wy1 - wy0) * k) / shuntTurns;
        const y1 = wy0 + ((wy1 - wy0) * (k + 1)) / shuntTurns - 0.002;
        rect(Math.min(xi, xm), Math.max(xi, xm), y0, y1, INK_35);
      }
      box(Math.min(xi, xm), Math.max(xi, xm), wy0, wy1, fine);
      for (let k = 0; k < 8; k++) {
        const y0 = wy0 + ((wy1 - wy0) * k) / 8;
        const y1 = wy0 + ((wy1 - wy0) * (k + 1)) / 8 - 0.006;
        rect(Math.min(xm + sgn * 0.008, xo), Math.max(xm + sgn * 0.008, xo), y0, y1, INK_15);
        box(Math.min(xm + sgn * 0.008, xo), Math.max(xm + sgn * 0.008, xo), y0, y1, fine);
      }
    }
    sk.target(part('shunt'), [P(ce + c, wy0, cn), P(ce + c + 0.06, wy1, cn)], true);
    sk.target(part('series'), [P(ce + c + 0.06, wy0, cn), P(ce + c + 0.1, wy1, cn)], true);

    // ---- the tap changer, standing face-on behind the cut
    sk.stagger = 0.22;
    const sn = cn + 0.1;
    const R = 0.2;
    this.sel = { e: ce - 0.1, h: hT - 0.34, n: sn, R };
    const S = this.sel;
    // its insulating panel
    const Q = (e: number, h: number): Vec3 => P(e, h, sn + 0.005);
    quad(Q(ce - 0.36, hT - 0.66), Q(ce + 0.36, hT - 0.66), Q(ce + 0.36, hT - 0.04), Q(ce - 0.36, hT - 0.04));
    sk.poly([Q(ce - 0.36, hT - 0.66), Q(ce + 0.36, hT - 0.66), Q(ce + 0.36, hT - 0.04), Q(ce - 0.36, hT - 0.04)], fine, true);
    // the eight stationary contacts and neutral on an arc, and the tap leads down to the series winding
    for (let k = 0; k <= 8; k++) {
      const [x, y] = selDir(k);
      const cx = S.e + R * x;
      const cy = S.h + R * y;
      const pts: Vec3[] = [];
      for (let i = 0; i <= 10; i++) pts.push(P(cx + 0.016 * Math.cos((2 * Math.PI * i) / 10), cy + 0.016 * Math.sin((2 * Math.PI * i) / 10), S.n));
      sk.poly(pts, { width: PEN.medium, color: INK });
      if (k > 0) {
        const tapY = wy0 + ((wy1 - wy0) * (k - 0.5)) / 8;
        sk.poly([P(cx, cy - 0.016, S.n), P(cx, hT - 0.68, S.n), P(ce + c + 0.1 + 0.015, tapY, cn)], hair);
      }
    }
    // the preventive autotransformer, bridging the two fingers
    const pa = { e: ce + 0.24, h: hT - 0.46 };
    quad(Q(pa.e - 0.06, pa.h - 0.09), Q(pa.e + 0.06, pa.h - 0.09), Q(pa.e + 0.06, pa.h + 0.09), Q(pa.e - 0.06, pa.h + 0.09), INK_15);
    sk.poly([Q(pa.e - 0.06, pa.h - 0.09), Q(pa.e + 0.06, pa.h - 0.09), Q(pa.e + 0.06, pa.h + 0.09), Q(pa.e - 0.06, pa.h + 0.09)], fine, true);
    for (let k = 1; k < 6; k++) sk.seg(Q(pa.e - 0.06, pa.h - 0.09 + (0.18 * k) / 6), Q(pa.e + 0.06, pa.h - 0.09 + (0.18 * k) / 6), hair);
    sk.poly([Q(S.e, S.h), Q(S.e + 0.12, S.h - 0.06), Q(pa.e - 0.06, pa.h)], hair);
    // the reversing switch: a blade from the common lead to raise (+) or lower (−)
    this.revAt = { e: ce + 0.24, h: hT - 0.2, n: sn };
    for (const a of [30, 150]) {
      const x = this.revAt.e + 0.09 * Math.cos((a * Math.PI) / 180);
      const y = this.revAt.h + 0.09 * Math.sin((a * Math.PI) / 180);
      sk.seg(P(x - 0.012, y, sn), P(x + 0.012, y, sn), { width: PEN.medium, color: INK });
    }
    sk.target(part('selector'), [P(S.e - R, S.h - R, S.n), P(S.e + R, S.h + R, S.n)], true);
    sk.target(part('reversing'), [P(this.revAt.e - 0.08, this.revAt.h - 0.03, sn), P(this.revAt.e + 0.08, this.revAt.h + 0.08, sn)], true);
    sk.target(part('preventive'), [P(pa.e - 0.06, pa.h - 0.09, sn), P(pa.e + 0.06, pa.h + 0.09, sn)], true);

    // ---- what moves: the fingers, the reversing blade, the dials' hands
    this.moving.mesh.renderOrder = 32;
    sk.group.add(this.moving.mesh);
    const mst = { width: 2.2, color: INK, collapse: sk.anchor, stagger: 0.3 };
    this.fingers = [this.moving.segment(sk.anchor, sk.anchor, mst), this.moving.segment(sk.anchor, sk.anchor, mst)];
    this.rev = this.moving.segment(sk.anchor, sk.anchor, { ...mst, width: 1.8 });
    this.hands = this.dials.map(() => this.moving.segment(sk.anchor, sk.anchor, { ...mst, width: 1.6 }));
    this.moving.commit();

    // ---- power down to each unit and back up
    sk.stagger = 0.4;
    units.forEach((_, u) => {
      const n = phaseN[u]!;
      this.flows.push([sk.flowSeg(P(eR + 0.5, POLE, n), P(...sTop[u]!)), sk.flowSeg(P(...lTop[u]!), P(eR - 0.5, POLE, n))]);
    });

    // ---- names
    this.labels.push({ id: 'rg:unit', text: 'One unit per phase', anchor: P(units[2]!, hT + 0.6, nC), priority: 6, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'rg:core', text: 'Core, shunt winding, and the series winding in eight tapped sections', anchor: P(e1, (b0 + b1) / 2, cn), priority: 8, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'rg:selector', text: 'Tap selector: two fingers step along the taps', anchor: P(S.e - R, S.h - R * 0.6, S.n), priority: 9, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'rg:reversing', text: 'Reversing switch: raise or lower', anchor: P(this.revAt.e, this.revAt.h + 0.08, sn), priority: 7, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'rg:preventive', text: 'Preventive autotransformer: the half steps', anchor: P(pa.e + 0.06, pa.h - 0.09, sn), priority: 7, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'rg:dial', text: 'Position dial', anchor: P(this.dials[1]!.e, this.dials[1]!.h, this.dials[1]!.n - 0.1), priority: 5, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'rg:S', text: 'S: from the source', anchor: P(...sTop[1]!), priority: 6, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'rg:L', text: 'L: to the load', anchor: P(...lTop[1]!), priority: 6, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'rg:bypass', text: 'Bypass switches, open', anchor: P(eR, POLE + 0.6, phaseN[2]!), priority: 5, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'rg:control', text: 'Control: set point, bandwidth, line-drop compensation', anchor: P(cab.e, cab.h + 0.65, cab.n), priority: 6, minZoom: 0, kind: 'equip' });

    // fit: the cut unit, its tap changer and its bushings
    for (const e of [ce - G.r - 0.1, ce + G.r + 0.2]) for (const n of [nC - G.r, nC + G.r]) this.extent.push(P(e, hb + 0.3, n), P(e, hT + 0.6, n));
    sk.stagger = 0;
    sk.commit();
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  applySnapshot(s: Snapshot): void {
    this.state = this.stateOf(s);
    const st = this.state;
    this.target = st ? st.phases.map((p) => p.tap) : [0, 0, 0];
    if (this.lastTime < 0) this.shown = [...this.target];
    this.setMoving();
    this.setFlows();
  }

  private setFlows(): void {
    const st = this.state;
    const sc = this.flowScale;
    this.flows.forEach(([a, b], u) => {
      const p = st ? (st.phases[u]!.vL * st.phases[u]!.amps * Math.cos(((st.phases[u]!.degL - st.phases[u]!.degI) * Math.PI) / 180)) / 1000 : 0;
      for (const fl of [a, b]) this.sk.flow.set(fl, { sizePx: chevronSizeFor(p, sc), speed: chevronSpeedFor(p, sc) * Math.sign(p), side: 0, color: INK, alpha: Math.abs(p) > 1 ? 1 : 0 });
    });
  }

  /** The fingers at position `tap` (0 … ±16): on contacts ⌊|tap|/2⌋ and ⌈|tap|/2⌉, the same one or bridging two. */
  private setMoving(): void {
    const sk = this.sk;
    const S = this.sel;
    const t = this.shown[0]!;
    const a = Math.abs(t);
    const f = (k: number) => {
      const [x, y] = selDir(k);
      return sk.plan(S.e + 0.9 * S.R * x, S.h + 0.9 * S.R * y, S.n - 0.004);
    };
    const c = sk.plan(S.e, S.h, S.n - 0.004);
    this.moving.setEnds(this.fingers[0], c, f(Math.floor(a / 2)));
    this.moving.setEnds(this.fingers[1], c, f(Math.ceil(a / 2)));
    // reversing: toward raise (right) for a positive tap, lower (left) for negative, midway at neutral
    const ang = t > 0 ? 30 : t < 0 ? 150 : 90;
    const r = this.revAt;
    this.moving.setEnds(this.rev, sk.plan(r.e, r.h, r.n - 0.004), sk.plan(r.e + 0.09 * Math.cos((ang * Math.PI) / 180), r.h + 0.09 * Math.sin((ang * Math.PI) / 180), r.n - 0.004));
    this.dials.forEach((d, u) => {
      const [x, y] = dialDir((this.shown[u]! / 16) * 135);
      this.moving.setEnds(this.hands[u]!, sk.plan(d.e, d.h + 0.005, d.n), sk.plan(d.e + 0.085 * x, d.h + 0.005, d.n + 0.085 * y));
    });
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
    // a change of tap is made one step at a time, as the mechanism makes it (four a second here)
    this.stepClock += dt;
    let moved = false;
    if (this.stepClock >= 0.25) {
      this.stepClock = 0;
      for (let u = 0; u < 3; u++) {
        const d = this.target[u]! - this.shown[u]!;
        if (d === 0) continue;
        this.shown[u] = this.shown[u]! + Math.sign(d);
        moved = true;
      }
    }
    if (moved) this.setMoving();
    this.sk.frame(o);
    this.moving.frame(o);
  }

  set morph(m: number) {
    this.morphValue = m;
    this.sk.morph = m;
    this.moving.morph = m;
    this.moving.opacity = Math.max(0, Math.min(1, (m - 0.85) / 0.15));
  }

  get morph(): number {
    return this.morphValue;
  }

  fitPoints(): Vec3[] {
    return this.extent;
  }
}

/** A selector contact's direction from the pivot: neutral straight up, the eight taps stepping clockwise. */
function selDir(k: number): [number, number] {
  const a = ((90 - 17 * k) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
}

/** A dial's direction in the cover's plane for an angle from neutral (degrees; raise clockwise). */
function dialDir(deg: number): [number, number] {
  // neutral points away from the viewer across the cover (plan +e +n); clockwise seen from above
  const a = ((45 - deg) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
}
