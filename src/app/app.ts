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
import { branchView, siteView } from './inspect-system';
import type { FromWorker, ToWorker } from '../worker/model.worker';
import { Scrubber } from '../ui/scrubber';
import type { Action } from '../ui/inspector';

/**
 * The application: one sheet (the System level for now), its camera and input, the
 * solver thread, and the panels around the drawing.
 */
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
  private seq = 0;
  private inFlight = false;
  private stale = false;
  private scrubber!: Scrubber;
  private notice!: HTMLElement;
  private playTimer = 0;
  /** A camera move in progress (navigation, eased). */
  private flight: { t0: number; ms: number; from: [number, number, number]; to: [number, number, number] } | null = null
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
    this.scene.add(this.system.group);
    this.labels = new LabelLayer(root);
    drawSheet(root);
    this.buildChrome();
    this.legend = new Legend(root);
    this.inspector = new Inspector(root);
    this.inspector.onClose = () => this.select(null);
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
    const here = document.createElement('span');
    here.className = 'here';
    here.textContent = 'California · System';
    crumbs.appendChild(here);
    bar.append(mark, crumbs);
    this.root.appendChild(bar);

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
    if (k === 'all') this.outages.clear();
    else this.outages.delete(k);
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
    const msg: ToWorker = { type: 'solve', t: this.t, outages: [...this.outages], seq: ++this.seq };
    this.worker.postMessage(msg);
  }

  private setCurrent(s: Snapshot): void {
    this.current = s;
    this.system.applySnapshot(s);
    this.scrubber.setSolved(s.t, DAY.intervalMin);
    this.updateTitleblock();
    this.updateNotice();
    this.updateLegend();
    if (this.selection) this.inspect();
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
      if (this.outages.size) {
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
        el(qty(buses, 'buses', solver(`t${s.t}.darkBuses`), { digits: 0 })),
        rich(' are cut off from every source; '),
        el(qty(s.unservedMW, 'MW', solver(`t${s.t}.unserved`))),
        rich(' of demand is unserved. The rest of the grid has a solution, shown. '),
      );
    }
    body.appendChild(p);
    if (this.outages.size) {
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
              s.outcome === 'partial' ? span('; ', el(qty(s.unservedMW, 'MW', solver(`t${s.t}.unserved`))), ' unserved') : '',
            )
          : span('No steady-state operating point (see the notice).'),
      );
      st.classList.add('status');
      if (s.outcome !== 'solved') st.classList.add('bad');
      if (this.outages.size) {
        const names = [...this.outages].map((k) => this.grid.branches[k]!);
        row(
          'Tripped',
          ...names.flatMap((b, i) => [i ? '; ' : '', dataText(b.name, data(`network.line.${b.id}.name`))]),
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
        if (m.snap.t === this.t && this.outages.size === 0 && (this.current?.seq ?? 0) === 0) this.setCurrent(m.snap);
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
    const before = this.cam.screenToGround(sx, sy);
    const z = Math.max(0.35, Math.min(60, this.cam.pxPerUnit * factor));
    this.cam.pxPerUnit = z;
    this.cam.update();
    const after = this.cam.screenToGround(sx, sy);
    this.cam.target.add(before.sub(after));
    this.clampTarget();
    this.cameraDirty = true;
  }

  private clampTarget(): void {
    const t = this.cam.target;
    t.x = Math.max(-750, Math.min(750, t.x));
    t.z = Math.max(-650, Math.min(650, t.z));
    t.y = 0;
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
          this.select(null);
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

  private hover(x: number, y: number): void {
    const hit = this.system.pick(x, y, this.cam);
    this.canvas.style.cursor = hit ? 'pointer' : 'grab';
  }

  private click(x: number, y: number): void {
    this.select(this.system.pick(x, y, this.cam));
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
    if (!sel) this.inspector.hide();
    else this.inspect();
    this.refreshLabels();
  }

  private inspect(): void {
    const s = this.current;
    const sel = this.selection;
    if (!s || !sel) return;
    if (sel.kind === 'site') {
      const v = siteView(this.grid, s, sel.id);
      this.inspector.show({ header: 'Selected place', name: v.name, kind: v.kind, ...(v.intro ? { intro: v.intro } : {}), sections: v.sections });
    } else if (sel.kind === 'branch') {
      const k = sel.index;
      const v = branchView(this.grid, s, k);
      const out = this.outages.has(k);
      const actions: Action[] = [
        out
          ? { label: 'Restore this circuit', title: 'Close its breakers again', run: () => this.restore(k) }
          : { label: 'Trip this circuit', title: 'Open the breakers at both ends and solve again', run: () => this.trip(k) },
      ];
      if (this.outages.size > (out ? 1 : 0)) actions.push({ label: 'Restore everything', run: () => this.restore('all') });
      this.inspector.show({
        header: 'Selected circuit',
        name: dataText(v.name, data(`network.line.${this.grid.branches[k]!.id}.name`)),
        kind: v.kind,
        actions,
        ...(v.intro ? { intro: v.intro } : {}),
        sections: v.sections,
      });
    }
  }

  // ------------------------------------------------------------------ labels & legend
  private refreshLabels(): void {
    const sel = this.selection;
    const items: LabelItem[] = this.system.labels.map((l) => {
      const site = l.kind === 'site' ? l.id.slice(5) : null;
      const selected = sel?.kind === 'site' && site === sel.id;
      // with a selection, the places it connects to keep their names and the rest recede
      const kept = !!site && !!this.focusSites?.has(site);
      const dim = !!site && !!this.focusSites && !kept;
      return {
        id: l.id,
        anchor: l.anchor,
        priority: l.priority + (selected ? 100 : kept ? 50 : 0),
        minZoom: kept ? 0 : l.minZoom,
        className: `${l.kind}${l.priority < 4 && l.kind === 'site' ? ' minor' : ''}${selected ? ' selected' : ''}${dim ? ' dim' : ''}`,
        text: l.text,
        ...(l.kind === 'site' ? { dx: 0, dy: 0 } : {}),
        pinned: selected || (sel?.kind === 'branch' && kept),
      };
    });
    this.labels.set(items);
    this.cameraDirty = true;
  }

  private updateLegend(): void {
    const s = this.current;
    this.legend.update({
      classes: this.system.visibleClasses(this.cam.pxPerUnit),
      showSignal: true,
      showOutOfService: !!s && s.inService.some((x) => x === 0),
      noSolution: s?.outcome === 'none',
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
    this.cam.update();
    const w = this.cam.width;
    const h = this.cam.height;
    const pr = this.pixelRatio;
    for (const b of [this.system.lines, this.system.glyphs, this.system.marks]) b.frame({ width: w, height: h, pixelRatio: pr, pxPerUnit: this.cam.pxPerUnit, time });
    this.system.flow.frame(w, h, pr, time);
    this.system.faces.frame(pr);
    if (this.cam.pxPerUnit !== this.lastZoom) {
      this.system.setZoom(this.cam.pxPerUnit);
      this.updateLegend();
      this.lastZoom = this.cam.pxPerUnit;
    }
    this.renderer.render(this.scene, this.cam.camera);
    if (this.cameraDirty) {
      this.labels.reserve(this.reserveRects());
      this.labels.layout(this.cam);
      this.furniture.update(this.cam);
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
  private freeRect(): { x: number; y: number; w: number; h: number } {
    const w = this.cam.width;
    const h = this.cam.height;
    if (w < 760) return { x: 16, y: 100, w: w - 32, h: h - 100 - (this.titleblock.offsetHeight + 150) };
    const right = this.inspector.root.hidden ? 40 : 20 + this.inspector.root.offsetWidth + 20;
    return { x: 300, y: 56, w: w - 300 - right, h: h - 56 - 196 };
  }

  /** Move the camera so ground point (x, z) sits in the middle of the free area at `zoom`. */
  flyTo(x: number, z: number, zoom: number, ms = 700): void {
    const free = this.freeRect();
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
    if (this.reducedMotion || ms <= 0) {
      this.cam.target.set(to[0], 0, to[1]);
      this.cam.pxPerUnit = to[2];
      this.cameraDirty = true;
      return;
    }
    this.flight = { t0: performance.now(), ms, from, to };
  }

  private advanceFlight(now: number): void {
    const f = this.flight;
    if (!f) return;
    const u = Math.min(1, (now - f.t0) / f.ms);
    const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    this.cam.target.set(f.from[0] + (f.to[0] - f.from[0]) * e, 0, f.from[1] + (f.to[1] - f.from[1]) * e);
    this.cam.pxPerUnit = f.from[2] * (f.to[2] / f.from[2]) ** e;
    this.cameraDirty = true;
    if (u >= 1) this.flight = null;
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

function span(...parts: Array<Node | string>): HTMLSpanElement {
  const s = document.createElement('span');
  for (const p of parts) s.append(typeof p === 'string' ? rich(p) : p);
  return s;
}
