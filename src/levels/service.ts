import type * as THREE from 'three';
import type { Vec3 } from '../render/lines';
import { INK, INK_15, INK_35, INK_60, PEN, SIGNAL, voltageClassFor, type VoltageClass } from '../render/style';
import { rect, transformerSymbol, warningSymbol } from '../render/symbols';
import type { IsoCamera } from '../render/iso';
import type { Snapshot } from '../model/snapshot';
import { nodeIndex, type Feeder } from '../model/feeder';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_ISO, PERSIST, Sketch, enIso } from './sketch';
import { ANSI_A } from './feeder';
import { drawHome } from './home';
import { insulator, vcyl } from './kit';

/**
 * The Service level: one pole-top transformer and the homes it serves, in metres,
 * drawn isometrically — and, for the home with the outlet, cut open.
 *
 * On the pole: the lateral's single primary conductor, the transformer can, and the
 * secondary (triplex) running along the street to the spans either side. From each
 * span point a service drop to a home. The home at the end of the chain has its two
 * near walls cut at waist height, the cut hatched as a drawing marks a section, and
 * inside: the meter where the drop lands, the panel, the 12 AWG branch circuit round
 * the walls, and the wall outlet with a hair dryer plugged in.
 *
 * Chevrons are in kilowatts: down the pole into the can, out along the secondary,
 * down each drop into each home, and along the branch circuit to the outlet.
 *
 * It sits inside the Feeder level, which draws the pole, the lateral, the drops and
 * the homes in the same place: those are drawn here never folding, and the rest — the
 * can, the secondary, the inside of the outlet home — unfolds among them.
 */

const POLE = 11;
const CAN = 8.6; // m, the transformer can's centre
const SEC = 7.4; // m, the secondary
const EAVE = 3.2;
const HOUSE = { se: 10, sh: 4, sn: 8 };
const CUT = 1.2; // m, where the outlet home's near walls are cut

export class ServiceLevel implements Level {
  readonly kind = 'service' as const;
  readonly name: string;
  readonly unitKm = 0.001;
  readonly needsDetail = true;
  readonly flowScale = FLOW_SCALES.service;
  readonly north = NORTH_ISO;
  readonly labels: LabelSpec[] = [];
  readonly sk = new Sketch(enIso);
  /** The transformer can: what the Feeder level's transformer symbol unfolds into. */
  readonly origin: Vec3;
  /** The ground under the pole: where this level sits in the neighbourhood. */
  readonly seat: Vec3 = enIso(0, 0, 0);
  readonly outletAt: Vec3 | null = null;
  private morphValue = 1;
  private flows: Array<{ k: number; flow: number; seg: number; sign: number }> = [];
  private outletFlow = -1;
  private homeMarks: Array<{ i: number; at: Vec3 }> = [];
  private extent: Vec3[] = [];

