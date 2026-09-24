import type * as THREE from 'three';
import type { Vec3 } from '../render/lines';
import { INK, INK_35, INK_60, PEN, SIGNAL, voltageClassFor, type VoltageClass } from '../render/style';
import { warningSymbol } from '../render/symbols';
import type { IsoCamera } from '../render/iso';
import type { Grid, GridBranch, GridBus, GridGen, GridHvdc, GridShunt } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_MAP, Sketch, enIso as P } from './sketch';
import { siteExits, type SiteExit } from './exits';
import { UNIT1, unit1Shell } from './plant';
import { breaker, disconnect, gantry, insulator, kvClass, post, tower, transformer, vcyl, wire, type KvClass, type XfBody } from './kit';

/** The portal key of a transformer bank's own level (by its branch id). */
export const xfKey = (branchId: string): string => `xf:${branchId}`;

/**
 * The Site level: the inside of any substation or plant switchyard on the System
 * sheet, in metres — what its node stands for.
 *
 * Drawn from the network data by one rule, not from a survey of the real station, but
 * with the real equipment in its real order, in three phases: each voltage has a rigid
 * bus of three tubes on post insulators; each circuit has a bay off it — a drop from
 * each tube to a disconnect switch, a dead-tank circuit breaker, a second disconnect,
 * and a dead-end gantry — and outside the fence a lattice tower carrying the circuit
 * away on its true bearing, to the point where the System sheet's single stroke takes it
 * up (on the map one stroke stands for the three conductors). Transformer banks stand
 * between the buses they join; a generator arrives over its own bay from its step-up
 * transformer at the plant's edge; the demand served from here leaves through a
 * step-down bank; capacitor banks and DC converters have bays of their own.
 *
 * Chevrons ride the middle phase, at the System's MW scale: into the yard from every
 * source, out along every circuit and to the demand.
 */

type Item =
  | { kind: 'line'; exit: SiteExit; br: GridBranch }
  | { kind: 'plant'; plantId: string; gens: GridGen[] }
  | { kind: 'load' }
  | { kind: 'shunt'; shunt: GridShunt }
  | { kind: 'hvdc'; h: GridHvdc };

interface Section {
  bus: GridBus;
  k: KvClass;
  cls: VoltageClass;
  east: Item[];
  west: Item[];
  top: number;
  bot: number;
}

type P3 = [number, number, number];

/** A bay's conductors as drawn: each phase's far end, the middle phase's path, the strokes. */
interface BayDraw {
  ends: P3[];
  path: P3[];
  segs: number[];
  reach: number;
}

interface Corridor {
  far: string;
  k: KvClass;
  cls: VoltageClass;
  X: Vec3;
  circuits: Array<{ exit: SiteExit; ends: P3[]; line: { segs: number[]; flows: number[] } }>;
}

export class SiteLevel implements Level {
  readonly kind = 'site' as const;
  readonly name: string;
  readonly unitKm = 0.001;
  readonly needsDetail = false;
  readonly flowScale = FLOW_SCALES.site;
  readonly north = NORTH_MAP;
  readonly labels: LabelSpec[] = [];
  readonly sk = new Sketch(P);
  readonly seat: Vec3 = [0, 0, 0];
  /** Where Moss Landing Unit 1's frame sits in this one (its seat lands here). */
  unit1At: Vec3 | null = null;
  private morphValue = 1;
  private exitPts: Array<{ branch: number; at: Vec3; stagger: number }> = [];
  private lines: Array<{ k: number; segs: number[]; outer: Set<number>; flows: number[]; out: 1 | -1; mark: Vec3 }> = [];
  private plants: Array<{ gens: GridGen[]; segs: number[]; flows: number[] }> = [];
  private loads: Array<{ bus: GridBus; segs: number[]; flows: number[] }> = [];
  private hvdcs: Array<{ h: GridHvdc; bus: GridBus; flows: number[] }> = [];
  private banks: Array<{ k: number; segs: number[]; flows: number[] }> = [];
  private busSegs: Array<{ bus: GridBus; segs: number[]; at: Vec3 }> = [];
  private corridors = new Map<string, Corridor>();
  /** The transformer banks as drawn: where each tank stands, and its strokes (hidden while its own level is open). */
  readonly bankBodies: Array<{ branch: number; body: XfBody; lines: [number, number]; faces: [number, number]; hvKV: number; lvKV: number }> = [];
  /** Moss Landing Unit 1's footprint here: hidden while its own level is open. */
  private unit1Lines: [number, number] = [0, 0];
  private unit1Faces: [number, number] = [0, 0];
  private extent: Vec3[] = [];
  private R = 300;
  private reachE = 0;
  private reachW = 0;

