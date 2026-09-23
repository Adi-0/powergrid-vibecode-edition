import type * as THREE from 'three';
import type { Vec3 } from '../render/lines';
import { INK, INK_35, INK_60, PEN, SIGNAL, voltageClassFor, generatorClass, type VoltageClass } from '../render/style';
import { crossSymbol } from '../render/symbols';
import type { IsoCamera } from '../render/iso';
import type { Grid } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import { ccgtDesign, plantState, type CcgtBalance, type CcgtDesign } from '../model/ccgt';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_ISO, Sketch, enIso as en } from './sketch';

/**
 * The Plant level: Moss Landing Unit 1, a 2-on-1 combined cycle, in metres.
 *
 * Two trains of gas turbine → heat-recovery steam generator (HRSG) → stack, and one
 * steam turbine fed from both HRSGs, its exhaust condensed with seawater from Monterey
 * Bay. Each machine's generator steps up through its own transformer (GSU) into the
 * plant's 230 kV switchyard, which the Metcalf circuits, the 500/230 kV banks, Unit 2,
 * the battery and the local load share.
 *
 * Chevrons carry megawatts whatever form the energy is in — fuel, hot exhaust, steam,
 * heat to the sea, electricity — at one scale, so the eye sees where it goes: every
 * megawatt of fuel ends in exactly one of them.
 */
const PLANT = 'ML1';
const BUS = { e: 70, h: 12, n0: -48, n1: 48 };
const TRAIN_N: Record<string, number> = { GT1: -30, GT2: -6, ST: 22 };
const GSU_E = 50;
const GEN = { e: 19, se: 10, sh: 4.6, sn: 4.6 };
const GT = { e: -2, se: 24, sh: 7, sn: 7 };
const HRSG = { e: -34, se: 26, sh: 22, sn: 12 };
const STACK = { e: -52, s: 5, h: 45 };
const STT = { e: 2, se: 16, sh: 6.5, sn: 8 };
const COND = { e: 2, n: 33, se: 14, sh: 5, sn: 6 };

export class PlantLevel implements Level {
  readonly kind = 'plant' as const;
  readonly name = 'Moss Landing Unit 1';
  readonly unitKm = 0.001;
  readonly needsDetail = false;
  readonly flowScale = FLOW_SCALES.plant;
  readonly north = NORTH_ISO;
  readonly labels: LabelSpec[] = [];
  readonly sk = new Sketch(en);
  readonly plantId = PLANT;
  readonly design: CcgtDesign;
  /** The 230 kV bus's centre: what the System's Moss Landing node unfolds into. */
  readonly origin: Vec3 = en(BUS.e, BUS.h, 0);
  private morphValue = 1;
  private gens: Record<string, number> = {};
  private gsuK: Record<string, number> = {};
  /** Flow segments by what they carry. */
  private fl: Record<string, number[]> = {};
  private circuits: Array<{ k: number; flow: number; segs: number[] }> = [];
  private unitSegs: Record<string, number[]> = {};
  private snapshot: Snapshot | null = null;
  balance: CcgtBalance | null = null;

