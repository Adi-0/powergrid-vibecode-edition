import type * as THREE from 'three';
import type { Vec3 } from '../render/lines';
import { INK, INK_35, INK_60, PEN, SIGNAL, voltageClassFor, type VoltageClass } from '../render/style';
import { circle, crossSymbol, faultSymbol, rect, transformerSymbol, warningSymbol, type Symbol } from '../render/symbols';
import type { IsoCamera } from '../render/iso';
import type { Snapshot } from '../model/snapshot';
import { nodeIndex, type Feeder } from '../model/feeder';
import { FLOW_MAX_PX, FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_MAP, Sketch, enIso as en } from './sketch';
import type { Grid } from '../model/grid';
import { siteExits } from './exits';

/**
 * The Feeder level: the neighbourhood Evergreen serves, and feeder 1105 through it,
 * pole by pole, in metres. It is what the System's Evergreen node unfolds into: the
 * substation at its head (drawn as its fence and gantry here; its own level unfolds
 * the yard inside), the 60 kV circuits arriving from Metcalf on their bearing, and the
 * streets. The plan is laid square to the sheet like every equipment drawing, so its
 * street grid runs 45° off true north (the north arrow says which way is which).
 *
 * The three-phase trunk runs west along the arterial from the substation; ten fused
 * single-phase laterals run north and south down the side streets; a short three-phase
 * spur feeds the grocery. On the trunk: the feeder breaker, a recloser, a voltage
 * regulator and a capacitor bank. On every lateral pole with a transformer, the
 * two-circle symbol, and from it the service drops to the homes it serves — small
 * blocks, those with rooftop solar carrying a panel on the roof.
 *
 * Chevrons are in kilowatts at this level's scale. Around noon, laterals with a lot of
 * rooftop solar can run backwards toward the trunk: the chevrons turn round.
 * A home whose service voltage is outside ANSI C84.1 Range A (114–126 V) gets the
 * warning mark.
 */

const POLE = 11; // m, conductor height on the poles
const CAN = 8.6; // m, a pole-top transformer's centre
const SEC = 7.4; // m, the secondary on the poles
const EAVE = 3.2; // m, where a service drop meets a home
const HOME_H = 4; // m
/** The substation's centre in this plan, and where the 60 kV circuits leave it (radius, m). */
const SUB: [number, number] = [40, 0];
const EXIT_R = 260;

/** The layout's (x east of the substation along the trunk, z south) → (east, north), mirrored so the trunk runs west. */
const EN = (p: { x: number; z: number }): [number, number] => [-p.x, -p.z];

export const ANSI_A = { low: 114, high: 126 } as const;

export class FeederLevel implements Level {
  readonly kind = 'feeder' as const;
  readonly name = 'Feeder 1105';
  readonly unitKm = 0.001;
  readonly needsDetail = true;
  readonly flowScale = FLOW_SCALES.feeder;
  readonly north = NORTH_MAP;
  readonly labels: LabelSpec[] = [];
  readonly sk = new Sketch(en);
  /** The feeder's first pole outside the substation. */
  readonly origin: Vec3;
  /** Under the substation's centre: where this level sits on the System's Evergreen node. */
  readonly seat: Vec3 = en(SUB[0], 0, SUB[1]);
  private exitPts: Array<{ branch: number; at: Vec3; stagger: number }> = [];
  /** The substation's stand-in (its own level draws the yard): strokes, faces, glyphs. */
  private standIn = { lines: [0, 0] as [number, number], faces: [0, 0] as [number, number], glyphs: [0, 0] as [number, number] };
  /** Each pole-top transformer's homes and symbol, hidden while its service is open. */
  private serviceDraw = new Map<string, { lines: Array<[number, number]>; faces: Array<[number, number]>; glyphs: [number, number]; stagger: number[] }>();
  private morphValue = 1;
  private lines: Array<{ k: number; seg: number; flow: number; from: string }> = [];
  /** Each home's drawn strokes (drop and outline), to show it without supply. */
  private homeSegs: Array<{ id: string; first: number; count: number }> = [];
  /** Where each protective device sits (for its open mark). */
  private devAt = new Map<string, Vec3>();
  private children = new Map<string, string[]>();
  private nodeAt = new Map<string, Vec3>();
  private last: Snapshot | null = null;
  /**
   * A fault on the feeder and the protection's state as its sequence plays: where it
   * is, whether fault current is flowing now, which devices are open, and the branches
   * the fault current flows through.
   */
  private fault: { node: string; conducting: boolean; open: Set<string>; path: Set<number> } | null = null;
  private homeMarks: Array<{ i: number; at: Vec3 }> = [];
  private extent: Vec3[] = [];
  private selection: Selection | null = null;