  constructor(
    readonly feeder: Feeder,
    readonly transformerId: string,
  ) {
    const sk = this.sk;
    const L = feeder.layout;
    const net = feeder.base;
    const tr = L.transformers.find((t) => t.id === transformerId)!;
    this.name = `Service ${transformerId.slice(2)}`;
    const t0 = L.pos.get(tr.primary)!;
    // plan: metres east and north of the pole, mirrored as the Feeder level is
    const EN = (p: { x: number; z: number }): [number, number] => [-(p.x - t0.x), -(p.z - t0.z)];
    const P = (id: string, h: number): Vec3 => {
      const [e, n] = EN(L.pos.get(id)!);
      return enIso(e, h, n);
    };
    const bidx = new Map(net.branches.map((b, k) => [b.id, k]));
    this.origin = enIso(0, CAN, 0);
    sk.anchor = this.origin;
    const lat = L.laterals.find((l) => l.id === tr.lateral)!;
    const mv = voltageClassFor(12.47);
    const lv = voltageClassFor(0.24);

    // ---- the pole, the primary through it, and the can
    sk.stagger = PERSIST;
    sk.seg(enIso(0, 0, 0), enIso(0, POLE, 0), { width: PEN.medium, color: INK });
    sk.stagger = 0;
    sk.seg(enIso(-1.2, POLE - 0.4, 0), enIso(1.2, POLE - 0.4, 0), { width: PEN.medium, color: INK }); // crossarm
    sk.stagger = PERSIST;
    // the primary conductor along the street: from the previous pole to the next
    const k = lat.nodes.indexOf(tr.primary);
    const prev = lat.nodes[k - 1];
    const next = lat.nodes[k + 1];
    const upstream = prev ? P(prev, POLE) : enIso(0, POLE, 60);
    const here = enIso(0, POLE, 0);
    const downstream = next ? P(next, POLE) : null;
    const trim = (a: Vec3, b: Vec3, m: number): Vec3 => {
      // stop a span m metres from `a` so neighbouring poles stay off the sheet's middle
      const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const f = Math.min(1, m / (d || 1));
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    };
    const up = trim(here, upstream, 45);
    const inK = prev ? bidx.get(`${prev}-${tr.primary}`) : undefined;
    const segUp = sk.seg(up, here, { width: mv.weight + 0.3, color: INK });
    if (inK !== undefined) this.flows.push({ k: inK, flow: sk.flowSeg(up, here), seg: segUp, sign: 1 });
    if (downstream) {
      const dn = trim(here, downstream, 45);
      const outK = bidx.get(`${tr.primary}-${next}`);
      const segDn = sk.seg(here, dn, { width: mv.weight + 0.3, color: INK });
      if (outK !== undefined) this.flows.push({ k: outK, flow: sk.flowSeg(here, dn), seg: segDn, sign: 1 });
    }
    this.labels.push({ id: 'sv:primary', text: `Lateral ${lat.id}, phase ${'abc'[lat.phase]}`, anchor: up, priority: 5, minZoom: 0, kind: 'equip', prov: `data:evergreen.layout.laterals.${lat.id}` });
    // the can: a box standing on a bracket, and its drop from the primary
    sk.stagger = 0.08;
    // the can: a round tank hung on the pole, its primary bushing on the lid
    const l0 = sk.lines.count;
    const f0 = sk.faces.vertexCount;
    vcyl(sk, 0.9, 0, 0.42, CAN + 0.8, CAN - 0.8);
    insulator(sk, [0.9, CAN + 0.8, 0], [0.9, CAN + 1.25, 0], 0.12);
    this.canDraw = { lines: [l0, sk.lines.count - l0], faces: [f0, sk.faces.vertexCount - f0] };
    const can: Vec3[] = [enIso(0.5, CAN - 0.8, -0.4), enIso(1.3, CAN + 0.8, 0.4)];
    const ctK = bidx.get(transformerId)!;
    const tap = sk.seg(here, enIso(0.9, CAN + 1.25, 0), { width: PEN.thin, color: INK });
    this.flows.push({ k: ctK, flow: sk.flowSeg(here, enIso(0.9, CAN + 1.25, 0)), seg: tap, sign: 1 });
    const g0 = sk.glyphs.count;
    sk.symbol(enIso(0.9, CAN, 0), transformerSymbol(3.5), PEN.thin, 16, 0);
    this.canGlyphs = [g0, sk.glyphs.count - g0];
    sk.target({ kind: 'dist', what: 'transformer', id: transformerId }, can, true);
    this.labels.push({ id: 'sv:can', text: `${tr.kva} kVA`, anchor: enIso(0.9, CAN + 1, 0), priority: 8, minZoom: 0, kind: 'equip', prov: `data:evergreen.layout.transformers.${transformerId}.kva` });

    // ---- the secondary along the street, and the drops
    sk.stagger = 0.16;
    const secNodes = [tr.secondary, `${tr.secondary}N`, `${tr.secondary}S`];
    const secAt = (id: string) => P(id, SEC);
    this.secondaryAt = secAt(tr.secondary);
    // the can's three secondary leads to the triplex (its own level draws them the same way, from its bushings)
    for (const i of [0, 1, 2]) {
      const t = ((125 + 20 * i) * Math.PI) / 180;
      sk.seg(enIso(0.9 + 0.55 * Math.cos(t), CAN - 0.42, 0.55 * Math.sin(t)), [this.secondaryAt[0], this.secondaryAt[1] + (i - 1) * 0.05, this.secondaryAt[2]], { width: i === 1 ? lv.weight : lv.weight + 0.4, color: INK });
    }
    for (const sid of secNodes.slice(1)) {
      const bk = bidx.get(`${tr.secondary}-${sid}`);
      const seg = sk.seg(secAt(tr.secondary), secAt(sid), { width: lv.weight + 0.4, color: INK, dash: lv.dash });
      if (bk !== undefined) this.flows.push({ k: bk, flow: sk.flowSeg(secAt(tr.secondary), secAt(sid)), seg, sign: 1 });
      sk.seg(enIso(...(([e, n]) => [e, 0, n] as const)(EN(L.pos.get(sid)!))), secAt(sid), { width: PEN.hairline, color: INK_60 }); // a service pole
    }
    const idx = nodeIndex(feeder);
    const homes = L.homes.filter((h) => h.transformer === transformerId);
    for (const h of homes) {
      sk.stagger = PERSIST;
      const [e, n] = EN(h);
      const drop = net.branches.find((b) => b.to === h.id)!;
      const outlet = h.id === L.outlet.home;
      const a = secAt(drop.from);
      const streetE = EN(L.pos.get(drop.from)!)[0];
      // the home first (the Feeder level draws the same one here), then its drop to the eave over the meter
      const home = outlet ? null : drawHome(sk, e, n, h.pvKW > 0, streetE);
      const b = home ? home.drop : enIso(e + (e > 0 ? -HOUSE.se / 2 : HOUSE.se / 2), EAVE, n);
      const seg = sk.seg(a, b, { width: lv.weight, color: INK, dash: lv.dash });
      this.flows.push({ k: bidx.get(drop.id)!, flow: sk.flowSeg(a, b), seg, sign: 1 });
      if (home) sk.target({ kind: 'dist', what: 'home', id: h.id }, home.corners, true);
      if (home?.inverter) this.inverters.push({ homeId: h.id, e, n, streetE, ...home.inverter });
      else {
        this.cutaway(e, n, b, h.id);
        (this as { outletAt: Vec3 | null }).outletAt = enIso(e + HOUSE.se / 2 - 0.02, 0.35, n + 1.5);
      }
      this.homeMarks.push({ i: idx.get(h.id)!, at: enIso(e, HOUSE.sh, n) });
    }
    // the street, as two kerb lines
    sk.stagger = 0;
    for (const de of [-7, 7]) sk.seg(enIso(de, 0, -70), enIso(de, 0, 70), { width: PEN.hairline, color: INK_35 });
    sk.commit();
    const xs = homes.map((h) => EN(h));
    const e0 = Math.min(...xs.map((p) => p[0])) - 8;
    const e1 = Math.max(...xs.map((p) => p[0])) + 8;
    const n0 = Math.min(...xs.map((p) => p[1]), -40) - 6;
    const n1 = Math.max(...xs.map((p) => p[1]), 40) + 6;
    this.extent = [enIso(e0, 0, n0), enIso(e1, 0, n0), enIso(e1, 0, n1), enIso(e0, 0, n1), enIso(0, POLE, 0)];
    void INK_15;
  }

