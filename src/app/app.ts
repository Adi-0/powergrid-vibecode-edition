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
import { clockEl, data, dataText, el, input, qty, siQty, solver } from '../ui/quantity';
import { rich } from '../ui/glossary';
import { branchView, siteView } from './inspect-system';
import type { FromWorker } from '../worker/model.worker';

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
  readonly snaps = new Map<number, Snapshot>();
  t = 76; // 19:00, the evening peak
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
  }

  private updateTitleblock(): void {
    const s = this.snaps.get(this.t);
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
    row('Time', clockEl(Math.floor(this.t / 4) + (this.t % 4) / 4, DAY.intervalMin, input(`time.t${this.t}`)), ' PDT, one [[quasi-static]] interval');
    if (s) {
      row(
        'Demand',
        el(qty(s.netLoadMW, 'MW', solver(`t${s.t}.netLoad`), { phases: '3φ' })),
        ' after ',
        el(qty(s.btmMW, 'MW', solver(`t${s.t}.btm`))),
        ' of [[btm-solar|rooftop solar]]',
      );
      row(
        'Supply',
        el(qty(s.genMW, 'MW', solver(`t${s.t}.gen`))),
        ' generated; [[losses]] ',
        el(qty(s.lossesMW, 'MW', solver(`t${s.t}.losses`))),
        ' (',
        el(qty((100 * s.lossesMW) / s.netLoadMW, '%', solver(`t${s.t}.lossPct`))),
        ')',
      );
      const ok = s.status === 'converged';
      const st = row(
        'Solution',
        ok
          ? span(
              'AC [[power-flow|power flow]] converged: [[newton-raphson|Newton–Raphson]], ',
              el(qty(s.iterations, 'iterations', solver(`t${s.t}.iterations`), { digits: 0 })),
              '; largest [[mismatch]] ',
              el(siQty(s.maxMismatchPu * S_BASE * 1e6, 'W', solver(`t${s.t}.mismatch`))),
            )
          : span('No steady-state operating point. ', s.reason),
      );
      st.classList.add('status');
      if (!ok) st.classList.add('bad');
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
        this.snaps.set(m.snap.t, m.snap);
        if (m.snap.t === this.t) this.showInterval();
      } else if (m.type === 'progress') {
        this.progressEl.hidden = false;
        this.progressEl.replaceChildren(
          document.createTextNode('Solving the day: '),
          el(qty((100 * m.done) / m.total, '%', solver('progress'), { digits: 0 })),
        );
      } else if (m.type === 'day-done') {
        this.progressEl.hidden = true;
      }
    };
    this.worker.postMessage({ type: 'init', focus: this.t });
  }

  private showInterval(): void {
    const s = this.snaps.get(this.t);
    if (!s) return;
    this.system.applySnapshot(s);
    this.updateTitleblock();
    this.updateLegend();
    if (this.selection) this.inspect();
    this.onReady();
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
    const bottom = narrow ? this.titleblock.offsetHeight + 40 : 64;
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
    const s = this.snaps.get(this.t);
    const sel = this.selection;
    if (!s || !sel) return;
    if (sel.kind === 'site') {
      const v = siteView(this.grid, s, sel.id);
      this.inspector.show({ header: 'Selected place', name: v.name, kind: v.kind, ...(v.intro ? { intro: v.intro } : {}), sections: v.sections });
    } else if (sel.kind === 'branch') {
      const v = branchView(this.grid, s, sel.index);
      this.inspector.show({
        header: 'Selected circuit',
        name: dataText(v.name, data(`network.line.${this.grid.branches[sel.index]!.id}.name`)),
        kind: v.kind,
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
    const s = this.snaps.get(this.t);
    this.legend.update({
      classes: this.system.visibleClasses(this.cam.pxPerUnit),
      showSignal: true,
      showOutOfService: !!s && s.inService.some((x) => x === 0),
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
