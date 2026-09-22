import * as THREE from 'three';
import { FaceBatch } from '../render/faces';
import { LineBatch, type Vec3 } from '../render/lines';
import { FlowBatch, chevronSize, chevronSpeed } from '../render/flow';
import { RegionFace } from '../render/region';
import { INK, INK_15, INK_35, INK_60, PEN, SIGNAL, voltageClassFor, type VoltageClass } from '../render/style';
import { converterSymbol, crossSymbol, generatorSymbol, substationSymbol, warningSymbol, type Symbol } from '../render/symbols';
import type { Grid, GridBranch } from '../model/grid';
import { SegmentIndex, type Outlines, type Ring } from '../model/outline';
import type { Snapshot } from '../model/snapshot';
import type { IsoCamera } from '../render/iso';
import { project } from '../model/geo';

/**
 * The System level: all of California in one axonometric sheet.
 *
 * The state is drawn as a thin slab, like an architect's site model: its top is the
 * map, and the edges that face the viewer are cut sections, hatched. Neighbouring
 * states continue the ground around it, outlined lighter and cut off by break lines. On the slab: transmission corridors (one
 * stroke per circuit, weight and dash by voltage class), power flowing along them as
 * chevrons sized and moving by megawatts, and one-line symbols at every site.
 */

export const SLAB_KM = 30; // drawn thickness of the state slab (vertical exaggeration)
/** Zoom (px per km) above which generator symbols and 115/60 kV circuits are drawn. */
export const GEN_ZOOM = 1.5;

export type Selection =
  | { kind: 'site'; id: string }
  | { kind: 'branch'; index: number }
  | { kind: 'plant'; id: string };

export interface SiteAnchor {
  id: string;
  pos: Vec3;
  kvMax: number;
  plants: string[];
  outOfState: boolean;
}

export interface LabelSpec {
  id: string;
  text: string;
  anchor: Vec3;
  priority: number;
  /** Minimum zoom (px per km) at which the label may show. */
  minZoom: number;
  kind: 'site' | 'plant' | 'region' | 'sea';
}

interface CircuitDraw {
  branch: number;
  seg: number;
  flow: number;
  cls: VoltageClass;
}

export class SystemLevel {
  readonly group = new THREE.Group();
  readonly faces = new FaceBatch('sys-faces');
  readonly lines = new LineBatch('sys-lines');
  readonly glyphs = new LineBatch('sys-glyphs');
  readonly marks = new LineBatch('sys-marks');
  readonly flow = new FlowBatch('sys-flow');
  /** State surfaces: California's top and the neighbours' (see render/region.ts). */
  readonly surfaces: RegionFace[] = [];
  readonly sites: SiteAnchor[] = [];
  readonly labels: LabelSpec[] = [];
  private circuits: CircuitDraw[] = [];
  private byBranch = new Map<number, CircuitDraw>();
  private siteGlyphRange = new Map<string, [number, number]>();
  private genGlyphs: number[] = [];
  private genVisible = true;
  /** Voltage classes present in the drawing. */
  readonly classes: VoltageClass[] = [];
  snapshot: Snapshot | null = null;

  constructor(
    readonly grid: Grid,
    readonly geo: Outlines,
  ) {
    this.buildSlab();
    this.buildNetwork();
    this.buildGlyphs();
    this.lines.commit();
    this.faces.commit();
    this.glyphs.commit();
    this.marks.commit();
    this.flow.commit();
    this.glyphs.mesh.renderOrder = 30;
    this.marks.mesh.renderOrder = 31;
    for (const r of this.surfaces) this.group.add(...r.meshes);
    this.group.add(this.faces.mesh, this.lines.mesh, this.flow.mesh, this.glyphs.mesh, this.marks.mesh);
  }

  // ------------------------------------------------------------------ slab
  /** Neighbouring states' outlines, for telling California's land borders from its coast. */
  private neighbourEdges!: SegmentIndex;

