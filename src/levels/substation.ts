import type * as THREE from 'three';
import type { Vec3 } from '../render/lines';
import { INK, INK_35, INK_60, PEN, SIGNAL, voltageClassFor, type VoltageClass } from '../render/style';
import { transformerSymbol, warningSymbol } from '../render/symbols';
import type { IsoCamera } from '../render/iso';
import type { Grid } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import { COUPLING_BUS } from '../model/coupling';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_ISO, PERSIST, Sketch, enIso as en } from './sketch';
import { EV_EXIT_N, evergreenIn, evergreenRiser } from './feeder';
import { breaker, disconnect, gantry, kvClass, post, tower, transformer, wire } from './kit';

/**
 * The Substation level: the Evergreen 60/12 kV substation as a yard, in metres.
 *
 * It sits inside the Feeder level (the neighbourhood), which draws its fence, its
 * gantry and the circuits in: those are drawn here in the same place and never fold;
 * the yard unfolds inside them.
 *
 * Three 60 kV circuits from Metcalf arrive on the east side at a dead-end gantry and
 * each passes a disconnect and a circuit breaker onto the 60 kV bus. The bus also
 * carries the 60 kV circuits onward to the other substations fed from here (the
 * transmission model lumps them into this bus's load; drawn as one pair, "to the rest
 * of east San José"). From the bus, the bank — 30 MVA, 60/12.47 kV, delta–wye, with an
 * on-load tap changer — steps down to the 12 kV switchgear, whose four breakers feed
 * four feeders out under the west fence. Feeder 1105 is modelled pole by pole; the
 * other three are lumped as a load on the 12 kV bus.
 *
 * Every conductor carries chevrons in proportion to megawatts, at this level's scale.
 */

/** The portal key of the bank's own level. */
export const XF_BANK_KEY = 'xf:EV-BANK';

const FEEDER_N = [EV_EXIT_N, -2.5, 2.5, 7.5]; // north positions of the four feeder exits
const FEEDER_IDS = ['1105', '1102', '1103', '1104'];
const CIRCUIT_N = [-10, 0, 10]; // incoming 60 kV circuits
const BUS60 = { e: 14, h: 7, n0: -16, n1: 16 };
/** The bank's tank: its three phases stand along north (the transformer level draws inside it). */
export const BANK = { e: -2, n: 0, se: 4.4, sh: 4.5, sn: 6, f: 1.1 };
/** The tap changer's motor drive: a cabinet on the bank's low-voltage side. */
export const BANK_DRIVE = { e: BANK.e - BANK.se / 2 - 0.35, h: 0.8, n: BANK.n - 1.4, se: 0.5, sh: 1.6, sn: 0.9 };
const GEAR = { e: -22, n: 0, se: 3, sh: 3, sn: 16 };

export class SubstationLevel implements Level {
  readonly kind = 'substation' as const;
  readonly name = 'Evergreen substation';
  readonly unitKm = 0.001;
  readonly needsDetail = true;
  readonly flowScale = FLOW_SCALES.substation;
  readonly north = NORTH_ISO;
  readonly labels: LabelSpec[] = [];
  readonly sk = new Sketch(en);
  /** Where the yard folds to: the bank, in the middle. */
  readonly origin: Vec3 = en(0, 0, 0);
  /** The centre of the fence, on the ground: where this level sits in the neighbourhood. */
  readonly seat: Vec3 = en(0, 0, 0);
  /** The feeder 1105 exit at the west fence: what the Feeder level unfolds from. */
  readonly feederExit: Vec3 = en(-40, 9, FEEDER_N[0]!);
  private morphValue = 1;
  private circuits: Array<{ k: number; flows: number[]; seg: number[] }> = [];
  private onward: number[] = [];
  private bankFlow = -1;
  private feederFlows: number[] = [];
  private busSegs: number[] = [];
  private bankGlyphs: [number, number] = [0, 0];
  /** The bank as drawn here: hidden while its own level (the cut-open tank) is open. */
  private bankDraw = { lines: [0, 0] as [number, number], faces: [0, 0] as [number, number] };
  private snapshot: Snapshot | null = null;
  private selection: Selection | null = null;

