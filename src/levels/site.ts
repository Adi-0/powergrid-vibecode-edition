import type * as THREE from 'three';
import type { Vec3 } from '../render/lines';
import { INK, INK_35, INK_60, PEN, SIGNAL, voltageClassFor, type VoltageClass } from '../render/style';
import { transformerSymbol, warningSymbol } from '../render/symbols';
import type { IsoCamera } from '../render/iso';
import type { Grid, GridBranch, GridBus, GridGen, GridHvdc, GridShunt } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_MAP, Sketch, enIso as P } from './sketch';
import { siteExits, type SiteExit } from './exits';
import { UNIT1, unit1Shell } from './plant';

/**
 * The Site level: the inside of any substation or plant switchyard on the System
 * sheet, in metres — what its node stands for.
 *
 * Drawn from the network data, not from a survey of the real station: one straight
 * [[bus]] per voltage, rigid conductor on post insulators, with bays hanging off it on
 * both sides. A line bay is a circuit breaker, a disconnect, a dead-end gantry and the
 * first tower outside the fence; from there the circuit runs away on its true bearing
 * toward the station at its far end, where the System sheet's stroke takes it up.
 * Transformer banks sit between the buses they join; generators arrive through their
 * step-up transformers; the demand served from here leaves through a distribution
 * bank; capacitor banks and DC converters take bays of their own.
 *
 * Chevrons carry megawatts at this level's scale: into the yard from every source,
 * out of it along every circuit and to the demand. What arrives equals what leaves
 * (the bus's own balance, solved), so the eye can check conservation at a glance.
 */

interface YardClass {
  /** Size factor for equipment (breakers and banks grow with voltage). */
  f: number;
  pitch: number;
  busH: number;
  bay: number;
  gantryH: number;
  towerH: number;
}

function yardClass(kv: number): YardClass {
  if (kv >= 345) return { f: 2.3, pitch: 30, busH: 16, bay: 66, gantryH: 24, towerH: 44 };
  if (kv >= 200) return { f: 1.7, pitch: 18, busH: 12, bay: 44, gantryH: 16, towerH: 32 };
  if (kv >= 100) return { f: 1.3, pitch: 13, busH: 9, bay: 32, gantryH: 12, towerH: 22 };
  return { f: 1, pitch: 10, busH: 7, bay: 24, gantryH: 11, towerH: 16 };
}

type Item =
  | { kind: 'line'; exit: SiteExit; br: GridBranch }
  | { kind: 'plant'; plantId: string; gens: GridGen[] }
  | { kind: 'load' }
  | { kind: 'shunt'; shunt: GridShunt }
  | { kind: 'hvdc'; h: GridHvdc };

interface Section {
  bus: GridBus;
  c: YardClass;
  cls: VoltageClass;
  east: Item[];
  west: Item[];
  top: number;
  bot: number;
}

