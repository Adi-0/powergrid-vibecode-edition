import * as THREE from 'three';
import { LineBatch, type LineStyle, type Vec3 } from '../render/lines';
import { FlowBatch, chevronSize, chevronSpeed } from '../render/flow';
import { INK, INK_35, INK_60, PEN, SIGNAL, voltageClassFor, type VoltageClass } from '../render/style';
import { converterSymbol, crossSymbol, generatorSymbol, transformerSymbol, warningSymbol, type Symbol } from '../render/symbols';
import { projectToView, type IsoCamera } from '../render/iso';
import type { Grid, GridBranch, GridBus } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import { REGIONS, type RegionId } from '../data/ca/network';
import { FLOW_SCALES, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';

/**
 * The Region level: one part of the state drawn as an exploded axonometric.
 *
 * The ground is the map. Each voltage network of the region floats above it on its
 * own layer — the lowest voltage just above the ground, 500 kV on top — like the
 * floors of an architect's exploded drawing, each outlined by a phantom plate. A
 * substation becomes a vertical axis through the layers, with a busbar on every layer
 * it has a bus on. Power is drawn wherever it moves: up a short riser from each
 * generator into its bus, along the lines on each layer, down through the
 * transformers between layers, and down a short drop from each bus that serves
 * customers. Chevrons are sized and paced by megawatts everywhere, as on the System
 * sheet.
 *
 * The level has its own frame: kilometres from the region's centre. Collapsed
 * (group scale y → 0) every layer lands on the ground and the drawing coincides with
 * the System sheet's; the transition between the two levels is that fold.
 */

export interface RegionLayer {
  cls: VoltageClass;
  y: number;
}

interface Item {
  kind: 'line' | 'xfmr' | 'gen' | 'load' | 'hvdc';
  /** Branch index (line, transformer), plant id (gen), bus index (load). */
  ref: number | string;
  site: string;
  seg: number;
  flow: number;
  /** For lines: the voltage class; sideways offset in px. */
  cls?: VoltageClass;
  side: number;
  /** For lines leaving the region: the far end is off the plate. */
  external?: boolean;
  /** Line drawn from the branch's to-end (so flow sign flips). */
  reversed?: boolean;
  a: Vec3;
  b: Vec3;
}

const BUS_HALF = 11; // px, half-length of a busbar
const GEN_DX = 20; // px between generator risers, to the left of the axis
const LOAD_DX = 18; // px, the load's drop to the right of the axis

export class RegionLevel implements Level {
  readonly kind = 'region' as const;
  readonly unitKm = 1;
  readonly north: [number, number] = [Math.SQRT1_2, -Math.SQRT1_2];
  readonly seat: Vec3 = [0, 0, 0];
  readonly needsDetail = false;
  readonly flowScale = FLOW_SCALES.region;
  readonly group = new THREE.Group();
  readonly lines = new LineBatch('reg-lines');
  readonly glyphs = new LineBatch('reg-glyphs');
  readonly plates = new LineBatch('reg-plates');
  readonly marks = new LineBatch('reg-marks');
  readonly flow = new FlowBatch('reg-flow');
  readonly labels: LabelSpec[] = [];
  readonly layers: RegionLayer[] = [];
  readonly name: string;
  /** Centre of the region in the System frame, km. */
  readonly center: [number, number];
  /** Site ids in this region (their axes are drawn). */
  readonly siteIds: string[];
  /** Plate corners (local frame, ground level) — for fitting the camera. */
  readonly corners: Vec3[] = [];
  private items: Item[] = [];
  private busY = new Map<number, number>();
  private sitePos = new Map<string, Vec3>();
  private siteGlyphs = new Map<string, number[]>();
  private snapshot: Snapshot | null = null;
  private selection: Selection | null = null;
  private morphValue = 1;

  constructor(
    readonly grid: Grid,
    readonly id: RegionId,
  ) {
    const g = grid;
    this.name = REGIONS[id].name;
    const sites = g.sites.filter((s) => s.region === id && !s.outOfState);
    this.siteIds = sites.map((s) => s.id);
    const inRegion = new Set(this.siteIds);
    // the frame: kilometres from the mean of the region's substations
    const pos0 = (siteId: string): [number, number] => {
      const b = g.buses.find((x) => x.site.id === siteId)!;
      return [b.x, b.z];
    };
    let cx = 0;
    let cz = 0;
    for (const s of sites) {
      const [x, z] = pos0(s.id);
      cx += x;
      cz += z;
    }
    this.center = [cx / sites.length, cz / sites.length];
    const local = (siteId: string, y = 0): Vec3 => {
      const [x, z] = pos0(siteId);
      return [x - this.center[0], y, z - this.center[1]];
    };
    // plan coordinates (km east, km north) and back — plates are square to the map
    const R = Math.SQRT1_2;
    const toEN = (x: number, z: number): [number, number] => [(x + z) * R, (x - z) * R];
    const fromEN = (e: number, n: number): [number, number] => [(e + n) * R, (e - n) * R];
    let e0 = Infinity;
    let e1 = -Infinity;
    let n0 = Infinity;
    let n1 = -Infinity;
    for (const s of sites) {
      const p = local(s.id);
      const [e, n] = toEN(p[0], p[2]);
      e0 = Math.min(e0, e);
      e1 = Math.max(e1, e);
      n0 = Math.min(n0, n);
      n1 = Math.max(n1, n);
    }
    const margin = 22;
    e0 -= margin;
    e1 += margin * 2.2; // room on the right for labels
    n0 -= margin;
    n1 += margin;

    // layers: every voltage class with a substation bus in the region (not generator terminals)
    const busesHere = g.buses.filter((b) => inRegion.has(b.site.id) && !b.terminalOf);
    const classes = [...new Map(busesHere.map((b) => [voltageClassFor(b.kv).id, voltageClassFor(b.kv)])).values()].sort((a, b) => a.kvNominal - b.kvNominal);
    // spacing between layers, and the short stubs generators and loads hang on below
    // their bus (the lowest layer's stubs reach the ground, where customers are)
    const H = Math.max(24, 0.26 * Math.max(e1 - e0, n1 - n0));
    const STUB = 0.3 * H;
    classes.forEach((cls, i) => this.layers.push({ cls, y: STUB + i * H }));
    const layerY = (kv: number) => this.layers.find((l) => l.cls.id === voltageClassFor(kv).id)?.y ?? 0;
    for (const b of busesHere) this.busY.set(b.index, layerY(b.kv));
    for (const s of sites) this.sitePos.set(s.id, local(s.id));

    // plates: a phantom outline per layer, square to the map
    const rectEN: Array<[number, number]> = [
      [e0, n0],
      [e1, n0],
      [e1, n1],
      [e0, n1],
    ];
    for (const [e, n] of rectEN) {
      const [x, z] = fromEN(e, n);
      this.corners.push([x, 0, z]);
    }
    for (const l of this.layers) {
      const ring = rectEN.map(([e, n]) => {
        const [x, z] = fromEN(e, n);
        return [x, l.y, z] as Vec3;
      });
      this.plates.polyline(ring, { width: PEN.hairline, color: INK_35, dash: 'dashDot' }, true);
      // lettered at the plate's left corner (west), where nothing else is drawn
      const [lx, lz] = fromEN(e0, (n0 + n1) / 2);
      this.labels.push({ id: `layer:${l.cls.id}`, text: `${l.cls.kvNominal} kV`, anchor: [lx, l.y, lz], priority: 20, minZoom: 0, kind: 'layer', prov: `data:style.voltageClass.${l.cls.id}.kvNominal` });
    }

    // exits: where a line leaves the plate on its way to a substation outside the region
    const exitPoint = (a: Vec3, b: Vec3): Vec3 => {
      const [ea, na] = toEN(a[0], a[2]);
      const [eb, nb] = toEN(b[0], b[2]);
      let t = 1;
      const de = eb - ea;
      const dn = nb - na;
      if (de > 0) t = Math.min(t, (e1 - ea) / de);
      if (de < 0) t = Math.min(t, (e0 - ea) / de);
      if (dn > 0) t = Math.min(t, (n1 - na) / dn);
      if (dn < 0) t = Math.min(t, (n0 - na) / dn);
      return [a[0] + (b[0] - a[0]) * t, a[1], a[2] + (b[2] - a[2]) * t];
    };

    // site axes: a hairline from the ground to the topmost busbar
    for (const s of sites) {
      const buses = busesHere.filter((b) => b.site.id === s.id);
      const top = Math.max(...buses.map((b) => this.busY.get(b.index)!));
      const p = this.sitePos.get(s.id)!;
      this.lines.segment([p[0], 0, p[2]], [p[0], top, p[2]], { width: PEN.hairline, color: INK_35, dash: 'hidden' });
      const glyphIdx: number[] = [];
      for (const b of buses) {
        const y = this.busY.get(b.index)!;
        const [f] = this.glyphs.glyph([p[0], y, p[2]], [
          [-BUS_HALF, 0],
          [BUS_HALF, 0],
        ], { width: 3.2, color: INK });
        glyphIdx.push(f);
      }
      this.siteGlyphs.set(s.id, glyphIdx);
      const plantsHere = new Set(g.gens.filter((x) => x.bus.site.id === s.id).map((x) => x.plant.id));
      const load = g.loads.filter((l) => l.bus.site.id === s.id).reduce((a, l) => a + l.rec.peakMW, 0);
      const priority = (top >= this.layers[this.layers.length - 1]!.y ? 6 : 4) + (load > 1200 ? 1 : 0) + (plantsHere.size ? 1 : 0);
      this.labels.push({ id: `site:${s.id}`, text: s.name.toUpperCase(), anchor: [p[0], top, p[2]], priority, minZoom: 0, kind: 'site' });
    }

    // lines: on their layer; a line to a substation outside the region stops at the plate's edge
    const corridorSide = (br: GridBranch, cls: VoltageClass) => (br.circuit - (br.circuitsInCorridor + 1) / 2) * (cls.weight + 3);
    g.branches.forEach((br, k) => {
      if (br.kind !== 'line') return;
      const fIn = inRegion.has(br.from.site.id);
      const tIn = inRegion.has(br.to.site.id);
      if (!fIn && !tIn) return;
      const cls = voltageClassFor(br.kv);
      const y = layerY(br.kv);
      const side = corridorSide(br, cls);
      const reversed = !fIn;
      const near = reversed ? br.to : br.from;
      const far = reversed ? br.from : br.to;
      const a = local(near.site.id, y);
      let b = local(far.site.id, y);
      const external = !(fIn && tIn);
      if (external) b = exitPoint(a, b);
      // keep the drawing's direction the branch's own (from → to) so the offset side matches the System sheet
      const [s0, s1] = reversed ? [b, a] : [a, b];
      const seg = this.lines.segment(s0, s1, { width: cls.weight, dash: cls.dash, color: INK, side });
      const flow = this.flow.segment(s0, s1, { sizePx: 0, speed: 0, side, color: INK, alpha: 0 });
      this.items.push({ kind: 'line', ref: k, site: near.site.id, seg, flow, cls, side, external, a: s0, b: s1 });
      if (external) {
        // the far substation's name where the line leaves the plate
        const key = `exit:${far.site.id}:${cls.id}`;
        if (!this.labels.some((l) => l.id === key))
          this.labels.push({ id: key, text: `to ${far.site.name}`, anchor: b, priority: 1, minZoom: 0, kind: 'exit' });
        this.glyphs.glyph(b, [
          [-4, -4],
          [4, 4],
        ], { width: PEN.medium, color: INK_60 });
      }
    });

    // transformers: vertical between the layers of their two buses, banks side by side
    const banks = new Map<string, GridBranch[]>();
    for (const br of g.branches) {
      if (br.kind !== 'transformer' || !inRegion.has(br.from.site.id)) continue;
      if (br.from.terminalOf || br.to.terminalOf) continue; // a unit's step-up: plant detail
      const key = `${br.from.site.id}:${br.from.kv}:${br.to.kv}`;
      banks.set(key, [...(banks.get(key) ?? []), br]);
    }
    for (const list of banks.values()) {
      list.forEach((br, i) => {
        const p = this.sitePos.get(br.from.site.id)!;
        const side = (i - (list.length - 1) / 2) * 8;
        const a: Vec3 = [p[0], this.busY.get(br.from.index)!, p[2]];
        const b: Vec3 = [p[0], this.busY.get(br.to.index)!, p[2]];
        const seg = this.lines.segment(a, b, { width: PEN.medium, color: INK, px: [side, 0, side, 0] });
        const flow = this.flow.segment(a, b, { sizePx: 0, speed: 0, side: 0, color: INK, alpha: 0 });
        this.flowPx(flow, side, b[1] > a[1]);
        const mid: Vec3 = [p[0], (a[1] + b[1]) / 2, p[2]];
        this.symbol(mid, transformerSymbol(4.2), PEN.thin, side, 0);
        this.items.push({ kind: 'xfmr', ref: br.index, site: br.from.site.id, seg, flow, side, a, b });
      });
    }

    // generation: a riser from the ground into the plant's bus, one per plant, left of the axis
    for (const s of sites) {
      const p = this.sitePos.get(s.id)!;
      const plants = [...new Set(g.gens.filter((x) => x.bus.site.id === s.id).map((x) => x.plant.id))];
      plants.forEach((pid, i) => {
        const gen = g.gens.find((x) => x.plant.id === pid)!;
        const bus = this.hvBusOf(gen.bus);
        const y = this.busY.get(bus.index) ?? layerY(bus.kv);
        const dx = -(GEN_DX + i * GEN_DX);
        const a: Vec3 = [p[0], y - STUB, p[2]];
        const b: Vec3 = [p[0], y, p[2]];
        const seg = this.lines.segment(a, b, { width: PEN.thin, color: INK, px: [dx, 0, dx, 0] });
        // the tap onto the busbar
        this.glyphs.glyph(b, [
          [dx, 0],
          [-BUS_HALF, 0],
        ], { width: PEN.thin, color: INK });
        const flow = this.flow.segment(a, b, { sizePx: 0, speed: 0, color: INK, alpha: 0 });
        this.flowPx(flow, dx, true);
        this.symbol(a, gen.tech.synchronous ? generatorSymbol(6.2) : converterSymbol(11.5), PEN.thin, dx, -8);
        this.items.push({ kind: 'gen', ref: pid, site: s.id, seg, flow, side: dx, a, b });
      });
      // demand: one drop from each load bus to the ground, right of the axis
      const loadBuses = [...new Set(g.loads.filter((l) => l.bus.site.id === s.id).map((l) => l.bus))];
      loadBuses.forEach((bus, i) => {
        const y = this.busY.get(bus.index) ?? layerY(bus.kv);
        const dx = LOAD_DX + i * 10;
        const a: Vec3 = [p[0], y, p[2]];
        const b: Vec3 = [p[0], y - STUB, p[2]];
        this.glyphs.glyph(a, [
          [BUS_HALF, 0],
          [dx, 0],
        ], { width: PEN.thin, color: INK });
        const seg = this.lines.segment(a, b, { width: PEN.thin, color: INK, px: [dx, 0, dx, 0] });
        const flow = this.flow.segment(a, b, { sizePx: 0, speed: 0, color: INK, alpha: 0 });
        this.flowPx(flow, dx, false);
        // a load arrow at the ground, pointing down
        this.glyphs.glyph(b, [
          [dx - 4.5, 6],
          [dx, -1],
          [dx + 4.5, 6],
        ], { width: PEN.medium, color: INK });
        this.items.push({ kind: 'load', ref: bus.index, site: s.id, seg, flow, side: dx, a, b });
      });
    }

    // DC links inside the region: a dotted heavy line with a converter at each end
    g.hvdc.forEach((h, i) => {
      if (!inRegion.has(h.from.site.id) || !inRegion.has(h.to.site.id)) return;
      const y = layerY(h.from.kv);
      const a = local(h.from.site.id, y);
      const b = local(h.to.site.id, y);
      const seg = this.lines.segment(a, b, { width: 2.1, color: INK, dash: 'dot', side: -10 });
      const flow = this.flow.segment(a, b, { sizePx: 0, speed: 0, side: -10, color: INK, alpha: 0 });
      for (const [p, q] of [
        [a, b],
        [b, a],
      ] as Array<[Vec3, Vec3]>) {
        // converters sit a little way along the link from each end
        const f = 0.12;
        const c: Vec3 = [p[0] + (q[0] - p[0]) * f, y, p[2] + (q[2] - p[2]) * f];
        const [ox, oy] = this.sideVec(a, b, -10);
        this.symbol(c, converterSymbol(9), PEN.thin, ox, oy);
      }
      this.items.push({ kind: 'hvdc', ref: i, site: h.from.site.id, seg, flow, side: -10, a, b });
    });

    this.lines.commit();
    this.glyphs.commit();
    this.plates.commit();
    this.marks.commit();
    this.flow.commit();
    this.plates.mesh.renderOrder = 9;
    this.glyphs.mesh.renderOrder = 30;
    this.marks.mesh.renderOrder = 31;
    this.group.add(this.plates.mesh, this.lines.mesh, this.flow.mesh, this.glyphs.mesh, this.marks.mesh);
  }

  /** A unit on a generator-terminal bus draws at the substation bus its step-up feeds. */
  private hvBusOf(bus: GridBus): GridBus {
    if (!bus.terminalOf) return bus;
    const gsu = this.grid.branches.find((b) => b.kind === 'transformer' && (b.from === bus || b.to === bus));
    return gsu ? (gsu.from === bus ? gsu.to : gsu.from) : bus;
  }

  private symbol(at: Vec3, sym: Symbol, width: number, dx = 0, dy = 0): void {
    sym.polys.forEach((poly, i) =>
      this.glyphs.glyph(
        at,
        poly.map(([x, y]) => [x + dx, y + dy] as [number, number]),
        { width, color: INK },
        sym.closed[i],
      ),
    );
  }

  /**
   * Chevrons on a vertical riser drawn `dx` px to the right of its axis. A flow's
   * sideways offset is along the segment's left normal: −x for a segment running up
   * the screen, +x for one running down.
   */
  private flowPx(flow: number, dx: number, up: boolean): void {
    this.flowSide.set(flow, up ? -dx : dx);
  }
  private flowSide = new Map<number, number>();

  /** Screen-space offset (px, y up) perpendicular to a segment. */
  private sideVec(a: Vec3, b: Vec3, side: number): [number, number] {
    const [ax, ay] = projectToView(a[0], a[1], a[2]);
    const [bx, by] = projectToView(b[0], b[1], b[2]);
    const L = Math.hypot(bx - ax, by - ay) || 1;
    return [(-(by - ay) / L) * side, ((bx - ax) / L) * side];
  }

  // ------------------------------------------------------------------ state
  applySnapshot(s: Snapshot): void {
    this.snapshot = s;
    this.marks.clear();
    const g = this.grid;
    const none = s.outcome === 'none';
    for (const it of this.items) {
      let mw = 0;
      let alive = !none;
      let over = false;
      let color = INK;
      if (it.kind === 'line' || it.kind === 'xfmr') {
        const k = it.ref as number;
        const br = g.branches[k]!;
        alive = alive && s.inService[k] === 1 && (s.energized[br.from.index] === 1 || s.energized[br.to.index] === 1);
        over = alive && s.loading[k]! > 1;
        mw = s.pf[k]!; // + : enters at from, flows from → to
        color = over ? SIGNAL : alive ? INK : INK_35;
        const dash = it.kind === 'line' ? (alive || none ? it.cls!.dash : 'hidden') : alive || none ? 'solid' : 'hidden';
        this.lines.setColor(it.seg, color, 1);
        this.lines.setPattern(it.seg, dash);
        if (!s.inService[k]) {
          const [mid, off] = this.midMark(it);
          crossSymbol(9).polys.forEach((p) => this.marks.glyph(mid, p.map(([x, y]) => [x + off[0], y + off[1]] as [number, number]), { width: PEN.medium, color: INK }));
        } else if (over) {
          const [mid, off] = this.midMark(it);
          warningSymbol(13).polys.forEach((p, i) => this.marks.glyph(mid, p.map(([x, y]) => [x + off[0], y + off[1]] as [number, number]), { width: PEN.medium, color: SIGNAL }, i === 0));
        }
      } else if (it.kind === 'gen') {
        const gens = g.gens.filter((x) => x.plant.id === it.ref);
        mw = gens.reduce((a, x) => a + (s.genOnline[x.index] ? s.pg[x.index]! : 0), 0);
        alive = alive && gens.some((x) => s.genOnline[x.index]);
        this.lines.setColor(it.seg, alive ? INK : INK_35, 1);
        this.lines.setPattern(it.seg, alive || none ? 'solid' : 'hidden');
      } else if (it.kind === 'load') {
        const b = it.ref as number;
        mw = s.pd[b]!;
        const dark = !none && !s.energized[b];
        alive = alive && !dark;
        this.lines.setColor(it.seg, dark ? SIGNAL : alive ? INK : INK_35, 1);
        this.lines.setPattern(it.seg, alive || none ? 'solid' : 'hidden');
      } else if (it.kind === 'hvdc') {
        mw = g.hvdc[it.ref as number]!.rec.scheduleMW;
      }
      const side = this.flowSide.get(it.flow) ?? it.side;
      this.flow.set(it.flow, {
        sizePx: alive ? chevronSize(mw) : 0,
        speed: chevronSpeed(mw) * Math.sign(mw),
        side,
        color: over ? SIGNAL : INK,
        alpha: alive && Math.abs(mw) > 0.5 ? 1 : 0,
        phase: (this.items.indexOf(it) * 37) % 50,
      });
    }
    // dark substations: their busbars in the signal colour
    for (const [id, idx] of this.siteGlyphs) {
      const dark = !none && this.grid.buses.filter((b) => b.site.id === id && !b.terminalOf).every((b) => !s.energized[b.index]);
      for (const i of idx) this.glyphs.setColor(i, dark ? SIGNAL : none ? INK_35 : INK, 1);
    }
    this.marks.commit();
    this.highlight(this.selection);
  }

  private midMark(it: Item): [Vec3, [number, number]] {
    const mid: Vec3 = [(it.a[0] + it.b[0]) / 2, (it.a[1] + it.b[1]) / 2, (it.a[2] + it.b[2]) / 2];
    if (it.kind === 'xfmr') return [mid, [it.side + 10, 0]];
    return [mid, this.sideVec(it.a, it.b, it.side)];
  }

  /** Focus and context, as on the System sheet; what is wrong or tripped never recedes. */
  highlight(sel: Selection | null): Set<string> | null {
    this.selection = sel;
    const s = this.snapshot;
    const g = this.grid;
    let keepSites: Set<string> | null = null;
    let keep: (it: Item) => boolean = () => true;
    if (sel?.kind === 'branch') {
      const br = g.branches[sel.index];
      keepSites = new Set(br ? [br.from.site.id, br.to.site.id] : []);
      keep = (it) => (it.kind === 'line' || it.kind === 'xfmr') && it.ref === sel.index;
    } else if (sel?.kind === 'site') {
      keepSites = new Set([sel.id]);
      keep = (it) => it.site === sel.id || ((it.kind === 'line' || it.kind === 'xfmr') && [g.branches[it.ref as number]!.from.site.id, g.branches[it.ref as number]!.to.site.id].includes(sel.id));
      for (const it of this.items) if (it.kind === 'line' && keep(it)) {
        const br = g.branches[it.ref as number]!;
        keepSites.add(br.from.site.id).add(br.to.site.id);
      }
    }
    const flagged = (it: Item) =>
      !!s && (it.kind === 'line' || it.kind === 'xfmr') && (s.inService[it.ref as number] === 0 || (s.outcome !== 'none' && s.loading[it.ref as number]! > 1));
    for (const it of this.items) {
      const dim = !sel || keep(it) || flagged(it) ? 0 : 0.78;
      this.lines.setDim(it.seg, dim);
      this.flow.setDim(it.flow, dim);
    }
    for (const [id, idx] of this.siteGlyphs) for (const i of idx) this.glyphs.setDim(i, keepSites && !keepSites.has(id) ? 0.7 : 0);
    return keepSites;
  }

  // ------------------------------------------------------------------ transition
  /** 0: folded flat onto the ground (matches the System sheet); 1: exploded. */
  set morph(m: number) {
    this.morphValue = m;
    this.group.scale.y = Math.max(1e-4, m);
    // what only exists in the exploded drawing fades in as the layers separate
    const f = Math.max(0, Math.min(1, (m - 0.35) / 0.5));
    this.plates.opacity = f;
    this.glyphs.opacity = f;
  }

  get morph(): number {
    return this.morphValue;
  }

  // ------------------------------------------------------------------ picking
  pick(sx: number, sy: number, cam: IsoCamera): Selection | null {
    const v = new THREE.Vector3();
    const p = new THREE.Vector2();
    const q = new THREE.Vector2();
    const toScreen = (w: Vec3, out: THREE.Vector2) => cam.worldToScreen(v.set(w[0], w[1] * this.group.scale.y, w[2]), out);
    // busbars first (a substation)
    let best: Selection | null = null;
    let bestD = 12;
    for (const [id, pos] of this.sitePos) {
      for (const b of this.grid.buses.filter((x) => x.site.id === id && this.busY.has(x.index))) {
        toScreen([pos[0], this.busY.get(b.index)!, pos[2]], p);
        const d = Math.max(0, Math.abs(p.x - sx) - BUS_HALF) + Math.abs(p.y - sy);
        if (d < bestD) {
          bestD = d;
          best = { kind: 'site', id };
        }
      }
    }
    if (best) return best;
    bestD = 7;
    for (const it of this.items) {
      toScreen(it.a, p);
      toScreen(it.b, q);
      let off: [number, number];
      if (it.kind === 'line' || it.kind === 'hvdc') {
        const [ox, oy] = this.sideVec(it.a, it.b, it.side);
        off = [ox, -oy];
      } else off = [it.side, 0];
      const ax = p.x + off[0];
      const ay = p.y + off[1];
      const dx = q.x + off[0] - ax;
      const dy = q.y + off[1] - ay;
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / L2));
      const d = Math.hypot(ax + t * dx - sx, ay + t * dy - sy);
      if (d < bestD) {
        bestD = d;
        best = it.kind === 'line' || it.kind === 'xfmr' ? { kind: 'branch', index: it.ref as number } : { kind: 'site', id: it.site };
      }
    }
    return best;
  }

  /** Where a substation's busbar of this voltage is drawn (this level's frame). */
  busbarOf(siteId: string, kv: number): Vec3 {
    const p = this.sitePos.get(siteId)!;
    const b = this.grid.buses.find((x) => x.site.id === siteId && x.kv === kv && this.busY.has(x.index));
    return [p[0], b ? this.busY.get(b.index)! : 0, p[2]];
  }

  /** Voltage classes drawn (for the key). */
  get classes(): VoltageClass[] {
    return this.layers.map((l) => l.cls);
  }

  /** Top of the drawing (for fitting). */
  get height(): number {
    return this.layers.length ? this.layers[this.layers.length - 1]!.y : 0;
  }

  fitPoints(): Vec3[] {
    return this.corners.flatMap((c) => [c, [c[0], this.height, c[2]] as Vec3]);
  }

  frame(o: FrameInfo): void {
    for (const b of [this.lines, this.glyphs, this.plates, this.marks]) b.frame(o);
    this.flow.frame(o.width, o.height, o.pixelRatio, o.time);
  }

  dispose(): void {
    for (const b of [this.lines, this.glyphs, this.plates, this.marks]) b.dispose();
    this.flow.dispose();
  }
}

export type { LineStyle };