  constructor(readonly grid: Grid) {
    const sk = this.sk;
    sk.anchor = this.origin;
    this.design = ccgtDesign(grid.gens.find((g) => g.plant.id === PLANT)!.plant);
    for (const g of grid.gens) if (g.plant.id === PLANT && g.unitId) this.gens[g.unitId] = g.index;
    for (const b of grid.branches) if (b.id.startsWith(`${PLANT}-`)) this.gsuK[b.id.slice(PLANT.length + 1, b.id.indexOf(' '))] = b.index;
    const addFlow = (key: string, a: Vec3, b: Vec3) => (this.fl[key] ??= []).push(sk.flowSeg(a, b));
    const pipe = (key: string, pts: Vec3[], w: number = PEN.fine) => {
      for (let i = 0; i + 1 < pts.length; i++) {
        sk.seg(pts[i]!, pts[i + 1]!, { width: w, color: INK });
        addFlow(key, pts[i]!, pts[i + 1]!);
      }
    };
    const c230 = voltageClassFor(230);

    // ---- ground: the site boundary and the shore
    sk.stagger = 0;
    sk.poly([en(-70, 0, -60), en(100, 0, -60), en(100, 0, 58), en(-70, 0, 58)], { width: PEN.hairline, color: INK_60, dash: 'long' }, true);
    this.labels.push({ id: 'eq:bay', text: 'To Monterey Bay', anchor: en(-120, 0, 33), priority: 3, minZoom: 0, kind: 'equip' });

    // ---- 230 kV switchyard
    sk.stagger = 0.05;
    for (const n of [BUS.n0 + 2, 0, BUS.n1 - 2]) sk.seg(en(BUS.e, 0, n), en(BUS.e, BUS.h, n), { width: PEN.thin, color: INK });
    const busSeg = sk.seg(en(BUS.e, BUS.h, BUS.n0), en(BUS.e, BUS.h, BUS.n1), { width: 4, color: INK });
    this.unitSegs.bus = [busSeg];
    sk.target({ kind: 'equip', what: 'bus', id: 'MOSS_LANDING-230' }, [en(BUS.e, BUS.h, BUS.n0), en(BUS.e, BUS.h, BUS.n1)]);
    this.labels.push({ id: 'eq:bus', text: '230 kV switchyard', anchor: en(BUS.e, BUS.h, BUS.n1), priority: 8, minZoom: 0, kind: 'equip', prov: 'data:network.bus.MOSS_LANDING-230.baseKV' });
    // circuits and banks leaving the bus: the Metcalf lines east, the 500 kV banks north
    const busId = 'MOSS_LANDING-230';
    const away = grid.branches.filter((b) => (b.from.id === busId || b.to.id === busId) && !b.id.startsWith(`${PLANT}-`));
    let li = 0;
    let xi = 0;
    for (const b of away) {
      const isX = b.kind === 'transformer';
      const n = isX ? 30 + xi * 8 : -36 + li * 10;
      const tap = en(BUS.e, BUS.h, n);
      const far = isX ? en(BUS.e + 10 + xi * 6, 18, 75) : en(150, 14, n + 20);
      const segs = [sk.seg(tap, far, { width: isX ? PEN.medium : c230.weight, color: INK, dash: isX ? 'solid' : c230.dash })];
      const flow = sk.flowSeg(tap, far);
      this.circuits.push({ k: b.index, flow, segs });
      sk.target({ kind: 'branch', index: b.index }, [tap, far]);
      if (isX) xi++;
      else li++;
    }
    this.labels.push({ id: 'eq:metcalf', text: 'To Metcalf', anchor: en(150, 14, -6), priority: 6, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'eq:500', text: 'To the 500 kV yard', anchor: en(BUS.e + 16, 18, 75), priority: 5, minZoom: 0, kind: 'equip', prov: 'data:network.bus.MOSS_LANDING-500.baseKV' });
    // the rest of the bus: Unit 2 and the battery in, the local load out
    const others = en(BUS.e + 12, 6, -62);
    this.fl.others = [sk.flowSeg(others, en(BUS.e, BUS.h, BUS.n0))];
    sk.seg(others, en(BUS.e, BUS.h, BUS.n0), { width: PEN.medium, color: INK });
    this.labels.push({ id: 'eq:others', text: 'Unit 2 and the battery', anchor: others, priority: 4, minZoom: 0, kind: 'equip', prov: 'data:plants.ML2.name' });
    const load = en(BUS.e + 18, 4, 58);
    this.fl.load = [sk.flowSeg(en(BUS.e, BUS.h, BUS.n1), load)];
    sk.seg(en(BUS.e, BUS.h, BUS.n1), load, { width: PEN.medium, color: INK });
    this.labels.push({ id: 'eq:load', text: 'Local load', anchor: load, priority: 3, minZoom: 0, kind: 'equip' });

    // ---- per unit: GSU, isolated-phase bus, generator
    sk.stagger = 0.14;
    for (const [u, n] of Object.entries(TRAIN_N)) {
      const segs: number[] = [];
      const tank = sk.box(GSU_E, 0.4, n, 6, 5.5, 6);
      sk.box(GSU_E, 0, n, 7.4, 0.4, 7.4);
      const hv = en(GSU_E + 1.5, 8.5, n);
      segs.push(sk.seg(en(GSU_E + 1.5, 5.9, n), hv, { width: PEN.medium, color: INK }));
      segs.push(sk.seg(hv, en(BUS.e, BUS.h, n), { width: c230.weight, color: INK }));
      addFlow(`hv:${u}`, hv, en(BUS.e, BUS.h, n));
      sk.target({ kind: 'equip', what: 'gsu', id: `${PLANT}-${u}` }, tank, true);
      // isolated-phase bus: an enclosed duct from the generator terminals to the GSU's low side
      // chevrons ride on top of the duct (the conductors are inside it)
      const ipbA = en(GEN.e + GEN.se / 2, 3.9, n);
      const ipbB = en(GSU_E - 3, 3.9, n);
      sk.box((GEN.e + GEN.se / 2 + GSU_E - 3) / 2, 2.6, n, GSU_E - 3 - GEN.e - GEN.se / 2, 1.2, 1.2);
      addFlow(`gen:${u}`, ipbA, ipbB);
      const gen = sk.box(GEN.e, 0.6, n, GEN.se, GEN.sh, GEN.sn);
      sk.box(GEN.e, 0, n, GEN.se + 1, 0.6, GEN.sn + 1);
      sk.target({ kind: 'equip', what: 'generator', id: `${PLANT}-${u}` }, gen, true);
      this.unitSegs[u] = segs;
      this.labels.push({ id: `eq:gen:${u}`, text: u === 'ST' ? 'Generator (steam)' : `Generator (${u})`, anchor: en(GEN.e, 5.2, n + 2.3), priority: 6, minZoom: 0, kind: 'equip', prov: `data:plants.${PLANT}.units.${u}.id` });
    }
    this.labels.push({ id: 'eq:gsu', text: 'Step-up transformers', anchor: en(GSU_E, 6, -34), priority: 5, minZoom: 0, kind: 'equip' });

    // ---- gas-turbine trains: turbine, transition duct, HRSG, stack
    sk.stagger = 0.24;
    for (const u of ['GT1', 'GT2']) {
      const n = TRAIN_N[u]!;
      const gt = sk.box(GT.e, 0, n, GT.se, GT.sh, GT.sn);
      sk.target({ kind: 'equip', what: 'turbine', id: `${PLANT}-${u}` }, gt, true);
      // shaft power into the generator
      addFlow(`shaft:${u}`, en(GT.e + GT.se / 2, 2.9, n), en(GEN.e - GEN.se / 2, 2.9, n));
      sk.seg(en(GT.e + GT.se / 2, 2.9, n), en(GEN.e - GEN.se / 2, 2.9, n), { width: PEN.bold, color: INK });
      // exhaust: transition duct into the HRSG
      const d0 = GT.e - GT.se / 2;
      const d1 = HRSG.e + HRSG.se / 2;
      sk.box((d0 + d1) / 2, 1, n, d0 - d1, 8, 9);
      addFlow(`exhaust:${u}`, en(d0, 9.1, n), en(d1, 9.1, n));
      const h = sk.box(HRSG.e, 0, n, HRSG.se, HRSG.sh, HRSG.sn);
      sk.target({ kind: 'equip', what: 'hrsg', id: `${PLANT}-${u}` }, h, true);
      // stack: what the HRSG did not take, up to the sky
      const st = sk.box(STACK.e, 0, n, STACK.s, STACK.h, STACK.s);
      sk.target({ kind: 'equip', what: 'stack', id: `${PLANT}-${u}` }, st, true);
      addFlow(`stack:${u}`, en(STACK.e, STACK.h, n), en(STACK.e, STACK.h + 14, n));
      this.labels.push({ id: `eq:gt:${u}`, text: `Gas turbine ${u.slice(2)}`, anchor: en(GT.e, GT.sh, n + GT.sn / 2), priority: 7, minZoom: 0, kind: 'equip', prov: `data:plants.${PLANT}.units.${u}.name` });
      this.labels.push({ id: `eq:hrsg:${u}`, text: `HRSG ${u.slice(2)}`, anchor: en(HRSG.e, HRSG.sh, n + HRSG.sn / 2), priority: 6, minZoom: 0, kind: 'equip', prov: `data:plants.${PLANT}.units.${u}.id` });
    }
    this.labels.push({ id: 'eq:stack', text: 'Stacks', anchor: en(STACK.e, STACK.h, TRAIN_N.GT1! - 3), priority: 5, minZoom: 0, kind: 'equip' });
    // fuel gas: pipeline in from the south to each turbine's combustors
    const fuelIn = en(-8, 0.6, -75);
    const header = en(-8, 0.6, TRAIN_N.GT2!);
    sk.seg(fuelIn, en(-8, 0.6, TRAIN_N.GT1!), { width: PEN.fine, color: INK });
    sk.seg(en(-8, 0.6, TRAIN_N.GT1!), header, { width: PEN.fine, color: INK });
    this.fl.fuelMain = [sk.flowSeg(fuelIn, en(-8, 0.6, TRAIN_N.GT1!))];
    this.fl.fuelGT2 = [sk.flowSeg(en(-8, 0.6, TRAIN_N.GT1!), header)];
    sk.target({ kind: 'equip', what: 'fuel', id: PLANT }, [fuelIn, header]);
    this.labels.push({ id: 'eq:fuel', text: 'Natural gas in', anchor: fuelIn, priority: 6, minZoom: 0, kind: 'equip' });

    // ---- steam: from both HRSGs to the steam turbine; exhaust to the condenser; seawater out
    sk.stagger = 0.34;
    const nST = TRAIN_N.ST!;
    for (const u of ['GT1', 'GT2']) {
      const n = TRAIN_N[u]!;
      pipe(`steam:${u}`, [en(HRSG.e + 4, HRSG.sh, n), en(HRSG.e + 4, 26, n), en(HRSG.e + 4, 26, nST)]);
    }
    pipe('steam', [en(HRSG.e + 4, 26, nST), en(STT.e - 4, 26, nST), en(STT.e - 4, STT.sh, nST)], PEN.thin);
    const stt = sk.box(STT.e, 0, nST, STT.se, STT.sh, STT.sn);
    sk.target({ kind: 'equip', what: 'turbine', id: `${PLANT}-ST` }, stt, true);
    addFlow('shaft:ST', en(STT.e + STT.se / 2, 2.9, nST), en(GEN.e - GEN.se / 2, 2.9, nST));
    sk.seg(en(STT.e + STT.se / 2, 2.9, nST), en(GEN.e - GEN.se / 2, 2.9, nST), { width: PEN.bold, color: INK });
    this.labels.push({ id: 'eq:stt', text: 'Steam turbine', anchor: en(STT.e, STT.sh, nST - STT.sn / 2), priority: 7, minZoom: 0, kind: 'equip' });
    const cond = sk.box(COND.e, 0, COND.n, COND.se, COND.sh, COND.sn);
    sk.target({ kind: 'equip', what: 'condenser', id: PLANT }, cond, true);
    addFlow('exhaustST', en(STT.e, 1.5, nST + STT.sn / 2), en(COND.e, 1.5, COND.n - COND.sn / 2));
    pipe('sea', [en(COND.e - COND.se / 2, 1.2, COND.n), en(-66, 1.2, COND.n), en(-110, 0, COND.n)], PEN.thin);
    this.labels.push({ id: 'eq:cond', text: 'Condenser', anchor: en(COND.e, COND.sh, COND.n + COND.sn / 2), priority: 6, minZoom: 0, kind: 'equip' });
    sk.stagger = 0;
    sk.commit();
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  get classes(): VoltageClass[] {
    return [voltageClassFor(230), generatorClass(18)];
  }

  /** The generator of a unit, as a point (where the Machine level unfolds from). */
  generatorAt(unit: string): Vec3 {
    return en(GEN.e, 2.9, TRAIN_N[unit] ?? 0);
  }

  applySnapshot(s: Snapshot): void {
    this.snapshot = s;
    const sk = this.sk;
    const none = s.outcome === 'none';
    const sc = this.flowScale;
    const set = (key: string, mw: number, color = INK) => {
      for (const f of this.fl[key] ?? [])
        sk.flow.set(f, { sizePx: chevronSizeFor(mw, sc), speed: chevronSpeedFor(mw, sc) * Math.sign(mw), side: 0, color, alpha: !none && Math.abs(mw) > 1e-3 ? 1 : 0 });
    };
    const ps = plantState(this.grid, s, PLANT);
    const tripped = ps.tripped;
    const running = !none && ps.running;
    const pg = (u: string) => (u === 'ST' ? ps.stMW : ps.gtMW[u === 'GT1' ? 0 : 1]!);
    const b = ps.balance;
    this.balance = b;
    sk.marks.clear();
    // fuel, heat and electricity
    set('fuelMain', b ? b.fuelHhv : 0);
    set('fuelGT2', b ? b.gt[1]!.fuelLhv * (b.fuelHhv / b.fuelLhv) : 0);
    ['GT1', 'GT2'].forEach((u, i) => {
      const g = b?.gt[i];
      set(`shaft:${u}`, g ? g.shaft : 0);
      set(`exhaust:${u}`, g ? g.exhaust : 0);
      const ex = g ? g.exhaust : 0;
      const exAll = b ? b.gt.reduce((a, x) => a + x.exhaust, 0) : 1;
      // stack: the sensible heat not recovered, and the water vapour's latent heat, this train's share
      set(`stack:${u}`, b ? ((b.stack + b.latent) * ex) / exAll : 0);
      set(`steam:${u}`, b ? (b.steamHeat * ex) / exAll : 0);
    });
    set('steam', b ? b.steamHeat : 0);
    set('shaft:ST', b ? b.stShaft : 0);
    set('exhaustST', b ? b.condenser : 0);
    set('sea', b ? b.condenser : 0);
    for (const u of Object.keys(TRAIN_N)) {
      const k = this.gsuK[u]!;
      set(`gen:${u}`, running ? pg(u) : 0);
      set(`hv:${u}`, running && s.inService[k] ? -s.pf[k]! : 0);
      for (const seg of this.unitSegs[u] ?? []) {
        sk.lines.setColor(seg, tripped ? INK_35 : INK, 1);
        sk.lines.setPattern(seg, tripped ? 'hidden' : 'solid');
      }
    }
    if (tripped)
      for (const u of Object.keys(TRAIN_N))
        crossSymbol(10).polys.forEach((p) => sk.marks.glyph(en(GSU_E + 1.5, 10, TRAIN_N[u]!), p, { width: PEN.medium, color: INK }, false));
    // the yard
    const bus = this.grid.bus('MOSS_LANDING-230').index;
    for (const c of this.circuits) {
      const br = this.grid.branches[c.k]!;
      const mw = br.from.index === bus ? s.pf[c.k]! : s.pt[c.k]!; // leaving the bus
      const out = !s.inService[c.k];
      const over = !out && s.loading[c.k]! > 1;
      for (const seg of c.segs) {
        sk.lines.setColor(seg, over ? SIGNAL : out ? INK_35 : INK, 1);
        sk.lines.setPattern(seg, out ? 'hidden' : 'solid');
      }
      sk.flow.set(c.flow, { sizePx: chevronSizeFor(mw, sc), speed: chevronSpeedFor(mw, sc) * Math.sign(mw), side: 0, color: over ? SIGNAL : INK, alpha: !none && !out && Math.abs(mw) > 1e-3 ? 1 : 0 });
    }
    let others = 0;
    for (const g of this.grid.gens) if (g.bus.index === bus && g.plant.id !== PLANT && s.genOnline[g.index]) others += s.pg[g.index]!;
    set('others', others);
    set('load', s.energized[bus] ? s.pd[bus]! : 0);
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
    return [en(-72, 0, -62), en(102, 0, -62), en(102, 0, 60), en(-72, 0, 60), en(STACK.e, STACK.h + 4, TRAIN_N.GT1!), en(-72, 30, 60)];
  }
}