  constructor(
    readonly feeder: Feeder,
    readonly grid: Grid,
  ) {
    const sk = this.sk;
    const L = feeder.layout;
    const net = feeder.base;
    const idx = nodeIndex(feeder);
    const at = (id: string, h: number): Vec3 => {
      const [e, n] = EN(L.pos.get(id)!);
      return en(e, h, n);
    };
    this.origin = at('F0', POLE);
    sk.anchor = this.seat;
    // distance along the network from the first pole, for the order the feeder unfolds in
    const dist = new Map<string, number>([['F0', 0]]);
    const kids = new Map<string, string[]>();
    for (const b of net.branches) kids.set(b.from, [...(kids.get(b.from) ?? []), b.to]);
    this.children = kids;
    for (let q = ['F0']; q.length; ) {
      const next: string[] = [];
      for (const n of q) {
        const p = L.pos.get(n)!;
        for (const c of kids.get(n) ?? []) {
          const pc = L.pos.get(c)!;
          dist.set(c, dist.get(n)! + Math.hypot(pc.x - p.x, pc.z - p.z));
          next.push(c);
        }
      }
      q = next;
    }
    const far = Math.max(...dist.values());
    const stag = (id: string) => (0.5 * (dist.get(id) ?? 0)) / far;
    // Out of the System's node the neighbourhood grows down its streets: each span from
    // the pole before it, each home from its drop, in order of distance along the feeder.
    const parentOf = new Map(net.branches.map((b) => [b.to, b.from]));

    // ---- the substation at the head: its fence, its 60 kV gantry and the circuits in
    // (the Substation level draws these in the same place), and a stand-in for the yard
    sk.stagger = 0;
    const sub: Array<[number, number]> = [
      [0, -25],
      [80, -25],
      [80, 25],
      [0, 25],
    ];
    sk.poly(sub.map(([e, n]) => en(e, 0, n)), { width: PEN.hairline, color: INK_60, dash: 'long' }, true);
    for (const x of evergreenIn(grid)) {
      const g = x.gantry.map((p) => en(p[0] + SUB[0], p[1], p[2] + SUB[1]));
      for (const [a, b] of x.frame) sk.seg(en(a[0] + SUB[0], a[1], a[2] + SUB[1]), en(b[0] + SUB[0], b[1], b[2] + SUB[1]), { width: PEN.medium, color: INK });
      const X = en(x.exit[0] + SUB[0], x.exit[1], x.exit[2] + SUB[1]);
      const cls = voltageClassFor(60);
      sk.seg(g[0]!, g[1]!, { width: cls.weight + 0.4, color: INK, dash: cls.dash });
      sk.seg(g[1]!, X, { width: cls.weight + 0.4, color: INK, dash: cls.dash, px: [0, 0, x.sidePx[0], x.sidePx[1]], collapsePx: [0, 0, x.sidePx[0], x.sidePx[1]] });
      sk.target({ kind: 'branch', index: x.branch }, [g[0]!, g[1]!, X]);
      this.exitPts.push({ branch: x.branch, at: X, stagger: 0 });
    }
    // feeder 1105's riser at the west fence, and its first span to the first pole
    for (const [a, b] of evergreenRiser()) sk.seg(en(a[0] + SUB[0], a[1], a[2] + SUB[1]), en(b[0] + SUB[0], b[1], b[2] + SUB[1]), { width: PEN.medium, color: INK });
    const riserTop = en(-40 + SUB[0], 9, EV_EXIT_N + SUB[1]);
    sk.seg(riserTop, this.origin, { width: voltageClassFor(12.47).weight + 0.7, color: INK });
    sk.target({ kind: 'dist', what: 'feeder', id: 'CB-1105' }, [riserTop, this.origin]);
    const l0 = sk.lines.count;
    const f0 = sk.faces.vertexCount;
    const g0 = sk.glyphs.count;
    sk.box(SUB[0], 0, SUB[1], 8, 5, 5);
    sk.symbol(en(SUB[0], 7, SUB[1]), transformerSymbol(4.5), PEN.thin);
    this.standIn = { lines: [l0, sk.lines.count - l0], faces: [f0, sk.faces.vertexCount - f0], glyphs: [g0, sk.glyphs.count - g0] };
    sk.target({ kind: 'dist', what: 'bank', id: 'EV-BANK' }, [en(SUB[0] - 4, 0, SUB[1] - 2.5), en(SUB[0] + 4, 5, SUB[1] + 2.5)], true);
    this.labels.push({ id: 'fd:sub', text: 'Evergreen substation', anchor: en(40, 6, 25), priority: 9, minZoom: 0, kind: 'equip' });

    // ---- primary: poles at every primary node, conductors between them
    const trunkW = voltageClassFor(12.47).weight + 0.7;
    const latW = voltageClassFor(12.47).weight;
    const primary = (id: string) => net.nodes.get(id)?.kind === 'primary' && !id.startsWith('EV-') && !id.endsWith('-480');
    for (const [id] of net.nodes) {
      if (!primary(id)) continue;
      this.nodeAt.set(id, at(id, POLE));
      sk.stagger = stag(id);
      const up = parentOf.get(id);
      sk.anchor = up && L.pos.has(up) ? at(up, 0) : this.seat;
      sk.seg(at(id, 0), at(id, POLE), { width: PEN.hairline, color: INK_60 });
    }
    net.branches.forEach((b, k) => {
      if (!primary(b.from) || !primary(b.to) || b.kind === 'centertap') return;
      sk.stagger = stag(b.from);
      const three = (b.kind === 'line' || b.kind === 'switch' || b.kind === 'regulator') && b.phases.length === 3;
      const a = at(b.from, POLE);
      const c = at(b.to, POLE);
      sk.anchor = a;
      const seg = sk.seg(a, c, { width: three ? trunkW : latW, color: INK });
      const flow = sk.flowSeg(a, c);
      this.lines.push({ k, seg, flow, from: b.from });
      sk.target({ kind: 'dist', what: 'line', id: b.id }, [a, c]);
    });
    // devices on the trunk
    const dev = (id: string, node: string, sym: Symbol, text: string, dy = 12) => {
      sk.stagger = stag(node);
      const p = at(node, POLE);
      sk.anchor = p;
      sk.symbol(p, sym, PEN.thin, 0, dy);
      this.devAt.set(id, p);
      sk.target({ kind: 'dist', what: 'device', id }, [p]);
      this.labels.push({ id: `fd:${id}`, text, anchor: p, priority: 7, minZoom: 0, kind: 'equip' });
    };
    dev('RCL-1', 'F2R', { polys: [rect(9, 9)], closed: [true] }, 'Recloser');
    dev('REG-1', 'F4R', { polys: [circle(5.5), [[-7, -6], [7, 6]], [[3.5, 6], [7, 6], [7, 2.5]]], closed: [true, false, false] }, 'Regulator');
    dev('CAP-1', 'F5', { polys: [[[-5, 2], [5, 2]], [[-5, -2], [5, -2]], [[0, 2], [0, 7]], [[0, -2], [0, -7]]], closed: [false, false, false, false] }, 'Capacitor bank', -14);
    // lateral fuses and names
    for (const lat of L.laterals) {
      sk.stagger = stag(lat.nodes[0]!);
      const p = at(lat.nodes[0]!, POLE);
      sk.anchor = p;
      sk.symbol(p, { polys: [rect(4, 8)], closed: [true] }, PEN.thin);
      this.devAt.set(lat.fuse, p);
      sk.target({ kind: 'dist', what: 'device', id: lat.fuse }, [p]);
      const end = at(lat.nodes[lat.nodes.length - 1]!, POLE);
      this.labels.push({ id: `fd:${lat.id}`, text: `${lat.id} · phase ${'abc'[lat.phase]}`, anchor: end, priority: 4, minZoom: 0, kind: 'equip', prov: `data:evergreen.layout.laterals.${lat.id}` });
    }
    // the grocery's own transformer and building
    sk.stagger = stag('C1');
    sk.anchor = at('C1', 0);
    sk.symbol(at('C1', POLE), transformerSymbol(3.5), PEN.thin, 0, 10);
    {
      const [e, n] = EN(L.pos.get('C1-480')!);
      sk.box(e, 0, n + 30, 40, 6, 30);
      this.labels.push({ id: 'fd:grocery', text: 'Grocery', anchor: en(e, 6, n + 45), priority: 5, minZoom: 0, kind: 'equip' });
      sk.target({ kind: 'dist', what: 'node', id: 'C1-480' }, [en(e, 0, n + 30)]);
    }

    // ---- services: pole-top transformers, drops and homes
    for (const t of L.transformers) {
      sk.stagger = stag(t.primary);
      const p = at(t.primary, CAN);
      sk.anchor = p;
      const glyphs = sk.symbol(p, transformerSymbol(2.6), PEN.thin, 7, 0);
      this.serviceDraw.set(t.id, { lines: [], faces: [], glyphs, stagger: [] });
      sk.target({ kind: 'dist', what: 'transformer', id: t.id }, [p]);
    }
    const dropFrom = new Map<string, string>();
    for (const b of net.branches) if (b.kind === 'line' && b.to.startsWith('H-') && !b.to.endsWith('-OUTLET')) dropFrom.set(b.to, b.from);
    const lv = voltageClassFor(0.24);
    for (const h of L.homes) {
      sk.stagger = stag(h.id);
      const [e, n] = EN(h);
      const from = dropFrom.get(h.id);
      const first = sk.lines.count;
      const f0 = sk.faces.vertexCount;
      sk.anchor = from ? at(from, SEC) : en(e, 0, n);
      if (from) sk.seg(at(from, SEC), en(e, EAVE, n), { width: lv.weight, color: INK, dash: lv.dash });
      const c = sk.box(e, 0, n, 10, HOME_H, 8, { width: PEN.fine, color: INK });
      if (h.pvKW > 0) {
        // a panel on the roof
        const r = [en(e - 3.5, HOME_H + 0.02, n - 2.5), en(e + 3.5, HOME_H + 0.02, n - 2.5), en(e + 3.5, HOME_H + 0.02, n + 2.5), en(e - 3.5, HOME_H + 0.02, n + 2.5)];
        sk.poly(r, { width: PEN.hairline, color: INK }, true);
        sk.seg(r[0]!, r[2]!, { width: PEN.hairline, color: INK });
      }
      this.homeSegs.push({ id: h.id, first, count: sk.lines.count - first });
      const sd = this.serviceDraw.get(h.transformer);
      if (sd) {
        sd.lines.push([first, sk.lines.count - first]);
        sd.faces.push([f0, sk.faces.vertexCount - f0]);
        sd.stagger.push(sk.stagger);
      }
      sk.target({ kind: 'dist', what: 'home', id: h.id }, c, true);
      this.homeMarks.push({ i: idx.get(h.id)!, at: en(e, HOME_H, n) });
    }
    const outlet = L.outlet;
    {
      const h = L.homes.find((x) => x.id === outlet.home)!;
      const [e, n] = EN(h);
      this.labels.push({ id: 'fd:outlet', text: 'The home with the outlet', anchor: en(e, HOME_H, n), priority: 10, minZoom: 0, kind: 'equip' });
    }
    sk.stagger = 0;
    sk.anchor = this.seat;
    sk.commit();
    // extent, for the camera
    let e0 = Infinity;
    let e1 = -Infinity;
    let n0 = Infinity;
    let n1 = -Infinity;
    for (const p of L.pos.values()) {
      const [e, n] = EN(p);
      e0 = Math.min(e0, e);
      e1 = Math.max(e1, e);
      n0 = Math.min(n0, n);
      n1 = Math.max(n1, n);
    }
    e1 = Math.max(e1, SUB[0] + 60);
    this.extent = [en(e0 - 20, 0, n0 - 20), en(e1 + 20, 0, n0 - 20), en(e1 + 20, 0, n1 + 20), en(e0 - 20, 0, n1 + 20)];
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  get classes(): VoltageClass[] {
    return [voltageClassFor(12.47), voltageClassFor(0.24)];
  }

  /** Show a fault and the protection's state (null: no fault). */
  setFault(fault: { node: string; conducting: boolean; open: Set<string>; path: Set<number> } | null): void {
    this.fault = fault;
    if (this.last) this.applySnapshot(this.last);
  }

  /** Nodes beyond a device (everything its opening leaves without supply). */
  private beyond(devices: Iterable<string>): Set<string> {
    const out = new Set<string>();
    for (const d of devices) {
      const b = this.feeder.base.branches.find((x) => x.id === d);
      if (!b) continue;
      for (let q = [b.to]; q.length; ) {
        const next: string[] = [];
        for (const n of q) {
          if (out.has(n)) continue;
          out.add(n);
          next.push(...(this.children.get(n) ?? []));
        }
        q = next;
      }
    }
    return out;
  }

  applySnapshot(s: Snapshot): void {
    this.last = s;
    const sk = this.sk;
    const f = s.feeder;
    const none = s.outcome === 'none' || !f;
    const dark = !!f && f.boundaryP === 0 && f.headP === 0;
    const sc = this.flowScale;
    const flt = this.fault;
    const open = new Set<string>([...s.feederOpen, ...(flt ? flt.open : [])]);
    // without supply: beyond an open device (load shed — the signal colour, with a dash)
    const out = this.beyond(open);
    for (const l of this.lines) {
      const kw = f ? f.flows[l.k * 4]! / 1000 : 0;
      const lost = out.has(l.from) || open.has(this.feeder.base.branches[l.k]!.id);
      sk.lines.setColor(l.seg, dark || lost ? SIGNAL : none ? INK_35 : INK, 1);
      sk.lines.setPattern(l.seg, lost ? 'hidden' : 'solid');
      if (flt) {
        // while the fault plays out: the fault current along its path, while it flows
        const on = flt.conducting && flt.path.has(l.k);
        sk.flow.set(l.flow, { sizePx: FLOW_MAX_PX, speed: on ? 60 : 0, color: SIGNAL, alpha: on ? 1 : 0 });
      } else sk.flow.set(l.flow, { sizePx: chevronSizeFor(kw, sc), speed: chevronSpeedFor(kw, sc) * Math.sign(kw), color: INK, alpha: !none && !dark && !lost && Math.abs(kw) > 0.05 ? 1 : 0 });
    }
    const homeOut = new Set(this.feeder.layout.homes.filter((h) => out.has(h.meter) || out.has(h.id)).map((h) => h.id));
    for (const h of this.homeSegs) for (let i = h.first; i < h.first + h.count; i++) sk.lines.setColor(i, homeOut.has(h.id) ? SIGNAL : INK, 1);
    sk.marks.clear();
    // the fault itself, and every device that is open
    if (flt) {
      const p = this.nodeAt.get(flt.node);
      if (p) faultSymbol(18).polys.forEach((poly) => sk.marks.glyph(p, poly.map(([x, y]) => [x + 6, y + 4] as [number, number]), { width: PEN.bold, color: SIGNAL }, false));
    }
    for (const d of open) {
      const p = this.devAt.get(d) ?? (d === 'CB-1105' ? this.origin : null);
      if (p) crossSymbol(11).polys.forEach((poly) => sk.marks.glyph(p, poly.map(([x, y]) => [x - 10, y + 10] as [number, number]), { width: PEN.medium, color: INK }, false));
    }
    // homes outside ANSI C84.1 Range A get the warning mark
    if (f && !dark && !none && !flt)
      for (const h of this.homeMarks) {
        const v1 = Math.hypot(f.V[h.i * 6]!, f.V[h.i * 6 + 1]!);
        const v2 = Math.hypot(f.V[h.i * 6 + 2]!, f.V[h.i * 6 + 3]!);
        const v = (v1 + v2) / 2;
        if (v > 1 && (v < ANSI_A.low || v > ANSI_A.high)) warningSymbol(10).polys.forEach((p, i) => sk.marks.glyph(h.at, p.map(([x, y]) => [x, y + 12] as [number, number]), { width: PEN.medium, color: SIGNAL }, i === 0));
      }
    sk.marks.commit();
  }

  highlight(sel: Selection | null): Set<string> | null {
    this.selection = sel;
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

  /** A primary node's pole top, or a device's position, in this frame. */
  pointOf(id: string): Vec3 | null {
    return this.devAt.get(id) ?? this.nodeAt.get(id) ?? null;
  }

  /** The ground under a pole-top transformer's pole: where its Service level sits. */
  transformerAt(id: string): Vec3 {
    const t = this.feeder.layout.transformers.find((x) => x.id === id)!;
    const [e, n] = EN(this.feeder.layout.pos.get(t.primary)!);
    return en(e, 0, n);
  }

  /** Where the Substation level sits in this plan (the centre of the fence, on the ground). */
  get substationAt(): Vec3 {
    return en(SUB[0], 0, SUB[1]);
  }

  exits(): Array<{ branch: number; at: Vec3; stagger: number }> {
    return this.exitPts;
  }

  yieldTo(key: string, m: number): void {
    const hide = m > 0;
    const sk = this.sk;
    const lines = (r: [number, number]) => {
      for (let i = r[0]; i < r[0] + r[1]; i++) sk.lines.setDim(i, hide ? 1 : 0);
    };
    const glyphs = (r: [number, number]) => {
      for (let i = r[0]; i < r[0] + r[1]; i++) sk.glyphs.setDim(i, hide ? 1 : 0);
    };
    if (key === 'substation') {
      lines(this.standIn.lines);
      glyphs(this.standIn.glyphs);
      sk.faces.setHidden(this.standIn.faces[0], this.standIn.faces[1], hide, 0);
      return;
    }
    const d = this.serviceDraw.get(key.replace('service:', ''));
    if (!d) return;
    d.lines.forEach(lines);
    glyphs(d.glyphs);
    d.faces.forEach((f, i) => sk.faces.setHidden(f[0], f[1], hide, d.stagger[i]));
  }
}

export { EN, POLE };

/** Where feeder 1105 leaves the substation's west fence (plan north, substation frame). */
export const EV_EXIT_N = -7.5;

/**
 * Evergreen's 60 kV circuits in, in the Substation level's frame (plan e, h, n): the
 * gantry on the east fence, the first tower outside it, and the exit point on each
 * circuit's bearing toward Metcalf where the System's stroke takes it up. The Feeder
 * and Substation levels both draw these, in the same place.
 */
export function evergreenIn(grid: Grid): Array<{ branch: number; sidePx: [number, number]; gantry: [Vec3, Vec3]; exit: Vec3; frame: Array<[Vec3, Vec3]> }> {
  const ex = siteExits(grid, 'EVERGREEN').sort((a, b) => grid.branches[a.branch]!.circuit - grid.branches[b.branch]!.circuit);
  const ns = [-10, 0, 10];
  return ex.map((x, i) => {
    const n = ns[i] ?? 0;
    // plan (e, n) from the frame's (x, z): e = x, n = −z
    // at conductor height: the System's stroke carries the circuit on from there
    const exit: Vec3 = [x.dir[0] * EXIT_R, 14, -x.dir[1] * EXIT_R];
    const top: Vec3 = [37, 11, n];
    const tower: Vec3 = [66, 15, n];
    const frame: Array<[Vec3, Vec3]> = i === 0 ? [[[37, 0, -16], [37, 11, -16]], [[37, 0, 16], [37, 11, 16]], [[37, 11, -16], [37, 11, 16]]] : [];
    frame.push([[66, 0, n - 1.5], [66, 15, n]], [[66, 0, n + 1.5], [66, 15, n]], [[66, 14, n - 2.5], [66, 14, n + 2.5]]);
    return { branch: x.branch, sidePx: x.sidePx, gantry: [top, tower], exit, frame };
  });
}

/** Feeder 1105's riser pole at the substation's west fence (Substation frame, plan e, h, n). */
export function evergreenRiser(): Array<[Vec3, Vec3]> {
  return [
    [[-40, 0, EV_EXIT_N], [-40, 9, EV_EXIT_N]],
    [[-40, 8.5, EV_EXIT_N - 1.2], [-40, 8.5, EV_EXIT_N + 1.2]],
  ];
}