  constructor(readonly grid: Grid) {
    const sk = this.sk;
    sk.anchor = this.origin;
    const g = grid;
    const cls60 = voltageClassFor(60);
    const cls12 = voltageClassFor(12.47);
    const w60 = cls60.weight + 0.4;
    const w12 = cls12.weight + 0.2;

    // ---- the fence: the neighbourhood draws it too
    sk.stagger = PERSIST;
    const fence: Array<[number, number]> = [
      [-40, -25],
      [40, -25],
      [40, 25],
      [-40, 25],
    ];
    sk.poly(fence.map(([e, n]) => en(e, 0, n)), { width: PEN.hairline, color: INK_60, dash: 'long' }, true);
    for (let i = 0; i < 4; i++) {
      const [e0, n0] = fence[i]!;
      const [e1, n1] = fence[(i + 1) % 4]!;
      const len = Math.hypot(e1 - e0, n1 - n0);
      for (let d = 0; d <= len; d += 10) {
        const e = e0 + ((e1 - e0) * d) / len;
        const n = n0 + ((n1 - n0) * d) / len;
        sk.seg(en(e, 0, n), en(e, 2.2, n), { width: PEN.hairline, color: INK_60 });
      }
    }
    // control building
    sk.stagger = 0;
    sk.box(29, 0, -20.5, 9, 3.5, 5);
    this.labels.push({ id: 'eq:ctrl', text: 'Control building', anchor: en(29, 3.5, -20.5), priority: 2, minZoom: 0, kind: 'equip' });

    // ---- 60 kV, three phases: the circuits in over their towers to one gantry, each
    // through a disconnect, a breaker and a second disconnect, down onto the bus
    const k = kvClass(60);
    const wp = Math.max(0.9, cls60.weight * 0.55);
    const lines60 = evergreenIn(g);
    const ns = lines60.flatMap((x) => [-1, 0, 1].map((p) => x.gantry[0][2] + p * k.sp));
    sk.stagger = 0.02;
    const G = gantry(sk, 37, ns, 11, k);
    const tubes = [BUS60.e - k.sp, BUS60.e, BUS60.e + k.sp];
    lines60.forEach((x, ci) => {
      const n = x.gantry[0][2];
      const pn = [-1, 0, 1].map((p) => n + p * k.sp);
      // outside: the tower carrying the circuit away toward Metcalf, its conductors converging on the exit point
      sk.stagger = 0;
      const X = en(x.exit[0], x.exit[1], x.exit[2]);
      const te = x.gantry[1][0];
      const L = Math.hypot(x.exit[0] - te, x.exit[2] - n) || 1;
      const att = tower(sk, te, n, (x.exit[0] - te) / L, (x.exit[2] - n) / L, 15, 3, k.sp, k.f);
      const byN = [...att].sort((a, c) => a[2] - c[2]);
      const segs: number[] = [];
      const gat = G.slice(ci * 3, ci * 3 + 3);
      for (let p = 0; p < 3; p++) {
        segs.push(sk.seg(en(...gat[p]!), en(...byN[p]!), { width: wp, color: INK, dash: cls60.dash }));
        segs.push(sk.seg(en(...byN[p]!), X, { width: wp, color: INK, dash: cls60.dash, px: [0, 0, x.sidePx[0], x.sidePx[1]], collapsePx: [0, 0, x.sidePx[0], x.sidePx[1]] }));
      }
      // inside the fence
      sk.stagger = 0.08;
      const D3 = disconnect(sk, 31.5, 29.1, pn, k);
      const B = breaker(sk, 27, 24.2, pn, k);
      const D1 = disconnect(sk, 22.1, 19.7, pn, k);
      for (let p = 0; p < 3; p++) {
        segs.push(wire(sk, gat[p]!, D3[p]![0], wp), wire(sk, D3[p]![1], B[p]![0], wp), wire(sk, B[p]![1], D1[p]![0], wp), wire(sk, D1[p]![1], [tubes[p]!, k.busH, pn[p]!], wp));
      }
      // chevrons ride the middle phase: in from the exit, over the tower and gantry, through the bay, onto the bus
      const mid: Vec3[] = [X, en(...byN[1]!), en(...gat[1]!), en(...D3[1]![0]), en(...D3[1]![1]), en(...B[1]![0]), en(...B[1]![1]), en(...D1[1]![0]), en(...D1[1]![1]), en(tubes[1]!, k.busH, n)];
      const flows = mid.slice(1).map((q, j) => sk.flowSeg(mid[j]!, q));
      this.circuits.push({ k: x.branch, flows, seg: segs });
      sk.target({ kind: 'branch', index: x.branch }, mid);
    });
    this.labels.push({ id: 'eq:in', text: 'From Metcalf', anchor: en(66, 15, 12), priority: 5, minZoom: 0, kind: 'equip' });
    // the bus: three tubes on post insulators
    sk.stagger = 0.12;
    for (const e of tubes) {
      for (const n of [-15, -5, 5, 15]) post(sk, e, n, k.busH, k.f);
      this.busSegs.push(wire(sk, [e, k.busH, BUS60.n0], [e, k.busH, BUS60.n1], cls60.weight + 0.6));
    }
    sk.target({ kind: 'dist', what: 'bus60', id: 'EV-60' }, [en(BUS60.e, k.busH, BUS60.n0), en(BUS60.e, k.busH, BUS60.n1)]);
    this.labels.push({ id: 'eq:bus60', text: '60 kV bus', anchor: en(BUS60.e + k.sp, k.busH, BUS60.n1), priority: 6, minZoom: 0, kind: 'equip', prov: 'data:network.bus.EVERGREEN-60.baseKV' });
    // onward at 60 kV to the other substations (lumped in the transmission model): off the north end
    const onEnd = en(BUS60.e + 8, 9, 42);
    for (const e of tubes) this.busSegs.push(sk.seg(en(e, k.busH, BUS60.n1), en(e + 8, 9, 42), { width: wp, color: INK, dash: cls60.dash }));
    this.onward.push(sk.flowSeg(en(BUS60.e, k.busH, BUS60.n1), onEnd));
    this.labels.push({ id: 'eq:onward', text: 'On to the rest of east San José', anchor: onEnd, priority: 3, minZoom: 0, kind: 'equip' });

    // ---- the bank: 30 MVA, 60/12.47 kV, its high side toward the bus
    sk.stagger = 0.2;
    const bl0 = sk.lines.count;
    const bf0 = sk.faces.vertexCount;
    const xf = transformer(sk, BANK.e, BANK.n, BANK.se, BANK.sh, BANK.sn, BANK.f, 1);
    const D = BANK_DRIVE;
    sk.box(D.e, D.h, D.n, D.se, D.sh, D.sn, { width: PEN.fine, color: INK });
    this.bankDraw = { lines: [bl0, sk.lines.count - bl0], faces: [bf0, sk.faces.vertexCount - bf0] };
    const tank = xf.tank;
    const hvB = [...xf.hv].sort((a, c) => a[2] - c[2]);
    const lvB = [...xf.lv].sort((a, c) => a[2] - c[2]).map((q) => en(...q));
    hvB.forEach((q, p) => this.busSegs.push(wire(sk, [tubes[p]!, k.busH, q[2]], q, wp)));
    this.bankFlow = sk.flowSeg(en(tubes[1]!, k.busH, hvB[1]![2]), en(...hvB[1]!));
    sk.target({ kind: 'dist', what: 'bank', id: 'EV-BANK' }, tank, true);
    this.labels.push({ id: 'eq:bank', text: 'Bank 1 · 60/12 kV', anchor: en(BANK.e, BANK.sh + 3, BANK.n - 2), priority: 8, minZoom: 0, kind: 'equip', prov: 'data:evergreen.bank' });
    this.labels.push({ id: 'eq:rad', text: 'Radiators', anchor: en(BANK.e, BANK.sh * 0.6, BANK.n - BANK.sn / 2 - 0.45), priority: 2, minZoom: 6, kind: 'equip' });
    this.labels.push({ id: 'eq:cons', text: 'Conservator', anchor: en(BANK.e - BANK.se * 0.32, BANK.sh + 2.2, BANK.n + BANK.sn / 2 - 0.6), priority: 2, minZoom: 6, kind: 'equip' });

    // ---- 12 kV switchgear and the feeders
    sk.stagger = 0.28;
    const gear = sk.box(GEAR.e, 0, GEAR.n, GEAR.se, GEAR.sh, GEAR.sn);
    // cable bus from the LV bushings to the gear
    // cable bus from the low-voltage bushings to the gear, one conductor per phase
    lvB.forEach((q, p) => this.busSegs.push(sk.seg(q, en(GEAR.e + GEAR.se / 2, GEAR.sh - 0.4, (p - 1) * 1.2), { width: w12, color: INK })));
    sk.target({ kind: 'dist', what: 'bus12', id: 'EV-12' }, gear, true);
    this.labels.push({ id: 'eq:gear', text: '12 kV switchgear', anchor: en(GEAR.e, GEAR.sh, GEAR.n + GEAR.sn / 2), priority: 7, minZoom: 0, kind: 'equip', prov: 'data:evergreen.bank.kvLowLL' });
    sk.stagger = 0.36;
    FEEDER_N.forEach((n, i) => {
      // breaker door on the gear's west face
      const d0 = en(GEAR.e - GEAR.se / 2, 0.4, n - 1.6);
      const d1 = en(GEAR.e - GEAR.se / 2, 2.4, n + 1.6);
      sk.poly([d0, en(GEAR.e - GEAR.se / 2, 0.4, n + 1.6), d1, en(GEAR.e - GEAR.se / 2, 2.4, n - 1.6)], { width: PEN.fine, color: INK }, true);
      // underground out to a riser pole at the fence, then overhead away (1105 only)
      const out = en(GEAR.e - GEAR.se / 2, 0, n);
      const pole = en(-40, 0, n);
      sk.seg(out, pole, { width: w12, color: INK, dash: 'hidden' });
      // the riser poles; 1105's (and its first span) are drawn by the neighbourhood too
      if (i === 0) sk.stagger = PERSIST;
      if (i === 0) for (const [a, b] of evergreenRiser()) sk.seg(en(...a), en(...b), { width: PEN.medium, color: INK });
      else {
        sk.seg(pole, en(-40, 9, n), { width: PEN.medium, color: INK });
        sk.seg(en(-40, 8.5, n - 1.2), en(-40, 8.5, n + 1.2), { width: PEN.medium, color: INK });
      }
      const f = sk.flowSeg(out, pole);
      this.feederFlows.push(f);
      if (i === 0) {
        // on to feeder 1105's first pole, outside the fence
        const away = en(-80, 11, 0);
        sk.seg(en(-40, 9, n), away, { width: voltageClassFor(12.47).weight + 0.7, color: INK });
        sk.stagger = 0.36;
        this.feederFlows.push(sk.flowSeg(en(-40, 9, n), away));
        sk.target({ kind: 'dist', what: 'feeder', id: 'CB-1105' }, [out, pole, en(-40, 9, n), away]);
        this.labels.push({ id: 'eq:f1105', text: `Feeder ${FEEDER_IDS[i]}`, anchor: away, priority: 9, minZoom: 0, kind: 'equip', prov: 'data:evergreen.feeder.1105' });
      } else {
        this.labels.push({ id: `eq:f${FEEDER_IDS[i]}`, text: `${FEEDER_IDS[i]}`, anchor: en(-40, 9.5, n), priority: 3, minZoom: 0, kind: 'equip', prov: `data:evergreen.feeder.${FEEDER_IDS[i]}` });
      }
    });
    sk.stagger = 0;
    sk.commit();
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  get classes(): VoltageClass[] {
    return [voltageClassFor(60), voltageClassFor(12.47)];
  }

  applySnapshot(s: Snapshot): void {
    this.snapshot = s;
    const sk = this.sk;
    const f = s.feeder;
    const none = s.outcome === 'none';
    const sc = this.flowScale;
    const set = (flow: number, mw: number, side = 0, color = INK) =>
      sk.flow.set(flow, { sizePx: chevronSizeFor(mw, sc), speed: chevronSpeedFor(mw, sc) * Math.sign(mw), side, color, alpha: !none && Math.abs(mw) > 1e-3 ? 1 : 0 });
    sk.marks.clear();
    // 60 kV circuits: power arriving at Evergreen
    for (const c of this.circuits) {
      const br = this.grid.branches[c.k]!;
      const mw = br.to.id === COUPLING_BUS ? -s.pt[c.k]! : -s.pf[c.k]!;
      const out = !s.inService[c.k];
      const over = !out && s.loading[c.k]! > 1;
      for (const seg of c.seg) {
        sk.lines.setColor(seg, over ? SIGNAL : out ? INK_35 : INK, 1);
        sk.lines.setPattern(seg, out ? 'hidden' : 'solid');
      }
      for (const fl of c.flows) set(fl, out ? 0 : mw, 0, over ? SIGNAL : INK);
    }
    // onward 60 kV: the rest of this bus's demand
    const bus = this.grid.bus(COUPLING_BUS).index;
    const boundaryMW = f ? f.boundaryP / 1e6 : 0;
    const onwardMW = s.energized[bus] ? s.pd[bus]! - boundaryMW : 0;
    set(this.onward[this.onward.length - 1]!, onwardMW);
    set(this.bankFlow, boundaryMW);
    // feeders: 1105 modelled, the other three lumped at the 12 kV bus
    if (f) {
      let other = 0;
      f.loadIds.forEach((id, i) => {
        if (id.startsWith('OTHER:')) other += f.loadP[i]!;
      });
      const head = f.headP / 1e6;
      set(this.feederFlows[0]!, head);
      set(this.feederFlows[1]!, head);
      for (let i = 2; i < this.feederFlows.length; i++) set(this.feederFlows[i]!, other / 3 / 1e6);
    }
    const dark = !none && !s.energized[bus];
    for (const seg of this.busSegs) sk.lines.setColor(seg, dark ? SIGNAL : none ? INK_35 : INK, 1);
    for (let i = this.bankGlyphs[0]; i < this.bankGlyphs[0] + this.bankGlyphs[1]; i++) sk.glyphs.setColor(i, dark ? SIGNAL : INK, 1);
    if (dark) warningSymbol(13).polys.forEach((p, i) => sk.marks.glyph(this.origin, p.map(([x, y]) => [x + 18, y + 14] as [number, number]), { width: PEN.medium, color: SIGNAL }, i === 0));
    sk.marks.commit();
    this.highlight(this.selection);
  }

  highlight(sel: Selection | null): Set<string> | null {
    this.selection = sel;
    return null;
  }

  /** The bank's own level draws it (cut open) while it is open. */
  yieldTo(key: string, m: number): void {
    if (key !== XF_BANK_KEY) return;
    const hide = m > 0;
    const d = this.bankDraw;
    for (let i = d.lines[0]; i < d.lines[0] + d.lines[1]; i++) this.sk.lines.setDim(i, hide ? 1 : 0);
    this.sk.faces.setHidden(d.faces[0], d.faces[1], hide, 0.2);
  }

  /** Where the bank's level sits here: the ground under its tank (its frame is this one). */
  get bankAt(): Vec3 {
    return en(BANK.e, 0, BANK.n);
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
    // the yard; the incoming and outgoing lines run on off the sheet
    return [en(-44, 0, -27), en(70, 0, -27), en(70, 0, 27), en(-44, 0, 27), en(-44, 11, -27), en(70, 15, 27)];
  }
}
