import * as THREE from 'three';
import { IsoCamera, projectToView } from '../render/iso';
import { GROUND } from '../render/style';
import { LabelLayer, type LabelItem } from '../render/labels';
import { SystemLevel, type Selection } from '../levels/system';
import { Grid, S_BASE } from '../model/grid';
import { outlines } from '../model/outline';
import type { Snapshot } from '../model/snapshot';
import { DAY } from '../data/ca/profiles';
import { Legend } from '../ui/legend';
import { Inspector } from '../ui/inspector';
import { installTermTips } from '../ui/tooltip';
import { drawSheet } from '../ui/sheet';
import { Furniture } from '../ui/furniture';
import { clockEl, data, dataText, derived, el, input, qty, siQty, solver } from '../ui/quantity';
import { rich } from '../ui/glossary';
import { branchView, regionView, siteView, transformerView } from './inspect-system';
import { bankView, busView, distTransformerView, feederBreakerView, feederElementView, feederView, homeView, outletTraceView, serviceView, substationView } from './inspect-dist';
import { makeFeeder, type Feeder } from '../model/feeder';
import { RegionLevel } from '../levels/region';
import { SubstationLevel } from '../levels/substation';
import { FeederLevel } from '../levels/feeder';
import { ServiceLevel } from '../levels/service';
import { PlantLevel } from '../levels/plant';
import { MachineLevel } from '../levels/machine';
import { SiteLevel } from '../levels/site';
import { smoothstep } from '../levels/exits';
import { equipView, machineView, plantView } from './inspect-plant';
import { tripResponse, type TripResponse } from '../model/frequency';
import { faultStudy, type FaultStudy } from '../model/faultStudy';
import { faultOnFeeder, feederSource } from '../model/feederFault';
import { simulateProtection } from '../model/protection';
import { pathBetween, type FeederFaultKind } from '../physics/dist/fault';
import { busFaultSection, feederFaultView, reliabilitySection, type FeederEvent } from './inspect-fault';
import { simulateYears, type ReliabilityRun } from '../model/reliability';
import type { LabelSpec, Level, LevelKind } from '../levels/level';
import type { Vec3 } from '../render/lines';
import { PaperTooth } from '../render/paper';
import { REGIONS, type RegionId } from '../data/ca/network';
import type { FromWorker, ToWorker } from '../worker/model.worker';
import { Scrubber } from '../ui/scrubber';
import { HonestyPanel, type HonestyContext } from '../ui/honesty';
import { GlossaryPanel } from '../ui/glossaryPanel';
import { Tour } from './tour';
import type { Action, Section } from '../ui/inspector';
import type { Panel } from '../math/expr';
import { branchPanel, busFaultPanel, busPanel, feederFaultPanel, feederPanel, frequencyPanel, machinePanel, meterPanel, outletPanel, plantPanel, regionPanel, substationPanel } from '../math/panels';

/**
 * A place in a level that has a level of its own. Zoom toward it and that level
 * unfolds there, in the parent's frame, as far as the zoom has gone; zoom on and the
 * camera is handed to the child's own frame; zoom back out and it is handed back and
 * the child folds away. `anchor` is where the child's seat lands in the parent's frame,
 * `ratio` how many parent units one child unit is (1000 from kilometres to metres).
 */
interface Portal {
  key: string;
  anchor: Vec3;
  ratio: number;
  make: () => Level;
  /** What the node is in its level's own terms (to dive into it from a selection). */
  sel: Selection;
  /** The parent's label for the node, which gives way to the child's own names. */
  label?: string;
}

/** A level unfolding inside the one on the sheet: how far (m), between its two zooms. */
interface Band {
  portal: Portal;
  level: Level;
  /** Parent px/unit where it starts to unfold, and where it is whole (the hand-off). */
  zIn: number;
  zOut: number;
  m: number;
}

/**
 * At the hand-off the child fills this share of the zoom that fits it to the sheet, and
 * it starts to unfold BAND times further out: a station out of the System when its
 * yard would span some 45 px, a part of a level (ratio 1) when it would span some 70.
 */
const HANDOFF = { deep: 0.6, near: 0.85 };
const BAND = { deep: 9, near: 6 };
/** At most this many children unfold at once (the ones nearest where the reader zooms). */
const MAX_BANDS = 6;

/**
 * The application: the sheet, its camera and input, the zoom tree, the solver thread,
 * and the panels around the drawing.
 */
/** Is `to` downstream of `from` on the feeder (following closed and open switches alike)? */
function pathBetweenIds(fd: Feeder, from: string, to: string): boolean {
  const parent = new Map(fd.base.branches.map((b) => [b.to, b.from]));
  for (let n: string | undefined = to; n; n = parent.get(n)) if (n === from) return true;
  return false;
}

export class App {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam = new IsoCamera();
  readonly grid = new Grid();
  readonly system: SystemLevel;
  readonly labels: LabelLayer;
  readonly legend: Legend;
  /** Sites the current selection connects to (null: nothing selected). */
  private focusSites: Set<string> | null = null;
  readonly inspector: Inspector;
  honesty!: HonestyPanel;
  glossary!: GlossaryPanel;
  tour!: Tour;
  /** The inspector was open when a side panel took its place. */
  private inspectorUnder = false;

  /** The context the honesty panel adds to the level's own sections. */
  private honestyContext(): HonestyContext[] {
    const c: HonestyContext[] = [];
    if (this.outages.size || this.plantOutages.size) c.push('trip');
    if (this.tripEvent) c.push('frequency');
    if (this.feederEvent || this.feederOpen.size || this.selection?.kind === 'site') c.push('fault');
    if (this.inspector.working) c.push('math');
    return c;
  }

  openHonesty(): void {
    this.glossary.hide();
    this.takeInspectorColumn();
    this.honesty.show(this.top.kind, this.honestyContext());
  }

  openGlossary(term?: string): void {
    this.honesty.hide();
    this.takeInspectorColumn();
    this.glossary.show(term);
  }

  /** A side panel opens in the inspector's column; the inspector returns when it closes. */
  private takeInspectorColumn(): void {
    if (!this.inspector.root.hidden) {
      this.inspectorUnder = true;
      this.inspector.hide();
    }
  }

  closeSidePanels(): void {
    this.honesty.hide();
    this.glossary.hide();
    if (this.inspectorUnder) {
      this.inspectorUnder = false;
      this.inspect();
    }
  }
  readonly furniture: Furniture;
  private titleblock!: HTMLElement;
  private progressEl!: HTMLElement;
  private worker: Worker | null = null;
  /** The day's own solutions, base case, as they stream in. */
  readonly snaps = new Map<number, Snapshot>();
  /** What the sheet shows: the latest solve that answered the reader. */
  current: Snapshot | null = null;
  /** The interval the reader asked for (the sheet follows once it is solved). */
  t = 76; // 19:00, the evening peak
  /** Branches the reader has tripped. */
  readonly outages = new Set<number>();
  /** Plants the reader has tripped, and the frequency response to the last trip. */
  readonly plantOutages = new Set<string>();
  tripEvent: TripResponse | null = null;
  /** Excitation changed by the reader: generator index → voltage set-point, pu. */
  readonly vset = new Map<number, number>();
  /** Feeder devices left open by protection after a fault. */
  readonly feederOpen = new Set<string>();
  /** A fault on the feeder and its protection sequence (playing while `faultPlaying`). */
  feederEvent: FeederEvent | null = null;
  private faultStart = 0;
  private faultPlaying = false;
  private faultState = '';
  private faultCache: { seq: number; t: number; fs: FaultStudy } | null = null;
  private reliabilityCache: { t: number; run: ReliabilityRun } | null = null;
  /** For the screenshot harness: hold the protection playback at this time, s. */
  freezeFault: number | null = null;
  private seq = 0;
  private inFlight = false;
  private stale = false;
  private scrubber!: Scrubber;
  private notice!: HTMLElement;
  private playTimer = 0;
  /** A camera move in progress (navigation, eased). */
  private flight: { t0: number; ms: number; ease: (u: number) => number; at: (e: number) => void; done?: () => void } | null = null;
  /** The levels open, System first; the last is the one on the sheet. */
  readonly stack: Level[] = [];
  /** How each level after the System sits in the one before it. */
  private path: Portal[] = [];
  /** The Region lens (voltage layers), when open: the camera before it. */
  private lens: { saved: { target: THREE.Vector3; zoom: number } } | null = null;
  private regions = new Map<RegionId, RegionLevel>();
  /** Every level built so far, by its portal's key; and each level's portals. */
  private kids = new Map<string, Level>();
  private portalLists = new Map<Level, Portal[]>();
  private bandZooms = new Map<string, { zIn: number; zOut: number }>();
  /** Children unfolding in the level on the sheet. */
  private bands = new Map<string, Band>();
  /** The furthest the camera may zoom here: to the hand-off of any child in view. */
  private reach = 0;
  /** Where the reader last zoomed (the wheel's point), for choosing among children. */
  private focus: { x: number; y: number } | null = null;
  /** px per frame unit, per drawn level, relative to the camera's (for dash phases). */
  private scaleOf = new Map<Level, number>();
  private labelKey = '';
  /** A level transition in progress. */
  private anim: { t0: number; ms: number; frame: (e: number) => void; done: () => void } | null = null;
  /** For tests: hold a transition at this fold (0 flat … 1 exploded). */
  freezeMorph: number | null = null;
  private crumbs!: HTMLElement;
  toolsEl!: HTMLElement;
  private readonly paper = new PaperTooth()
  selection: Selection | null = null;
  private pixelRatio = 1;
  private cameraDirty = true;
  private start = performance.now();
  private reducedMotion = false;
  readonly perf = { frames: 0, frameMs: [] as number[], cpuMs: [] as number[] };
  onReady: () => void = () => {};

  constructor(root: HTMLElement) {
    this.root = root;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'gl';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Map of the California grid. Arrow keys pan, plus and minus zoom, Tab moves between places.');
    root.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setClearColor(new THREE.Color(GROUND), 1);
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.system = new SystemLevel(this.grid, outlines());
    this.stack.push(this.system);
    this.scene.add(this.system.group);
    this.scene.add(this.paper.mesh);
    this.labels = new LabelLayer(root);
    drawSheet(root);
    this.buildChrome();
    this.legend = new Legend(root);
    this.inspector = new Inspector(root);
    this.inspector.onClose = () => (this.selection ? this.select(null) : this.inspector.hide());
    this.furniture = new Furniture(root);
    installTermTips(root);
    this.resize();
    this.fit();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    this.refreshLabels();
    this.updateLegend();
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ chrome
  private buildChrome(): void {
    const bar = document.createElement('header');
    bar.className = 'panel titlebar';
    const mark = document.createElement('div');
    mark.className = 'mark';
    mark.textContent = 'Grid Atlas';
    const crumbs = document.createElement('nav');
    crumbs.className = 'crumbs';
    crumbs.setAttribute('aria-label', 'Where you are');
    this.crumbs = crumbs;
    this.updateCrumbs();
    bar.append(mark, crumbs);
    this.root.appendChild(bar);

    // quiet, always there: what this view simplifies, and the glossary
    const tools = document.createElement('div');
    tools.className = 'tools';
    const tool = (label: string, title: string, run: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', run);
      tools.appendChild(b);
      return b;
    };
    tool('What’s simplified', 'What this view leaves out, and what the full treatment would be', () => this.openHonesty());
    tool('Glossary', 'Every term, searchable', () => this.openGlossary());
    const tourBtn = tool('Guided tour', 'About ten minutes, from the whole state to a wall outlet; leave and come back any time', () => this.tour.open());
    this.toolsEl = tools;
    this.root.appendChild(tools);
    this.honesty = new HonestyPanel(this.root);
    this.honesty.onClose = () => this.closeSidePanels();
    this.glossary = new GlossaryPanel(this.root);
    this.glossary.onClose = () => this.closeSidePanels();
    this.tour = new Tour(this.root, this);
    if (this.tour.saved > 0) tourBtn.textContent = 'Resume the tour';
    // a term anywhere opens its glossary entry
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('.term[data-term]');
      if (t && !t.closest('.glossary')) this.openGlossary(t.dataset.term);
    });

    this.progressEl = document.createElement('div');
    this.progressEl.className = 'panel progress';
    this.progressEl.textContent = 'Solving the day…';
    this.root.appendChild(this.progressEl);

    this.titleblock = document.createElement('footer');
    this.titleblock.className = 'panel titleblock';
    this.root.appendChild(this.titleblock);
    this.updateTitleblock();

    this.scrubber = new Scrubber(this.root);
    this.scrubber.setCursor(this.t);
    this.scrubber.onChange = (t) => this.setTime(t);
    this.scrubber.onPlay = (on) => {
      window.clearTimeout(this.playTimer);
      if (on) this.playStep();
    };

