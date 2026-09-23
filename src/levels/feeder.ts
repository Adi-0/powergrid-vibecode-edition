import type * as THREE from 'three';
import type { Vec3 } from '../render/lines';
import { INK, INK_35, INK_60, PEN, SIGNAL, voltageClassFor, type VoltageClass } from '../render/style';
import { circle, rect, transformerSymbol, warningSymbol, type Symbol } from '../render/symbols';
import type { IsoCamera } from '../render/iso';
import type { Snapshot } from '../model/snapshot';
import { nodeIndex, type Feeder } from '../model/feeder';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_MAP, Sketch, en } from './sketch';

/**
 * The Feeder level: feeder 1105 out of Evergreen, pole by pole, in metres.
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

const POLE = 9; // m, conductor height on the poles
const EAVE = 3.2; // m, where a service drop meets a home

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
  readonly sk = new Sketch();
  /** The feeder's first pole outside the substation: what the substation's feeder exit unfolds into. */
  readonly origin: Vec3;
  private morphValue = 1;
  private lines: Array<{ k: number; seg: number; flow: number }> = [];
  private homeMarks: Array<{ i: number; at: Vec3 }> = [];
  private extent: Vec3[] = [];
  private selection: Selection | null = null;

  constructor(readonly feeder: Feeder) {
    const sk = this.sk;
    const L = feeder.layout;
    const net = feeder.base;
    const idx = nodeIndex(feeder);
    const at = (id: string, h: number): Vec3 => {
      const [e, n] = EN(L.pos.get(id)!);
      return en(e, h, n);
    };
    this.origin = at('F0', POLE);
    sk.anchor = this.origin;
    // distance along the network from the first pole, for the order the feeder unfolds in
    const dist = new Map<string, number>([['F0', 0]]);
    const kids = new Map<string, string[]>();
    for (const b of net.branches) kids.set(b.from, [...(kids.get(b.from) ?? []), b.to]);
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
    const stag = (id: string) => (0.45 * (dist.get(id) ?? 0)) / far;

    // ---- the substation at the head, as a compact outline (its own level draws the yard)
    sk.stagger = 0;
    const sub: Array<[number, number]> = [
      [0, -25],
      [80, -25],
      [80, 25],
      [0, 25],
    ];
    sk.poly(sub.map(([e, n]) => en(e, 0, n)), { width: PEN.hairline, color: INK_60, dash: 'long' }, true);
    sk.box(40, 0, 0, 8, 5, 5);
    sk.symbol(en(40, 7, 0), transformerSymbol(4.5), PEN.thin);
    sk.seg(en(20, 5, 0), this.origin, { width: voltageClassFor(12.47).weight + 0.4, color: INK, dash: 'hidden' });
    sk.target({ kind: 'dist', what: 'feeder', id: 'CB-1105' }, [en(20, 5, 0), this.origin]);
    this.labels.push({ id: 'fd:sub', text: 'Evergreen substation', anchor: en(40, 6, 25), priority: 9, minZoom: 0, kind: 'equip' });

    // ---- primary: poles at every primary node, conductors between them
    const trunkW = voltageClassFor(12.47).weight + 0.7;
    const latW = voltageClassFor(12.47).weight;
    const primary = (id: string) => net.nodes.get(id)?.kind === 'primary' && !id.startsWith('EV-') && !id.endsWith('-480');
    for (const [id] of net.nodes) {
      if (!primary(id)) continue;
      sk.stagger = stag(id);
      sk.seg(at(id, 0), at(id, POLE), { width: PEN.hairline, color: INK_60 });
    }
    net.branches.forEach((b, k) => {
      if (!primary(b.from) || !primary(b.to) || b.kind === 'centertap') return;
      sk.stagger = stag(b.from);
      const three = (b.kind === 'line' || b.kind === 'switch' || b.kind === 'regulator') && b.phases.length === 3;
      const a = at(b.from, POLE);
      const c = at(b.to, POLE);
      const seg = sk.seg(a, c, { width: three ? trunkW : latW, color: INK });
      const flow = sk.flowSeg(a, c);
      this.lines.push({ k, seg, flow });
      sk.target({ kind: 'dist', what: 'line', id: b.id }, [a, c]);
    });
    // devices on the trunk
    const dev = (id: string, node: string, sym: Symbol, text: string, dy = 12) => {
      sk.stagger = stag(node);
      const p = at(node, POLE);
      sk.symbol(p, sym, PEN.thin, 0, dy);
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
      sk.symbol(p, { polys: [rect(4, 8)], closed: [true] }, PEN.thin);
      sk.target({ kind: 'dist', what: 'device', id: lat.fuse }, [p]);
      const end = at(lat.nodes[lat.nodes.length - 1]!, POLE);
      this.labels.push({ id: `fd:${lat.id}`, text: `${lat.id} · phase ${'abc'[lat.phase]}`, anchor: end, priority: 4, minZoom: 0, kind: 'equip', prov: `data:evergreen.layout.laterals.${lat.id}` });
    }
    // the grocery's own transformer and building
    sk.stagger = stag('C1');
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
      const p = at(t.primary, POLE - 1.5);
      sk.symbol(p, transformerSymbol(2.6), PEN.thin, 7, 0);
      sk.target({ kind: 'dist', what: 'transformer', id: t.id }, [p]);
    }
    const dropFrom = new Map<string, string>();
    for (const b of net.branches) if (b.kind === 'line' && b.to.startsWith('H-') && !b.to.endsWith('-OUTLET')) dropFrom.set(b.to, b.from);
    const lv = voltageClassFor(0.24);
    for (const h of L.homes) {
      sk.stagger = stag(h.id);
      const [e, n] = EN(h);
      const from = dropFrom.get(h.id);
      if (from) sk.seg(at(from, POLE - 2), en(e, EAVE, n), { width: lv.weight, color: INK, dash: lv.dash });
      const c = sk.box(e, 0, n, 10, 3.6, 8, { width: PEN.fine, color: INK });
      if (h.pvKW > 0) {
        // a panel on the roof
        const r = [en(e - 3.5, 3.62, n - 2.5), en(e + 3.5, 3.62, n - 2.5), en(e + 3.5, 3.62, n + 2.5), en(e - 3.5, 3.62, n + 2.5)];
        sk.poly(r, { width: PEN.hairline, color: INK }, true);
        sk.seg(r[0]!, r[2]!, { width: PEN.hairline, color: INK });
      }
      sk.target({ kind: 'dist', what: 'home', id: h.id }, c, true);
      this.homeMarks.push({ i: idx.get(h.id)!, at: en(e, 3.6, n) });
    }
    const outlet = L.outlet;
    {
      const h = L.homes.find((x) => x.id === outlet.home)!;
      const [e, n] = EN(h);
      this.labels.push({ id: 'fd:outlet', text: 'The home with the outlet', anchor: en(e, 3.6, n), priority: 10, minZoom: 0, kind: 'equip' });
    }
    sk.stagger = 0;
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
    this.extent = [en(e0 - 20, 0, n0 - 20), en(e1 + 20, 0, n0 - 20), en(e1 + 20, 0, n1 + 20), en(e0 - 20, 0, n1 + 20)];
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
    const dark = !!f && f.boundaryP === 0 && f.headP === 0;
    const sc = this.flowScale;
    for (const l of this.lines) {
      const kw = f ? f.flows[l.k * 4]! / 1000 : 0;
      sk.lines.setColor(l.seg, dark ? SIGNAL : none ? INK_35 : INK, 1);
      sk.flow.set(l.flow, { sizePx: chevronSizeFor(kw, sc), speed: chevronSpeedFor(kw, sc) * Math.sign(kw), color: INK, alpha: !none && !dark && Math.abs(kw) > 0.05 ? 1 : 0 });
    }
    // homes outside ANSI C84.1 Range A get the warning mark
    sk.marks.clear();
    if (f && !dark && !none)
      for (const h of this.homeMarks) {
        const v1 = Math.hypot(f.V[h.i * 6]!, f.V[h.i * 6 + 1]!);
        const v2 = Math.hypot(f.V[h.i * 6 + 2]!, f.V[h.i * 6 + 3]!);
        const v = (v1 + v2) / 2;
        if (v < ANSI_A.low || v > ANSI_A.high) warningSymbol(10).polys.forEach((p, i) => sk.marks.glyph(h.at, p.map(([x, y]) => [x, y + 12] as [number, number]), { width: PEN.medium, color: SIGNAL }, i === 0));
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

  /** Where a pole-top transformer is drawn (for the Service level to unfold from). */
  transformerAt(id: string): Vec3 {
    const t = this.feeder.layout.transformers.find((x) => x.id === id)!;
    const [e, n] = EN(this.feeder.layout.pos.get(t.primary)!);
    return en(e, POLE - 1.5, n);
  }
}

export { EN, POLE };