  /** The outlet home, cut open: two near walls cut at waist height and hatched; the chain inside. */
  private cutaway(e: number, n: number, dropEnd: Vec3, homeId: string): void {
    const sk = this.sk;
    const { se, sh, sn } = HOUSE;
    const x0 = e - se / 2;
    const x1 = e + se / 2;
    const y0 = n - sn / 2;
    const y1 = n + sn / 2;
    // floor
    sk.faces.quad(enIso(x0, 0, y0), enIso(x1, 0, y0), enIso(x1, 0, y1), enIso(x0, 0, y1), { collapse: sk.anchor, stagger: sk.stagger });
    // far walls (north and east), full height: the ones the camera sees from inside
    const wall = (a: [number, number], b: [number, number], h: number, hatch: boolean) => {
      const q: Vec3[] = [enIso(a[0], 0, a[1]), enIso(b[0], 0, b[1]), enIso(b[0], h, b[1]), enIso(a[0], h, a[1])];
      sk.faces.quad(q[0]!, q[1]!, q[2]!, q[3]!, hatch ? { color: INK_35, hatch: true, collapse: sk.anchor, stagger: sk.stagger } : { collapse: sk.anchor, stagger: sk.stagger });
      sk.poly(q, { width: PEN.fine, color: INK }, true);
    };
    wall([x0, y1], [x1, y1], sh, false); // north
    wall([x1, y0], [x1, y1], sh, false); // east
    // near walls (south and west) cut at waist height: the cut is hatched
    wall([x0, y0], [x1, y0], CUT, true);
    wall([x0, y0], [x0, y1], CUT, true);
    sk.target({ kind: 'dist', what: 'home', id: homeId }, [enIso(x0, 0, y0), enIso(x1, 0, y0), enIso(x1, sh, y1), enIso(x0, sh, y1)], true);
    sk.stagger = 0.4;
    // the meter where the drop lands (on the outside of the west or east wall), then the panel inside
    const meterSide = dropEnd[0] < e ? x0 : x1;
    const meter = enIso(meterSide, 1.6, n - 1);
    sk.symbol(meter, { polys: [rect(7, 9)], closed: [true] }, PEN.thin);
    sk.seg(dropEnd, meter, { width: PEN.thin, color: INK });
    this.labels.push({ id: 'sv:meter', text: 'Meter', anchor: meter, priority: 9, minZoom: 0, kind: 'equip' });
    const panel = enIso(x0 + 1.5, 1.4, y1 - 0.05);
    sk.box(x0 + 1.5, 0.9, y1 - 0.2, 0.6, 1.0, 0.25, { width: PEN.fine, color: INK });
    sk.seg(meter, enIso(x0 + 1.5, 1.4, y1 - 0.3), { width: PEN.thin, color: INK, dash: 'hidden' });
    this.labels.push({ id: 'sv:panel', text: 'Panel', anchor: panel, priority: 9, minZoom: 0, kind: 'equip' });
    // the branch circuit: down the wall, along the north and east walls at outlet height, to the outlet
    const route: Vec3[] = [enIso(x0 + 1.5, 0.9, y1 - 0.1), enIso(x0 + 1.5, 0.35, y1 - 0.1), enIso(x1 - 0.1, 0.35, y1 - 0.1), enIso(x1 - 0.1, 0.35, n + 1.5)];
    const segs: number[] = [];
    for (let i = 0; i + 1 < route.length; i++) segs.push(sk.seg(route[i]!, route[i + 1]!, { width: PEN.medium, color: INK }));
    this.outletFlow = sk.flowSeg(route[1]!, route[2]!);
    this.outletFlow2 = sk.flowSeg(route[2]!, route[3]!);
    this.labels.push({ id: 'sv:circuit', text: 'Branch circuit · 12 AWG', anchor: route[2]!, priority: 7, minZoom: 0, kind: 'equip', prov: 'data:evergreen.WIRING_12AWG' });
    // the outlet: a plate with two slots, and a hair dryer's cord
    const o = enIso(x1 - 0.05, 0.35, n + 1.5);
    sk.symbol(o, { polys: [rect(8, 11), [[-1.5, 1.5], [-1.5, 3.5]], [[1.5, 1.5], [1.5, 3.5]], [[0, -2.5], [0, -3.5]]], closed: [true, false, false, false] }, PEN.thin);
    sk.seg(o, enIso(x1 - 1.4, 0.9, n + 2.4), { width: PEN.thin, color: INK });
    sk.box(x1 - 1.6, 0.9, n + 2.5, 0.35, 0.25, 0.2, { width: PEN.fine, color: INK });
    sk.target({ kind: 'dist', what: 'outlet', id: 'OUTLET' }, [o]);
    this.labels.push({ id: 'sv:outlet', text: 'The outlet', anchor: o, priority: 12, minZoom: 0, kind: 'equip' });
    void segs;
  }
  private outletFlow2 = -1;
  /** The can as drawn here: hidden while its own level (the transformer opened) is open. */
  private canDraw = { lines: [0, 0] as [number, number], faces: [0, 0] as [number, number] };
  private canGlyphs: [number, number] = [0, 0];
  /** Where the secondary's three wires meet the triplex. */
  secondaryAt: Vec3 = [0, 0, 0];
  /** Each home's solar inverter as drawn (each opens into a level of its own). */
  readonly inverters: Array<{ homeId: string; e: number; n: number; streetE: number; lines: [number, number]; faces: [number, number]; at: Vec3 }> = [];

