import type * as THREE from 'three';
import { LineBatch, type Vec3 } from '../render/lines';
import { INK, INK_15, INK_35, INK_60, PEN, voltageClassFor, type VoltageClass } from '../render/style';
import type { IsoCamera } from '../render/iso';
import type { Snapshot } from '../model/snapshot';
import { invWave, type InvState } from '../model/invState';
import { COMPONENTS } from '../data/components';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_ISO, PERSIST, Sketch, enIso } from './sketch';
import { GHOST, vcyl } from './kit';
import { inverterGeom } from './home';

/**
 * The Inverter level: a home's rooftop solar inverter, on its wall, opened (it unfolds
 * in the Service level's frame). Its cover and near side are cut away; on its back
 * plate, in the order the power passes:
 *
 * - the DC terminals and disconnect, where the panels' conduit comes in;
 * - the DC link: capacitors that hold the panels' voltage steady;
 * - the H-bridge: four switches on two legs between the DC rails. S1 and S4 on puts the
 *   DC across the output one way round, S2 and S3 the other;
 * - the filter inductors on the two outputs, which smooth the pulses into a sine;
 * - the output relay and the AC terminals, out along the wall to the meter;
 * - the control board, which tracks the panels' best operating point, keeps the output
 *   in step with the grid's voltage, and opens the relay if the grid goes away.
 *
 * What moves is the solution, slowed `slowdown` times: the switches conduct in turn by
 * pulse-width modulation (drawn with `drawnCarrier` pulses a cycle), the panels' power
 * comes down the conduit steadily, and the power out along the cable pulses at twice
 * the line frequency — the capacitors make up the difference.
 */

export class InverterLevel implements Level {
  readonly kind = 'inverter' as const;
  readonly unitKm = 0.001;
  readonly needsDetail = true;
  readonly flowScale = FLOW_SCALES.inverter;
  readonly north = NORTH_ISO;
  readonly labels: LabelSpec[] = [];
  readonly sk = new Sketch(enIso);
  readonly seat: Vec3;
  readonly name: string;
  readonly classes: VoltageClass[] = [voltageClassFor(0.24)];
  state: InvState | null = null;
  private morphValue = 1;
  private sw = new LineBatch('inv-switches');
  /** Each switch's conducting bar: S1, S2 (leg A, top and bottom), S3, S4 (leg B). */
  private bars: number[] = [];
  private dcFlows: number[] = [];
  private acFlows: number[] = [];
  private acTravel = 0;
  private lastTime = -1;
  private extent: Vec3[] = [];

  /** Where the inverter stands on its home's wall, in the Service frame (its portal's anchor). */
  static anchorIn(e: number, n: number, streetE: number): Vec3 {
    const g = inverterGeom(e, n, streetE);
    return enIso(g.box.e, g.box.h + g.box.sh / 2, g.box.n);
  }