    this.notice = document.createElement('section');
    this.notice.className = 'panel notice';
    this.notice.hidden = true;
    this.notice.setAttribute('role', 'status');
    this.root.appendChild(this.notice);
  }

  // ------------------------------------------------------------------ time and trips
  /** Ask for an interval; the sheet changes when its power flow has been solved. */
  setTime(t: number): void {
    this.t = Math.max(0, Math.min(95, t));
    this.scrubber.setCursor(this.t);
    this.requestSolve();
  }

  /** Playback: advance one interval once the current one is on the sheet. */
  private playStep(): void {
    if (!this.scrubber.isPlaying) return;
    const shown = this.current?.t === this.t && !this.inFlight;
    if (shown) this.setTime((this.t + 1) % 96);
    this.playTimer = window.setTimeout(() => this.playStep(), shown ? 220 : 40);
  }

  trip(k: number): void {
    this.outages.add(k);
    this.requestSolve();
  }

  restore(k: number | 'all'): void {
    if (k === 'all') {
      this.outages.clear();
      this.plantOutages.clear();
      this.vset.clear();
      this.tripEvent = null;
      this.clearFeederFault(false);
    } else this.outages.delete(k);
    this.requestSolve();
  }

  /** Anything changed from the day as scheduled. */
  get scenarioActive(): boolean {
    return this.outages.size > 0 || this.plantOutages.size > 0 || this.vset.size > 0 || this.feederOpen.size > 0;
  }

  /**
   * Trip a plant: its breakers open at once. The frequency response runs from the
   * interval as it stands (a time-domain model), and the power flow re-solves with the
   * governors having picked up its output.
   */
  tripPlant(id: string): void {
    const s = this.current;
    if (!s || s.outcome === 'none' || this.plantOutages.has(id)) return;
    this.tripEvent = tripResponse(this.grid, s, id);
    this.plantOutages.add(id);
    this.requestSolve();
  }

  restorePlant(id: string): void {
    this.plantOutages.delete(id);
    if (this.tripEvent?.plantId === id) this.tripEvent = null;
    this.requestSolve();
  }

  /** The sequence networks at the interval on the sheet (built once per solution). */
  faultStudyNow(): FaultStudy | null {
    const s = this.current;
    if (!s || s.outcome === 'none') return null;
    if (!this.faultCache || this.faultCache.seq !== s.seq || this.faultCache.t !== s.t) this.faultCache = { seq: s.seq, t: s.t, fs: faultStudy(this.grid, s) };
    return this.faultCache.fs;
  }

  /**
   * A fault on feeder 1105 at a node: the fault current from the transmission system's
   * Thevenin through the bank and down the feeder, and the protection's sequence,
   * simulated, then played on the sheet in real time.
   */
  faultFeeder(node: string, permanent: boolean, kind: FeederFaultKind = 'slg'): void {
    const s = this.current;
    const fl = this.feederLevel;
    if (!s || !s.feeder || !fl || this.top !== fl) return;
    const fs = this.faultStudyNow();
    if (!fs) return;
    const fd = this.feederModel();
    const res = faultOnFeeder(fd, s, feederSource(this.grid, fs), node, kind);
    if (!res) return;
    const mags = res.I.map((x) => x.abs());
    const lat = fd.layout.laterals.find((l) => l.nodes.includes(node));
    const prot = simulateProtection({ devices: res.devices, Iph: Math.max(...mags), Ires: res.residual.abs(), Ifuse: lat ? mags[lat.phase]! : 0, permanent });
    const homesBeyond = (devs: string[]) => {
      const out = new Set<string>();
      for (const d of devs) {
        const b = fd.base.branches.find((x) => x.id === d);
        if (!b) continue;
        for (const h of fd.layout.homes) if (pathBetweenIds(fd, b.to, h.meter)) out.add(h.id);
      }
      return out;
    };
    const outH = homesBeyond(prot.open);
    const momH = [...homesBeyond(prot.momentary)].filter((h) => !outH.has(h));
    this.clearFeederFault(false);
    this.feederEvent = { node, permanent, res, prot, outHomes: outH.size, momentaryHomes: momH.length };
    this.faultStart = performance.now();
    this.faultPlaying = true;
    this.faultState = '';
    this.select(null);
    this.updateLegend();
    // bring the fault and the device that protects it into view
    const guard = [...res.devices].reverse().find((d) => d !== 'CB-1105') ?? 'CB-1105';
    const pts = [fl.pointOf(node), fl.pointOf(guard) ?? fl.origin].filter((p): p is Vec3 => !!p);
    const fit = this.fitOf(pts, 120);
    this.flyTo(fit.x, fit.z, Math.min(fit.zoom, this.cam.pxPerUnit * 6), 700, undefined, this.freeRect(true));
  }

  /** Camera fit for a set of points in the level's frame, with a margin in px. */
  private fitOf(pts: Vec3[], marginPx: number): { x: number; z: number; zoom: number } {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      const [vx, vy] = projectToView(p[0], p[1], p[2]);
      x0 = Math.min(x0, vx);
      x1 = Math.max(x1, vx);
      y0 = Math.min(y0, vy);
      y1 = Math.max(y1, vy);
    }
    const free = this.freeRect(true);
    const zoom = Math.min((free.w - 2 * marginPx) / Math.max(1e-6, x1 - x0), (free.h - 2 * marginPx) / Math.max(1e-6, y1 - y0));
    const [ax, ay] = projectToView(1, 0, 0);
    const [bx, by] = projectToView(0, 0, 1);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const det = ax * by - bx * ay;
    return { x: (cx * by - bx * cy) / det, z: (ax * cy - cx * ay) / det, zoom };
  }

  /** Repair the fault: every device closed again, the feeder back to normal. */
  clearFeederFault(solve = true): void {
    this.feederEvent = null;
    this.faultPlaying = false;
    this.faultState = '';
    this.feederLevel?.setFault(null);
    const had = this.feederOpen.size > 0;
    this.feederOpen.clear();
    this.updateLegend();
    if (solve && had) this.requestSolve();
    else if (solve) this.inspect();
  }

  /** Play the protection sequence: what is open and whether current flows, at the time on the clock. */
  private tickFault(now: number): void {
    const ev = this.feederEvent;
    const fl = this.feederLevel;
    if (!ev || !fl || !this.faultPlaying) return;
    const tp = this.freezeFault ?? (this.reducedMotion ? Infinity : (now - this.faultStart) / 1000);
    const open = new Set<string>();
    for (const e of ev.prot.events) {
      if (e.t > tp) break;
      if (e.what === 'open' || e.what === 'clear') open.add(e.device);
      if (e.what === 'reclose') open.delete(e.device);
    }
    const conducting = ev.prot.conducting.some(([a, b]) => tp >= a && tp < b);
    const done = tp > ev.prot.clearedAt + 1.2;
    const key = `${[...open].sort().join()}|${conducting}|${done}`;
    // the cursor on the timeline moves every frame; the drawing only when something changes
    const cur = this.inspector.root.querySelector<SVGLineElement>('svg[aria-label="The protection sequence in time"] line.cursor');
    if (cur) {
      const x = Number(cur.dataset.x0) + Math.min(1, tp / Number(cur.dataset.tend)) * Number(cur.dataset.w);
      cur.setAttribute('x1', String(x));
      cur.setAttribute('x2', String(x));
    }
    if (key === this.faultState) return;
    this.faultState = key;
    const fd = this.feederModel();
    const path = new Set((pathBetween(fd.base, 'EV-12', ev.node) ?? []).map((b) => fd.base.branches.indexOf(b)));
    if (done) {
      this.faultPlaying = false;
      // the steady state after: devices left open, the section beyond them without supply
      for (const d of ev.prot.open) this.feederOpen.add(d);
      fl.setFault(ev.permanent ? { node: ev.node, conducting: false, open: new Set(ev.prot.open), path } : null);
      this.requestSolve();
      this.inspect();
      return;
    }
    fl.setFault({ node: ev.node, conducting, open, path });
  }

  /** Move a generator's voltage set-point (its excitation); null returns it to schedule. */
  setExcitation(genIndex: number, v: number | null): void {
    if (v === null) this.vset.delete(genIndex);
    else this.vset.set(genIndex, Math.round(v * 1000) / 1000);
    this.requestSolve();
  }

  private requestSolve(): void {
    if (!this.worker) return;
    if (this.inFlight) {
      this.stale = true;
      return;
    }
    this.inFlight = true;
    this.stale = false;
    const msg: ToWorker = {
      type: 'solve',
      t: this.t,
      outages: [...this.outages],
      plantOutages: [...this.plantOutages],
      feederOpen: [...this.feederOpen],
      vset: [...this.vset],
      seq: ++this.seq,
      detail: this.needsDetail(),
    };
    this.worker.postMessage(msg);
  }

  private setCurrent(s: Snapshot): void {
    this.current = s;
    for (const l of this.drawn()) l.applySnapshot(s);
    this.scrubber.setSolved(s.t, DAY.intervalMin);
    this.updateTitleblock();
    this.updateNotice();
    this.updateLegend();
    if (this.selection || this.stack.length > 1) this.inspect();
    this.onReady();
  }

  /** Circuits over their normal rating in the shown solution, worst first. */
  private overloads(): number[] {
    const s = this.current;
    if (!s || s.outcome === 'none') return [];
    const out: number[] = [];
    this.grid.branches.forEach((b, k) => {
      if (b.kind === 'line' && s.inService[k] && s.loading[k]! > 1) out.push(k);
    });
    return out.sort((a, b) => s.loading[b]! - s.loading[a]!);
  }

  /** A notice over the sheet when the solution is not a whole, healthy one. */
  private updateNotice(): void {
    const s = this.current;
    const n = this.notice;
    const over = this.overloads();
    if (s && s.outcome === 'solved' && over.length === 0 && this.tripEvent) {
      // not something wrong: an event, and what the interconnection did about it
      const r = this.tripEvent;
      n.hidden = false;
      n.className = 'panel notice';
      const h = document.createElement('header');
      h.append(dataText(this.grid.plant(r.plantId).name, data(`plants.${r.plantId}.name`)), document.createTextNode(' tripped'));
      const body = document.createElement('div');
      body.className = 'body';
      const p = document.createElement('p');
      p.append(
        el(qty(r.lossMW, 'MW', solver(`t${s.t}.trip.${r.plantId}.loss`), { digits: 0 })),
        rich(' lost at once. Frequency fell to '),
        el(qty(r.nadirHz, 'Hz', solver(`t${s.t}.trip.${r.plantId}.nadir`), { digits: 3 })),
        rich(' and settles near '),
        el(qty(r.settledHz, 'Hz', solver(`t${s.t}.trip.${r.plantId}.settled`), { digits: 3 })),
        rich('; [[governor|governors]] across the West made up the rest. The flows drawn are after they have.'),
      );
      const bar = document.createElement('div');
      bar.className = 'actions';
      const b = document.createElement('button');
      b.textContent = 'Restore everything';
      b.addEventListener('click', () => this.restore('all'));
      bar.appendChild(b);
      body.append(p, bar);
      n.replaceChildren(h, body);
      return;
    }
    if (!s || (s.outcome === 'solved' && over.length === 0)) {
      n.hidden = true;
      return;
    }
    if (s.outcome === 'solved') {
      n.hidden = false;
      n.className = 'panel notice bad';
      const h = document.createElement('header');
      h.append(document.createTextNode('Over a limit'));
      const body = document.createElement('div');
      body.className = 'body';
      const p = document.createElement('p');
      p.append(
        rich('The grid has a solution, but '),
        el(qty(over.length, over.length === 1 ? 'circuit' : 'circuits', solver(`t${s.t}.overloadCount`), { digits: 0 })),
        rich(over.length === 1 ? ' is' : ' are'),
        rich(' carrying more than the normal [[rating]]. Operators would re-dispatch generation within minutes to bring the flow back under it.'),
      );
      const list = document.createElement('ul');
      list.className = 'list';
      for (const k of over.slice(0, 3)) {
        const b = this.grid.branches[k]!;
        const li = document.createElement('li');
        const go = document.createElement('button');
        go.textContent = 'Show';
        go.addEventListener('click', () => this.showBranch(k));
        li.append(
          dataText(b.name, data(`network.line.${b.id}.name`)),
          document.createTextNode(': '),
          el(qty(s.loading[k]! * 100, '%', solver(`t${s.t}.branch.${b.id}.loading`), { digits: 0 })),
          rich(' of normal, '),
          el(qty((s.loading[k]! * b.rateMVA * 100) / b.rateEmergencyMVA, '%', derived(`t${s.t}.branch.${b.id}.loadingEmergency`, solver(`t${s.t}.branch.${b.id}.loading`), data(`network.line.${b.id}.rateEmergencyMVA`)), { digits: 0 })),
          rich(' of [[emergency-rating|emergency]] '),
          go,
        );
        list.appendChild(li);
      }
      body.append(p, list);
      if (over.length > 3) {
        const more = document.createElement('p');
        more.append(rich('and '), el(qty(over.length - 3, 'more', solver(`t${s.t}.overloadCount`), { digits: 0 })));
        body.appendChild(more);
      }
      if (this.scenarioActive) {
        const bar = document.createElement('div');
        bar.className = 'actions';
        const b = document.createElement('button');
        b.textContent = 'Restore everything';
        b.addEventListener('click', () => this.restore('all'));
        bar.appendChild(b);
        body.appendChild(bar);
      }
      n.replaceChildren(h, body);
      return;
    }
    n.hidden = false;
    n.className = 'panel notice bad';
    const h = document.createElement('header');
    const body = document.createElement('div');
    body.className = 'body';
    const p = document.createElement('p');
    if (s.outcome === 'none') {
      h.append(document.createTextNode('No operating point'));
      p.append(
        rich('The [[power-flow|power flow]] has no steady-state solution for this interval with what is out of service. '),
        dataText(s.reason, solver(`t${s.t}.reason`)),
        rich(' Nothing on the sheet is a solved flow until something changes.'),
      );
    } else {
      h.append(document.createTextNode('Part of the grid is dark'));
      const buses = s.darkIslands.reduce((a, x) => a + x.buses.length, 0);
      p.append(
        el(qty(buses, buses === 1 ? 'bus' : 'buses', solver(`t${s.t}.darkBuses`), { digits: 0 })),
        rich(buses === 1 ? ' is cut off from every source; ' : ' are cut off from every source; '),
        el(qty(s.unservedMW, 'MW', solver(`t${s.t}.unserved`))),
        rich(' of demand is unserved. The rest of the grid has a solution, shown. '),
      );
    }
    body.appendChild(p);
    if (this.scenarioActive) {
      const bar = document.createElement('div');
      bar.className = 'actions';
      const b = document.createElement('button');
      b.textContent = 'Restore everything';
      b.addEventListener('click', () => this.restore('all'));
      bar.appendChild(b);
      body.appendChild(bar);
    }
    n.replaceChildren(h, body);
  }

  private updateTitleblock(): void {
    const s = this.current;
    const tb = this.titleblock;
    tb.replaceChildren();
    const table = document.createElement('table');
    const row = (k: string, ...v: Array<Node | string>) => {
      const tr = document.createElement('tr');
      // the sheet name and the model note are the first to go on a narrow screen
      if (k === 'Sheet' || k === 'Model') tr.className = 'aux';
      const a = document.createElement('td');
      a.className = 'k';
      a.textContent = k;
      const b = document.createElement('td');
      for (const x of v) b.append(typeof x === 'string' ? rich(x) : x);
      tr.append(a, b);
      table.appendChild(tr);
      return b;
    };
    row('Sheet', 'California · System — ', dataText(DAY.label.toLowerCase(), data('profiles.DAY.label')));
    const tShown = s?.t ?? this.t;
    row('Time', clockEl(tShown / 4, DAY.intervalMin, input(`time.t${tShown}`)), ' PDT, one [[quasi-static]] interval');
    if (s) {
      row(
        'Demand',
        el(qty(s.netLoadMW, 'MW', solver(`t${s.t}.netLoad`), { phases: '3φ' })),
        ' after ',
        el(qty(s.btmMW, 'MW', solver(`t${s.t}.btm`))),
        ' of [[btm-solar|rooftop solar]]',
      );
      const ok = s.outcome !== 'none';
      if (ok)
        row(
          'Supply',
          el(qty(s.genMW, 'MW', solver(`t${s.t}.gen`))),
          ' generated; [[losses]] ',
          el(qty(s.lossesMW, 'MW', solver(`t${s.t}.losses`))),
          ' (',
          el(qty((100 * s.lossesMW) / s.netLoadMW, '%', solver(`t${s.t}.lossPct`))),
          ')',
        );
      else row('Supply', '— (no solution: nothing is generated or lost in a state that does not exist)');
      const st = row(
        'Solution',
        ok
          ? span(
              'AC [[power-flow|power flow]] converged: [[newton-raphson|Newton–Raphson]], ',
              el(qty(s.iterations, 'iterations', solver(`t${s.t}.iterations`), { digits: 0 })),
              '; largest [[mismatch]] ',
              el(siQty(s.maxMismatchPu * S_BASE * 1e6, 'W', solver(`t${s.t}.mismatch`))),
              s.outcome === 'partial' ? badSpan(span('; ', el(qty(s.unservedMW, 'MW', solver(`t${s.t}.unserved`))), ' unserved')) : '',
            )
          : span('No steady-state operating point (see the notice).'),
      );
      st.classList.add('status');
      if (s.outcome === 'none') st.classList.add('bad');
      if (this.outages.size || this.plantOutages.size) {
        const names = [...this.outages].map((k) => this.grid.branches[k]!);
        row(
          'Tripped',
          ...names.flatMap((b, i) => [i ? '; ' : '', dataText(b.name, data(`network.line.${b.id}.name`))]),
          ...[...this.plantOutages].flatMap((id, i) => [i || names.length ? '; ' : '', dataText(this.grid.plant(id).name, data(`plants.${id}.name`))]),
        );
      }
    } else {
      // same rows as a solved interval, so the block does not change height
      row('Demand', '—');
      row('Supply', '—');
      row('Solution', 'solving…');
    }
    row('Model', 'Synthetic network named after real places — not a replica.');
    tb.appendChild(table);
    this.root.style.setProperty('--tb-h', `${tb.offsetHeight}px`);
  }

  // ------------------------------------------------------------------ worker
  startSolver(): void {
    this.worker = new Worker(new URL('../worker/model.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data;
      if (m.type === 'interval') {
        // the day's own sequence (base case): shown only while nothing newer answers the reader
        this.snaps.set(m.snap.t, m.snap);
        if (m.snap.t === this.t && !this.scenarioActive && (this.current?.seq ?? 0) === 0) this.setCurrent(m.snap);
      } else if (m.type === 'solved') {
        this.inFlight = false;
        if (m.snap.seq >= (this.current?.seq ?? 0)) this.setCurrent(m.snap);
        if (this.stale) this.requestSolve();
      } else if (m.type === 'schedule') {
        this.scrubber.update(m.day);
      } else if (m.type === 'progress') {
        this.progressEl.hidden = false;
        this.progressEl.replaceChildren(
          document.createTextNode('Solving the day: '),
          el(qty((100 * m.done) / m.total, '%', solver('progress'), { digits: 0 })),
        );
      } else if (m.type === 'day-done') {
        this.progressEl.hidden = true;
        // the final dispatch is ready: solve what is on the sheet again with it
        if ((this.current?.seq ?? 0) > 0) this.requestSolve();
      }
    };
    this.worker.postMessage({ type: 'init', focus: this.t });
  }

  // ------------------------------------------------------------------ camera
  private resize(): void {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.cam.setViewport(w, h);
    this.cameraDirty = true;
    // fits and band zooms depend on the free area
    this.fitZooms?.clear();
    this.bandZooms?.clear();
  }

  /** Fit California in the part of the sheet the panels leave free. */
  fit(): void {
    // the state plus the intertie points in neighbouring states
    const ring: Array<[number, number]> = [
      ...this.system.geo.california[0]!,
      ...this.system.sites.filter((x) => x.outOfState).map((x) => [x.pos[0], x.pos[2]] as [number, number]),
    ];
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let cx = 0;
    let cz = 0;
    for (const [x, z] of ring) {
      const [vx, vy] = projectToView(x, 0, z);
      x0 = Math.min(x0, vx);
      x1 = Math.max(x1, vx);
      y0 = Math.min(y0, vy);
      y1 = Math.max(y1, vy);
      cx += x;
      cz += z;
    }
    const w = this.cam.width;
    const h = this.cam.height;
    const narrow = w < 760;
    // free area: between the key (left) and the inspector/title block (right)
    const left = narrow ? 16 : 300;
    const right = narrow ? 16 : 40;
    const top = narrow ? 100 : 56;
    const bottom = narrow ? this.titleblock.offsetHeight + 150 : 196;
    const freeW = w - left - right;
    const freeH = h - top - bottom;
    this.cam.pxPerUnit = Math.min(freeW / (x1 - x0), freeH / (y1 - y0)) * 0.97;
    this.cam.target.set(cx / ring.length, 0, cz / ring.length);
    this.cam.update();
    // where the state's box lands now, and where it should land
    const v = new THREE.Vector3();
    const s = new THREE.Vector2();
    let sx0 = Infinity;
    let sx1 = -Infinity;
    let sy0 = Infinity;
    let sy1 = -Infinity;
    for (const [x, z] of ring) {
      this.cam.worldToScreen(v.set(x, 0, z), s);
      sx0 = Math.min(sx0, s.x);
      sx1 = Math.max(sx1, s.x);
      sy0 = Math.min(sy0, s.y);
      sy1 = Math.max(sy1, s.y);
    }
    this.panPixels(left + freeW / 2 - (sx0 + sx1) / 2, top + freeH / 2 - (sy0 + sy1) / 2);
    this.cameraDirty = true;
  }

  private panPixels(dx: number, dy: number): void {
    const a = this.cam.screenToGround(this.cam.width / 2, this.cam.height / 2);
    const b = this.cam.screenToGround(this.cam.width / 2 - dx, this.cam.height / 2 - dy);
    this.cam.target.add(b.sub(a));
    this.clampTarget();
    this.cameraDirty = true;
  }

  private zoomAt(sx: number, sy: number, factor: number): void {
    // a move of the camera in progress (a dive, a fold) finishes first
    if (this.anim || this.flight) return;
    // zooming in near a node that has a level of its own draws the zoom toward it, so
    // the node stays put on the sheet while it unfolds
    let fx = sx;
    let fy = sy;
    if (factor > 1) {
      const a = this.attractor(sx, sy);
      if (a) {
        fx += (a.x - sx) * a.w;
        fy += (a.y - sy) * a.w;
      }
    }
    this.focus = { x: fx, y: fy };
    const before = this.cam.screenToGround(fx, fy);
    let lo = 0.35;
    let hi = Math.max(60, this.reach);
    if (this.lens) {
      const f = this.levelFit(this.top).zoom;
      [lo, hi] = [f * 0.3, f * 30];
    } else if (this.path.length) {
      // below the System there is no floor: zooming out hands the sheet back up
      lo = 0;
      hi = Math.max(this.fitZoom(this.top) * 30, this.reach);
    }
    const z = Math.max(lo, Math.min(hi, this.cam.pxPerUnit * factor));
    this.cam.pxPerUnit = z;
    this.cam.update();
    const after = this.cam.screenToGround(fx, fy);
    this.cam.target.add(before.sub(after));
    this.clampTarget();
    this.cameraDirty = true;
  }

  /** The node with a level of its own nearest the pointer, and how strongly it holds the zoom (0 … 1). */
  private attractor(sx: number, sy: number): { x: number; y: number; w: number } | null {
    const z = this.cam.pxPerUnit;
    const r = 0.3 * Math.min(this.cam.width, this.cam.height);
    let best: { x: number; y: number; w: number } | null = null;
    let bd = r;
    for (const c of this.candidates) {
      const d = Math.hypot(c.x - sx, c.y - sy);
      if (d >= bd) continue;
      const w = Math.max(0, Math.min(1, Math.log(z / (c.zIn * 0.5)) / Math.LN2));
      if (w <= 0) continue;
      bd = d;
      best = { x: c.x, y: c.y, w };
    }
    return best;
  }

  private clampTarget(): void {
    const t = this.cam.target;
    t.y = 0;
    if (this.anim || this.flight) return;
    // keep the level's drawing within reach: its extent, and as much again around it
    // (the System's frame spans the state; a region under it keeps that ground)
    const l = this.top === this.region ? this.system : this.top;
    const off = this.top === this.region ? this.region.center : [0, 0];
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of l.fitPoints()) {
      x0 = Math.min(x0, p[0] - off[0]!);
      x1 = Math.max(x1, p[0] - off[0]!);
      z0 = Math.min(z0, p[2] - off[1]!);
      z1 = Math.max(z1, p[2] - off[1]!);
    }
    const mx = (x1 - x0) * 0.6;
    const mz = (z1 - z0) * 0.6;
    t.x = Math.max(x0 - mx, Math.min(x1 + mx, t.x));
    t.z = Math.max(z0 - mz, Math.min(z1 + mz, t.z));
  }

  // ------------------------------------------------------------------ input
  private bindInput(): void {
    const c = this.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let dragged = 0;
    let pinch = 0;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      dragged = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) {
        this.hover(e.offsetX, e.offsetY);
        return;
      }
      if (pointers.size === 1) {
        const dx = e.offsetX - p.x;
        const dy = e.offsetY - p.y;
        dragged += Math.abs(dx) + Math.abs(dy);
        this.panPixels(dx, dy);
      } else if (pointers.size === 2) {
        p.x = e.offsetX;
        p.y = e.offsetY;
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch > 0) this.zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, d / pinch);
        pinch = d;
        dragged += 10;
        return;
      }
      p.x = e.offsetX;
      p.y = e.offsetY;
    });
    const up = (e: PointerEvent) => {
      if (pointers.has(e.pointerId) && pointers.size === 1 && dragged < 5) this.click(e.offsetX, e.offsetY);
      pointers.delete(e.pointerId);
      pinch = 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('dblclick', (e) => {
      const hit = this.pick(e.offsetX, e.offsetY);
      if (hit) this.openFrom(hit);
      else this.diveNear(e.offsetX, e.offsetY);
    });
    c.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const k = e.ctrlKey ? 0.01 : 0.0015; // trackpad pinch arrives as ctrl+wheel
        this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * k));
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return;
      const step = 60;
      switch (e.key) {
        case 'ArrowLeft':
          this.panPixels(step, 0);
          break;
        case 'ArrowRight':
          this.panPixels(-step, 0);
          break;
        case 'ArrowUp':
          this.panPixels(0, step);
          break;
        case 'ArrowDown':
          this.panPixels(0, -step);
          break;
        case '+':
        case '=':
          this.zoomAt(this.cam.width / 2, this.cam.height / 2, 1.25);
          break;
        case '-':
        case '_':
          this.zoomAt(this.cam.width / 2, this.cam.height / 2, 0.8);
          break;
        case 'Escape':
          if (!this.honesty.root.hidden || !this.glossary.root.hidden) this.closeSidePanels();
          else if (this.selection) this.select(null);
          else if (this.stack.length > 1) this.closeTop();
          break;
        case 'Enter':
          if (this.selection && document.activeElement === this.canvas) this.openFrom(this.selection);
          break;
        case 'w':
        case 'W':
          if (this.inspector.root.hidden) return;
          this.inspector.toggleWorking();
          break;
        case '[':
        case ']':
          this.scrubber.setPlaying(false);
          this.setTime(this.t + (e.key === ']' ? 1 : -1));
          break;
        case 'Tab':
          if (document.activeElement === this.canvas) {
            e.preventDefault();
            this.cycle(e.shiftKey ? -1 : 1);
          }
          break;
        default:
          return;
      }
    });
  }

  private pick(x: number, y: number): Selection | null {
    if (this.anim) return null;
    return this.top.pick(x, y, this.cam);
  }

  private hover(x: number, y: number): void {
    this.canvas.style.cursor = this.pick(x, y) ? 'pointer' : 'grab';
  }

  private click(x: number, y: number): void {
    this.select(this.pick(x, y));
  }

  // ------------------------------------------------------------------ levels
  /** The level on the sheet. */
  get top(): Level {
    return this.stack[this.stack.length - 1]!;
  }

  get level(): LevelKind {
    return this.top.kind;
  }

  /** The open region, if any (the System stays under it as context). */
  get region(): RegionLevel | null {
    return (this.stack.find((l) => l instanceof RegionLevel) as RegionLevel | undefined) ?? null;
  }

  /** Evergreen's neighbourhood and feeder 1105, once built. */
  get feederLevel(): FeederLevel | null {
    return (this.kids.get('site:EVERGREEN') as FeederLevel | undefined) ?? null;
  }

  /** Moss Landing Unit 1, once built. */
  get plantLevel(): PlantLevel | null {
    return (this.kids.get('plant:ML1') as PlantLevel | undefined) ?? null;
  }

  private updateCrumbs(): void {
    const c = this.crumbs;
    c.replaceChildren();
    this.stack.forEach((l, i) => {
      if (i) {
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '›';
        c.appendChild(sep);
      }
      // a level's name can carry figures (a feeder's number): it comes from the data like any other
      const name = l instanceof RegionLevel ? dataText(l.name, data(`network.region.${l.id}.name`)) : /\d/.test(l.name) ? dataText(l.name, data(`level.${l.kind}.name`)) : document.createTextNode(l.name);
      if (i === this.stack.length - 1) {
        const here = document.createElement('span');
        here.className = 'here';
        here.append(name);
        c.appendChild(here);
      } else {
        const up = document.createElement('button');
        up.className = 'crumb';
        up.append(name);
        up.title = i === this.stack.length - 2 ? 'Up one level (Esc)' : 'Back to this level';
        up.addEventListener('click', () => this.closeTo(i));
        c.appendChild(up);
      }
    });
  }

  /** The ground point (y = 0) that projects to the same place on screen as p. */
  private groundUnder(p: Vec3): [number, number] {
    const [vx, vy] = projectToView(p[0], p[1], p[2]);
    const [ax, ay] = projectToView(1, 0, 0);
    const [bx, by] = projectToView(0, 0, 1);
    const det = ax * by - bx * ay;
    return [(vx * by - bx * vy) / det, (ax * vy - vx * ay) / det];
  }

  /** Where the camera must be (in the level's frame) for the level to fill the free area. */
  private levelFit(l: Level): { x: number; z: number; zoom: number } {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of l.fitPoints()) {
      const [vx, vy] = projectToView(p[0], p[1], p[2]);
      x0 = Math.min(x0, vx);
      x1 = Math.max(x1, vx);
      y0 = Math.min(y0, vy);
      y1 = Math.max(y1, vy);
    }
    const free = this.freeRect(true); // levels open with their balance in the inspector
    const zoom = Math.min(free.w / (x1 - x0), (free.h - 30) / (y1 - y0)) * 0.94;
    // the ground point under the middle of the box
    const [ax, ay] = projectToView(1, 0, 0);
    const [bx, by] = projectToView(0, 0, 1);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const det = ax * by - bx * ay;
    return { x: (cx * by - bx * cy) / det, z: (ax * cy - cx * ay) / det, zoom };
  }

  private fitZooms = new Map<Level, number>();
  /** The zoom that fits a level to the free area (cached until the window changes). */
  private fitZoom(l: Level): number {
    let z = this.fitZooms.get(l);
    if (z === undefined) {
      z = this.levelFit(l).zoom;
      this.fitZooms.set(l, z);
    }
    return z;
  }

  // ------------------------------------------------------------------ the zoom tree
  /**
   * The places in a level that have a level of their own. Every System node has one:
   * Evergreen opens into its neighbourhood (feeder 1105 and the substation at its
   * head), every other station into its yard. Inside: Moss Landing's Unit 1 (then each
   * of its generators), Evergreen's substation, and every pole-top transformer's service.
   */
  private portalsOf(l: Level): Portal[] {
    let ps = this.portalLists.get(l);
    if (ps) return ps;
    ps = [];
    if (l === this.system) {
      for (const s of this.system.sites) {
        const id = s.id;
        ps.push({
          key: `site:${id}`,
          anchor: [s.pos[0], 0, s.pos[2]],
          ratio: 1000,
          sel: { kind: 'site', id },
          label: `site:${id}`,
          make: () => (id === 'EVERGREEN' ? new FeederLevel(this.feederModel(), this.grid) : new SiteLevel(this.grid, id)),
        });
      }
    } else if (l instanceof SiteLevel && l.unit1At) {
      ps.push({ key: 'plant:ML1', anchor: l.unit1At, ratio: 1, sel: { kind: 'plant', id: 'ML1' }, label: 'st:plant:ML1', make: () => new PlantLevel(this.grid) });
    } else if (l instanceof FeederLevel) {
      ps.push({ key: 'substation', anchor: l.substationAt, ratio: 1, sel: { kind: 'dist', what: 'bank', id: 'EV-BANK' }, label: 'fd:sub', make: () => new SubstationLevel(this.grid) });
      for (const t of this.feederModel().layout.transformers)
        ps.push({ key: `service:${t.id}`, anchor: l.transformerAt(t.id), ratio: 1, sel: { kind: 'dist', what: 'transformer', id: t.id }, make: () => new ServiceLevel(this.feederModel(), t.id) });
    } else if (l instanceof PlantLevel) {
      for (const u of ['GT1', 'GT2', 'ST'])
        ps.push({ key: `machine:${u}`, anchor: l.generatorAt(u), ratio: 1, sel: { kind: 'equip', what: 'generator', id: `${l.plantId}-${u}` }, label: `eq:gen:${u}`, make: () => new MachineLevel(this.grid, `${l.plantId}-${u}`) });
    }
    this.portalLists.set(l, ps);
    return ps;
  }

  private levelPortal = new Map<Level, Portal>();
  private built = 0;
  /** The level a portal opens into (built once, then kept). */
  private child(p: Portal): Level {
    let l = this.kids.get(p.key);
    if (!l) {
      l = p.make();
      l.group.matrixAutoUpdate = false;
      this.kids.set(p.key, l);
      this.levelPortal.set(l, p);
      this.built++;
    }
    return l;
  }

  /**
   * Where a child starts to unfold and where it is handed the sheet, in its parent's
   * px/unit: at the hand-off it fills HANDOFF of its own fit; it starts BAND times
   * further out — but never before its parent has itself been handed the sheet.
   */
  private zooms(p: Portal): { zIn: number; zOut: number } {
    let zz = this.bandZooms.get(p.key);
    if (!zz) {
      const c = this.child(p);
      const kind = p.ratio > 1 ? 'deep' : 'near';
      const zOut = this.fitZoom(c) * p.ratio * HANDOFF[kind];
      let zIn = zOut / BAND[kind];
      const up = this.parentPortalOf(p);
      if (up) {
        // not before the parent has the sheet, and not in the view that fits the parent
        // (a level at rest shows its children folded) — so long as the band keeps some length
        const hand = this.zooms(up).zOut / up.ratio;
        zIn = Math.min(Math.max(zIn, hand * 1.08, this.fitZoom(this.child(up)) * 1.15), zOut / 1.6);
      }
      zz = { zIn, zOut };
      this.bandZooms.set(p.key, zz);
    }
    return zz;
  }

  /** The zoom a level settles at when the camera arrives: its fit, with its children folded. */
  private settleZoom(l: Level): number {
    let z = this.fitZoom(l);
    const ps = this.portalsOf(l);
    if (ps.length && ps.length <= 4) for (const p of ps) z = Math.min(z, this.zooms(p).zIn / 1.12);
    return z;
  }

  /** The portal of the level that holds `p` (null: it is one of the System's). */
  private parentPortalOf(p: Portal): Portal | null {
    for (const [l, q] of this.levelPortal) if (this.portalLists.get(l)?.includes(p)) return q;
    return null;
  }

  /** A child's point in its parent's frame, and back. */
  private place(p: Portal, c: Level, v: Vec3): Vec3 {
    return [p.anchor[0] + (v[0] - c.seat[0]) / p.ratio, p.anchor[1] + (v[1] - c.seat[1]) / p.ratio, p.anchor[2] + (v[2] - c.seat[2]) / p.ratio];
  }

  private toChild(p: Portal, c: Level, v: Vec3): Vec3 {
    return [c.seat[0] + (v[0] - p.anchor[0]) * p.ratio, c.seat[1] + (v[1] - p.anchor[1]) * p.ratio, c.seat[2] + (v[2] - p.anchor[2]) * p.ratio];
  }

  private placeMatrix(p: Portal, c: Level): THREE.Matrix4 {
    const k = 1 / p.ratio;
    return new THREE.Matrix4().makeTranslation(p.anchor[0], p.anchor[1], p.anchor[2]).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(-c.seat[0], -c.seat[1], -c.seat[2]));
  }

  /** Portals in view: where each node is on the sheet, and its zooms. */
  private candidates: Array<{ p: Portal; x: number; y: number; zIn: number; zOut: number; box: [number, number, number, number] }> = [];

  /** The least zoom at which a level's children are worth looking for (building them costs). */
  private bandGate(l: Level): number {
    if (l === this.system) return 5;
    if (l instanceof FeederLevel) return this.fitZoom(l) * 1.4;
    return 0;
  }

  /** Which children are unfolding in the level on the sheet, and how far: from the zoom. */
  private updateBands(): void {
    const top = this.top;
    const z = this.cam.pxPerUnit;
    this.candidates = [];
    this.reach = 0;
    const ps = this.portalsOf(top);
    const W = this.cam.width;
    const H = this.cam.height;
    if (ps.length && z >= this.bandGate(top)) {
      const v = new THREE.Vector3();
      const s2 = new THREE.Vector2();
      const budget = this.built + 4; // build a few levels per frame at most
      for (const p of ps) {
        this.cam.worldToScreen(v.set(p.anchor[0], p.anchor[1], p.anchor[2]), s2);
        const ax = s2.x;
        const ay = s2.y;
        // far off the sheet: skip before building anything
        if (ax < -2 * W || ax > 3 * W || ay < -2 * H || ay > 3 * H) continue;
        if (!this.kids.has(p.key) && this.built >= budget) continue;
        const zz = this.zooms(p);
        const c = this.kids.get(p.key)!;
        // the child's extent, whole, on the sheet
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const q of c.fitPoints()) {
          this.cam.worldToScreen(v.set(...this.place(p, c, q)), s2);
          x0 = Math.min(x0, s2.x);
          x1 = Math.max(x1, s2.x);
          y0 = Math.min(y0, s2.y);
          y1 = Math.max(y1, s2.y);
        }
        if (x1 < 0 || x0 > W || y1 < 0 || y0 > H) continue;
        this.candidates.push({ p, x: ax, y: ay, ...zz, box: [x0, y0, x1, y1] });
        this.reach = Math.max(this.reach, zz.zOut * 1.06);
      }
    }
    const f = this.focusPoint();
    const dist = (c: (typeof this.candidates)[number]) => {
      const [x0, y0, x1, y1] = c.box;
      const dx = Math.max(x0 - f.x, 0, f.x - x1);
      const dy = Math.max(y0 - f.y, 0, f.y - y1);
      return Math.hypot(c.x - f.x, c.y - f.y) + 4 * Math.hypot(dx, dy);
    };
    const live = this.candidates.filter((c) => z > c.zIn).sort((a, b) => dist(a) - dist(b)).slice(0, MAX_BANDS);
    this.focusBand = live[0]?.p.key ?? null;
    const keep = new Set(live.map((c) => c.p.key));
    for (const [key, b] of this.bands)
      if (!keep.has(key)) {
        this.dropBand(b);
        this.bands.delete(key);
      }
    for (const c of live) {
      const m = Math.max(0, Math.min(1, Math.log(z / c.zIn) / Math.log(c.zOut / c.zIn)));
      let b = this.bands.get(c.p.key);
      if (!b) {
        const level = this.child(c.p);
        if (this.current) level.applySnapshot(this.current);
        level.highlight(null);
        this.scene.add(level.group);
        b = { portal: c.p, level, zIn: c.zIn, zOut: c.zOut, m: -1 };
        this.bands.set(c.p.key, b);
        if (level.needsDetail && this.current && !this.current.feeder) this.requestSolve();
      }
      if (m !== b.m) {
        b.m = m;
        b.level.morph = m;
        this.yieldBand(top, b.portal, b.level, m);
        this.cameraDirty = true;
      }
    }
  }

  /** The child nearest where the reader zooms: the one the sheet will go to. */
  private focusBand: string | null = null;

  private focusPoint(): { x: number; y: number } {
    if (this.focus) return this.focus;
    const r = this.freeRect();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  private dropBand(b: Band): void {
    this.scene.remove(b.level.group);
    this.yieldBand(this.top, b.portal, b.level, 0);
  }

  /**
   * A parent gives way to its unfolding child: what the child draws in its place
   * recedes, and a System circuit ending at that node now ends where the child's own
   * stroke takes it up (following that stroke as it unfolds).
   */
  private yieldBand(parent: Level, p: Portal, c: Level, m: number): void {
    parent.yieldTo?.(p.key, m);
    if (parent !== this.system || !c.exits) return;
    const siteId = p.key.slice(5);
    for (const x of c.exits()) {
      if (m <= 0) {
        this.system.setCircuitEnd(x.branch, siteId, null);
        continue;
      }
      const t = smoothstep(x.stagger, x.stagger + 0.5, m);
      const P = this.place(p, c, x.at);
      const a = p.anchor;
      this.system.setCircuitEnd(x.branch, siteId, [a[0] + (P[0] - a[0]) * t, a[1] + (P[1] - a[1]) * t, a[2] + (P[2] - a[2]) * t]);
    }
  }

  /** Is the camera to hand the sheet down (a child whole in view) or up (zoomed out past the hand-off)? */
  private checkHandoff(): void {
    if (this.anim || this.flight || this.diving || this.lens) return;
    const z = this.cam.pxPerUnit;
    const p = this.path[this.path.length - 1];
    if (p && z < (this.zooms(p).zOut / p.ratio) * 0.94) {
      this.handBack();
      return;
    }
    const f = this.focusPoint();
    let best: Band | null = null;
    let bd = Infinity;
    for (const b of this.bands.values()) {
      if (z < b.zOut) continue;
      const c = this.candidates.find((x) => x.p === b.portal);
      if (!c) continue;
      const d = Math.hypot(c.x - f.x, c.y - f.y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (best) this.handOff(best);
  }

  /** The child is whole: the sheet (and the camera) go over to its own frame. */
  private handOff(b: Band): void {
    const parent = this.top;
    const p = b.portal;
    const c = b.level;
    const t = this.cam.target;
    const v = this.toChild(p, c, [t.x, 0, t.z]);
    this.cam.target.set(v[0], 0, v[2]);
    this.cam.pxPerUnit /= p.ratio;
    this.cam.update();
    if (this.focus) this.focus = { ...this.focus };
    for (const o of this.bands.values()) if (o !== b) this.dropBand(o);
    this.bands.clear();
    b.m = 1;
    c.morph = 1;
    this.yieldBand(parent, p, c, 1);
    this.stack.push(c);
    this.path.push(p);
    this.afterLevelChange();
  }

  /** Zoomed back out past the hand-off: the sheet returns to the parent, the child unfolding in it. */
  private handBack(): void {
    for (const o of this.bands.values()) this.dropBand(o);
    this.bands.clear();
    const c = this.stack.pop()!;
    const p = this.path.pop()!;
    const t = this.cam.target;
    const v = this.place(p, c, [t.x, 0, t.z]);
    this.cam.target.set(v[0], 0, v[2]);
    this.cam.pxPerUnit *= p.ratio;
    this.cam.update();
    const zz = this.zooms(p);
    this.bands.set(p.key, { portal: p, level: c, zIn: zz.zIn, zOut: zz.zOut, m: 1 });
    this.afterLevelChange();
  }

  /** Can this level show this selection? */
  private selectionFits(l: Level, sel: Selection): boolean {
    if (l === this.system) return sel.kind === 'site' || sel.kind === 'branch' || sel.kind === 'plant';
    if (l instanceof SiteLevel) return (sel.kind === 'site' && sel.id === l.siteId) || sel.kind === 'branch' || sel.kind === 'plant';
    if (l instanceof FeederLevel || l instanceof SubstationLevel || l instanceof ServiceLevel) return sel.kind === 'dist' || sel.kind === 'branch';
    if (l instanceof PlantLevel || l instanceof MachineLevel) return sel.kind === 'equip';
    return false;
  }

  /** The sheet has a new level on it: its crumbs, key, labels and balance. */
  private afterLevelChange(): void {
    this.applyMatrices();
    if (this.selection && !this.selectionFits(this.top, this.selection)) this.selection = null;
    this.focusSites = this.system.highlight(this.top === this.system ? this.selection : null);
    if (this.top !== this.system) this.top.highlight(this.selection);
    this.updateCrumbs();
    this.labelKey = '';
    this.updateLegend();
    // the level may draw what the last solve did not include (the substation and feeder)
    this.requestSolve();
    if (this.stack.length > 1 || this.selection) this.inspect();
    else this.inspector.hide();
    if (!this.honesty.root.hidden) this.honesty.show(this.top.kind, this.honestyContext());
    this.cameraDirty = true;
  }

  private needsDetail(): boolean {
    return this.stack.some((l) => l.needsDetail) || [...this.bands.values()].some((b) => b.level.needsDetail);
  }

  private setMatrix(g: THREE.Object3D, m: THREE.Matrix4): void {
    g.matrixAutoUpdate = false;
    g.matrix.copy(m);
    g.matrixWorldNeedsUpdate = true;
  }

  /** Every drawn level in the frame of the one on the sheet. */
  private applyMatrices(): void {
    if (this.lens) return;
    const n = this.stack.length;
    this.setMatrix(this.top.group, new THREE.Matrix4());
    this.scaleOf.clear();
    this.scaleOf.set(this.top, 1);
    let M = new THREE.Matrix4();
    let k = 1;
    for (let i = n - 2; i >= 0; i--) {
      const p = this.path[i]!;
      const c = this.stack[i + 1]!;
      M = M.clone().multiply(this.placeMatrix(p, c).invert());
      k *= p.ratio;
      this.setMatrix(this.stack[i]!.group, M);
      this.scaleOf.set(this.stack[i]!, k);
    }
    for (const b of this.bands.values()) {
      this.setMatrix(b.level.group, this.placeMatrix(b.portal, b.level));
      this.scaleOf.set(b.level, 1 / b.portal.ratio);
    }
  }

  /**
   * The levels around the one on the sheet recede, so it reads first: its parent to
   * half ink, further up to a third — except the System around a station, whose
   * circuits are the station's own, carried on. The sheet's own level recedes the same
   * way as a child unfolds in it, so nothing jumps at the hand-off.
   */
  private applyContextInk(): void {
    const ink = (l: Level, v: number) => {
      l.group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (m?.uniforms?.uInk) m.uniforms.uInk.value = v;
      });
    };
    const n = this.stack.length;
    // how far the child in focus has unfolded: the levels recede one step as it does
    let mMax = 0;
    for (const b of this.bands.values()) mMax = Math.max(mMax, b.m);
    const s = this.lens ? 0 : smoothstep(0.55, 1, mMax);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
    for (let i = 0; i < n; i++) {
      const l = this.stack[i]!;
      const d = n - 1 - i + s;
      const v = this.lens ? 1 : l === this.system ? (d <= 1 ? 1 : lerp(1, 0.32, d - 1)) : d <= 1 ? lerp(1, 0.5, d) : lerp(0.5, 0.32, d - 1);
      ink(l, v);
    }
    // the child in focus in full ink; its neighbours recede with the sheet they unfold in
    const selfInk = this.lens ? 1 : this.top === this.system ? 1 : 1 - 0.5 * s;
    for (const b of this.bands.values()) ink(b.level, b.portal.key === this.focusBand ? 1 : selfInk);
  }

  /** The levels drawn this frame. */
  private drawn(): Level[] {
    return [...this.stack, ...[...this.bands.values()].map((b) => b.level)];
  }

  // ------------------------------------------------------------------ moving through the tree
  /** A dive or an ascent in progress (the hand-offs are the move's own). */
  private diving = false;

  /**
   * Zoom into a child of the level on the sheet: the camera closes on its node (held
   * steady on the sheet) through the band, so it unfolds as the zoom passes, and is
   * handed its frame; then settles on it.
   */
  dive(key: string): Promise<void> {
    return new Promise((resolve) => {
      if (this.anim || this.flight || this.diving || this.lens) return resolve();
      const p = this.portalsOf(this.top).find((x) => x.key === key);
      if (!p) return resolve();
      this.scrubber.setPlaying(false);
      this.diving = true;
      const zz = this.zooms(p);
      const free = this.freeRect(true);
      const z0 = this.cam.pxPerUnit;
      const z1 = zz.zOut * 1.001;
      const s0 = this.cam.worldToScreen(new THREE.Vector3(...p.anchor), new THREE.Vector2());
      const s1 = { x: free.x + free.w / 2, y: free.y + free.h / 2 };
      const L = Math.log(z1 / z0);
      const ms = Math.max(900, Math.min(2600, 420 * Math.abs(L)));
      this.fly(
        ms,
        inOut,
        (e) => {
          const x = s0.x + (s1.x - s0.x) * e;
          const y = s0.y + (s1.y - s0.y) * e;
          this.focus = { x, y };
          this.placeAt(p.anchor, x, y, z0 * Math.exp(L * e));
        },
        () => {
          this.updateBands();
          let b = this.bands.get(key);
          if (!b) {
            const c = this.child(p);
            if (this.current) c.applySnapshot(this.current);
            this.scene.add(c.group);
            b = { portal: p, level: c, zIn: zz.zIn, zOut: zz.zOut, m: 1 };
            this.bands.set(key, b);
          }
          this.handOff(b);
          // settle: the child fitted to the free area, its own children still folded
          const to = this.cameraFor({ ...this.levelFit(b.level), zoom: this.settleZoom(b.level) });
          const from = { t: this.cam.target.clone(), z: this.cam.pxPerUnit };
          this.fly(
            650,
            easeOut,
            (e) => {
              this.cam.target.lerpVectors(from.t, to.target, e);
              this.cam.pxPerUnit = from.z * (to.zoom / from.z) ** e;
            },
            () => {
              this.diving = false;
              this.focus = null;
              resolve();
            },
          );
        },
      );
    });
  }

  /**
   * Zoom out of the level on the sheet, one level up: the camera draws back to the
   * hand-off, hands the sheet back, and the level folds into its node as the zoom goes on.
   */
  ascend(): Promise<void> {
    return new Promise((resolve) => {
      if (this.anim || this.flight || this.diving) return resolve();
      if (this.lens) {
        this.closeLens(() => resolve());
        return;
      }
      const p = this.path[this.path.length - 1];
      if (!p) return resolve();
      this.scrubber.setPlaying(false);
      this.diving = true;
      const c = this.top;
      const zz = this.zooms(p);
      const free = this.freeRect(true);
      const s1 = { x: free.x + free.w / 2, y: free.y + free.h / 2 };
      const s0 = this.cam.worldToScreen(new THREE.Vector3(...c.seat), new THREE.Vector2());
      const z0 = this.cam.pxPerUnit;
      const zh = (zz.zOut / p.ratio) * 0.92;
      const L1 = Math.log(zh / z0);
      this.fly(
        Math.max(350, Math.min(1100, 380 * Math.abs(L1))),
        (u) => u * u,
        (e) => this.placeAt(c.seat, s0.x + (s1.x - s0.x) * e, s0.y + (s1.y - s0.y) * e, z0 * Math.exp(L1 * e)),
        () => {
          this.handBack();
          const z1 = this.cam.pxPerUnit;
          const L2 = Math.log((zz.zIn * 0.7) / z1);
          this.fly(
            1300,
            easeOut,
            (e) => {
              this.focus = s1;
              this.placeAt(p.anchor, s1.x, s1.y, z1 * Math.exp(L2 * e));
            },
            () => {
              this.diving = false;
              this.focus = null;
              resolve();
            },
          );
        },
      );
    });
  }

  /**
   * For the screenshot harness and tests: hold the camera on a node of the level on the
   * sheet at the zoom where its child is `m` of the way unfolded.
   */
  holdBand(key: string, m: number): void {
    const p = this.portalsOf(this.top).find((x) => x.key === key);
    if (!p) return;
    const zz = this.zooms(p);
    const free = this.freeRect();
    const x = free.x + free.w / 2;
    const y = free.y + free.h / 2;
    this.focus = { x, y };
    this.placeAt(p.anchor, x, y, zz.zIn * (zz.zOut / zz.zIn) ** m);
    this.cameraDirty = true;
  }

  /** Go to a place in the tree (a path of portal keys from the System), each move a real zoom. */
  async goTo(keys: string[]): Promise<void> {
    await this.waitFor(() => !this.transitioning);
    if (this.lens) await this.ascend();
    let k = 0;
    while (k < this.path.length && k < keys.length && this.path[k]!.key === keys[k]) k++;
    while (this.path.length > k) {
      const before = this.path.length;
      await this.ascend();
      if (this.path.length >= before) break;
    }
    for (let i = k; i < keys.length; i++) {
      const before = this.path.length;
      await this.dive(keys[i]!);
      if (this.path.length <= before) break;
    }
  }

  /** Dive into whatever the selection is a node for, one level down. */
  openFrom(sel: Selection): void {
    const top = this.top;
    if (top instanceof SubstationLevel && sel.kind === 'dist' && sel.what === 'feeder') {
      void this.ascend();
      return;
    }
    let s = sel;
    if (top instanceof FeederLevel && sel.kind === 'dist' && sel.what === 'home') {
      const h = this.feederModel().layout.homes.find((x) => x.id === sel.id);
      if (h) s = { kind: 'dist', what: 'transformer', id: h.transformer };
    }
    const same = (a: Selection, b: Selection) => a.kind === b.kind && (a as { id?: string }).id === (b as { id?: string }).id && (a as { what?: string }).what === (b as { what?: string }).what;
    const p = this.portalsOf(top).find((x) => same(x.sel, s));
    if (p) void this.dive(p.key);
  }

  /** Double-click on the sheet away from anything pickable: dive into the nearest node there. */
  private diveNear(sx: number, sy: number): void {
    let best: Portal | null = null;
    let bd = 40;
    for (const c of this.candidates) {
      const d = Math.hypot(c.x - sx, c.y - sy);
      if (d < bd) {
        bd = d;
        best = c.p;
      }
    }
    if (best) void this.dive(best.key);
  }

  /** Close the level on the sheet: fold it back into its node one level up. */
  closeTop(done?: () => void): void {
    if (this.stack.length < 2) return;
    void this.ascend().then(() => done?.());
  }

  /** Close levels until the one at `index` is on the sheet. */
  closeTo(index: number): void {
    if (this.lens) {
      void this.ascend();
      return;
    }
    void this.goTo(this.path.slice(0, index).map((p) => p.key));
  }

  private feeder: Feeder | null = null;
  /** The feeder model the drawing thread keeps (same topology as the solver's). */
  feederModel(): Feeder {
    this.feeder ??= makeFeeder();
    return this.feeder;
  }

  /** The keys from the System to a named place (for the guided route and the harness). */
  keysFor(place: 'system' | 'region' | 'site' | 'feeder' | 'substation' | 'service' | 'plant' | 'machine'): string[] {
    const outletT = this.feederModel().layout.homes.find((h) => h.id === this.feederModel().layout.outlet.home)!.transformer;
    switch (place) {
      case 'site':
        return ['site:TESLA'];
      case 'feeder':
        return ['site:EVERGREEN'];
      case 'substation':
        return ['site:EVERGREEN', 'substation'];
      case 'service':
        return ['site:EVERGREEN', `service:${outletT}`];
      case 'plant':
        return ['site:MOSS_LANDING', 'plant:ML1'];
      case 'machine':
        return ['site:MOSS_LANDING', 'plant:ML1', 'machine:GT1'];
      default:
        return [];
    }
  }

  /** Back-compat for tests and the guided route: the last element names the place. */
  async navigate(path: Array<'region' | 'site' | 'substation' | 'feeder' | 'service' | 'plant' | 'machine'>): Promise<void> {
    const want = path[path.length - 1];
    if (want === 'region') {
      await this.goTo([]);
      this.enterRegion('bay');
      await this.waitFor(() => this.level === 'region' && !this.transitioning);
      return;
    }
    await this.goTo(this.keysFor(want ?? 'system'));
  }

  enterFeeder(): void {
    void this.goTo(this.keysFor('feeder'));
  }

  enterSubstation(): void {
    void this.goTo(this.keysFor('substation'));
  }

  enterService(transformerId: string): void {
    void this.goTo(['site:EVERGREEN', `service:${transformerId}`]);
  }

  enterPlant(): void {
    void this.goTo(this.keysFor('plant'));
  }

  enterMachine(unit: string): void {
    void this.goTo(['site:MOSS_LANDING', 'plant:ML1', `machine:${unit}`]);
  }

  exitRegion(): void {
    this.closeTo(0);
  }

  // ------------------------------------------------------------------ the Region lens
  /**
   * The Region lens: a region's network pulled apart into one layer per voltage. Not a
   * level of the zoom tree — a way of looking at the System — opened from a place's
   * inspector and folded away again.
   */
  enterRegion(id: RegionId): void {
    if (this.top !== this.system || this.anim || this.flight || this.diving || id === 'tie') return;
    this.scrubber.setPlaying(false);
    for (const b of this.bands.values()) this.dropBand(b);
    this.bands.clear();
    let r = this.regions.get(id);
    if (!r) {
      r = new RegionLevel(this.grid, id);
      this.regions.set(id, r);
    }
    const reg = r;
    const f = this.levelFit(reg);
    const saved = { target: this.cam.target.clone(), zoom: this.cam.pxPerUnit };
    this.flyTo(f.x + reg.center[0], f.z + reg.center[1], f.zoom, 700, () => {
      // hand-off: the region's frame, its drawing folded flat exactly over the System sheet's
      if (this.current) reg.applySnapshot(this.current);
      reg.highlight(this.selection);
      reg.morph = 0;
      this.scene.add(reg.group);
      this.system.group.matrixAutoUpdate = true;
      this.system.group.position.set(-reg.center[0], 0, -reg.center[1]);
      this.cam.target.x -= reg.center[0];
      this.cam.target.z -= reg.center[1];
      this.system.setNetworkShown(false, new Set(reg.siteIds), 0);
      this.stack.push(reg);
      this.lens = { saved };
      this.labels.set([]);
      this.updateCrumbs();
      this.updateLegend();
      this.tween(1500, (e) => this.foldFrame(reg, e), () => {
        this.labelKey = '';
        this.updateLegend();
        this.inspect();
      });
    }, this.freeRect(true));
  }

  private closeLens(done?: () => void): void {
    const r = this.top as RegionLevel;
    if (!this.lens || !(r instanceof RegionLevel) || this.anim) return;
    this.labels.set([]);
    this.select(null);
    this.tween(1100, (e) => this.foldFrame(r, 1 - e), () => {
      this.scene.remove(r.group);
      this.system.group.position.set(0, 0, 0);
      this.cam.target.x += r.center[0];
      this.cam.target.z += r.center[1];
      this.system.setNetworkShown(true);
      this.stack.pop();
      this.lens = null;
      this.afterLevelChange();
      done?.();
    });
  }

  /** One frame of the fold: layers rise, and the System's symbols give way to the Region's. */
  private foldFrame(r: RegionLevel, m: number): void {
    r.morph = m;
    this.system.setNetworkShown(false, new Set(r.siteIds), Math.max(0, Math.min(1, (m - 0.35) / 0.5)));
    this.cameraDirty = true;
  }

  private tween(ms: number, frame: (e: number) => void, done: () => void): void {
    if (this.reducedMotion) {
      frame(1);
      done();
      return;
    }
    frame(0);
    this.anim = { t0: performance.now(), ms, frame, done };
  }

  private advanceAnim(now: number): void {
    const a = this.anim;
    if (!a) return;
    const u = Math.min(1, (now - a.t0) / a.ms);
    let e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    if (this.freezeMorph !== null) e = Math.min(e, this.freezeMorph);
    a.frame(e);
    if (u >= 1 && this.freezeMorph === null) {
      this.anim = null;
      a.done();
    }
  }

  get transitioning(): boolean {
    return !!this.anim || !!this.flight || this.diving;
  }

  /** Resolve once `cond` holds (checked each frame), or reject after `ms`. */
  waitFor(cond: () => boolean, ms = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const check = () => {
        if (cond()) resolve();
        else if (performance.now() - t0 > ms) reject(new Error('timed out'));
        else requestAnimationFrame(check);
      };
      check();
    });
  }

  /** The sheet shows the answer to the latest request. */
  solved(): Promise<void> {
    return this.waitFor(() => !!this.current && this.current.seq === this.seq && !this.inFlight && !this.stale, 60000);
  }

  /** The camera target and zoom that put a fit's ground point in the free area's middle. */
  private cameraFor(fit: { x: number; z: number; zoom: number }): { target: THREE.Vector3; zoom: number } {
    const save = { t: this.cam.target.clone(), z: this.cam.pxPerUnit };
    this.cam.pxPerUnit = fit.zoom;
    this.cam.target.set(fit.x, 0, fit.z);
    this.cam.update();
    const free = this.freeRect(true);
    const g0 = this.cam.screenToGround(this.cam.width / 2, this.cam.height / 2);
    const g1 = this.cam.screenToGround(free.x + free.w / 2, free.y + free.h / 2);
    const target = new THREE.Vector3(fit.x - (g1.x - g0.x), 0, fit.z - (g1.z - g0.z));
    this.cam.pxPerUnit = save.z;
    this.cam.target.copy(save.t);
    this.cam.update();
    return { target, zoom: fit.zoom };
  }


  /** Keyboard: step through places in order of importance. */
  private cycle(dir: number): void {
    const order = this.system.labels.filter((l) => l.kind === 'site').sort((a, b) => b.priority - a.priority).map((l) => l.id.slice(5));
    const cur = this.selection?.kind === 'site' ? order.indexOf(this.selection.id) : -1;
    const next = order[(cur + dir + order.length) % order.length]!;
    this.select({ kind: 'site', id: next });
  }

  select(sel: Selection | null): void {
    this.selection = sel;
    this.focusSites = this.system.highlight(sel);
    if (this.top !== this.system) this.focusSites = this.top.highlight(sel);
    if (!sel && this.stack.length === 1) this.inspector.hide();
    else this.inspect();
    this.refreshLabels();
  }

  private inspect(): void {
    const s = this.current;
    const sel = this.selection;
    if (!s) return;
    // a side panel has the column: the inspector waits under it; the honesty panel follows the view
    if (!this.honesty.root.hidden || !this.glossary.root.hidden) {
      this.inspectorUnder = true;
      if (!this.honesty.root.hidden) this.honesty.show(this.top.kind, this.honestyContext());
      return;
    }
    const top = this.top;
    const panels = () => this.panelsFor(sel, s);
    const show = (header: string, v: { name: string | Node; kind: Node; intro?: Node; sections: Section[] }, actions: Action[] = []) =>
      this.inspector.show({ header, name: v.name, kind: v.kind, actions, panels, ...(v.intro ? { intro: v.intro } : {}), sections: v.sections });
    if (top instanceof SubstationLevel) {
      const f = this.feederModel();
      if (!sel) return show('Substation', substationView(this.grid, s));
      if (sel.kind === 'dist') {
        if (sel.what === 'bank') return show('Selected transformer', bankView(s, f));
        if (sel.what === 'bus60' || sel.what === 'bus12') return show('Selected bus', busView(this.grid, s, sel.what, f));
        if (sel.what === 'feeder') return show('Selected feeder', feederBreakerView(s, f), [{ label: 'Follow feeder 1105', title: 'Out of the yard and down the street (Enter)', run: () => void this.ascend() }]);
      }
    }
    if (top instanceof FeederLevel) {
      const f = this.feederModel();
      const ev = this.feederEvent;
      if (ev && !sel) {
        const tp = this.freezeFault ?? (this.faultPlaying ? (performance.now() - this.faultStart) / 1000 : ev.prot.clearedAt + 1.2);
        return show('Fault', feederFaultView(f, s, ev, tp), [{ label: 'Repair and restore', title: 'A crew repairs the fault; every device closes again', run: () => this.clearFeederFault() }]);
      }
      if (!sel) {
        const v = feederView(s, f);
        // reliability: from the interval's fault currents (it changes little with the hour); computed once per interval
        const fs = s.feeder && !this.feederOpen.size ? this.faultStudyNow() : null;
        if (fs && s.feeder && (!this.reliabilityCache || this.reliabilityCache.t !== s.t)) this.reliabilityCache = { t: s.t, run: simulateYears(f, s, feederSource(this.grid, fs)) };
        const rel = this.reliabilityCache && this.reliabilityCache.t === s.t ? reliabilitySection(this.reliabilityCache.run, s.t) : null;
        return show('Feeder', rel ? { ...v, sections: [...v.sections, rel] } : v, [{ label: 'Into the substation', title: 'Zoom into the yard at the head of the feeder', run: () => void this.dive('substation') }]);
      }
      // a fault can be put on any primary line or pole
      const faultActs = (node: string): Action[] => {
        const n = f.base.nodes.get(node);
        if (!n || n.kind !== 'primary' || node.startsWith('EV-')) return [];
        const acts: Action[] = [
          { label: 'Fault here, temporary', title: 'A flashover that goes out once the current stops', run: () => this.faultFeeder(node, false) },
          { label: 'Fault here, permanent', title: 'Something stays in contact: protection must isolate it', run: () => this.faultFeeder(node, true) },
        ];
        if (n.phases.length === 3) acts.push({ label: 'Three-phase fault', title: 'All three phases together, permanent', run: () => this.faultFeeder(node, true, '3ph') });
        return acts;
      };
      if (sel.kind === 'dist') {
        if (sel.what === 'line' || sel.what === 'device') {
          const b = f.base.branches.find((x) => x.id === sel.id);
          return show('Selected', feederElementView(s, f, sel.id, sel.what), b && sel.what === 'line' ? faultActs(b.to) : []);
        }
        if (sel.what === 'transformer')
          return show('Selected transformer', distTransformerView(s, f, sel.id), [{ label: 'Zoom into this service', title: 'Down the pole to the homes (Enter)', run: () => void this.dive(`service:${sel.id}`) }]);
        if (sel.what === 'home') {
          const h = f.layout.homes.find((x) => x.id === sel.id)!;
          return show('Selected home', homeView(s, f, sel.id), [{ label: 'Zoom into its service', title: 'Down the pole to this home (Enter)', run: () => void this.dive(`service:${h.transformer}`) }]);
        }
        if (sel.what === 'feeder') return show('Selected feeder', feederBreakerView(s, f));
      }
    }
    if (top instanceof ServiceLevel) {
      const f = this.feederModel();
      if (!sel) return show('Service', serviceView(s, f, top.transformerId));
      if (sel.kind === 'dist') {
        if (sel.what === 'outlet') return show('Selected outlet', outletTraceView(this.grid, s, f));
        if (sel.what === 'home') return show('Selected home', homeView(s, f, sel.id));
        if (sel.what === 'transformer') return show('Selected transformer', distTransformerView(s, f, sel.id));
      }
    }
    if (top instanceof PlantLevel) {
      const id = top.plantId;
      const tripped = this.plantOutages.has(id);
      const act: Action[] = [
        tripped
          ? { label: 'Restore the plant', title: 'Close its breakers again', run: () => this.restorePlant(id) }
          : { label: 'Trip the plant', title: 'Open all three units’ breakers at once and watch the frequency', run: () => this.tripPlant(id) },
      ];
      const trip = this.tripEvent?.plantId === id ? this.tripEvent : null;
      if (!sel) return show('Plant', plantView(this.grid, s, id, trip), act);
      if (sel.kind === 'equip') {
        const unit = sel.id.slice(id.length + 1);
        const more: Action[] = sel.what === 'generator' ? [{ label: 'Zoom into the generator', title: 'Into the machine (Enter)', run: () => void this.dive(`machine:${unit}`) }] : [];
        return show('Selected', equipView(this.grid, s, id, sel.what, sel.id), more);
      }
    }
    if (top instanceof MachineLevel) {
      const g = this.grid.gens.find((x) => x.id === top.genId)!;
      const sched = g.vset;
      const now = this.vset.get(g.index) ?? sched;
      const act: Action[] = [
        { label: 'Raise excitation', title: 'Voltage set-point up by 0.01 pu; the power flow re-solves', run: () => this.setExcitation(g.index, now + 0.01) },
        { label: 'Lower excitation', title: 'Voltage set-point down by 0.01 pu; the power flow re-solves', run: () => this.setExcitation(g.index, now - 0.01) },
      ];
      if (this.vset.has(g.index)) act.push({ label: 'As scheduled', run: () => this.setExcitation(g.index, null) });
      if (!sel || sel.kind === 'equip') {
        const v = machineView(this.grid, s, top.genId, now, sched);
        if (sel?.kind === 'equip') {
          const e = equipView(this.grid, s, top.genId.split('-')[0]!, sel.what, sel.id);
          return show('Selected', { ...e, sections: [...e.sections, ...v.sections] }, act);
        }
        return show('Generator', v, act);
      }
    }
    const siteActions = (id: string): Action[] => {
      const site = this.grid.sites.find((x) => x.id === id)!;
      const acts: Action[] = [];
      const p = this.portalsOf(this.top).find((x) => x.key === `site:${id}`);
      if (p) acts.push({ label: id === 'EVERGREEN' ? 'Zoom into the neighbourhood' : 'Zoom inside', title: 'Down into what this node stands for (Enter, or double-click)', run: () => void this.dive(p.key) });
      if (this.top === this.system && site.region !== 'tie')
        acts.push({ label: 'See the region in layers', title: `${REGIONS[site.region].name}, pulled apart by voltage`, run: () => this.enterRegion(site.region) });
      if (this.top instanceof SiteLevel && this.top.unit1At && id === this.top.siteId)
        acts.push({ label: 'Zoom into Unit 1', title: 'The combined-cycle plant beside the yard', run: () => void this.dive('plant:ML1') });
      return acts;
    };
    const siteShow = (header: string, id: string) => {
      const v = siteView(this.grid, s, id);
      const fs = this.faultStudyNow();
      const fsec = fs ? busFaultSection(this.grid, s, fs, id) : null;
      this.inspector.show({ header, name: v.name, kind: v.kind, actions: siteActions(id), panels, ...(v.intro ? { intro: v.intro } : {}), sections: fsec ? [...v.sections, fsec] : v.sections });
    };
    if (!sel) {
      // in a region with nothing selected: the region's own balance; in a yard, the station's
      if (top instanceof RegionLevel) show('Region', regionView(this.grid, s, top.id, top.siteIds));
      if (top instanceof SiteLevel) siteShow('Station', top.siteId);
      return;
    }
    if (sel.kind === 'dist') return;
    if (sel.kind === 'plant') {
      const g = this.grid.gens.find((x) => x.plant.id === sel.id);
      if (!g) return;
      const siteId = g.bus.site.id;
      siteShow('Selected plant', siteId);
      if (top instanceof SiteLevel && sel.id === 'ML1') this.inspector.show({ header: 'Selected plant', name: g.plant.name, kind: siteView(this.grid, s, siteId).kind, actions: [{ label: 'Zoom into Unit 1', title: 'Into the plant (Enter)', run: () => void this.dive('plant:ML1') }], panels, sections: siteView(this.grid, s, siteId).sections });
      return;
    }
    if (sel.kind === 'site') {
      siteShow('Selected place', sel.id);
    } else if (sel.kind === 'branch') {
      const k = sel.index;
      const isX = this.grid.branches[k]!.kind === 'transformer';
      const v = isX ? transformerView(this.grid, s, k) : branchView(this.grid, s, k);
      const out = this.outages.has(k);
      const what = isX ? 'transformer' : 'circuit';
      const actions: Action[] = [
        out
          ? { label: `Restore this ${what}`, title: 'Close its breakers again', run: () => this.restore(k) }
          : { label: `Trip this ${what}`, title: 'Open the breakers at both ends and solve again', run: () => this.trip(k) },
      ];
      if (this.outages.size > (out ? 1 : 0)) actions.push({ label: 'Restore everything', run: () => this.restore('all') });
      this.inspector.show({
        header: isX ? 'Selected transformer' : 'Selected circuit',
        name: dataText(v.name, data(`network.${isX ? 'xfmr' : 'line'}.${this.grid.branches[k]!.id}.name`)),
        kind: v.kind,
        actions,
        panels,
        ...(v.intro ? { intro: v.intro } : {}),
        sections: v.sections,
      });
    }
  }

  /** The working behind the current readout: each panel's arithmetic reproduces its result. */
  private panelsFor(sel: Selection | null, s: Snapshot): Panel[] {
    const top = this.top;
    const out: Array<Panel | null> = [];
    if (this.tripEvent && (top instanceof PlantLevel || sel?.kind === 'site')) out.push(frequencyPanel(this.tripEvent));
    if (top instanceof PlantLevel) out.push(plantPanel(this.grid, s, top.plantId));
    else if (top instanceof MachineLevel) out.push(machinePanel(this.grid, s, top.genId));
    else if (top instanceof SubstationLevel) out.push(substationPanel(s));
    else if (top instanceof FeederLevel) {
      const f = this.feederModel();
      if (this.feederEvent && !sel) out.push(feederFaultPanel(s, this.feederEvent));
      if (sel?.kind === 'dist' && sel.what === 'home') out.push(meterPanel(s, f, sel.id));
      out.push(feederPanel(s, f));
    } else if (top instanceof ServiceLevel) {
      const f = this.feederModel();
      if (sel?.kind === 'dist' && sel.what === 'home') out.push(meterPanel(s, f, sel.id));
      else out.push(outletPanel(s, f));
    } else if (sel?.kind === 'branch') out.push(branchPanel(this.grid, s, sel.index));
    else if (sel?.kind === 'site' || sel?.kind === 'plant' || (!sel && top instanceof SiteLevel)) {
      // a place: its buses' working (a plant: the buses it feeds; in a yard with nothing selected: the yard's)
      const id = sel?.kind === 'site' ? sel.id : sel?.kind === 'plant' ? this.grid.gens.find((g) => g.plant.id === sel.id)?.bus.site.id : (top as SiteLevel).siteId;
      for (const b of this.grid.buses) if (b.site.id === id && !b.terminalOf) out.push(busPanel(this.grid, s, b.index));
      const fs = this.faultStudyNow();
      if (fs) for (const b of this.grid.buses) if (b.site.id === id && !b.terminalOf && s.energized[b.index]) out.push(busFaultPanel(this.grid, s, fs, b.index));
    }
    else if (!sel && top instanceof RegionLevel) out.push(regionPanel(this.grid, s, top.siteIds, top.id));
    return out.filter((p): p is Panel => p !== null);
  }

  // ------------------------------------------------------------------ labels & legend
  /** What the labels depend on besides the camera: the levels drawn, and the selection. */
  private labelSignature(): string {
    const bands = [...this.bands.values()]
      .filter((b) => b.m >= 0.7)
      .map((b) => b.portal.key)
      .sort()
      .join(',');
    return `${this.stack.map((l) => l.name).join('>')}|${bands}|${this.anim ? 'anim' : ''}|${JSON.stringify(this.selection)}`;
  }

  private refreshLabels(): void {
    // during a fold the drawing is moving under its names: they return when it settles
    if (this.anim) {
      this.labels.set([]);
      return;
    }
    const sel = this.selection;
    const items: LabelItem[] = [];
    // a node whose own level has (nearly) unfolded gives its name over to that level
    const yielding = new Set([...this.bands.values()].filter((b) => b.m >= 0.7 && b.portal.label).map((b) => b.portal.label!));
    for (const l of this.top.labels) {
      const site = l.kind === 'site' ? l.id.slice(5) : null;
      if (yielding.has(l.id)) continue;
      const selected = sel?.kind === 'site' && site === sel.id;
      // with a selection, the places it connects to keep their names and the rest recede
      const kept = !!site && !!this.focusSites?.has(site);
      const dim = !!site && !!this.focusSites && !kept;
      items.push({
        id: l.id,
        anchor: l.anchor,
        priority: l.priority + (selected ? 100 : kept ? 50 : 0),
        minZoom: kept ? 0 : l.minZoom,
        className: `${l.kind}${l.priority < 4 && l.kind === 'site' ? ' minor' : ''}${selected ? ' selected' : ''}${dim ? ' dim' : ''}`,
        text: l.text,
        ...(l.kind === 'site' ? { dx: 0, dy: 0 } : {}),
        ...(l.prov ? { prov: l.prov } : {}),
        pinned: selected || (sel?.kind === 'branch' && kept) || l.kind === 'layer',
      });
    }
    // the levels unfolding here, once nearly whole: their own names for their parts
    for (const b of this.bands.values()) {
      if (b.m < 0.7) continue;
      for (const l of b.level.labels) items.push(this.contextLabel(l, `${b.portal.key}/${l.id}`, this.place(b.portal, b.level, l.anchor), l.minZoom * b.portal.ratio, -1));
    }
    // the level above, as the ground this one stands on (its name for this node is this level's)
    const p = this.path[this.path.length - 1];
    if (p && !this.lens) {
      const parent = this.stack[this.stack.length - 2]!;
      for (const l of parent.labels) {
        if (l.kind === 'region' || l.kind === 'sea') continue;
        if (l.id === p.label) continue;
        items.push(this.contextLabel(l, `up/${l.id}`, this.toChild(p, this.top, l.anchor), l.minZoom / p.ratio, -3));
      }
    }
    this.labels.set(items);
    this.cameraDirty = true;
  }

  private contextLabel(l: LabelSpec, id: string, anchor: Vec3, minZoom: number, dp: number): LabelItem {
    return {
      id,
      anchor,
      priority: l.priority + dp,
      minZoom,
      className: `${l.kind}${l.kind === 'site' ? ' minor' : ''}`,
      text: l.text,
      ...(l.kind === 'site' ? { dx: 0, dy: 0 } : {}),
      ...(l.prov ? { prov: l.prov } : {}),
    };
  }

  private updateLegend(): void {
    const s = this.current;
    this.legend.update({
      level: this.top.kind,
      classes: this.top === this.system ? this.system.visibleClasses(this.cam.pxPerUnit) : this.top.classes,
      flowScale: this.top.flowScale,
      showSignal: true,
      showOutOfService: (!!s && s.inService.some((x) => x === 0)) || this.plantOutages.size > 0,
      noSolution: s?.outcome === 'none',
      fault: this.top instanceof FeederLevel && (this.feederEvent !== null || this.feederOpen.size > 0),
    });
  }

  private reserveRects(): Array<{ x: number; y: number; w: number; h: number }> {
    const out: Array<{ x: number; y: number; w: number; h: number }> = [];
    const pr = this.root.getBoundingClientRect();
    for (const el of this.root.querySelectorAll<HTMLElement>('.panel')) {
      if (el.hidden) continue;
      const r = el.getBoundingClientRect();
      out.push({ x: r.left - pr.left - 4, y: r.top - pr.top - 4, w: r.width + 8, h: r.height + 8 });
    }
    return out;
  }

  // ------------------------------------------------------------------ frame
  private lastZoom = 0;
  private loop = (now: number): void => {
    const c0 = performance.now();
    const time = this.reducedMotion ? 0 : (now - this.start) / 1000;
    this.advanceFlight(performance.now());
    this.advanceAnim(performance.now());
    this.tickFault(performance.now());
    this.cam.update();
    if (!this.lens) {
      // what unfolds, whether the sheet changes hands, and where every drawn level sits
      this.updateBands();
      this.checkHandoff();
      this.applyMatrices();
      this.applyContextInk();
    }
    const w = this.cam.width;
    const h = this.cam.height;
    const pr = this.pixelRatio;
    const z = this.cam.pxPerUnit;
    for (const l of this.drawn()) if (l.group.visible) l.frame({ width: w, height: h, pixelRatio: pr, pxPerUnit: z * (this.scaleOf.get(l) ?? 1), time });
    this.paper.frame(z / this.top.unitKm, pr);
    // the Region lens folds away when zoomed well out of it
    if (this.lens && !this.anim && !this.flight && z < this.levelFit(this.top).zoom * 0.4) this.closeTop();
    const pxKm = z / this.top.unitKm;
    if (pxKm !== this.lastZoom) {
      this.system.setZoom(pxKm);
      // in a yard the state's outline says nothing: the map recedes, the network stays
      this.system.setMapShown(1 - smoothstep(250, 1200, pxKm));
      this.updateLegend();
      this.lastZoom = pxKm;
    }
    const lk = this.labelSignature();
    if (lk !== this.labelKey) {
      this.labelKey = lk;
      this.refreshLabels();
    }
    this.renderer.render(this.scene, this.cam.camera);
    if (this.cameraDirty) {
      this.labels.reserve(this.reserveRects());
      this.labels.layout(this.cam);
      this.furniture.update(this.cam, this.top.unitKm, this.top.north);
      this.cameraDirty = false;
    }
    const cpu = performance.now() - c0;
    this.perf.frames++;
    this.perf.cpuMs.push(cpu);
    this.perf.frameMs.push(now);
    if (this.perf.cpuMs.length > 240) {
      this.perf.cpuMs.shift();
      this.perf.frameMs.shift();
    }
    requestAnimationFrame(this.loop);
  };

  /** Forget the frame statistics gathered so far (start-up frames compile shaders). */
  resetStats(): void {
    this.perf.cpuMs.length = 0;
    this.perf.frameMs.length = 0;
  }

  /** Frame statistics over the last few seconds (for the performance check). */
  stats(): { fps: number; cpuMsAvg: number; cpuMsP95: number; cpuMsMax: number; frames: number; drawCalls: number; triangles: number; instances: number } {
    const f = this.perf.frameMs;
    const fps = f.length > 1 ? ((f.length - 1) * 1000) / (f[f.length - 1]! - f[0]!) : 0;
    const c = [...this.perf.cpuMs].sort((a, b) => a - b);
    return {
      fps,
      cpuMsAvg: c.reduce((a, b) => a + b, 0) / Math.max(1, c.length),
      cpuMsP95: c[Math.floor(c.length * 0.95)] ?? 0,
      cpuMsMax: c[c.length - 1] ?? 0,
      frames: this.perf.frames,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      instances: this.system.lines.count + this.system.glyphs.count + this.system.marks.count + this.system.flow.count,
    };
  }

  /** Select a circuit and bring it into view, clear of the panels. */
  showBranch(k: number): void {
    const b = this.grid.branches[k]!;
    this.select({ kind: 'branch', index: k });
    const a = this.system.sites.find((x) => x.id === b.from.site.id)!.pos;
    const c = this.system.sites.find((x) => x.id === b.to.site.id)!.pos;
    const free = this.freeRect();
    const [ax, ay] = projectToView(a[0], 0, a[2]);
    const [cx, cy] = projectToView(c[0], 0, c[2]);
    const span = Math.max(Math.abs(ax - cx), Math.abs(ay - cy), 1);
    const zoom = Math.max(this.cam.pxPerUnit, Math.min(20, (0.4 * Math.min(free.w, free.h)) / span));
    this.flyTo((a[0] + c[0]) / 2, (a[2] + c[2]) / 2, zoom);
  }

  /** The part of the canvas the panels leave free, px. */
  private freeRect(withInspector = !this.inspector.root.hidden): { x: number; y: number; w: number; h: number } {
    const w = this.cam.width;
    const h = this.cam.height;
    if (w < 760) return { x: 16, y: 100, w: w - 32, h: h - 100 - (this.titleblock.offsetHeight + 150) };
    const right = withInspector ? 20 + 372 + 20 : 40;
    return { x: 300, y: 56, w: w - 300 - right, h: h - 56 - 196 };
  }

  /** Move the camera so ground point (x, z) sits in the middle of the free area at `zoom`. */
  flyTo(x: number, z: number, zoom: number, ms = 700, done?: () => void, free = this.freeRect()): void {
    // the ground offset that puts (x, z) at the free area's centre rather than the canvas's
    const save = { t: this.cam.target.clone(), z: this.cam.pxPerUnit };
    this.cam.pxPerUnit = zoom;
    this.cam.target.set(x, 0, z);
    this.cam.update();
    const g0 = this.cam.screenToGround(this.cam.width / 2, this.cam.height / 2);
    const g1 = this.cam.screenToGround(free.x + free.w / 2, free.y + free.h / 2);
    const to: [number, number, number] = [x - (g1.x - g0.x), z - (g1.z - g0.z), zoom];
    this.cam.pxPerUnit = save.z;
    this.cam.target.copy(save.t);
    this.cam.update();
    const from: [number, number, number] = [save.t.x, save.t.z, save.z];
    this.fly(ms, inOut, (e) => {
      this.cam.target.set(from[0] + (to[0] - from[0]) * e, 0, from[1] + (to[1] - from[1]) * e);
      this.cam.pxPerUnit = from[2] * (to[2] / from[2]) ** e;
    }, done);
  }

  /** A camera move: `at(e)` places the camera for e from 0 to 1, eased. */
  private fly(ms: number, ease: (u: number) => number, at: (e: number) => void, done?: () => void): void {
    if (this.reducedMotion || ms <= 0) {
      at(1);
      this.cam.update();
      this.cameraDirty = true;
      done?.();
      return;
    }
    this.flight = { t0: performance.now(), ms, ease, at, ...(done ? { done } : {}) };
  }

  private advanceFlight(now: number): void {
    const f = this.flight;
    if (!f) return;
    const u = Math.min(1, (now - f.t0) / f.ms);
    f.at(f.ease(u));
    this.cam.update();
    this.cameraDirty = true;
    if (u >= 1) {
      this.flight = null;
      f.done?.();
    }
  }

  /** Put ground point p at screen (sx, sy) with the camera at `zoom`. */
  private placeAt(p: Vec3, sx: number, sy: number, zoom: number): void {
    this.cam.pxPerUnit = zoom;
    this.cam.target.set(p[0], 0, p[2]);
    this.cam.update();
    const g = this.cam.screenToGround(sx, sy);
    this.cam.target.x += p[0] - g.x;
    this.cam.target.z += p[2] - g.z;
    this.cam.update();
  }

  /** Centre the view on a site at a zoom (px per km). */
  focusSite(id: string, pxPerKm: number): void {
    const s = this.system.sites.find((x) => x.id === id);
    if (!s) return;
    this.cam.pxPerUnit = pxPerKm;
    this.cam.target.set(s.pos[0], 0, s.pos[2]);
    this.cam.update();
    this.cameraDirty = true;
  }

  /** Programmatic pan (for tests and the guided route). */
  pan(dx: number, dy: number): void {
    this.panPixels(dx, dy);
  }
}

const inOut = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const easeOut = (u: number): number => 1 - (1 - u) ** 3;

function span(...parts: Array<Node | string>): HTMLSpanElement {
  const s = document.createElement('span');
  for (const p of parts) s.append(typeof p === 'string' ? rich(p) : p);
  return s;
}

/** Text in the signal colour: something is wrong. */
function badSpan(inner: HTMLElement): HTMLSpanElement {
  inner.classList.add('bad');
  return inner;
}