  /** Is this point on a land border (shared with a neighbouring state)? */
  private onLandBorder(x: number, z: number): boolean {
    return this.neighbourEdges.near(x, z, 4);
  }

  private slab(ring: Ring, top: number, bottom: number, outline: string, hatch: string | null, width: number, borders = false): void {
    const top3: Vec3[] = ring.map(([x, z]) => [x, top, z]);
    // walls (every edge; the depth test hides the ones facing away)
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i]!;
      const [bx, bz] = ring[(i + 1) % ring.length]!;
      this.faces.quad([ax, top, az], [bx, top, bz], [bx, bottom, bz], [ax, bottom, az], hatch ? { color: hatch, hatch: true } : {});
    }
    if (borders) {
      // coast in ink; land borders as a boundary line (chain-dashed), as drafted
      let run: Vec3[] = [];
      let runBorder: boolean | null = null;
      const flush = () => {
        if (run.length > 1)
          this.lines.polyline(run, runBorder ? { width: PEN.fine, color: INK_60, dash: 'dashDot' } : { width, color: outline });
      };
      for (let i = 0; i <= ring.length; i++) {
        const a = ring[i % ring.length]!;
        const b = ring[(i + 1) % ring.length]!;
        const isB = this.onLandBorder((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        if (runBorder === null) runBorder = isB;
        if (isB !== runBorder) {
          flush();
          run = [run[run.length - 1]!];
          runBorder = isB;
        }
        if (run.length === 0) run.push([a[0], top, a[1]]);
        run.push([b[0], top, b[1]]);
      }
      flush();
    } else this.lines.polyline(top3, { width, color: outline }, true);
    this.lines.polyline(
      ring.map(([x, z]) => [x, bottom, z] as Vec3),
      { width: PEN.hairline, color: outline },
      true,
    );
  }

  private buildSlab(): void {
    // Neighbouring states lie on the same ground as California (a site just over the
    // border, like Malin, must not drop out of sight). They get a surface for
    // occlusion; their coasts in a hairline, borders between them chain-dashed; the
    // borders they share with California are drawn by California; where the sheet
    // cuts them off, a break line.
    this.neighbourEdges = new SegmentIndex(this.geo.neighbours.flatMap((n) => n.rings), true);
    const cuts = new SegmentIndex(this.geo.cuts, false);
    const ca = new SegmentIndex(this.geo.california, true);
    const others = new Map(this.geo.neighbours.map((n) => [n.id, new SegmentIndex(n.rings, true)]));
    for (const n of this.geo.neighbours)
      for (const r of n.rings) {
        type Kind = 'skip' | 'coast' | 'border';
        const kindOf = (x: number, z: number): Kind => {
          if (cuts.near(x, z, 3) || ca.near(x, z, 4)) return 'skip';
          for (const [id, idx] of others) if (id !== n.id && idx.near(x, z, 4)) return id < n.id ? 'skip' : 'border';
          return 'coast';
        };
        let run: Vec3[] = [];
        let runKind: Kind | null = null;
        const flush = () => {
          if (run.length > 1 && runKind !== 'skip')
            this.lines.polyline(run, runKind === 'border' ? { width: PEN.fine, color: INK_60, dash: 'dashDot' } : { width: PEN.hairline, color: INK_60 });
          run = [];
        };
        for (let i = 0; i < r.length; i++) {
          const a = r[i]!;
          const b = r[(i + 1) % r.length]!;
          const k = kindOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          if (k !== runKind) {
            flush();
            runKind = k;
          }
          if (run.length === 0) run.push([a[0], 0, a[1]]);
          run.push([b[0], 0, b[1]]);
        }
        flush();
      }
    for (const c of this.geo.cuts) this.lines.polyline(breakLine(c, 0), { width: PEN.hairline, color: INK_35 });
    this.surfaces.push(
      new RegionFace(this.geo.neighbours.flatMap((n) => n.rings), 0, 2, -4, undefined, 'neighbours'),
      new RegionFace(this.geo.california, 0, 1, -2, undefined, 'california'),
    );
    this.geo.california.forEach((r, i) => this.slab(r, 0, -SLAB_KM, INK, INK_15, i === 0 ? PEN.coast + 0.3 : PEN.coast, i === 0));
    for (const l of this.geo.lakes) {
      this.lines.polyline(
        l.ring.map(([x, z]) => [x, 0.01, z] as Vec3),
        { width: PEN.hairline, color: INK_60 },
        true,
      );
    }
    // region names and the sea, lettered on the sheet
    const centroid = (r: Ring): Vec3 => {
      let x = 0;
      let z = 0;
      for (const [a, b] of r) {
        x += a;
        z += b;
      }
      return [x / r.length, 0, z / r.length];
    };
    const names: Record<string, string> = { OR: 'OREGON', NV: 'NEVADA', AZ: 'ARIZONA', BC: 'BAJA CALIFORNIA' };
    for (const n of this.geo.neighbours) {
      const big = [...n.rings].sort((a, b) => b.length - a.length)[0]!;
      this.labels.push({ id: `region:${n.id}`, text: names[n.id] ?? n.id, anchor: centroid(big), priority: 1, minZoom: 0, kind: 'region' });
    }
    const [sx, sz] = project(35.2, -124.6);
    this.labels.push({ id: 'sea', text: 'PACIFIC OCEAN', anchor: [sx, -SLAB_KM, sz], priority: 1, minZoom: 0, kind: 'sea' });
  }

  // ------------------------------------------------------------------ network
  private buildNetwork(): void {
    const g = this.grid;
    const siteKV = new Map<string, number>();
    for (const b of g.buses) siteKV.set(b.site.id, Math.max(siteKV.get(b.site.id) ?? 0, b.kv));
    for (const s of g.sites) {
      const b = g.buses.find((x) => x.site.id === s.id)!;
      const plants = g.gens.filter((x) => x.bus.site.id === s.id).map((x) => x.plant.id);
      this.sites.push({ id: s.id, pos: [b.x, 0, b.z], kvMax: siteKV.get(s.id)!, plants: [...new Set(plants)], outOfState: !!s.outOfState });
    }
    const pos = new Map(this.sites.map((s) => [s.id, s.pos]));
    const classSet = new Set<string>();
    g.branches.forEach((br, k) => {
      if (br.kind !== 'line') return;
      const cls = voltageClassFor(br.kv);
      classSet.add(cls.id);
      const a = pos.get(br.from.site.id)!;
      const b = pos.get(br.to.site.id)!;
      const n = br.circuitsInCorridor;
      const gap = cls.weight + 3;
      const side = (br.circuit - (n + 1) / 2) * gap;
      const seg = this.lines.segment(a, b, { width: cls.weight, dash: cls.dash, color: INK, side });
      const flow = this.flow.segment(a, b, { sizePx: 0, speed: 0, side, color: INK, alpha: 0 });
      const c: CircuitDraw = { branch: k, seg, flow, cls };
      this.circuits.push(c);
      this.byBranch.set(k, c);
    });
    for (const c of ['ehv500', 'hv230', 'hv115', 'sub69']) if (classSet.has(c)) this.classes.push(voltageClassFor(c === 'ehv500' ? 500 : c === 'hv230' ? 230 : c === 'hv115' ? 115 : 60));
  }

  // ------------------------------------------------------------------ symbols
  private addSymbol(anchor: Vec3, sym: Symbol, width: number, dx = 0, dy = 0): void {
    sym.polys.forEach((p, i) =>
      this.glyphs.glyph(
        anchor,
        p.map(([x, y]) => [x + dx, y + dy] as [number, number]),
        { width, color: INK },
        sym.closed[i],
      ),
    );
  }

  private buildGlyphs(): void {
    const g = this.grid;
    for (const s of this.sites) {
      const first = this.glyphs.count;
      const big = s.kvMax >= 345;
      if (!s.outOfState) {
        this.addSymbol(s.pos, substationSymbol(big ? 9 : 7), big ? PEN.bold : PEN.medium);
        if (big) this.addSymbol(s.pos, substationSymbol(4), PEN.fine);
      } else {
        this.addSymbol(s.pos, substationSymbol(7), PEN.medium);
      }
      // generation at the site: one symbol per plant kind, in a row to the right
      const kinds: Array<'sync' | 'conv'> = [];
      for (const pid of s.plants) {
        const gen = g.gens.find((x) => x.plant.id === pid)!;
        const k = gen.tech.synchronous ? 'sync' : 'conv';
        if (!kinds.includes(k)) kinds.push(k);
      }
      kinds.forEach((k, i) => {
        const dx = 14 + i * 15;
        const g0 = this.glyphs.count;
        this.glyphs.glyph(s.pos, [
          [big ? 4.5 : 3.5, 0],
          [dx - 6.5, 0],
        ], { width: PEN.fine, color: INK });
        this.addSymbol(s.pos, k === 'sync' ? generatorSymbol(6.2) : converterSymbol(11.5), PEN.thin, dx, 0);
        for (let q = g0; q < this.glyphs.count; q++) this.genGlyphs.push(q);
      });
      this.siteGlyphRange.set(s.id, [first, this.glyphs.count - first]);
      const site = g.sites.find((x) => x.id === s.id)!;
      const load = g.loads.filter((l) => l.bus.site.id === s.id).reduce((a, l) => a + l.rec.peakMW, 0);
      const gen = g.gens.filter((x) => x.bus.site.id === s.id).reduce((a, x) => a + x.pmaxMW, 0);
      const priority = (big ? 4 : 2) + (load > 1500 ? 2 : load > 800 ? 1 : 0) + (gen > 1500 ? 1 : 0) + (site.outOfState ? 1 : 0);
      this.labels.push({
        id: `site:${s.id}`,
        text: site.name.toUpperCase(),
        anchor: s.pos,
        priority,
        minZoom: priority >= 5 ? 0 : priority >= 4 ? 0.9 : 1.6,
        kind: 'site',
      });
    }
  }

  // ------------------------------------------------------------------ state
  /** Show 115 and 60 kV circuits only once zoomed in far enough to read them. */
  setZoom(pxPerKm: number): void {
    const show = pxPerKm > GEN_ZOOM;
    if (show === this.genVisible) return;
    this.genVisible = show;
    for (const g of this.genGlyphs) this.glyphs.setAlpha(g, show ? 1 : 0);
    for (const c of this.circuits) if (c.cls.kvMin < 200) this.lines.setAlpha(c.seg, show ? 1 : 0);
    if (this.snapshot) this.applySnapshot(this.snapshot);
  }

  /** Is this circuit drawn at the current zoom? (115 and 60 kV only close in.) */
  private drawn(c: CircuitDraw): boolean {
    return this.genVisible || c.cls.kvMin >= 200;
  }

  /** Are generator symbols drawn at this zoom? */
  showsGenerators(pxPerKm: number): boolean {
    return pxPerKm > GEN_ZOOM;
  }

  visibleClasses(pxPerKm: number): VoltageClass[] {
    return this.classes.filter((c) => pxPerKm > GEN_ZOOM || c.kvMin >= 200);
  }

  /** Apply a solved interval: flows, overloads, dead buses. */
  applySnapshot(s: Snapshot): void {
    this.snapshot = s;
    this.marks.clear();
    for (const c of this.circuits) {
      const k = c.branch;
      const br0 = this.grid.branches[k]!;
      const alive = s.inService[k] === 1 && s.energized[br0.from.index] === 1 && s.energized[br0.to.index] === 1;
      const over = s.loading[k]! > 1.0;
      const mw = s.pf[k]!; // + means power enters at the from end: flows from → to
      if (!s.inService[k]) {
        this.lines.setColor(c.seg, INK_35);
        this.lines.setPattern(c.seg, 'hidden');
        this.flow.set(c.flow, { sizePx: 0, speed: 0, color: INK, alpha: 0, side: this.sideOf(c) });
        const br = this.grid.branches[k]!;
        const a = br.from.site.id;
        const b = br.to.site.id;
        const pa = this.sites.find((x) => x.id === a)!.pos;
        const pb = this.sites.find((x) => x.id === b)!.pos;
        const mid: Vec3 = [(pa[0] + pb[0]) / 2, 0, (pa[2] + pb[2]) / 2];
        crossSymbol(9).polys.forEach((p) => this.marks.glyph(mid, p, { width: PEN.medium, color: INK }));
        continue;
      }
      const shown = this.drawn(c);
      this.lines.setColor(c.seg, over ? SIGNAL : alive ? INK : INK_35, shown ? 1 : 0);
      this.lines.setPattern(c.seg, alive ? c.cls.dash : 'hidden');
      const speed = chevronSpeed(mw) * Math.sign(mw);
      this.flow.set(c.flow, {
        sizePx: alive ? chevronSize(mw) : 0,
        speed,
        side: this.sideOf(c),
        color: over ? SIGNAL : INK,
        alpha: alive && shown ? 1 : 0,
        phase: (c.branch * 37) % 50,
      });
      if (over) {
        // pair the colour with a mark: a warning triangle at mid-span
        const br = this.grid.branches[k]!;
        const pa = this.sites.find((x) => x.id === br.from.site.id)!.pos;
        const pb = this.sites.find((x) => x.id === br.to.site.id)!.pos;
        const mid: Vec3 = [(pa[0] + pb[0]) / 2, 0, (pa[2] + pb[2]) / 2];
        warningSymbol(13).polys.forEach((p, i) => this.marks.glyph(mid, p, { width: PEN.medium, color: SIGNAL }, i === 0));
      }
    }
    // dead sites (no source) and voltage out of range
    for (const site of this.sites) {
      const buses = this.grid.buses.filter((b) => b.site.id === site.id);
      const dead = buses.every((b) => !s.energized[b.index]);
      const out = buses.some((b) => s.energized[b.index] && (s.vm[b.index]! < 0.95 || s.vm[b.index]! > (b.kv >= 345 ? 1.1 : 1.05)));
      const [first, n] = this.siteGlyphRange.get(site.id)!;
      const gen = new Set(this.genGlyphs);
      for (let i = first; i < first + n; i++) this.glyphs.setColor(i, dead ? SIGNAL : INK, gen.has(i) && !this.genVisible ? 0 : 1);
      if (dead || out) warningSymbol(12).polys.forEach((p, i) => this.marks.glyph(site.pos, p.map(([x, y]) => [x - 12, y + 12] as [number, number]), { width: PEN.medium, color: SIGNAL }, i === 0));
    }
    this.marks.commit();
  }

  private sideOf(c: CircuitDraw): number {
    const br: GridBranch = this.grid.branches[c.branch]!;
    const n = br.circuitsInCorridor;
    return (br.circuit - (n + 1) / 2) * (c.cls.weight + 3);
  }

  // ------------------------------------------------------------------ picking
  pick(sx: number, sy: number, cam: IsoCamera): Selection | null {
    const v = new THREE.Vector3();
    const s2 = new THREE.Vector2();
    let best: Selection | null = null;
    let bestD = 14;
    for (const s of this.sites) {
      cam.worldToScreen(v.set(s.pos[0], s.pos[1], s.pos[2]), s2);
      const d = Math.hypot(s2.x - sx, s2.y - sy);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'site', id: s.id };
      }
      // generator symbols to the right of the square
      const nk = s.plants.length ? 1 : 0;
      if (nk && Math.hypot(s2.x + 14 - sx, s2.y - sy) < 8 && Math.hypot(s2.x + 14 - sx, s2.y - sy) < bestD) {
        bestD = Math.hypot(s2.x + 14 - sx, s2.y - sy);
        best = { kind: 'site', id: s.id };
      }
    }
    if (best) return best;
    bestD = 7;
    const pa = new THREE.Vector2();
    const pb = new THREE.Vector2();
    for (const c of this.circuits) {
      const br = this.grid.branches[c.branch]!;
      const a = this.sites.find((x) => x.id === br.from.site.id)!.pos;
      const b = this.sites.find((x) => x.id === br.to.site.id)!.pos;
      cam.worldToScreen(v.set(a[0], a[1], a[2]), pa);
      cam.worldToScreen(v.set(b[0], b[1], b[2]), pb);
      // apply the sideways offset (screen normal; y down on screen)
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dy / len;
      const ny = -dx / len;
      const off = this.sideOf(c);
      const ax = pa.x + nx * off;
      const ay = pa.y + ny * off;
      const t = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / (len * len)));
      const d = Math.hypot(ax + t * dx - sx, ay + t * dy - sy);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'branch', index: c.branch };
      }
    }
    return best;
  }

  /**
   * Selection: what is selected, and what it connects to, stays as drawn; the rest
   * of the network recedes (the map itself does not). A selected circuit is also
   * drawn heavier. Returns the sites that stay, so their labels can stay too.
   */
  highlight(sel: Selection | null): Set<string> | null {
    const g = this.grid;
    let keepBranch: (k: number) => boolean = () => true;
    let keepSites: Set<string> | null = null;
    if (sel?.kind === 'branch') {
      const b = g.branches[sel.index];
      keepBranch = (k) => k === sel.index;
      keepSites = new Set(b ? [b.from.site.id, b.to.site.id] : []);
    } else if (sel?.kind === 'site' || sel?.kind === 'plant') {
      const siteId = sel.kind === 'site' ? sel.id : g.gens.find((x) => x.plant.id === sel.id)?.bus.site.id;
      keepBranch = (k) => g.branches[k]!.from.site.id === siteId || g.branches[k]!.to.site.id === siteId;
      keepSites = new Set(siteId ? [siteId] : []);
      g.branches.forEach((b, k) => {
        if (keepBranch(k)) keepSites!.add(b.from.site.id).add(b.to.site.id);
      });
    }
    for (const c of this.circuits) {
      const keep = keepBranch(c.branch);
      const dim = keep ? 0 : 0.78;
      this.lines.setDim(c.seg, dim);
      this.flow.setDim(c.flow, dim);
      this.lines.setWidth(c.seg, c.cls.weight + (sel?.kind === 'branch' && keep ? 1.6 : 0));
    }
    for (const [id, [first, n]] of this.siteGlyphRange) {
      const dim = keepSites && !keepSites.has(id) ? 0.7 : 0;
      for (let i = first; i < first + n; i++) this.glyphs.setDim(i, dim);
    }
    return keepSites;
  }
}

/** A drafting break line: the cut edge redrawn as a gentle zigzag (every ~30 km). */
function breakLine(pts: Ring, y: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(L / 30));
    const nx = -(bz - az) / (L || 1);
    const nz = (bx - ax) / (L || 1);
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      out.push([ax + (bx - ax) * t0, y, az + (bz - az) * t0]);
      const tm = (k + 0.5) / n;
      const amp = (k % 2 === 0 ? 1 : -1) * 6;
      out.push([ax + (bx - ax) * tm + nx * amp, y, az + (bz - az) * tm + nz * amp]);
    }
  }
  const last = pts[pts.length - 1]!;
  out.push([last[0], y, last[1]]);
  return out;
}