  constructor(
    readonly grid: Grid,
    readonly siteId: string,
  ) {
    const sk = this.sk;
    const site = grid.sites.find((s) => s.id === siteId)!;
    this.name = site.name;
    sk.anchor = [0, 0, 0];
    const exits = siteExits(grid, siteId);
    const buses = grid.buses.filter((b) => b.site.id === siteId && !b.terminalOf).sort((a, b) => b.kv - a.kv);
    // which site bus each generator reaches (a unit's terminal bus steps up into one)
    const busOf = (g: GridGen): GridBus => (g.bus.terminalOf ? grid.branches.find((b) => b.to === g.bus)!.from : g.bus);
    const sections: Section[] = buses.map((bus) => ({ bus, k: kvClass(bus.kv), cls: voltageClassFor(bus.kv), east: [], west: [], top: 0, bot: 0 }));
    const custom = siteId === UNIT1.site;
    for (const sec of sections) {
      const b = sec.bus;
      const lines: Item[] = [];
      for (const x of exits) {
        const br = grid.branches[x.branch]!;
        if (br.from === b || br.to === b) lines.push({ kind: 'line', exit: x, br });
      }
      const others: Item[] = [];
      const byPlant = new Map<string, GridGen[]>();
      for (const g of grid.gens) if (busOf(g) === b) byPlant.set(g.plant.id, [...(byPlant.get(g.plant.id) ?? []), g]);
      for (const [plantId, gens] of byPlant) if (!(custom && plantId === UNIT1.plant)) others.push({ kind: 'plant', plantId, gens });
      if (grid.loads.some((l) => l.bus === b)) others.push({ kind: 'load' });
      for (const h of grid.hvdc) if (h.from === b || h.to === b) others.push({ kind: 'hvdc', h });
      for (const s of grid.shunts) if (s.bus === b) others.push({ kind: 'shunt', shunt: s });
      // lines leave from the side their bearing points to; the rest fill the emptier side
      for (const it of lines) ((it as { exit: SiteExit }).exit.dir[0] >= 0 ? sec.east : sec.west).push(it);
      const unit1Here = custom && b.id === UNIT1.bus;
      for (const it of others) (unit1Here || sec.east.length < sec.west.length ? sec.east : sec.west).push(it);
      // along the bus: lines by where they head (north first), so their spans do not cross
      const northOf = (it: Item) => (it.kind === 'line' ? -it.exit.dir[1] : -2);
      sec.east.sort((a, b) => northOf(b) - northOf(a));
      sec.west.sort((a, b) => northOf(b) - northOf(a));
    }
    // stack the sections along the plan's n, highest voltage at the top, banks between
    const bankPairs = new Map<string, GridBranch[]>();
    for (const br of grid.branches)
      if (br.kind === 'transformer' && br.from.site.id === siteId && !br.from.terminalOf && !br.to.terminalOf) {
        const key = `${br.from.id}|${br.to.id}`;
        bankPairs.set(key, [...(bankPairs.get(key) ?? []), br]);
      }
    let cursor = 0;
    sections.forEach((sec, i) => {
      const n = Math.max(sec.east.length, sec.west.length, 1);
      let L = n * sec.k.pitch;
      if (custom && sec.bus.id === UNIT1.bus) L = Math.max(L, UNIT1.busSpan[1] - UNIT1.busSpan[0] + 16);
      sec.top = cursor;
      sec.bot = cursor - L;
      const next = sections[i + 1];
      const banked = next && [...bankPairs.keys()].some((k) => k.includes(sec.bus.id) && k.includes(next.bus.id));
      cursor = sec.bot - (next ? (banked ? 22 + 5 * sec.k.f : 14) : 0);
    });
    const shift = -cursor / 2;
    for (const sec of sections) {
      sec.top += shift;
      sec.bot += shift;
    }
    const top = sections[0]!.top;
    const bot = sections[sections.length - 1]!.bot;

    // ---- how far the drawing reaches, and so the exit radius
    for (const sec of sections) {
      const bayEnd = this.bayLength(sec.k, true);
      const far = (items: Item[]) => items.reduce((a, it) => (it.kind === 'plant' ? Math.max(a, bayEnd + 16 + blockSize(it)) : it.kind === 'load' || it.kind === 'hvdc' ? Math.max(a, bayEnd + 40) : a), bayEnd + 8);
      this.reachE = Math.max(this.reachE, far(sec.east));
      this.reachW = Math.max(this.reachW, far(sec.west));
    }
    if (custom) this.reachW = Math.max(this.reachW, UNIT1.reachW);
    this.R = Math.max(280, Math.hypot(Math.max(this.reachE, this.reachW), Math.max(top, -bot)) + 150);

    // ---- the fence with its gate and the road in, the control house: first to unfold
    sk.stagger = 0;
    const fenceE = Math.max(...sections.map((s) => this.bayLength(s.k, true))) + 5;
    const fn0 = bot - 26;
    const fn1 = top + 10;
    const gate = 8;
    const fence: Array<[number, number]> = [
      [-gate / 2, fn0],
      [fenceE, fn0],
      [fenceE, fn1],
      [-fenceE, fn1],
      [-fenceE, fn0],
      [gate / 2 - gate, fn0],
    ];
    for (let i = 0; i + 1 < fence.length; i++) {
      const [e0, n0] = fence[i]!;
      const [e1, n1] = fence[i + 1]!;
      sk.seg(P(e0, 0, n0), P(e1, 0, n1), { width: PEN.hairline, color: INK_60, dash: 'long' });
      const len = Math.hypot(e1 - e0, n1 - n0);
      for (let d = 0; d <= len; d += 12) sk.seg(P(e0 + ((e1 - e0) * d) / len, 0, n0 + ((n1 - n0) * d) / len), P(e0 + ((e1 - e0) * d) / len, 2.4, n0 + ((n1 - n0) * d) / len), { width: PEN.hairline, color: INK_60 });
    }
    // the road: in through the gate along the bus line, to the control house
    for (const de of [-3, 3]) sk.seg(P(de, 0, fn0 - 30), P(de, 0, fn0 + 6), { width: PEN.hairline, color: INK_35 });
    const house = { e: -fenceE * 0.45, n: fn0 + 10 };
    sk.box(house.e, 0, house.n, 12, 4.2, 8);
    sk.seg(P(house.e + 6, 0, house.n + 1), P(-3, 0, fn0 + 1), { width: PEN.hairline, color: INK_35 });
    this.labels.push({ id: 'st:name', text: site.name.toUpperCase(), anchor: P(0, 0, fn1 + 6), priority: 10, minZoom: 0, kind: 'site' });
    this.labels.push({ id: 'st:house', text: 'Control house', anchor: P(house.e, 4.2, house.n), priority: 2, minZoom: 1.2, kind: 'equip' });

    // ---- buses: three tubes on post insulators
    for (const sec of sections) {
      const { k, bus } = sec;
      sk.stagger = 0.04;
      const segs: number[] = [];
      const posts = Math.max(2, Math.round((sec.top - sec.bot) / k.pitch) + 1);
      for (let p = 0; p < 3; p++) {
        const e = tubeE(k, p);
        for (let i = 0; i < posts; i++) post(sk, e, sec.top - ((sec.top - sec.bot) * i) / (posts - 1), k.busH - 0.3 * k.f, k.f);
        segs.push(wire(sk, [e, k.busH, sec.top], [e, k.busH, sec.bot], busWidth(sec.cls)));
      }
      this.busSegs.push({ bus, segs, at: P(0, k.busH, sec.top) });
      sk.target({ kind: 'site', id: siteId }, [P(0, k.busH, sec.top), P(0, k.busH, sec.bot)]);
      this.labels.push({ id: `st:bus:${bus.id}`, text: `${bus.kv} kV bus`, anchor: P(tubeE(k, 2), k.busH, sec.top), priority: 8, minZoom: 0, kind: 'equip', prov: `data:network.bus.${bus.id}.baseKV` });
    }

    // ---- bays
    for (const sec of sections) {
      for (const [side, items] of [[1, sec.east], [-1, sec.west]] as Array<[1 | -1, Item[]]>) {
        // plants stand in a column past the bays, spaced by their own size
        const blocks = items.filter((it) => it.kind === 'plant');
        const sizes = blocks.map((it) => blockSize(it));
        const span = sizes.reduce((a, s) => a + s, 0) + 14 * Math.max(0, sizes.length - 1);
        let bn = (sec.top + sec.bot) / 2 + span / 2;
        const blockAt = new Map<Item, { n: number; s: number }>();
        blocks.forEach((it, i) => {
          blockAt.set(it, { n: bn - sizes[i]! / 2, s: sizes[i]! });
          bn -= sizes[i]! + 14;
        });
        items.forEach((it, j) => {
          const n = sec.top - ((sec.top - sec.bot) * (j + 0.5)) / items.length;
          this.bay(sec, side, n, it, blockAt.get(it));
        });
      }
    }
    sk.anchor = [0, 0, 0];
    for (const cor of this.corridors.values()) this.corridor(cor);
    if (custom) this.unit1(sections.find((s) => s.bus.id === UNIT1.bus)!);

    // ---- banks between the buses they join
    for (const [key, brs] of bankPairs) {
      const [hvId, lvId] = key.split('|');
      const hv = sections.find((s) => s.bus.id === hvId);
      const lv = sections.find((s) => s.bus.id === lvId);
      if (hv && lv) this.banksBetween(hv, lv, brs);
    }
    sk.stagger = 0;
    sk.anchor = [0, 0, 0];
    sk.commit();
    const ext = Math.max(fenceE, this.reachE, this.reachW) + 8;
    this.extent = [P(-ext, 0, bot - 40), P(ext, 0, bot - 40), P(ext, 0, top + 20), P(-ext, 0, top + 20), P(0, sections[0]!.k.gantryH, top)];
  }

