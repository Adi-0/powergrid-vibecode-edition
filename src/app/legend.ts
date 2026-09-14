/**
 * The legend.
 *
 * Always present, always correct, always complete. A beginner cannot read an
 * encoding they were never shown, and an encoding that appears in the drawing
 * but not in the legend is a private joke.
 *
 * It is generated from the same constants the renderer draws with — the
 * voltage-class weights from `style.ts`, the symbol paths from `symbols.ts` —
 * so it cannot drift out of date. A legend maintained by hand is a legend that
 * is wrong by the third commit.
 */

import { VOLTAGE_CLASSES, INK, SIGNAL, FLOW } from '../render/style.js';
import { LEGEND_SYMBOLS, MACHINE_MARKS, MachineMark, symbolToSVG } from '../render/symbols.js';
import { verticalExaggeration } from '../render/world.js';

export interface LegendHost {
  /** Called when the reader hovers a row, so a definition can be shown. */
  onExplain?: (term: string, text: string, el: HTMLElement) => void;
  onDismiss?: () => void;
}

/** The flow encoding: a solid conductor with light marks running inside it. */
function flowSwatch(): string {
  const on = FLOW.markSpacingPx * FLOW.markLengthFraction;
  const off = FLOW.markSpacingPx * (1 - FLOW.markLengthFraction);
  return (
    `<svg viewBox="0 0 44 14" width="44" height="14" fill="none">` +
    `<line x1="1" y1="7" x2="43" y2="7" stroke="${INK.ink}" stroke-width="3.2" ` +
    `stroke-linecap="round" />` +
    `<line x1="1" y1="7" x2="43" y2="7" stroke="${INK.ground}" ` +
    `stroke-width="${3.2 - 1.5}" stroke-dasharray="${on} ${off}">` +
    `<animate attributeName="stroke-dashoffset" from="${on + off}" to="0" ` +
    `dur="1.1s" repeatCount="indefinite" /></line></svg>`
  );
}

/** A short stroke sample, drawn at the same weight and dash the renderer uses. */
function strokeSwatch(weightPx: number, dash: number[], color: string = INK.ink): string {
  const dashAttr = dash.length ? ` stroke-dasharray="${dash.join(' ')}"` : '';
  return (
    `<svg viewBox="0 0 44 14" width="44" height="14" fill="none">` +
    `<line x1="1" y1="7" x2="43" y2="7" stroke="${color}" ` +
    `stroke-width="${weightPx}" stroke-linecap="round"${dashAttr} /></svg>`
  );
}

export class Legend {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly host: LegendHost;
  private exaggerationRow: HTMLElement | null = null;

  constructor(host: LegendHost = {}) {
    this.host = host;
    this.element = document.createElement('aside');
    this.element.className = 'panel panel--legend';
    this.element.innerHTML =
      `<div class="panel__head">` +
      `<span class="panel__title">Legend</span>` +
      `<span class="panel__sub">how to read this</span>` +
      `</div><div class="panel__body"></div>`;
    this.body = this.element.querySelector('.panel__body') as HTMLElement;
    this.build();
  }

  private group(heading: string): HTMLElement {
    const g = document.createElement('div');
    g.className = 'legend__group';
    g.innerHTML = `<h3 class="legend__heading">${heading}</h3>`;
    this.body.appendChild(g);
    return g;
  }

  private row(parent: HTMLElement, swatch: string, name: string, explain: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'legend__row';
    row.innerHTML =
      `<span class="legend__swatch">${swatch}</span>` +
      `<span class="legend__name">${name}</span>`;
    row.addEventListener('pointerenter', () => this.host.onExplain?.(name, explain, row));
    row.addEventListener('pointerleave', () => this.host.onDismiss?.());
    parent.appendChild(row);
    return row;
  }

  private build(): void {
    // --- Voltage classes: weight and dash, never hue ------------------------
    const v = this.group('Voltage class — by line weight');
    for (const c of VOLTAGE_CLASSES) {
      this.row(v, strokeSwatch(c.weightPx, c.dashPx), c.label, c.blurb);
    }
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent =
      'Voltage is shown by how heavy the line is, never by colour — so the ' +
      'drawing survives being photocopied, and colour stays free to mean ' +
      'one thing.';
    v.appendChild(note);

    // --- The one signal colour ---------------------------------------------
    const s = this.group('Colour means one thing');
    this.row(
      s, strokeSwatch(2.2, [], SIGNAL.alarm), 'Something is wrong',
      'Over a thermal limit, outside voltage limits, faulted, or out of ' +
      'service. Nothing else in this drawing is ever coloured, so when you ' +
      'see it, it matters.'
    );

    // --- Flow ---------------------------------------------------------------
    const f = this.group('Power flow');
    this.row(
      f, flowSwatch(), 'Marks travel with the power',
      'Light marks run along the inside of each circuit in the direction real ' +
      'power is actually going, at a speed set by how heavily the circuit is ' +
      'loaded. Reverse the flow and they reverse; unload the circuit and they ' +
      'slow to a stop. Nothing here is animated for decoration.'
    );

    // --- Symbols ------------------------------------------------------------
    const sym = this.group('Symbols');
    for (const def of LEGEND_SYMBOLS) {
      this.row(sym, symbolToSVG(def.path, 22), def.name, def.blurb);
    }

    // --- Machine marks ------------------------------------------------------
    const marks = this.group('Inside a machine circle');
    const order: MachineMark[] = ['steam', 'nuclear', 'hydro', 'wind', 'solar', 'geothermal', 'import'];
    for (const key of order) {
      const m = MACHINE_MARKS[key];
      this.row(marks, symbolToSVG(m.path, 22), m.name, m.blurb);
    }
    const markNote = document.createElement('p');
    markNote.className = 'note';
    markNote.textContent =
      'There is no industry standard for telling one kind of plant from ' +
      'another on a one-line diagram, so these marks are this drawing’s own ' +
      'convention. Everything above them is standard.';
    marks.appendChild(markNote);

    // --- The vertical exaggeration, declared ---------------------------------
    const ex = this.group('Vertical scale');
    this.exaggerationRow = this.row(
      ex, strokeSwatch(0.7, [], INK.inkFaint), 'Heights are exaggerated',
      'The voltage classes are drawn at different heights so the backbone ' +
      'reads as sitting above the regional network and crossings resolve ' +
      'correctly. Those heights are not real: a 500 kV tower is about 50 m ' +
      'tall, which at this scale would be a fraction of a pixel. A ' +
      'cross-section drawing does the same thing, and says so.'
    );
  }

  /** Keep the stated exaggeration honest as the camera zooms. */
  update(metresPerPixel: number): void {
    if (!this.exaggerationRow) return;
    const factor = verticalExaggeration(metresPerPixel);
    const name = this.exaggerationRow.querySelector('.legend__name');
    if (name) {
      name.innerHTML =
        factor >= 2
          ? `Heights exaggerated <em>×${formatFactor(factor)}</em>`
          : 'Heights are true <em>×1</em>';
    }
  }
}

function formatFactor(f: number): string {
  if (f >= 1000) return `${Math.round(f / 100) / 10}k`;
  if (f >= 100) return String(Math.round(f / 10) * 10);
  return String(Math.round(f));
}
