/**
 * The time scrubber.
 *
 * Drag it and the whole model moves through a day: demand rises and falls,
 * solar comes up and goes down, dispatchable plant ramps, the marginal unit
 * changes, flows redistribute, and every number in the app follows — because
 * every hour is re-dispatched and re-solved, not interpolated between
 * pre-rendered states.
 *
 * Behind the handle is the duck curve. It is NOT an illustration: it is total
 * demand and demand-minus-renewables, both computed from the same dispatch the
 * app is running, plotted straight. If the data changed, the drawing would.
 */

import { DispatchResult } from '../sim/dispatch.js';
import { Season, DAY_PROFILES } from '../sim/profiles.js';
import { INK, SELECTION } from '../render/style.js';
import { term, escapeHtml } from './tooltip.js';

export interface ScrubberHost {
  onChange: (hour: number) => void;
  onSeasonChange: (season: Season) => void;
}

/** The three days the model can be looked at, in the order they are offered. */
const SEASONS: Season[] = ['summer', 'spring', 'winter'];

/**
 * Curtailment below this share of demand is not marked on the plot. Below about
 * one per cent it is an artefact of hour-by-hour dispatch bumping into
 * minimum-generation limits rather than a fact about the system.
 */
const CURTAILMENT_VISIBLE = 0.01;

export class Scrubber {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly clock: HTMLElement;
  private readonly track: HTMLElement;
  private readonly note: HTMLElement;
  private readonly host: ScrubberHost;

  private day: readonly DispatchResult[] = [];
  private hour = 18;
  private dragging = false;
  private playing = false;
  private playTimer: number | null = null;

  constructor(host: ScrubberHost) {
    this.host = host;
    this.element = document.createElement('div');
    this.element.className = 'scrub';
    this.element.innerHTML = `
      <button class="btn scrub__play" aria-pressed="false" title="Run the day">▶</button>
      <span class="scrub__clock num">18:00</span>
      <div class="scrub__track"><canvas></canvas></div>
      <span class="scrub__note"></span>
      <span class="scrub__season">${SEASONS.map((s, i) =>
        `<button class="btn" data-season="${s}" aria-pressed="${i === 0}" ` +
        `title="${escapeHtml(DAY_PROFILES[s].blurb)}">` +
        `${s[0].toUpperCase()}${s.slice(1)}</button>`).join('')}</span>`;

    this.clock = this.element.querySelector('.scrub__clock') as HTMLElement;
    this.track = this.element.querySelector('.scrub__track') as HTMLElement;
    this.note = this.element.querySelector('.scrub__note') as HTMLElement;
    this.canvas = this.element.querySelector('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;

    this.attach();
  }

  private attach(): void {
    const toHour = (clientX: number): number => {
      const r = this.track.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return t * 24;
    };

    this.track.addEventListener('pointerdown', (e) => {
      this.track.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.stopPlaying();
      this.set(toHour(e.clientX));
    });
    this.track.addEventListener('pointermove', (e) => {
      if (this.dragging) this.set(toHour(e.clientX));
    });
    const end = () => { this.dragging = false; };
    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', end);

    (this.element.querySelector('.scrub__play') as HTMLElement).addEventListener(
      'click', () => (this.playing ? this.stopPlaying() : this.startPlaying())
    );

    for (const b of this.element.querySelectorAll('[data-season]')) {
      b.addEventListener('click', () => {
        const s = (b as HTMLElement).dataset.season as Season;
        for (const other of this.element.querySelectorAll('[data-season]')) {
          (other as HTMLElement).setAttribute(
            'aria-pressed', String((other as HTMLElement).dataset.season === s)
          );
        }
        this.host.onSeasonChange(s);
      });
    }

    // Arrow keys step by fifteen minutes, which is the interval a real market
    // clears on and therefore the natural grain of the control.
    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') { this.stopPlaying(); this.set(this.hour + 0.25); }
      else if (e.key === 'ArrowLeft') { this.stopPlaying(); this.set(this.hour - 0.25); }
      else if (e.key === ' ') { e.preventDefault(); this.playing ? this.stopPlaying() : this.startPlaying(); }
      else return;
      e.preventDefault();
    });