  /** How far a bay reaches from the bus centre line (to its gantry, or its second disconnect). */
  private bayLength(k: KvClass, withGantry: boolean): number {
    const d = bayStations(k);
    return withGantry ? d.ge + 1.4 * k.f : d.d3b;
  }

  /**
   * The core of a bay, three phases: from each bus tube a drop to a disconnect, a
   * breaker, a second disconnect and (for a line or a plant) a dead-end gantry.
   */
  private bayCore(sec: Section, s: 1 | -1, n: number, opts: { gantry: boolean; second?: boolean }): BayDraw {
    const sk = this.sk;
    const { k, cls } = sec;
    const d = bayStations(k);
    const ns = [-1, 0, 1].map((p) => n + p * k.sp);
    const w = phaseWidth(cls);
    const segs: number[] = [];
    sk.stagger = 0.12;
    sk.anchor = P(0, k.busH, n);
    const D1 = disconnect(sk, s * d.d1a, s * d.d1b, ns, k);
    const B = breaker(sk, s * d.b0, s * d.b1, ns, k);
    const second = opts.second ?? true;
    const D3 = second ? disconnect(sk, s * d.d3a, s * d.d3b, ns, k) : null;
    let G: P3[] | null = null;
    if (opts.gantry) {
      sk.stagger = 0;
      sk.anchor = [0, 0, 0];
      G = gantry(sk, s * d.ge, ns, k.gantryH, k);
      sk.stagger = 0.12;
      sk.anchor = P(0, k.busH, n);
    }
    const ends: P3[] = [];
    const path: P3[] = [];
    for (let p = 0; p < 3; p++) {
      const tube: P3 = [tubeE(k, p), k.busH, ns[p]!];
      const chain: P3[] = [tube, D1[p]![0], D1[p]![1], B[p]![0], B[p]![1]];
      if (D3) chain.push(D3[p]![0], D3[p]![1]);
      if (G) chain.push(G[p]!);
      // conductors between terminals (the blades and the breaker are the equipment's own)
      const joins: Array<[P3, P3]> = [
        [chain[0]!, chain[1]!],
        [chain[2]!, chain[3]!],
      ];
      if (D3) joins.push([chain[4]!, chain[5]!]);
      if (G) joins.push([chain[chain.length - 2]!, chain[chain.length - 1]!]);
      for (const [a, b] of joins) segs.push(wire(sk, a, b, w));
      ends.push(chain[chain.length - 1]!);
      if (p === 1) path.push(...chain);
    }
    return { ends, path, segs, reach: G ? d.ge : D3 ? d.d3b : d.b1 };
  }

