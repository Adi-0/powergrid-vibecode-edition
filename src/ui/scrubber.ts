import type { DaySummary } from '../worker/model.worker';
import { clockEl, data, derived, el, qty, solver, dataText } from './quantity';
import { rich } from './glossary';

/**
 * The day strip: the day as dispatched, drawn as a chart, with a cursor that sets
 * the time of the sheet. Three curves: what customers use; what the grid supplies
 * after rooftop solar; and what is left for the rest of the fleet once utility solar
 * and wind have been taken — the "duck". The band between the last two (utility
 * solar and wind) is hatched, as a drawing marks a region.
 *
 * Moving the cursor asks for that interval to be solved; the sheet shows each
 * interval only once its power flow has been solved (see app.ts).
 */

const SVGNS = 'http://www.w3.org/2000/svg';
const N = 96;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export class Scrubber {
  readonly root: HTMLElement;
  private readonly plot: HTMLElement;
  private readonly readout: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private svg: SVGSVGElement | null = null;
  private cursor: SVGLineElement | null = null;
  private solvedMark: SVGLineElement | null = null;
  private day: DaySummary | null = null;
  private t = 0;
  private solvedT = -1;
  private playing = false;
  private axis: HTMLElement;
  /** Called when the reader moves the cursor (interval index 0…95). */
  onChange: (t: number) => void = () => {};
  /** Called when playback starts or stops. */
  onPlay: (playing: boolean) => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('section');
    this.root.className = 'panel scrubber';
    this.root.setAttribute('aria-label', 'Time of day');
    const h = document.createElement('header');
    const title = document.createElement('span');
    title.textContent = 'Time of day';
    this.readout = document.createElement('span');
    this.readout.className = 'readout';
    this.playBtn = document.createElement('button');
    this.playBtn.className = 'play';
    this.playBtn.textContent = 'Play the day';
    this.playBtn.setAttribute('aria-pressed', 'false');
    this.playBtn.addEventListener('click', () => this.setPlaying(!this.playing));
    const right = document.createElement('span');
    right.className = 'right';
    right.append(this.readout, this.playBtn);
    h.append(title, right);
    const body = document.createElement('div');
    body.className = 'body';
    this.plot = document.createElement('div');
    this.plot.className = 'plot';
    this.plot.tabIndex = 0;
    this.plot.setAttribute('role', 'slider');
    this.plot.setAttribute('aria-label', 'Time of day');
    this.plot.setAttribute('aria-valuemin', '0');
    this.plot.setAttribute('aria-valuemax', String(N - 1));
    this.axis = document.createElement('div');
    this.axis.className = 'axis';
    const key = document.createElement('div');
    key.className = 'key';
    key.append(
      this.keyItem('dash', 'what customers use'),
      this.keyItem('thin', 'from the grid, after [[btm-solar|rooftop solar]]'),
      this.keyItem('heavy', 'left for the rest of the fleet'),
      this.keyItem('hatch', 'utility solar and wind'),
    );
    body.append(this.plot, this.axis, key);
    this.root.append(h, body);
    parent.appendChild(this.root);
    this.bind();
    new ResizeObserver(() => this.draw()).observe(this.plot);
  }

  private keyItem(kind: 'dash' | 'thin' | 'heavy' | 'hatch', text: string): HTMLElement {
    const s = document.createElement('span');
    s.className = 'k';
    const sw = svgEl('svg', { width: 22, height: 10, 'aria-hidden': 'true' });
    if (kind === 'hatch') {
      sw.appendChild(svgEl('rect', { x: 1, y: 1, width: 20, height: 8, fill: 'url(#scrub-hatch)', stroke: 'none' }));
    } else {
      sw.appendChild(
        svgEl('line', {
          x1: 1,
          x2: 21,
          y1: 5,
          y2: 5,
          stroke: kind === 'dash' ? 'var(--ink-60)' : 'var(--ink)',
          'stroke-width': kind === 'heavy' ? 2.2 : 1,
          ...(kind === 'dash' ? { 'stroke-dasharray': '4 3' } : {}),
        }),
      );
    }
    s.append(sw, rich(text));
    return s;
  }

  private bind(): void {
    const p = this.plot;
    let dragging = false;
    const at = (e: PointerEvent) => {
      const r = p.getBoundingClientRect();
      const f = (e.clientX - r.left) / r.width;
      this.move(Math.max(0, Math.min(N - 1, Math.floor(f * N))));
    };
    p.addEventListener('pointerdown', (e) => {
      dragging = true;
      p.setPointerCapture(e.pointerId);
      this.setPlaying(false);
      at(e);
    });
    p.addEventListener('pointermove', (e) => dragging && at(e));
    p.addEventListener('pointerup', () => (dragging = false));
    p.addEventListener('pointercancel', () => (dragging = false));
    p.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: -1, ArrowRight: 1, PageDown: -4, PageUp: 4 }[e.key];
      if (d !== undefined) {
        e.preventDefault();
        e.stopPropagation();
        this.setPlaying(false);
        this.move(Math.max(0, Math.min(N - 1, this.t + d)));
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        this.move(e.key === 'Home' ? 0 : N - 1);
      }
    });
  }

  private move(t: number): void {
    if (t === this.t) return;
    this.setCursor(t);
    this.onChange(t);
  }

  setPlaying(on: boolean): void {
    if (on === this.playing) return;
    this.playing = on;
    this.playBtn.setAttribute('aria-pressed', String(on));
    this.playBtn.textContent = on ? 'Pause' : 'Play the day';
    this.onPlay(on);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** The requested interval (moves immediately). */
  setCursor(t: number): void {
    this.t = t;
    this.plot.setAttribute('aria-valuenow', String(t));
    const hh = Math.floor(t / 4);
    const mm = (t % 4) * 15;
    this.plot.setAttribute('aria-valuetext', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    this.place(this.cursor, t);
  }

  /** The interval the sheet currently shows, solved. */
  setSolved(t: number, intervalMin: number): void {
    this.solvedT = t;
    this.place(this.solvedMark, t);
    this.readout.replaceChildren(clockEl(t / 4, intervalMin, solver(`t${t}.interval`)));
  }

  update(day: DaySummary): void {
    this.day = day;
    this.draw();
  }

  private x(t: number, w: number): number {
    return ((t + 0.5) / N) * w;
  }

  private place(line: SVGLineElement | null, t: number): void {
    if (!line || !this.svg) return;
    const w = this.plot.clientWidth;
    const x = this.x(t, w);
    line.setAttribute('x1', String(x));
    line.setAttribute('x2', String(x));
  }

  private draw(): void {
    const d = this.day;
    const w = this.plot.clientWidth;
    const h = this.plot.clientHeight;
    if (!d || w < 10 || h < 10) return;
    const svg = svgEl('svg', { width: w, height: h, 'aria-hidden': 'true' });
    const defs = svgEl('defs', {});
    const pat = svgEl('pattern', { id: 'scrub-hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: 'var(--ink-35)', 'stroke-width': 1.1 }));
    defs.appendChild(pat);
    svg.appendChild(defs);
    // vertical scale: round numbers bracketing the day (a line chart need not start
    // at zero; both ends are labelled so the scale is never implied)
    const step = 10000;
    const top = Math.ceil(Math.max(...d.grossMW) / step) * step;
    const bottom = Math.max(0, Math.floor(Math.min(...d.residualMW) / step) * step);
    const y = (mw: number) => h - 2 - ((mw - bottom) / (top - bottom)) * (h - 6);
    const path = (arr: Float64Array) => Array.from(arr, (v, i) => `${i ? 'L' : 'M'}${this.x(i, w).toFixed(1)},${y(v).toFixed(1)}`).join('');
    // gridlines (hairline) at every step, and every 6 hours
    for (let mw = bottom + step; mw < top + 1; mw += step)
      svg.appendChild(svgEl('line', { x1: 0, x2: w, y1: y(mw), y2: y(mw), stroke: 'var(--ink-15)', 'stroke-width': 1 }));
    for (let hr = 6; hr < 24; hr += 6) svg.appendChild(svgEl('line', { x1: (hr / 24) * w, x2: (hr / 24) * w, y1: 0, y2: h, stroke: 'var(--ink-15)', 'stroke-width': 1 }));
    svg.appendChild(svgEl('line', { x1: 0, x2: w, y1: y(bottom), y2: y(bottom), stroke: 'var(--ink)', 'stroke-width': 1 }));
    // the solar-and-wind band between grid demand and the residual
    const band = `${path(d.netLoadMW)}${Array.from(d.residualMW, (v, i) => ({ v, i }))
      .reverse()
      .map(({ v, i }) => `L${this.x(i, w).toFixed(1)},${y(v).toFixed(1)}`)
      .join('')}Z`;
    svg.appendChild(svgEl('path', { d: band, fill: 'url(#scrub-hatch)', stroke: 'none' }));
    svg.appendChild(svgEl('path', { d: path(d.grossMW), fill: 'none', stroke: 'var(--ink-60)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
    svg.appendChild(svgEl('path', { d: path(d.netLoadMW), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1 }));
    svg.appendChild(svgEl('path', { d: path(d.residualMW), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
    // cursor: where the reader asked (ink) and what is shown, solved (hairline)
    this.solvedMark = svgEl('line', { y1: 0, y2: h, stroke: 'var(--ink-35)', 'stroke-width': 3 });
    this.cursor = svgEl('line', { y1: 0, y2: h, stroke: 'var(--ink)', 'stroke-width': 1.2 });
    svg.append(this.solvedMark, this.cursor);
    this.plot.replaceChildren(svg);
    this.svg = svg;
    // scale label, top left, and the hour axis under the plot
    const scale = document.createElement('span');
    scale.className = 'scale';
    scale.append(el(qty(top, 'MW', derived('chart.day.top', solver('schedule.grossMW')), { digits: 0 })));
    const base = document.createElement('span');
    base.className = 'scale base';
    base.append(el(qty(bottom, 'MW', derived('chart.day.bottom', solver('schedule.residualMW')), { digits: 0 })));
    this.plot.append(scale, base);
    this.axis.replaceChildren();
    for (let hr = 0; hr <= 24; hr += 6) {
      const tick = dataText(`${String(hr).padStart(2, '0')}:00`, data('profiles.DAY.hours'), 'tick');
      tick.style.left = `${(hr / 24) * 100}%`;
      this.axis.appendChild(tick);
    }
    this.setCursor(this.t);
    if (this.solvedT >= 0) this.place(this.solvedMark, this.solvedT);
  }
}