    window.addEventListener('resize', () => this.draw());
  }

  private startPlaying(): void {
    this.playing = true;
    (this.element.querySelector('.scrub__play') as HTMLElement).textContent = '❚❚';
    (this.element.querySelector('.scrub__play') as HTMLElement).setAttribute('aria-pressed', 'true');
    // One whole day in about forty seconds: slow enough to watch the evening
    // ramp happen rather than flicker past it.
    this.playTimer = window.setInterval(() => this.set(this.hour + 0.15), 100);
  }

  private stopPlaying(): void {
    this.playing = false;
    (this.element.querySelector('.scrub__play') as HTMLElement).textContent = '▶';
    (this.element.querySelector('.scrub__play') as HTMLElement).setAttribute('aria-pressed', 'false');
    if (this.playTimer !== null) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
  }

  private set(hour: number): void {
    const h = ((hour % 24) + 24) % 24;
    this.hour = h;
    this.host.onChange(h);
  }

  /** Called whenever the app state changes. */
  /**
   * Put the season buttons where the state actually is.
   *
   * Needed because the guided path changes the season without anybody pressing
   * a button, and a control that shows the wrong thing is worse than no
   * control at all.
   */
  setSeason(season: Season): void {
    for (const b of this.element.querySelectorAll('[data-season]')) {
      (b as HTMLElement).setAttribute(
        'aria-pressed', String((b as HTMLElement).dataset.season === season));
    }
  }

  update(day: readonly DispatchResult[], hour: number, dispatch: DispatchResult): void {
    this.day = day;
    this.hour = hour;
    const hh = Math.floor(hour);
    const mm = Math.round((hour - hh) * 60);
    this.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;

    const marginalName = dispatch.marginalUnit
      ? day[Math.floor(hour) % 24].stack.find((s) => s.generatorId === dispatch.marginalUnit)?.name
      : null;
    this.note.innerHTML =
      `${term('marginal-unit', 'Setting the price')}: ` +
      `<b>${marginalName ?? '—'}</b>` +
      (dispatch.demandMW > 0 && dispatch.curtailedMW / dispatch.demandMW >= CURTAILMENT_VISIBLE
        ? ` · ${term('curtailment', 'curtailing')} <b class="num">${Math.round(dispatch.curtailedMW)} MW</b>`
        : '');

    this.draw();
  }

  /**
   * The duck curve, drawn from the dispatch the app is actually running.
   *
   * Two lines: total demand, and demand minus wind and solar. The gap between
   * them IS the renewable output, and the shape of the lower line — deep dip at
   * midday, steep climb into the evening — is the duck. Nobody drew it.
   */
  private draw(): void {
    const day = this.day;
    if (day.length === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.track.clientWidth;
    const h = this.track.clientHeight;
    if (w < 8 || h < 8) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    // Zero-based, because the DEPTH of the midday dip relative to the whole is
    // the point. A plot that starts at the minimum exaggerates the duck into a
    // canyon and tells the reader something untrue about how much of the system
    // solar actually displaces.
    let maxMW = 0;
    for (const d of day) maxMW = Math.max(maxMW, d.demandMW);
    const padTop = 4;
    const padBottom = 11; // room for the hour labels
    const x = (hour: number) => (hour / 24) * w;
    const y = (mw: number) =>
      h - padBottom - (mw / (maxMW * 1.05)) * (h - padTop - padBottom);

    const at = (i: number) => day[((i % 24) + 24) % 24];

    // Hours, every six. A ruler, not the subject.
    g.strokeStyle = INK.inkGhost;
    g.lineWidth = 1;
    g.fillStyle = INK.inkFaint;
    g.font = `9px ${getComputedStyle(document.body).fontFamily}`;
    g.textAlign = 'center';
    for (let hr = 0; hr <= 24; hr += 6) {
      const px = Math.round(x(hr)) + 0.5;
      g.beginPath();
      g.moveTo(px, 0);
      g.lineTo(px, h - padBottom);
      g.stroke();
      if (hr < 24) {
        g.fillText(`${String(hr).padStart(2, '0')}`, Math.max(9, px), h - 2);
      }
    }

    // The gap between total demand and net load IS the wind and solar output.
    // Filling it says so without a word.
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const px = x(i);
      const py = y(at(i).demandMW);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    for (let i = 24; i >= 0; i--) g.lineTo(x(i), y(at(i).netLoadMW));
    g.closePath();
    g.fillStyle = 'rgba(20, 22, 26, 0.09)';
    g.fill();

    // Curtailment: generation that could have been made and was turned away.
    // The only colour on this plot, and the only place it is permitted — so it
    // is drawn only when it is worth a reader's attention. A few hundred
    // megawatts against a thirty-gigawatt system is a rounding error, and
    // marking it in the signal colour would spend the one thing that colour
    // means on something that does not matter.
    for (let i = 0; i < 24; i++) {
      const d = at(i);
      const share = d.demandMW > 0 ? d.curtailedMW / d.demandMW : 0;
      if (share < CURTAILMENT_VISIBLE) continue;
      // Opacity in proportion to how much is being thrown away, so a serious
      // oversupply hour looks different from a marginal one.
      g.fillStyle = `rgba(196, 52, 27, ${Math.min(0.22, 0.05 + share * 1.6).toFixed(3)})`;
      g.fillRect(x(i), padTop, x(1), h - padTop - padBottom);
    }

    const plot = (get: (d: DispatchResult) => number, width: number, dash: number[]) => {
      g.beginPath();
      g.setLineDash(dash);
      g.lineWidth = width;
      g.strokeStyle = INK.ink;
      for (let i = 0; i <= 24; i++) {
        const px = x(i);
        const py = y(get(at(i)));
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
      g.setLineDash([]);
    };

    plot((d) => d.demandMW, 1, [2, 2]);   // everything people are using
    plot((d) => d.netLoadMW, 1.7, []);    // what is left for everything else

    // The handle.
    const hx = Math.round(x(this.hour)) + 0.5;
    g.strokeStyle = SELECTION.stroke;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(hx, 0);
    g.lineTo(hx, h - padBottom);
    g.stroke();
    g.fillStyle = SELECTION.stroke;
    g.beginPath();
    g.arc(hx, y(at(Math.floor(this.hour)).netLoadMW), 3, 0, Math.PI * 2);
    g.fill();
  }
}