  /** One bay on a section's bus, and what it serves. */
  private bay(sec: Section, s: 1 | -1, n: number, it: Item, block?: { n: number; s: number }): void {
    const sk = this.sk;
    const { k, cls } = sec;
    const flowsOn = (path: P3[]) => path.slice(1).map((q, i) => sk.flowSeg(P(...path[i]!), P(...q)));
    if (it.kind === 'line') {
      const core = this.bayCore(sec, s, n, { gantry: true });
      const line = { k: it.exit.branch, segs: core.segs, outer: new Set<number>(), flows: flowsOn(core.path), out: (it.br.from === sec.bus ? 1 : -1) as 1 | -1, mark: P(...core.ends[1]!) };
      this.lines.push(line);
      sk.target({ kind: 'branch', index: it.exit.branch }, core.path.map((q) => P(...q)));
      const key = `${it.exit.far}|${it.br.kv}`;
      let cor = this.corridors.get(key);
      if (!cor) {
        cor = { far: it.exit.far, k, cls, X: [it.exit.dir[0] * this.R, 0, it.exit.dir[1] * this.R], circuits: [] };
        this.corridors.set(key, cor);
      }
      cor.circuits.push({ exit: it.exit, ends: core.ends, line });
      return;
    }
    if (it.kind === 'plant') {
      const gen = it.gens[0]!;
      const b = block ?? { n, s: blockSize(it) };
      const core = this.bayCore(sec, s, n, { gantry: true });
      // the step-up transformer at the plant's edge, its high side toward the yard
      const ge = bayStations(k).ge;
      const te = s * (ge + 10 + 2.5 * k.f);
      sk.stagger = 0.24;
      sk.anchor = P(s * ge, 0, n);
      const gsu = transformer(sk, te, b.n, 3.2 * k.f, 2.6 * k.f, 3.4 * k.f, k.f, s === 1 ? -1 : 1);
      const w = phaseWidth(cls);
      const segs = [...core.segs];
      // spans from the gantry to the transformer's bushings (in the order they stand)
      const hv = [...gsu.hv].sort((a, c) => a[2] - c[2]);
      const ends = [...core.ends].sort((a, c) => a[2] - c[2]);
      for (let p = 0; p < 3; p++) segs.push(wire(sk, ends[p]!, hv[p]!, w));
      // the generator's own bus into the plant
      const be = s * (ge + 16 + 5 * k.f + b.s / 2);
      const lvMid = gsu.lv[1]!;
      const face = s * (Math.abs(be) - b.s / 2);
      sk.box((lvMid[0] + face) / 2, lvMid[1] - 0.6, b.n, Math.max(0.5, Math.abs(face - lvMid[0])), 0.6, 0.6, { width: PEN.fine, color: INK });
      sk.stagger = 0.3;
      sk.anchor = P(te, 0, b.n);
      drawBlock(sk, gen.plant.tech, be, b.n, b.s, s);
      const path = [...core.path, hv[1]!, [face, lvMid[1] - 0.3, b.n] as P3].reverse();
      const flows = flowsOn(path);
      this.plants.push({ gens: it.gens, segs, flows });
      sk.target({ kind: 'plant', id: it.plantId }, path.map((q) => P(...q)));
      sk.target({ kind: 'plant', id: it.plantId }, [P(be - b.s / 2, 0, b.n - b.s / 2), P(be + b.s / 2, b.s * 0.4, b.n + b.s / 2)], true);
      this.labels.push({ id: `st:plant:${it.plantId}`, text: gen.plant.name, anchor: P(be, b.s * 0.35, b.n + b.s / 2), priority: 7, minZoom: 0, kind: 'equip', prov: `data:plants.${it.plantId}.name` });
      return;
    }
    if (it.kind === 'load') {
      const core = this.bayCore(sec, s, n, { gantry: false });
      const d = bayStations(k);
      // the step-down bank, its high side toward the bay
      sk.stagger = 0.24;
      const te = s * (d.d3b + 4 + 2.4 * k.f);
      const xf = transformer(sk, te, n, 4.4 * k.f, 3.2 * k.f, 3.8 * k.f, k.f * 0.8, s === 1 ? -1 : 1);
      const w = phaseWidth(cls);
      const segs = [...core.segs];
      const hv = [...xf.hv].sort((a, c) => a[2] - c[2]);
      const ends = [...core.ends].sort((a, c) => a[2] - c[2]);
      for (let p = 0; p < 3; p++) segs.push(wire(sk, ends[p]!, hv[p]!, w));
      // out on wood H-frames at 60 kV, two spans, then off the sheet
      const sub = voltageClassFor(60);
      const lvk = kvClass(60);
      const lv = [...xf.lv].sort((a, c) => a[2] - c[2]);
      const frames = [te + s * 14, te + s * 30];
      const armH = 11;
      let prev: P3[] = lv;
      for (const fe of frames) {
        for (const dn of [-2.6, 2.6]) sk.seg(P(fe, 0, n + dn), P(fe, armH + 0.8, n + dn), { width: PEN.thin, color: INK });
        sk.seg(P(fe, armH, n - 3.4), P(fe, armH, n + 3.4), { width: PEN.thin, color: INK });
        const att: P3[] = [-1, 0, 1].map((p) => [fe, armH - 1, n + p * lvk.sp * 1.1] as P3);
        for (let p = 0; p < 3; p++) {
          insulator(sk, [fe, armH, att[p]![2]], att[p]!, 0.25);
          segs.push(sk.seg(P(...prev[p]!), P(...att[p]!), { width: phaseWidth(sub), color: INK, dash: sub.dash }));
        }
        prev = att;
      }
      const off: P3[] = prev.map((q) => [q[0] + s * 14, q[1] - 1, q[2]] as P3);
      for (let p = 0; p < 3; p++) segs.push(sk.seg(P(...prev[p]!), P(...off[p]!), { width: phaseWidth(sub), color: INK, dash: sub.dash, fade: 'none' }));
      const path = [...core.path, hv[1]!, lv[1]!, ...frames.map((fe) => [fe, armH - 1, n] as P3), off[1]!];
      this.loads.push({ bus: sec.bus, segs, flows: flowsOn(path) });
      sk.target({ kind: 'site', id: this.siteId }, path.map((q) => P(...q)));
      this.labels.push({ id: `st:load:${sec.bus.id}`, text: 'To the distribution substations', anchor: P(...off[2]!), priority: 5, minZoom: 0.3, kind: 'equip' });
      this.labels.push({ id: `st:loadx:${sec.bus.id}`, text: 'Step-down bank', anchor: P(te, 3.6 * k.f, n + 2 * k.f), priority: 3, minZoom: 1, kind: 'equip' });
      return;
    }
    if (it.kind === 'shunt') {
      const core = this.bayCore(sec, s, n, { gantry: false, second: false });
      const d = bayStations(k);
      // the capacitor rack: a steel frame, three phases of cans on insulators
      sk.stagger = 0.24;
      const re = s * (d.b1 + 3 + 3 * k.f);
      const rw = 5 * k.f;
      sk.box(re, 0, n, rw, 1.2, 3 * k.sp + 2, { width: PEN.fine, color: INK_60 });
      const tops: P3[] = [];
      for (let p = 0; p < 3; p++) {
        const pn = n + (p - 1) * k.sp;
        for (let t = 0; t < 2; t++) {
          const h0 = 1.2 + t * 1.6 * k.f;
          insulator(sk, [re, h0, pn], [re, h0 + 0.5 * k.f, pn], 0.2 * k.f);
          for (let c = -1; c <= 1; c++) sk.box(re + c * rw * 0.3, h0 + 0.5 * k.f, pn, 0.5 * k.f, 0.9 * k.f, 0.35 * k.f, { width: PEN.hairline, color: INK });
        }
        tops.push([re, 1.2 + 3.2 * k.f + 0.2, pn]);
      }
      const segs = [...core.segs];
      const ends = [...core.ends].sort((a, c) => a[2] - c[2]);
      for (let p = 0; p < 3; p++) segs.push(wire(sk, ends[p]!, tops[p]!, phaseWidth(cls)));
      sk.target({ kind: 'site', id: this.siteId }, core.path.map((q) => P(...q)));
      this.labels.push({ id: `st:shunt:${sec.bus.id}`, text: 'Capacitor bank', anchor: P(re, 3.6 * k.f, n + 1.5 * k.sp), priority: 4, minZoom: 0.6, kind: 'equip' });
      return;
    }
    // a DC converter: its transformer and valve hall, and the line or cable away
    const core = this.bayCore(sec, s, n, { gantry: false });
    const d = bayStations(k);
    sk.stagger = 0.24;
    const te = s * (d.d3b + 4 + 2.5 * k.f);
    const xf = transformer(sk, te, n, 5 * k.f, 3.4 * k.f, 4 * k.f, k.f, s === 1 ? -1 : 1);
    const hv = [...xf.hv].sort((a, c) => a[2] - c[2]);
    const ends = [...core.ends].sort((a, c) => a[2] - c[2]);
    for (let p = 0; p < 3; p++) core.segs.push(wire(sk, ends[p]!, hv[p]!, phaseWidth(cls)));
    const he = te + s * (5 * k.f + 14);
    sk.box(he, 0, n, 24, 15, 18);
    const away: P3 = [he + s * 50, 0, n];
    sk.seg(P(he + s * 12, 3, n), P(...away), { width: PEN.medium, color: INK, dash: 'short' });
    this.hvdcs.push({ h: it.h, bus: sec.bus, flows: flowsOn([...core.path, hv[1]!, [he, 8, n], away]) });
    sk.target({ kind: 'site', id: this.siteId }, core.path.map((q) => P(...q)));
    this.labels.push({ id: `st:hvdc:${it.h.rec.id}`, text: it.h.rec.name, anchor: P(he, 15, n), priority: 6, minZoom: 0, kind: 'equip', prov: `data:network.hvdc.${it.h.rec.id}.name` });
  }