/** A plant drawn in its own level below this one (Moss Landing Unit 1): where it sits here. */
export const ML_SITE = 'MOSS_LANDING';

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
  private lines: Array<{ k: number; segs: number[]; flows: number[]; out: 1 | -1; bus: number; mark: Vec3 }> = [];
  private plants: Array<{ gens: GridGen[]; segs: number[]; flows: number[] }> = [];
  private loads: Array<{ bus: GridBus; flows: number[] }> = [];
  private hvdcs: Array<{ h: GridHvdc; bus: GridBus; flows: number[] }> = [];
  private banks: Array<{ k: number; segs: number[]; flows: number[]; glyphs: [number, number] }> = [];
  private busSegs: Array<{ bus: GridBus; seg: number; at: Vec3 }> = [];
  /** Moss Landing Unit 1's footprint here: hidden while its own level is open. */
  private unit1Lines: [number, number] = [0, 0];
  private unit1Faces: [number, number] = [0, 0];
  private extent: Vec3[] = [];
  private R = 300;
  /** Circuits to one far station: their gantries (plan e, n), and the exit point they share. */
  private corridors = new Map<string, { gantries: Array<{ e: number; n: number; seg: (T: Vec3) => void }>; X: Vec3; c: YardClass; far: string; drawn: boolean }>();

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
    const sections: Section[] = buses.map((bus) => ({ bus, c: yardClass(bus.kv), cls: voltageClassFor(bus.kv), east: [], west: [], top: 0, bot: 0 }));
    const custom = siteId === ML_SITE;
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
      for (const it of lines) {
        const de = (it as { exit: SiteExit }).exit.dir[0];
        (de >= 0 ? sec.east : sec.west).push(it);
      }
      const unit1Here = custom && b.id === UNIT1.bus;
      for (const it of others) (unit1Here || sec.east.length < sec.west.length ? sec.east : sec.west).push(it);
      // top of the section first: sort each side's lines by where they head (north first)
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
      const n = Math.max(sec.east.length, sec.west.length, 2);
      let L = n * sec.c.pitch;
      if (custom && sec.bus.id === UNIT1.bus) L = Math.max(L, UNIT1.busSpan[1] - UNIT1.busSpan[0] + 16);
      sec.top = cursor;
      sec.bot = cursor - L;
      const next = sections[i + 1];
      const banked = next && [...bankPairs.keys()].some((k) => k.includes(sec.bus.id) && k.includes(next.bus.id));
      cursor = sec.bot - (next ? (banked ? 18 + 6 * sec.c.f : 16) : 0);
    });
    const shift = -cursor / 2;
    for (const sec of sections) {
      sec.top += shift;
      sec.bot += shift;
    }
    const top = sections[0]!.top;
    const bot = sections[sections.length - 1]!.bot;
    // how far the drawing reaches (the plant blocks past the bays), and so the exit radius
    let reachE = 0;
    let reachW = 0;
    for (const sec of sections) {
      const blockR = (items: Item[]) => items.reduce((a, it) => (it.kind === 'plant' ? Math.max(a, sec.c.bay + 16 + blockSize(it) ) : it.kind === 'hvdc' || it.kind === 'load' ? Math.max(a, sec.c.bay + 34) : a), sec.c.bay + 8);
      reachE = Math.max(reachE, blockR(sec.east));
      reachW = Math.max(reachW, blockR(sec.west));
    }
    if (custom) reachW = Math.max(reachW, UNIT1.reachW);
    this.R = Math.max(260, Math.hypot(Math.max(reachE, reachW), Math.max(top, -bot)) + 140);
    const R = this.R;

    // ---- the fence, the control building and the name, first to unfold
    sk.stagger = 0;
    const fenceE = Math.max(...sections.map((s) => s.c.bay)) + 6;
    const fence: Array<[number, number]> = [
      [-fenceE, bot - 8],
      [fenceE, bot - 8],
      [fenceE, top + 8],
      [-fenceE, top + 8],
    ];
    sk.poly(fence.map(([e, n]) => P(e, 0, n)), { width: PEN.hairline, color: INK_60, dash: 'long' }, true);
    sk.box(-fenceE + 9, 0, top - 2, 10, 4, 7);
    this.labels.push({ id: 'st:name', text: site.name.toUpperCase(), anchor: P(0, 0, top + 14), priority: 10, minZoom: 0, kind: 'site' });

    // ---- buses
    for (const sec of sections) {
      const { c, bus } = sec;
      sk.stagger = 0.04;
      const posts = Math.max(2, Math.round((sec.top - sec.bot) / c.pitch) + 1);
      for (let i = 0; i < posts; i++) {
        const n = sec.top - ((sec.top - sec.bot) * i) / (posts - 1);
        sk.seg(P(0, 0, n), P(0, c.busH, n), { width: PEN.thin, color: INK });
      }
      const a = P(0, c.busH, sec.top);
      const b = P(0, c.busH, sec.bot);
      this.busSegs.push({ bus, seg: sk.seg(a, b, { width: sec.cls.weight + 1.8, color: INK }), at: a });
      sk.target({ kind: 'site', id: siteId }, [a, b]);
      this.labels.push({ id: `st:bus:${bus.id}`, text: `${bus.kv} kV bus`, anchor: a, priority: 8, minZoom: 0, kind: 'equip', prov: `data:network.bus.${bus.id}.baseKV` });
    }

    // ---- bays: circuits to the same station share a tower outside the fence (and one name)
    for (const sec of sections)
      for (const it of [...sec.east, ...sec.west])
        if (it.kind === 'line') {
          const key = `${it.exit.far}|${it.br.kv}`;
          const cor = this.corridors.get(key) ?? { gantries: [], X: [it.exit.dir[0] * R, 0, it.exit.dir[1] * R] as Vec3, c: sec.c, far: it.exit.far, drawn: false };
          this.corridors.set(key, cor);
        }
    for (const sec of sections) {
      for (const [side, items] of [[1, sec.east], [-1, sec.west]] as Array<[1 | -1, Item[]]>) {
        const blocks = items.filter((it) => it.kind === 'plant');
        // plant blocks stand in a column past the bays, spaced by their own size
        const sizes = blocks.map((it) => blockSize(it));
        const span = sizes.reduce((a, s) => a + s, 0) + 12 * Math.max(0, sizes.length - 1);
        let bn = (sec.top + sec.bot) / 2 + span / 2;
        const blockAt = new Map<Item, { n: number; s: number }>();
        blocks.forEach((it, i) => {
          blockAt.set(it, { n: bn - sizes[i]! / 2, s: sizes[i]! });
          bn -= sizes[i]! + 12;
        });
        items.forEach((it, j) => {
          const n = sec.top - ((sec.top - sec.bot) * (j + 0.5)) / items.length;
          this.bay(sec, side, n, it, R, blockAt.get(it));
        });
      }
    }
    sk.anchor = [0, 0, 0];
    for (const cor of this.corridors.values()) this.corridor(cor);
    if (custom) this.unit1(sections.find((s) => s.bus.id === UNIT1.bus)!);

    // ---- banks between sections
    sk.stagger = 0.2;
    for (const [key, brs] of bankPairs) {
      const [hvId, lvId] = key.split('|');
      const hv = sections.find((s) => s.bus.id === hvId);
      const lv = sections.find((s) => s.bus.id === lvId);
      if (!hv || !lv) continue;
      const gapN = (hv.bot + lv.top) / 2;
      const f = hv.c.f;
      const big = (brs[0]!.xfmr?.mva ?? 0) >= 500;
      const [se, sh, sn] = big ? [9, 7, 6.5] : [5.5, 4.6, 4.4];
      const dx = se + 7;
      brs.forEach((br, k) => {
        const e = (k - (brs.length - 1) / 2) * dx;
        sk.anchor = P(0, 0, gapN);
        const tank = sk.box(e, 0.5, gapN, se, sh, sn);
        sk.box(e, 0, gapN, se + 1.4, 0.5, sn + 1.4);
        const hvB = P(e + se * 0.25, sh + 0.5 + 2.2 * f * 0.6, gapN + sn * 0.25);
        const lvB = P(e - se * 0.25, sh + 0.5 + 1.4 * f * 0.6, gapN - sn * 0.25);
        sk.seg(P(e + se * 0.25, sh + 0.5, gapN + sn * 0.25), hvB, { width: PEN.medium, color: INK });
        sk.seg(P(e - se * 0.25, sh + 0.5, gapN - sn * 0.25), lvB, { width: PEN.medium, color: INK });
        const hvBus = P(0, hv.c.busH, hv.bot);
        const lvBus = P(0, lv.c.busH, lv.top);
        const s1 = sk.seg(hvBus, hvB, { width: hv.cls.weight, color: INK });
        const s2 = sk.seg(lvB, lvBus, { width: lv.cls.weight, color: INK });
        const glyphs = sk.symbol(P(e, sh + 4, gapN), transformerSymbol(4.5), PEN.thin);
        this.banks.push({ k: br.index, segs: [s1, s2], flows: [sk.flowSeg(hvBus, hvB), sk.flowSeg(lvB, lvBus)], glyphs });
        sk.target({ kind: 'branch', index: br.index }, tank, true);
      });
      const kvs = `${hv.bus.kv}/${lv.bus.kv} kV`;
      this.labels.push({ id: `st:banks:${key}`, text: brs.length > 1 ? `${kvs} banks` : `${kvs} bank`, anchor: P(((brs.length - 1) / 2) * dx + se, sh, gapN), priority: 7, minZoom: 0, kind: 'equip', prov: `data:network.xfmr.${brs[0]!.id}.kv` });
    }
    sk.stagger = 0;
    sk.anchor = [0, 0, 0];
    sk.commit();
    const ext = Math.max(fenceE, reachE, reachW) + 10;
    this.extent = [P(-ext, 0, bot - 14), P(ext, 0, bot - 14), P(ext, 0, top + 20), P(-ext, 0, top + 20), P(0, 30, top)];
  }

  /** One bay on a section's bus: breaker and disconnect, then what it serves. */
  private bay(sec: Section, s: 1 | -1, n: number, it: Item, R: number, block?: { n: number; s: number }): void {
    const sk = this.sk;
    const { c, cls } = sec;
    const f = c.f;
    const tap = P(0, c.busH, n);
    const w = cls.weight;
    void R;
    if (it.kind === 'line') {
      const x = it.exit;
      // the circuit's own stroke out of the yard, first to unfold: its gantry, then away
      sk.stagger = 0;
      const ge = s * c.bay;
      for (const dn of [-c.pitch * 0.36, c.pitch * 0.36]) sk.seg(P(ge, 0, n + dn), P(ge, c.gantryH, n + dn), { width: PEN.medium, color: INK });
      sk.seg(P(ge, c.gantryH, n - c.pitch * 0.36), P(ge, c.gantryH, n + c.pitch * 0.36), { width: PEN.medium, color: INK });
      const G = P(ge, c.gantryH, n);
      // inside the fence: breaker and disconnect, growing out of the bus
      sk.stagger = 0.12;
      sk.anchor = tap;
      const be = s * c.bay * 0.3;
      const de = s * c.bay * 0.58;
      sk.box(be, 0, n, 2 * f, 2.6 * f, 1.5 * f);
      const B = P(be, 2.6 * f + 0.4, n);
      for (const dn of [-0.9 * f, 0.9 * f]) sk.seg(P(de, 0, n + dn), P(de, 4 * f, n + dn), { width: PEN.thin, color: INK });
      const D = P(de, 4 * f, n);
      const segs = [sk.seg(tap, B, { width: w, color: INK }), sk.seg(B, D, { width: w, color: INK }), sk.seg(D, G, { width: w, color: INK })];
      const flows = [sk.flowSeg(tap, B), sk.flowSeg(B, D), sk.flowSeg(D, G)];
      sk.anchor = [0, 0, 0];
      const line = { k: x.branch, segs, flows, out: (it.br.from === sec.bus ? 1 : -1) as 1 | -1, bus: sec.bus.index, mark: G };
      this.lines.push(line);
      const path = [tap, B, D, G];
      sk.target({ kind: 'branch', index: x.branch }, path);
      // out of the yard: over the corridor's tower to the exit point, where the System's stroke takes over
      const cor = this.corridors.get(`${x.far}|${it.br.kv}`)!;
      cor.gantries.push({
        e: ge,
        n,
        seg: (T: Vec3) => {
          sk.stagger = 0;
          sk.anchor = [0, 0, 0];
          const X: Vec3 = [cor.X[0], T[1], cor.X[2]];
          const sp = x.sidePx;
          line.segs.unshift(sk.seg(G, T, { width: w, color: INK, dash: cls.dash }), sk.seg(T, X, { width: w, color: INK, dash: cls.dash, px: [0, 0, sp[0], sp[1]], collapsePx: [0, 0, sp[0], sp[1]] }));
          line.flows.push(sk.flowSeg(G, T), sk.flowSeg(T, X));
          this.exitPts.push({ branch: x.branch, at: X, stagger: 0 });
          sk.target({ kind: 'branch', index: x.branch }, [G, T, X]);
        },
      });
      return;
    }
    sk.stagger = 0.16;
    // what a bay serves grows out of the bus
    sk.anchor = tap;
    if (it.kind === 'plant') {
      const gen = it.gens[0]!;
      const b = block ?? { n, s: blockSize(it) };
      const ge = s * c.bay * 0.42;
      sk.box(ge, 0.4, n, 3.4 * f, 3.4 * f, 3 * f);
      sk.symbol(P(ge, 3.4 * f + 2, n), transformerSymbol(3), PEN.thin);
      const H = P(ge, 3.4 * f + 1, n);
      const be = s * (c.bay + 12 + b.s / 2);
      const edge = P(be - (s * b.s) / 2, 3, b.n);
      sk.stagger = 0.3;
      sk.anchor = H;
      drawBlock(sk, gen.plant.tech, be, b.n, b.s);
      const pts = [edge, H, tap];
      sk.stagger = 0.16;
      sk.anchor = tap;
      const segs = [sk.seg(edge, H, { width: w, color: INK }), sk.seg(H, tap, { width: w, color: INK })];
      const flows = [sk.flowSeg(edge, H), sk.flowSeg(H, tap)];
      this.plants.push({ gens: it.gens, segs, flows });
      sk.target({ kind: 'plant', id: it.plantId }, pts);
      sk.target({ kind: 'plant', id: it.plantId }, [P(be - b.s / 2, 0, b.n - b.s / 2), P(be + b.s / 2, b.s * 0.4, b.n + b.s / 2)], true);
      this.labels.push({ id: `st:plant:${it.plantId}`, text: gen.plant.name, anchor: P(be, 6, b.n + b.s / 2), priority: 7, minZoom: 0, kind: 'equip', prov: `data:plants.${it.plantId}.name` });
      return;
    }
    if (it.kind === 'load') {
      const ge = s * c.bay * 0.4;
      sk.box(ge, 0.4, n, 5 * f * 0.8, 4 * f * 0.8, 4 * f * 0.8);
      const H = P(ge, 4 * f * 0.8 + 0.4, n);
      sk.symbol(P(ge, 4 * f * 0.8 + 3, n), transformerSymbol(3), PEN.thin);
      const sub = voltageClassFor(60);
      const out: Vec3[] = [-1, 0, 1].map((k) => P(s * (c.bay + 30), 9, n + k * 7));
      const segs = [sk.seg(tap, H, { width: w, color: INK }), ...out.map((o) => sk.seg(H, o, { width: sub.weight, color: INK, dash: sub.dash }))];
      void segs;
      const flows = [sk.flowSeg(tap, H), ...out.map((o) => sk.flowSeg(H, o))];
      this.loads.push({ bus: sec.bus, flows });
      sk.target({ kind: 'site', id: this.siteId }, [tap, H, out[1]!]);
      this.labels.push({ id: `st:load:${sec.bus.id}`, text: 'To the distribution substations', anchor: out[2]!, priority: 5, minZoom: 0.3, kind: 'equip' });
      return;
    }
    if (it.kind === 'shunt') {
      const ge = s * c.bay * 0.5;
      sk.box(ge, 0, n, 6 * f * 0.7, 0.6, 4 * f * 0.7);
      for (const de of [-1, 0, 1]) for (const dn of [-1, 1]) sk.box(ge + de * 1.4 * f * 0.7, 0.6, n + dn * 1 * f * 0.7, 0.9, 2.2 * f * 0.6, 0.9);
      sk.seg(tap, P(ge, 2.2 * f * 0.6 + 0.6, n), { width: w, color: INK });
      sk.target({ kind: 'site', id: this.siteId }, [tap, P(ge, 1, n)]);
      this.labels.push({ id: `st:shunt:${sec.bus.id}`, text: 'Capacitor bank', anchor: P(ge, 3, n), priority: 4, minZoom: 0.5, kind: 'equip' });
      return;
    }
    // a DC converter: a valve hall, and the cable or line away
    const he = s * (c.bay * 0.55 + 12);
    sk.box(he, 0, n, 22, 14, 16);
    const H = P(he - s * 11, 10, n);
    sk.seg(tap, H, { width: w, color: INK });
    const away = P(he + s * 40, 0, n);
    sk.seg(P(he + s * 11, 4, n), away, { width: PEN.medium, color: INK, dash: 'short' });
    this.hvdcs.push({ h: it.h, bus: sec.bus, flows: [sk.flowSeg(tap, H), sk.flowSeg(P(he + s * 11, 4, n), away)] });
    sk.target({ kind: 'site', id: this.siteId }, [tap, H, away]);
    this.labels.push({ id: `st:hvdc:${it.h.rec.id}`, text: it.h.rec.name, anchor: P(he, 14, n), priority: 6, minZoom: 0, kind: 'equip', prov: `data:network.hvdc.${it.h.rec.id}.name` });
  }

  /**
   * A corridor out of the yard: one tower outside the fence carrying its circuits (a
   * double-circuit tower for two), each circuit from its gantry over the tower and on,
   * at conductor height, to the exit point on its bearing.
   */
  private corridor(cor: { gantries: Array<{ e: number; n: number; seg: (T: Vec3) => void }>; X: Vec3; c: YardClass; far: string }): void {
    const sk = this.sk;
    if (!cor.gantries.length) return;
    const { c } = cor;
    const f = c.f;
    sk.stagger = 0;
    const ge = cor.gantries.reduce((a, g) => a + g.e, 0) / cor.gantries.length;
    const gn = cor.gantries.reduce((a, g) => a + g.n, 0) / cor.gantries.length;
    const xe = cor.X[0];
    const xn = -cor.X[2];
    const L = Math.hypot(xe - ge, xn - gn) || 1;
    const ue = (xe - ge) / L;
    const un = (xn - gn) / L;
    const d = Math.min(30 * f, L * 0.4);
    const te = ge + ue * d;
    const tn = gn + un * d;
    const H = c.towerH;
    const k = cor.gantries.length;
    const arm = Math.max(4 * f, 2.2 * f * k);
    // legs, and the crossarm across the way the circuits go
    for (const sgn of [-1, 1]) sk.seg(P(te - un * sgn * 0.3 * arm, 0, tn + ue * sgn * 0.3 * arm), P(te, H, tn), { width: PEN.thin, color: INK });
    sk.seg(P(te - un * arm, H - 2, tn + ue * arm), P(te + un * arm, H - 2, tn - ue * arm), { width: PEN.thin, color: INK });
    // each circuit hangs from its own point on the arm, in the order its gantries stand
    const order = [...cor.gantries].sort((a, b) => (a.e - ge) * -un + (a.n - gn) * ue - ((b.e - ge) * -un + (b.n - gn) * ue));
    order.forEach((g, i) => {
      const o = k === 1 ? 0 : ((i / (k - 1)) * 2 - 1) * arm * 0.8;
      g.seg(P(te - un * o, H - 2, tn + ue * o));
    });
    const far = this.grid.sites.find((q) => q.id === cor.far)!;
    this.labels.push({ id: `st:to:${cor.far}:${c.busH}`, text: `to ${far.name}`, anchor: P(te, H, tn), priority: 6, minZoom: 0.25, kind: 'exit' });
  }

  /**
   * Moss Landing Unit 1: its three step-up bays on the west side of the 230 kV bus and
   * the silhouette of the plant beyond — the parts its own level draws in the same
   * place. The rest of the plant unfolds from here.
   */
  private unit1(sec: Section): void {
    const sk = this.sk;
    const nc = (sec.top + sec.bot) / 2;
    // plant frame (east, height, north) → this frame: the plant's bus lies on this bus
    const plantToSite = (e: number, h: number, n: number): Vec3 => P(e - UNIT1.busE, h, n + nc);
    this.unit1At = P(0, 0, nc);
    sk.stagger = 0.16;
    sk.anchor = P(0, sec.c.busH, nc);
    const l0 = sk.lines.count;
    const f0 = sk.faces.vertexCount;
    const save = sk.plan;
    sk.plan = plantToSite;
    const hv = unit1Shell(sk, true);
    sk.plan = save;
    this.unit1Lines = [l0, sk.lines.count - l0];
    this.unit1Faces = [f0, sk.faces.vertexCount - f0];
    const gens = this.grid.gens.filter((g) => g.plant.id === UNIT1.plant);
    const w = sec.cls.weight;
    const segs: number[] = [];
    const flows: number[] = [];
    for (const [u, n] of Object.entries(UNIT1.trains)) {
      const a = plantToSite(...hv[u]!);
      const tap = P(0, sec.c.busH, n + nc);
      segs.push(sk.seg(a, tap, { width: w, color: INK }));
      flows.push(sk.flowSeg(a, tap));
      sk.target({ kind: 'plant', id: UNIT1.plant }, [a, tap]);
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
    const kvs = [...new Set(this.grid.buses.filter((b) => b.site.id === this.siteId && !b.terminalOf).map((b) => voltageClassFor(b.kv).id))];
    const out = kvs.map((id) => this.grid.buses.find((b) => b.site.id === this.siteId && voltageClassFor(b.kv).id === id)!).map((b) => voltageClassFor(b.kv));
    if (this.loads.length && !out.some((c) => c.id === 'sub69')) out.push(voltageClassFor(60));
    return out.sort((a, b) => b.kvNominal - a.kvNominal);
  }

  exits(): Array<{ branch: number; at: Vec3; stagger: number }> {
    return this.exitPts;
  }

  yieldTo(key: string, m: number): void {
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
      l.segs.forEach((seg, i) => {
        sk.lines.setColor(seg, over ? SIGNAL : alive || none ? (none ? INK_35 : INK) : INK_35, 1);
        sk.lines.setPattern(seg, out || (!alive && !none) ? 'hidden' : i < 2 ? voltageClassFor(br.kv).dash : 'solid');
      });
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
      const mw = s.energized[l.bus.index] ? s.pd[l.bus.index]! - hvdcAt(l.bus) : 0;
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
      for (let i = b.glyphs[0]; i < b.glyphs[0] + b.glyphs[1]; i++) sk.glyphs.setColor(i, over ? SIGNAL : INK, 1);
      for (const f of b.flows) set(f, out ? 0 : s.pf[b.k]!, over ? SIGNAL : INK);
    }
    for (const b of this.busSegs) {
      const i = b.bus.index;
      const dead = !none && !s.energized[i];
      const vm = s.vm[i]!;
      const range = !none && !dead && (vm < 0.95 || vm > (b.bus.kv >= 345 ? 1.1 : 1.05));
      sk.lines.setColor(b.seg, dead ? SIGNAL : none ? INK_35 : INK, 1);
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

/** A plant's block: its footprint side, m, by capacity (schematic, not to its real area). */
function blockSize(it: Item): number {
  if (it.kind !== 'plant') return 0;
  const mw = it.gens.reduce((a, g) => a + g.pmaxMW, 0);
  return Math.max(26, Math.min(78, 15 * Math.sqrt(Math.abs(mw) / 100)));
}

/** A vertical cylinder (a containment, a cooling tower, a tank): outline, silhouettes, faces. */
function vcyl(sk: Sketch, e: number, n: number, r: number, h: number, h0 = 0): void {
  const N = 28;
  const pt = (t: number, y: number): Vec3 => sk.plan(e + r * Math.cos(t), y, n + r * Math.sin(t));
  const f = { collapse: sk.anchor, stagger: sk.stagger };
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N;
    const b = (2 * Math.PI * (i + 1)) / N;
    sk.faces.quad(pt(a, h0), pt(b, h0), pt(b, h), pt(a, h), f);
    sk.faces.tri(sk.plan(e, h, n), pt(a, h), pt(b, h), f);
    sk.seg(pt(a, h), pt(b, h), { width: PEN.outline, color: INK });
    sk.seg(pt(a, h0), pt(b, h0), { width: PEN.outline, color: INK });
  }
  // silhouettes: where the wall turns away from the camera (plan-north-east and south-west of the axis)
  for (const t of [Math.PI / 4, (5 * Math.PI) / 4]) sk.seg(pt(t, h0), pt(t, h), { width: PEN.outline, color: INK });
}

/** The plant's silhouette by technology, standing on (e, n) with footprint side s. */
function drawBlock(sk: Sketch, tech: string, e: number, n: number, s: number): void {
  const thin = { width: PEN.thin, color: INK };
  switch (tech) {
    case 'nuclear':
      sk.box(e + s * 0.18, 0, n, s * 0.5, s * 0.22, s * 0.8);
      vcyl(sk, e - s * 0.25, n + s * 0.22, s * 0.16, s * 0.32);
      vcyl(sk, e - s * 0.25, n - s * 0.22, s * 0.16, s * 0.32);
      break;
    case 'geothermal':
      sk.box(e + s * 0.15, 0, n, s * 0.5, s * 0.2, s * 0.6);
      vcyl(sk, e - s * 0.25, n, s * 0.18, s * 0.3);
      break;
    case 'hydro':
    case 'pumped_storage': {
      sk.box(e, 0, n, s * 0.45, s * 0.22, s * 0.8);
      // penstocks up the hill behind
      for (const dn of [-0.2, 0.2]) sk.poly([sk.plan(e - s * 0.22, s * 0.12, n + dn * s), sk.plan(e - s * 0.9, s * 0.5, n + dn * s * 1.3), sk.plan(e - s * 1.5, s * 0.9, n + dn * s * 1.6)], thin);
      break;
    }
    case 'wind':
      for (let k = -1; k <= 1; k++) {
        const tn = n + k * s * 0.34;
        const hub = sk.plan(e, s * 0.9, tn);
        sk.seg(sk.plan(e, 0, tn), hub, { width: PEN.medium, color: INK });
        // the rotor faces the viewer (its plane holds the vertical and the screen's horizontal)
        for (let b = 0; b < 3; b++) {
          const t = (2 * Math.PI * b) / 3 + k * 0.7;
          const L = s * 0.42;
          sk.seg(hub, [hub[0] + Math.cos(t) * L * Math.SQRT1_2, hub[1] + Math.sin(t) * L, hub[2] + Math.cos(t) * L * Math.SQRT1_2], thin);
        }
      }
      break;
    case 'solar_pv':
      for (let k = 0; k < 6; k++) {
        const re = e - s / 2 + (k + 0.5) * (s / 6);
        const q = [sk.plan(re - 1.6, 0.8, n - s / 2), sk.plan(re - 1.6, 0.8, n + s / 2), sk.plan(re + 1.6, 2.6, n + s / 2), sk.plan(re + 1.6, 2.6, n - s / 2)];
        sk.faces.quad(q[0]!, q[1]!, q[2]!, q[3]!, { collapse: sk.anchor, stagger: sk.stagger });
        sk.poly(q, thin, true);
      }
      break;
    case 'battery':
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) sk.box(e - s * 0.3 + i * s * 0.3, 0, n - s * 0.33 + j * s * 0.33, s * 0.22, 2.6, s * 0.12);
      break;
    case 'import_ac':
    case 'import_dc':
      // the rest of the interconnection: a line off the sheet
      sk.seg(sk.plan(e - s / 2, 3, n), sk.plan(e + s * 1.2, 3, n), { width: PEN.bold, color: INK, dash: 'hidden' });
      break;
    case 'syncon':
      sk.box(e, 0, n, s * 0.5, s * 0.25, s * 0.5);
      break;
    default:
      // gas: turbine hall, recovery boiler and stack
      sk.box(e + s * 0.18, 0, n, s * 0.5, s * 0.2, s * 0.7);
      sk.box(e - s * 0.2, 0, n, s * 0.24, s * 0.34, s * 0.5);
      sk.box(e - s * 0.4, 0, n, 4, s * 0.62, 4);
  }
}