  constructor(
    readonly homeId: string,
    e: number,
    n: number,
    streetE: number,
    private readonly stateOf: (s: Snapshot) => InvState | null,
  ) {
    const sk = this.sk;
    const P = (ee: number, h: number, nn: number): Vec3 => enIso(ee, h, nn);
    const g = inverterGeom(e, n, streetE);
    const b = g.box;
    this.name = `Solar inverter, home ${homeId.replace(/^H-?/, '')}`;
    this.seat = InverterLevel.anchorIn(e, n, streetE);
    sk.anchor = this.seat;
    const part = (what: string): Selection => ({ kind: 'part', id: `inv:${homeId}`, what }) as Selection;
    const fs = () => ({ collapse: sk.anchor, stagger: sk.stagger });
    const fine = { width: PEN.fine, color: INK };
    const thin = { width: PEN.thin, color: INK };
    const hair = { width: PEN.hairline, color: INK_60 };
    const e0 = b.e - b.se / 2;
    const e1 = b.e + b.se / 2;
    const h0 = b.h;
    const h1 = b.h + b.sh;
    const nb = b.n + b.sn / 2; // the back, against the wall
    const nf = b.n - b.sn / 2; // the front, toward the viewer

    // ---- the box, its cover and near side cut away; the conduit and the cable as the home draws them
    sk.stagger = PERSIST;
    sk.faces.quad(P(e0, h0, nb), P(e1, h0, nb), P(e1, h1, nb), P(e0, h1, nb), fs());
    sk.faces.quad(P(e1, h0, nf), P(e1, h0, nb), P(e1, h1, nb), P(e1, h1, nf), fs());
    sk.faces.quad(P(e0, h0, nf), P(e1, h0, nf), P(e1, h0, nb), P(e0, h0, nb), fs());
    sk.poly([P(e0, h1, nb), P(e1, h1, nb), P(e1, h1, nf)], { width: PEN.outline, color: INK });
    sk.poly([P(e1, h1, nf), P(e1, h0, nf), P(e0, h0, nf)], { width: PEN.bold, color: INK });
    sk.poly([P(e0, h0, nf), P(e0, h0, nb), P(e0, h1, nb)], { width: PEN.outline, color: INK });
    sk.seg(P(e1, h0, nb), P(e1, h1, nb), fine);
    sk.seg(P(e0, h0, nb), P(e1, h0, nb), fine);
    sk.poly([P(e0, h1, nb), P(e0, h1, nf), P(e1, h1, nf)], GHOST);
    sk.seg(P(e0, h1, nf), P(e0, h0, nf), GHOST);
    sk.poly(g.dc.map((q) => P(...q)), { width: PEN.hairline, color: INK });
    sk.poly(g.ac.map((q) => P(...q)), { width: PEN.hairline, color: INK });
    sk.target(part('case'), [P(e0, h0, nf), P(e1, h1, nb)], true);

    // ---- on the back plate, face-on: everything the power passes through
    sk.stagger = 0.15;
    const np = nb - 0.012;
    const Q = (x: number, y: number): Vec3 => P(b.e + x, h0 + y, np);
    const rect = (x0: number, y0: number, x1: number, y1: number, s: { width: number; color: string } = fine, fill?: string) => {
      sk.faces.quad(Q(x0, y0), Q(x1, y0), Q(x1, y1), Q(x0, y1), { ...fs(), ...(fill ? { color: fill } : {}) });
      sk.poly([Q(x0, y0), Q(x1, y0), Q(x1, y1), Q(x0, y1)], s, true);
    };
    // DC terminals and disconnect, top left, where the conduit comes in
    const dcIn = -0.15;
    rect(-0.21, 0.56, -0.09, 0.64);
    sk.seg(Q(dcIn, 0.7), Q(dcIn, 0.64), thin);
    sk.seg(Q(-0.19, 0.6), Q(-0.12, 0.62), { width: PEN.medium, color: INK });
    sk.target(part('dcin'), [Q(-0.21, 0.56), Q(-0.09, 0.64)], true);
    // the DC rails: + along the top, − along the bottom of the bridge
    const yP = 0.5;
    const yN = 0.22;
    sk.poly([Q(dcIn, 0.56), Q(dcIn, yP), Q(0.17, yP)], { width: PEN.medium, color: INK });
    sk.poly([Q(-0.19, 0.56), Q(-0.19, yN), Q(0.17, yN)], { width: PEN.medium, color: INK });
    // the DC link capacitors, standing off the plate between the rails
    sk.stagger = 0.2;
    for (const x of [-0.12, -0.05]) {
      vcyl(sk, b.e + x, np - 0.03, 0.025, h0 + 0.44, h0 + 0.3);
      sk.seg(Q(x, 0.44), Q(x, yP), fine);
      sk.seg(Q(x, 0.3), Q(x, yN), fine);
    }
    sk.target(part('dclink'), [Q(-0.15, 0.28), Q(-0.02, 0.46)], true);
    // the H-bridge: two legs, each a switch from + to the midpoint and one from the midpoint to −
    sk.stagger = 0.25;
    const legs = [0.04, 0.14];
    const yMid = (yP + yN) / 2;
    const sws: Array<[number, number, number]> = [];
    legs.forEach((x) => {
      for (const [ya, yb] of [
        [yP, yMid],
        [yMid, yN],
      ] as const) {
        const yc = (ya + yb) / 2;
        rect(x - 0.025, yc - 0.03, x + 0.025, yc + 0.03, thin, INK_15);
        sk.seg(Q(x, ya), Q(x, yc + 0.03), fine);
        sk.seg(Q(x, yc - 0.03), Q(x, yb), fine);
        sws.push([x, yc, 0]);
      }
    });
    sk.target(part('bridge'), [Q(0.01, yN), Q(0.17, yP)], true);
    // the outputs from each leg's midpoint, through the filter inductors, to the relay and the AC terminals
    const yL = 0.1;
    const coil = (x: number) => {
      rect(x - 0.022, yL - 0.035, x + 0.022, yL + 0.035, fine);
      for (let k = 1; k < 6; k++) sk.seg(Q(x - 0.022, yL - 0.035 + (0.07 * k) / 6), Q(x + 0.022, yL - 0.035 + (0.07 * k) / 6), hair);
    };
    legs.forEach((x, k) => {
      sk.poly([Q(x, yMid), Q(x + 0.045, yMid), Q(x + 0.045, yL + 0.035)], fine);
      coil(x + 0.045);
      sk.poly([Q(x + 0.045, yL - 0.035), Q(x + 0.045, 0.04), Q(0.2, 0.04 + k * 0.012)], fine);
    });
    sk.target(part('filter'), [Q(0.06, yL - 0.04), Q(0.21, yL + 0.04)], true);
    rect(0.19, 0.02, 0.23, 0.08, fine);
    sk.target(part('relay'), [Q(0.19, 0.02), Q(0.23, 0.08)], true);
    sk.seg(Q(0.15, 0.02), Q(0.15, 0), thin);
    // the control board, left, below the DC link
    sk.stagger = 0.3;
    rect(-0.22, 0.04, -0.06, 0.2, fine, INK_15);
    rect(-0.17, 0.09, -0.11, 0.15, fine);
    for (const y of [0.1, 0.12, 0.14]) {
      sk.seg(Q(-0.19, y), Q(-0.17, y), hair);
      sk.seg(Q(-0.11, y), Q(-0.09, y), hair);
    }
    sk.seg(Q(-0.06, 0.12), Q(0.02, 0.12), { width: PEN.hairline, color: INK_35, dash: 'hidden' });
    sk.target(part('control'), [Q(-0.22, 0.04), Q(-0.06, 0.2)], true);

    // ---- what moves: each switch's conducting bar
    this.sw.mesh.renderOrder = 32;
    sk.group.add(this.sw.mesh);
    const bst = { width: 3, color: INK, collapse: sk.anchor, stagger: 0.35 };
    for (const [x, yc] of sws) this.bars.push(this.sw.segment(Q(x, yc - 0.028), Q(x, yc + 0.028), bst));
    this.sw.commit();

    // ---- power: steady down the conduit, pulsing out along the cable
    sk.stagger = 0.4;
    for (let k = 0; k + 1 < g.dc.length; k++) this.dcFlows.push(sk.flowSeg(P(...g.dc[k]!), P(...g.dc[k + 1]!)));
    for (let k = 0; k + 1 < g.ac.length; k++) this.acFlows.push(sk.flowSeg(P(...g.ac[k]!), P(...g.ac[k + 1]!)));

    // ---- names
    this.labels.push({ id: 'iv:dc', text: 'From the panels: direct current', anchor: P(...g.dc[2]!), priority: 7, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'iv:link', text: 'DC link capacitors', anchor: Q(-0.12, 0.46), priority: 8, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'iv:bridge', text: 'Four switches: the H-bridge', anchor: Q(0.17, yP), priority: 9, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'iv:filter', text: 'Filter inductors: pulses to a sine', anchor: Q(0.2, yL), priority: 8, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'iv:control', text: 'Control: in step with the grid', anchor: Q(-0.22, 0.04), priority: 7, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'iv:ac', text: 'To the meter: alternating current', anchor: P(...g.ac[2]!), priority: 7, minZoom: 0, kind: 'equip' });

    // fit: the box, close
    for (const ee of [e0 - 0.06, e1 + 0.06]) for (const hh of [h0 - 0.06, h1 + 0.06]) this.extent.push(P(ee, hh, nb), P(ee, hh, nf));
    sk.stagger = 0;
    sk.commit();
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  get tau(): number {
    return Math.max(0, this.lastTime) / COMPONENTS.slowdown;
  }

  applySnapshot(s: Snapshot): void {
    this.state = this.stateOf(s);
    this.show(0);
  }

  private show(dt: number): void {
    const st = this.state;
    const on = !!st && st.pAC > 1;
    const sc = this.flowScale;
    // the panels' power: steady
    const dc = on ? st!.pDC / 1000 : 0;
    for (const f of this.dcFlows) this.sk.flow.set(f, { sizePx: chevronSizeFor(dc, sc), speed: chevronSpeedFor(dc, sc), side: 0, color: INK, alpha: on ? 1 : 0 });
    // the switches and the power out, at this instant
    const w = on ? invWave(st!, this.tau) : null;
    const p = w ? w.p / 1000 : 0;
    this.acTravel += chevronSpeedFor(p, sc) * dt;
    for (const f of this.acFlows) this.sk.flow.set(f, { sizePx: chevronSizeFor(p, sc), speed: 1e-6, phase: -this.acTravel, side: 0, color: INK, alpha: on ? Math.min(1, (1.5 * p) / Math.max(1e-9, dc)) : 0 });
    const conducting = w ? (w.leg === 1 ? [0, 3] : [1, 2]) : [];
    this.bars.forEach((bar, k) => this.sw.setAlpha(bar, conducting.includes(k) ? 1 : 0));
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
    this.sw.frame(o);
  }

  set morph(m: number) {
    this.morphValue = m;
    this.sk.morph = m;
    this.sw.morph = m;
    this.sw.opacity = Math.max(0, Math.min(1, (m - 0.85) / 0.15));
  }

  get morph(): number {
    return this.morphValue;
  }

  fitPoints(): Vec3[] {
    return this.extent;
  }
}