  /**
   * A corridor out of the yard: one lattice tower outside the fence carrying its
   * circuits, three phases each, and from it every conductor on, at conductor height, to
   * the exit point on the bearing — where the System's single stroke takes the circuit.
   */
  private corridor(cor: Corridor): void {
    const sk = this.sk;
    const { k, cls } = cor;
    sk.stagger = 0;
    sk.anchor = [0, 0, 0];
    const all = cor.circuits.flatMap((c) => c.ends);
    const ge = all.reduce((a, q) => a + q[0], 0) / all.length;
    const gn = all.reduce((a, q) => a + q[2], 0) / all.length;
    // the tower stands straight out from its gantries, past the fence, so the long span
    // to the exit runs outside the yard; the arm faces the way that span goes
    const s = Math.sign(ge) || 1;
    const te = ge + s * Math.max(26, 12 * k.f);
    const tn = gn;
    const L = Math.hypot(cor.X[0] - te, -cor.X[2] - tn) || 1;
    const ue = (cor.X[0] - te) / L;
    const un = (-cor.X[2] - tn) / L;
    const m = all.length;
    const att = tower(sk, te, tn, ue, un, k.towerH, m, k.sp * 1.1, k.f);
    // each gantry conductor to the arm position that keeps the spans from crossing
    const ve = -un;
    const vn = ue;
    const across = (q: P3) => (q[0] - te) * ve + (q[2] - tn) * vn;
    const order = all.map((q, i) => ({ q, i })).sort((a, b) => across(a.q) - across(b.q));
    const slot = new Map<number, P3>(order.map((o, j) => [o.i, att[j]!]));
    const w = phaseWidth(cls);
    let idx = 0;
    const H = att[0]![1];
    for (const c of cor.circuits) {
      const X: Vec3 = [cor.X[0], H, cor.X[2]];
      const sp = c.exit.sidePx;
      c.ends.forEach((q, p) => {
        const a = slot.get(idx++)!;
        const s1 = sk.seg(P(...q), P(...a), { width: w, color: INK, dash: cls.dash });
        // the three conductors of the circuit converge on the exit point: on the map one stroke stands for them
        const s2 = sk.seg(P(...a), X, { width: w, color: INK, dash: cls.dash, px: [0, 0, sp[0], sp[1]], collapsePx: [0, 0, sp[0], sp[1]] });
        c.line.segs.push(s1, s2);
        const line = this.lines.find((l) => l.segs === c.line.segs)!;
        line.outer.add(s1).add(s2);
        if (p === 1) {
          c.line.flows.push(sk.flowSeg(P(...q), P(...a)), sk.flowSeg(P(...a), X));
          sk.target({ kind: 'branch', index: c.exit.branch }, [P(...q), P(...a), X]);
        }
      });
      this.exitPts.push({ branch: c.exit.branch, at: X, stagger: 0 });
    }
    const far = this.grid.sites.find((q) => q.id === cor.far)!;
    this.labels.push({ id: `st:to:${cor.far}:${k.kv}`, text: `to ${far.name}`, anchor: P(te, k.towerH, tn), priority: 6, minZoom: 0.25, kind: 'exit' });
  }