  yieldTo(key: string, m: number): void {
    const inv = this.inverters.find((x) => key === `inv:${x.homeId}`);
    if (inv) {
      // the inverter's own level draws it, opened, with its conduit and cable
      for (let i = inv.lines[0]; i < inv.lines[0] + inv.lines[1]; i++) this.sk.lines.setDim(i, m > 0 ? 1 : 0);
      this.sk.faces.setHidden(inv.faces[0], inv.faces[1], m > 0, 0);
      return;
    }
    if (key !== `pt:${this.transformerId}`) return;
    const hide = m > 0;
    const d = this.canDraw;
    for (let i = d.lines[0]; i < d.lines[0] + d.lines[1]; i++) this.sk.lines.setDim(i, hide ? 1 : 0);
    for (let i = this.canGlyphs[0]; i < this.canGlyphs[0] + this.canGlyphs[1]; i++) this.sk.glyphs.setDim(i, hide ? 1 : 0);
    this.sk.faces.setHidden(d.faces[0], d.faces[1], hide, 0.08);
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  get classes(): VoltageClass[] {
    return [voltageClassFor(12.47), voltageClassFor(0.24)];
  }

  applySnapshot(s: Snapshot): void {
    const sk = this.sk;
    const f = s.feeder;
    const none = s.outcome === 'none' || !f;
    const dark = !!f && f.headP === 0 && f.boundaryP === 0;
    const sc = this.flowScale;
    for (const x of this.flows) {
      const kw = f ? (x.sign * f.flows[x.k * 4]!) / 1000 : 0;
      sk.lines.setColor(x.seg, dark ? SIGNAL : none ? INK_35 : INK, 1);
      sk.flow.set(x.flow, { sizePx: chevronSizeFor(kw, sc), speed: chevronSpeedFor(kw, sc) * Math.sign(kw), color: INK, alpha: !none && !dark && Math.abs(kw) > 0.005 ? 1 : 0 });
    }
    // the branch circuit carries the hair dryer's power
    if (f) {
      const i = f.loadIds.indexOf('OUTLET:appliance');
      const kw = i >= 0 ? f.loadP[i]! / 1000 : 0;
      for (const fl of [this.outletFlow, this.outletFlow2])
        if (fl >= 0) sk.flow.set(fl, { sizePx: chevronSizeFor(kw, sc), speed: chevronSpeedFor(kw, sc) * Math.sign(kw), color: INK, alpha: !none && !dark ? 1 : 0 });
    }
    sk.marks.clear();
    if (f && !none && !dark)
      for (const h of this.homeMarks) {
        const v = (Math.hypot(f.V[h.i * 6]!, f.V[h.i * 6 + 1]!) + Math.hypot(f.V[h.i * 6 + 2]!, f.V[h.i * 6 + 3]!)) / 2;
        if (v < ANSI_A.low || v > ANSI_A.high) warningSymbol(11).polys.forEach((p, i) => sk.marks.glyph(h.at, p.map(([x, y]) => [x, y + 14] as [number, number]), { width: PEN.medium, color: SIGNAL }, i === 0));
      }
    sk.marks.commit();
  }

  highlight(_sel: Selection | null): Set<string> | null {
    return null;
  }

  pick(sx: number, sy: number, cam: IsoCamera): Selection | null {
    return this.sk.pick(sx, sy, cam);
  }

  frame(o: FrameInfo): void {
    this.sk.frame(o);
  }

  set morph(m: number) {
    this.morphValue = m;
    this.sk.morph = m;
  }

  get morph(): number {
    return this.morphValue;
  }

  fitPoints(): Vec3[] {
    return this.extent;
  }
}