  /** Transformer banks in the gap between two buses: high-voltage leads up, low-voltage down. */
  private banksBetween(hv: Section, lv: Section, brs: GridBranch[]): void {
    const sk = this.sk;
    const gapN = (hv.bot + lv.top) / 2;
    const big = (brs[0]!.xfmr?.mva ?? 0) >= 500;
    const f = hv.k.f;
    const [se, sh, sn] = big ? [9, 6.5, 6.5] : [5.5, 4.4, 4.2];
    const dx = se + 10;
    brs.forEach((br, i) => {
      // alternate either side of the bus line, working outward
      const slot = Math.floor(i / 2) + 1;
      const e = (i % 2 === 0 ? 1 : -1) * (slot * dx - dx / 2 + hv.k.sp * 1.5);
      sk.stagger = 0.2;
      sk.anchor = P(0, 0, gapN);
      const l0 = sk.lines.count;
      const f0 = sk.faces.vertexCount;
      const body = { e, n: gapN, se, sh, sn, f: f * 0.7, hvSide: 1 as const, alongN: true };
      const xf = transformer(sk, e, gapN, se, sh, sn, body.f, 1, true);
      this.bankBodies.push({ branch: br.index, body, lines: [l0, sk.lines.count - l0], faces: [f0, sk.faces.vertexCount - f0], hvKV: hv.bus.kv, lvKV: lv.bus.kv });
      const segs: number[] = [];
      const hvT = [...xf.hv].sort((a, b) => a[0] - b[0]);
      const lvT = [...xf.lv].sort((a, b) => a[0] - b[0]);
      for (let p = 0; p < 3; p++) {
        segs.push(wire(sk, hvT[p]!, [tubeE(hv.k, p), hv.k.busH, hv.bot], phaseWidth(hv.cls)));
        segs.push(wire(sk, lvT[p]!, [tubeE(lv.k, p), lv.k.busH, lv.top], phaseWidth(lv.cls)));
      }
      const flows = [sk.flowSeg(P(tubeE(hv.k, 1), hv.k.busH, hv.bot), P(...hvT[1]!)), sk.flowSeg(P(...lvT[1]!), P(tubeE(lv.k, 1), lv.k.busH, lv.top))];
      this.banks.push({ k: br.index, segs, flows });
      sk.target({ kind: 'branch', index: br.index }, xf.tank, true);
    });
    const kvs = `${hv.bus.kv}/${lv.bus.kv} kV`;
    this.labels.push({ id: `st:banks:${hv.bus.id}|${lv.bus.id}`, text: brs.length > 1 ? `${kvs} banks` : `${kvs} bank`, anchor: P(dx / 2 + hv.k.sp * 1.5 + se, sh + 3, gapN), priority: 7, minZoom: 0, kind: 'equip', prov: `data:network.xfmr.${brs[0]!.id}.kv` });
  }

  /**
   * Moss Landing Unit 1: its three step-up transformers on the west side of the 230 kV
   * bus and the plant's silhouette beyond — the parts its own level draws in the same
   * place. The rest of the plant unfolds from here.
   */
  private unit1(sec: Section): void {
    const sk = this.sk;
    const nc = (sec.top + sec.bot) / 2;
    const plantToSite = (e: number, h: number, n: number): Vec3 => P(e - UNIT1.busE, h, n + nc);
    this.unit1At = P(0, 0, nc);
    sk.stagger = 0.16;
    sk.anchor = P(0, sec.k.busH, nc);
    const l0 = sk.lines.count;
    const f0 = sk.faces.vertexCount;
    const save = sk.plan;
    sk.plan = plantToSite;
    const hv = unit1Shell(sk);
    sk.plan = save;
    this.unit1Lines = [l0, sk.lines.count - l0];
    this.unit1Faces = [f0, sk.faces.vertexCount - f0];
    const gens = this.grid.gens.filter((g) => g.plant.id === UNIT1.plant);
    const w = phaseWidth(sec.cls);
    const segs: number[] = [];
    const flows: number[] = [];
    for (const [u, n] of Object.entries(UNIT1.trains)) {
      const bs = [...hv[u]!].sort((a, b) => a[2] - b[2]);
      bs.forEach((b, p) => {
        const a = plantToSite(...b);
        const t = P(tubeE(sec.k, p), sec.k.busH, n + nc + (p - 1) * 1.2);
        segs.push(sk.seg(a, t, { width: w, color: INK }));
        if (p === 1) {
          flows.push(sk.flowSeg(a, t));
          sk.target({ kind: 'plant', id: UNIT1.plant }, [a, t]);
        }
      });
    }
    this.plants.push({ gens, segs, flows });
    for (const [a, b] of UNIT1.pick) sk.target({ kind: 'plant', id: UNIT1.plant }, [plantToSite(...a), plantToSite(...b)], true);
    this.labels.push({ id: `st:plant:${UNIT1.plant}`, text: gens[0]!.plant.name, anchor: plantToSite(-34, 24, 34), priority: 8, minZoom: 0, kind: 'equip', prov: `data:plants.${UNIT1.plant}.name` });
    sk.anchor = [0, 0, 0];
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  get classes(): VoltageClass[] {
    const ids = new Set<string>();
    const out: VoltageClass[] = [];
    for (const b of this.grid.buses) {
      if (b.site.id !== this.siteId || b.terminalOf) continue;
      const c = voltageClassFor(b.kv);
      if (!ids.has(c.id)) out.push(c), ids.add(c.id);
    }
    if (this.loads.length && !ids.has('sub69')) out.push(voltageClassFor(60));
    return out.sort((a, b) => b.kvNominal - a.kvNominal);
  }

  exits(): Array<{ branch: number; at: Vec3; stagger: number }> {
    return this.exitPts;
  }

  yieldTo(key: string, m: number): void {
    const bank = this.bankBodies.find((b) => key === xfKey(this.grid.branches[b.branch]!.id));
    if (bank) {
      // the bank's own level draws it, cut open
      for (let i = bank.lines[0]; i < bank.lines[0] + bank.lines[1]; i++) this.sk.lines.setDim(i, m > 0 ? 1 : 0);
      this.sk.faces.setHidden(bank.faces[0], bank.faces[1], m > 0, 0.2);
      return;
    }
    if (key !== `plant:${UNIT1.plant}`) return;
    // the silhouette is drawn by the plant's own level while it is open
    const hide = m > 0;
    for (let i = this.unit1Lines[0]; i < this.unit1Lines[0] + this.unit1Lines[1]; i++) this.sk.lines.setDim(i, hide ? 1 : 0);
    this.sk.faces.setHidden(this.unit1Faces[0], this.unit1Faces[1], hide, 0.16);
  }

  applySnapshot(s: Snapshot): void {
    const sk = this.sk;
    const none = s.outcome === 'none';
    const sc = this.flowScale;
    const set = (flow: number, mw: number, color = INK, on = true) =>
      sk.flow.set(flow, { sizePx: chevronSizeFor(mw, sc), speed: chevronSpeedFor(mw, sc) * Math.sign(mw), color, alpha: !none && on && Math.abs(mw) > 0.5 ? 1 : 0 });
    sk.marks.clear();
    for (const l of this.lines) {
      const k = l.k;
      const br = this.grid.branches[k]!;
      const out = !s.inService[k];
      const alive = !none && !out && s.energized[br.from.index] === 1 && s.energized[br.to.index] === 1;
      const over = alive && s.loading[k]! > 1;
      // power leaving the site on this circuit (positive into the branch at this end)
      const mw = l.out === 1 ? s.pf[k]! : s.pt[k]!;
      for (const seg of l.segs) {
        sk.lines.setColor(seg, over ? SIGNAL : alive ? INK : INK_35, 1);
        sk.lines.setPattern(seg, out || (!alive && !none) ? 'hidden' : l.outer.has(seg) ? voltageClassFor(br.kv).dash : 'solid');
      }
      for (const f of l.flows) set(f, alive ? mw : 0, over ? SIGNAL : INK);
      if (over) warningSymbol(12).polys.forEach((p, i) => sk.marks.glyph(l.mark, p.map(([x, y]) => [x + 10, y + 12] as [number, number]), { width: PEN.medium, color: SIGNAL }, i === 0));
    }
    for (const p of this.plants) {
      const on = p.gens.some((g) => s.genOnline[g.index]);
      const mw = p.gens.reduce((a, g) => a + (s.genOnline[g.index] ? s.pg[g.index]! : 0), 0);
      for (const seg of p.segs) {
        sk.lines.setColor(seg, on && !none ? INK : INK_35, 1);
        sk.lines.setPattern(seg, on ? 'solid' : 'hidden');
      }
      for (const f of p.flows) set(f, mw, INK, on);
    }
    const hvdcAt = (bus: GridBus) =>
      this.grid.hvdc.reduce((a, h) => a + (h.from === bus ? h.rec.scheduleMW : h.to === bus ? -h.rec.scheduleMW * (1 - h.rec.lossFrac) : 0), 0);
    for (const l of this.loads) {
      const dead = !s.energized[l.bus.index];
      const mw = dead ? 0 : s.pd[l.bus.index]! - hvdcAt(l.bus);
      for (const seg of l.segs) sk.lines.setColor(seg, dead && !none ? SIGNAL : none ? INK_35 : INK, 1);
      for (const f of l.flows) set(f, mw);
    }
    for (const h of this.hvdcs) {
      const mw = h.h.from === h.bus ? h.h.rec.scheduleMW : -h.h.rec.scheduleMW * (1 - h.h.rec.lossFrac);
      for (const f of h.flows) set(f, s.energized[h.bus.index] ? mw : 0);
    }
    for (const b of this.banks) {
      const out = !s.inService[b.k];
      const over = !out && s.loading[b.k]! > 1;
      for (const seg of b.segs) {
        sk.lines.setColor(seg, over ? SIGNAL : out || none ? INK_35 : INK, 1);
        sk.lines.setPattern(seg, out ? 'hidden' : 'solid');
      }
      for (const f of b.flows) set(f, out ? 0 : s.pf[b.k]!, over ? SIGNAL : INK);
    }
    for (const b of this.busSegs) {
      const i = b.bus.index;
      const dead = !none && !s.energized[i];
      const vm = s.vm[i]!;
      const range = !none && !dead && (vm < 0.95 || vm > (b.bus.kv >= 345 ? 1.1 : 1.05));
      for (const seg of b.segs) sk.lines.setColor(seg, dead ? SIGNAL : none ? INK_35 : INK, 1);
      if (dead || range) warningSymbol(13).polys.forEach((p, k) => sk.marks.glyph(b.at, p.map(([x, y]) => [x - 14, y + 14] as [number, number]), { width: PEN.medium, color: SIGNAL }, k === 0));
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

/** Where a phase's bus tube runs (east of the bus centre line), m. */
function tubeE(k: KvClass, p: number): number {
  return (p - 1) * k.sp;
}

/** Stations along a bay, from the bus centre line outward: disconnect, breaker, disconnect, gantry. */
function bayStations(k: KvClass): { d1a: number; d1b: number; b0: number; b1: number; d3a: number; d3b: number; ge: number } {
  const d1a = k.sp * 1.6 + 2.2 * k.f;
  const d1b = d1a + k.Ld;
  const b0 = d1b + 1.8 * k.f;
  const b1 = b0 + k.Lb;
  const d3a = b1 + 1.8 * k.f;
  const d3b = d3a + k.Ld;
  const ge = d3b + 3.4 * k.f;
  return { d1a, d1b, b0, b1, d3a, d3b, ge };
}

function phaseWidth(c: VoltageClass): number {
  return Math.max(0.9, c.weight * 0.5);
}

function busWidth(c: VoltageClass): number {
  return Math.max(1.4, c.weight * 0.85);
}

/** A plant's block: its footprint side, m, by capacity (schematic, not to its real area). */
function blockSize(it: Item): number {
  if (it.kind !== 'plant') return 0;
  const mw = it.gens.reduce((a, g) => a + g.pmaxMW, 0);
  return Math.max(30, Math.min(80, 16 * Math.sqrt(Math.abs(mw) / 100)));
}

/**
 * A plant's silhouette by technology, standing on (e, n) with footprint side s, its
 * front (toward the yard) on the `side` it faces. What makes each kind recognisable: a
 * gas turbine's hall, recovery boiler and stack; a reactor's domed containment; a
 * powerhouse at the foot of its penstocks; a wind farm's turbines; rows of solar
 * tables; battery containers with their inverters.
 */
function drawBlock(sk: Sketch, tech: string, e: number, n: number, s: number, side: 1 | -1): void {
  const thin = { width: PEN.thin, color: INK };
  const hair = { width: PEN.hairline, color: INK };
  // `back` is away from the yard
  const back = (d: number) => e + side * d;
  switch (tech) {
    case 'nuclear':
      sk.box(back(-s * 0.2), 0, n, s * 0.35, s * 0.22, s * 0.8);
      vcyl(sk, back(s * 0.22), n + s * 0.22, s * 0.16, s * 0.3, 0, s * 0.16);
      vcyl(sk, back(s * 0.22), n - s * 0.22, s * 0.16, s * 0.3, 0, s * 0.16);
      break;
    case 'geothermal': {
      sk.box(back(-s * 0.15), 0, n, s * 0.4, s * 0.18, s * 0.5);
      vcyl(sk, back(s * 0.2), n + s * 0.2, s * 0.14, s * 0.32);
      vcyl(sk, back(s * 0.2), n - s * 0.2, s * 0.14, s * 0.32);
      // steam pipes from the wells behind
      for (const dn of [-0.35, 0, 0.35]) {
        sk.box(back(s * 0.55), 0, n + dn * s, 1.6, 1.4, 1.6, hair);
        sk.poly([sk.plan(back(s * 0.55), 1.2, n + dn * s), sk.plan(back(s * 0.4), 2.5, n + dn * s * 0.5), sk.plan(back(0), 2.5, n)], thin);
      }
      break;
    }
    case 'hydro':
    case 'pumped_storage': {
      // the powerhouse at the foot of the slope, penstocks climbing away from the yard to the intake
      sk.box(back(-s * 0.15), 0, n, s * 0.35, s * 0.2, s * 0.6);
      const rise = s * 0.9;
      for (const dn of [-0.14, 0.14]) {
        const pts = [sk.plan(back(0), s * 0.12, n + dn * s), sk.plan(back(s * 0.6), rise * 0.45, n + dn * s), sk.plan(back(s * 1.2), rise, n + dn * s)];
        sk.poly(pts, thin);
        sk.poly(pts.map(([x, y, z]) => [x, y + 1.2, z] as Vec3), hair);
      }
      // the intake and the edge of the reservoir above
      sk.box(back(s * 1.25), rise - 2, n, 4, 4, s * 0.5, hair);
      sk.poly([sk.plan(back(s * 1.3), rise, n - s * 0.6), sk.plan(back(s * 1.3), rise, n + s * 0.6)], { width: PEN.fine, color: INK_60, dash: 'long' });
      break;
    }
    case 'wind':
      for (let k = -1; k <= 1; k++) {
        const tn = n + k * s * 0.36;
        const te = back(k * s * 0.12);
        const H = s * 0.95;
        sk.seg(sk.plan(te - 0.8, 0, tn), sk.plan(te - 0.35, H, tn), thin);
        sk.seg(sk.plan(te + 0.8, 0, tn), sk.plan(te + 0.35, H, tn), thin);
        sk.box(te, H, tn, 3.2, 1.6, 1.4, hair);
        const hub = sk.plan(te - side * 1.8, H + 0.8, tn);
        // the rotor faces the viewer (its plane holds the vertical and the screen's horizontal)
        for (let b = 0; b < 3; b++) {
          const t = (2 * Math.PI * b) / 3 + k * 0.7;
          const L = s * 0.4;
          sk.seg(hub, [hub[0] + Math.cos(t) * L * Math.SQRT1_2, hub[1] + Math.sin(t) * L, hub[2] + Math.cos(t) * L * Math.SQRT1_2], thin);
        }
        // the collector cable to the plant's own transformer at the front
        sk.seg(sk.plan(te, 0.2, tn), sk.plan(back(-s * 0.5), 0.2, n), { width: PEN.hairline, color: INK_60, dash: 'short' });
      }
      break;
    case 'solar_pv':
      for (let r = 0; r < 7; r++) {
        const re = back(-s / 2 + (r + 0.5) * (s / 7));
        const q = [sk.plan(re - 1.5, 0.8, n - s / 2), sk.plan(re - 1.5, 0.8, n + s / 2), sk.plan(re + 1.5, 2.6, n + s / 2), sk.plan(re + 1.5, 2.6, n - s / 2)];
        sk.faces.quad(q[0]!, q[1]!, q[2]!, q[3]!, { collapse: sk.anchor, stagger: sk.stagger });
        sk.poly(q, thin, true);
        // the table's legs
        for (const tn of [n - s / 2 + 1, n, n + s / 2 - 1]) sk.seg(sk.plan(re, 0, tn), sk.plan(re, 1.7, tn), hair);
      }
      // inverter skids between the rows
      for (const dn of [-0.25, 0.25]) sk.box(back(0), 0, n + dn * s, 2.4, 2.2, 1.8, hair);
      break;
    case 'battery':
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 3; j++) sk.box(back(-s * 0.36 + i * s * 0.24), 0, n - s * 0.32 + j * s * 0.32, s * 0.18, 2.6, s * 0.1, thin);
      for (let j = 0; j < 3; j++) sk.box(back(-s * 0.5), 0, n - s * 0.32 + j * s * 0.32, 2.2, 2.2, 1.6, hair);
      break;
    case 'import_ac':
    case 'import_dc':
      // the rest of the interconnection: the line on out of the sheet
      sk.seg(sk.plan(back(-s / 2), 6, n), sk.plan(back(s * 1.2), 6, n), { width: PEN.bold, color: INK, dash: 'hidden' });
      break;
    case 'syncon':
      sk.box(back(0), 0, n, s * 0.5, s * 0.25, s * 0.5);
      break;
    default: {
      // gas: turbine hall, recovery boiler, stack
      sk.box(back(-s * 0.18), 0, n, s * 0.4, s * 0.18, s * 0.6);
      sk.box(back(s * 0.2), 0, n, s * 0.26, s * 0.34, s * 0.42);
      vcyl(sk, back(s * 0.42), n, 2.2, s * 0.6);
    }
  }
}
