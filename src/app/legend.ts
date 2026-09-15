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
import { MW_PER_DOT } from '../render/scene-terrain.js';
import { LEGEND_SYMBOLS, MACHINE_MARKS, MachineMark, symbolToSVG } from '../render/symbols.js';
import { verticalExaggeration } from '../render/world.js';

export interface LegendHost {
  /** Called when the reader hovers a row, so a definition can be shown. */
  onExplain?: (term: string, text: string, el: HTMLElement) => void;
  onDismiss?: () => void;
  /**
   * Called when the reader picks a voltage class to look at, or clears one.
   *
   * THE LEGEND IS THE FILTER. A key that explains an encoding is the obvious
   * place to ask for one part of it — it is already on the page, already names
   * every class, and needs no second control to be discovered. Clicking 500 kV
   * is the natural way to ask "so where does the backbone actually go".
   */
  onPickClass?: (kV: number | null) => void;
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

/** A scatter, to say that one dot is a fixed quantity of demand. */
function dotSwatch(): string {
  const at = [[4, 9], [9, 4], [13, 10], [18, 6], [22, 11], [27, 5], [30, 9]];
  return (
    `<svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true">` +
    at.map(([x, y]) =>
      `<circle cx="${x}" cy="${y}" r="0.9" fill="${INK.inkFaint}"/>`).join('') +
    `</svg>`
  );
}

/** Two circles, to say that size means quantity. */
function sizeSwatch(): string {
  return (
    `<svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true">` +
    `<circle cx="7" cy="7" r="2.6" fill="none" stroke="${INK.ink}" stroke-width="1.2"/>` +
    `<circle cx="23" cy="7" r="5.6" fill="none" stroke="${INK.ink}" stroke-width="1.5"/>` +
    `</svg>`
  );
}

export class Legend {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly host: LegendHost;
  private exaggerationRow: HTMLElement | null = null;
  private machineGroup: HTMLElement | null = null;
  private readonly voltageRows = new Map<number, HTMLElement>();
  /** The class the reader is holding up, if any. */
  private picked: number | null = null;
  private dotGroup: HTMLElement | null = null;
  private sizeGroup: HTMLElement | null = null;
  private exaggerationGroup: HTMLElement | null = null;

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

  private group(heading: string, tiles = false): HTMLElement {
    const g = document.createElement('div');
    g.className = 'legend__group';
    g.innerHTML = `<h3 class="legend__heading">${heading}</h3>`;
    this.body.appendChild(g);
    if (!tiles) return g;
    const wrap = document.createElement('div');
    wrap.className = 'legend__tiles';
    g.appendChild(wrap);
    return wrap;
  }

  /** The group element a row lives in, whether or not it is inside a tile grid. */
  private static groupOf(el: HTMLElement): HTMLElement {
    return el.classList.contains('legend__group')
      ? el : (el.parentElement as HTMLElement);
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
      const row = this.row(v, strokeSwatch(c.weightPx, c.dashPx), c.label, c.blurb);
      row.classList.add('legend__row--pick');
      row.setAttribute('role', 'button');
      row.setAttribute('aria-pressed', 'false');
      row.title = `Show ${c.label} against the rest`;
      row.addEventListener('click', () => {
        this.picked = this.picked === c.kV ? null : c.kV;
        for (const [kV, r] of this.voltageRows) {
          r.setAttribute('aria-pressed', String(kV === this.picked));
        }
        this.host.onPickClass?.(this.picked);
      });
      this.voltageRows.set(c.kV, row);
    }

    const note = document.createElement('p');
    note.className = 'note';
    note.textContent =
      'Weight, never colour — so the drawing photocopies. Click a class to ' +
      'hold it against the rest.';
    v.appendChild(note);

    // --- What the size of a symbol means -----------------------------------
    // The legend has to be complete, and symbol size now carries meaning, so
    // it has to say what.
    const z = this.group('Size — by how much is there');
    this.row(
      z, sizeSwatch(), 'Bigger means more',
      'A site symbol is drawn larger where there is more generating capacity, ' +
      'or more demand. Square-rooted, so a four-gigawatt station is about six ' +
      'times the area of a hundred-megawatt one rather than forty.'
    );

    // --- What the scatter of dots is ---------------------------------------
    const d = this.group('Where the demand is');
    this.row(
      d, dotSwatch(), `One dot is ${MW_PER_DOT} MW of peak demand`,
      'Scattered around the substation that carries it, so the drawing shows ' +
      'why the network goes where it goes. Counting the dots gives the number ' +
      'back. It is not a map of the cities: it is where this model puts its ' +
      'load, and the spread is a drawing choice.'
    );

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
    const sym = this.group('Symbols', true);
    for (const def of LEGEND_SYMBOLS) {
      this.row(sym, symbolToSVG(def.path, 18), def.name, def.blurb);
    }

    // --- Machine marks ------------------------------------------------------
    const marks = this.group('Inside a machine circle', true);
    const order: MachineMark[] = ['steam', 'nuclear', 'hydro', 'wind', 'solar', 'geothermal', 'import'];
    for (const key of order) {
      const m = MACHINE_MARKS[key];
      this.row(marks, symbolToSVG(m.path, 18), m.name, m.blurb);
    }
    const markNote = document.createElement('p');
    markNote.className = 'note';
    markNote.textContent =
      'This drawing’s own convention: no standard exists for these. ' +
      'Everything else here is standard.';
    Legend.groupOf(marks).appendChild(markNote);
    this.machineGroup = Legend.groupOf(marks);
    this.dotGroup = Legend.groupOf(d);
    this.sizeGroup = Legend.groupOf(z);

    // --- The vertical exaggeration, declared ---------------------------------
    const ex = this.group('Vertical scale');
    this.exaggerationGroup = ex;
    this.exaggerationRow = this.row(
      ex, strokeSwatch(0.7, [], INK.inkFaint), 'Heights are exaggerated',
      'The voltage classes are drawn at different heights so the backbone ' +
      'reads as sitting above the regional network and crossings resolve ' +
      'correctly. Those heights are not real: a 500 kV tower is about 50 m ' +
      'tall, which at this scale would be a fraction of a pixel. A ' +
      'cross-section drawing does the same thing, and says so.'
    );
  }

  /**
   * Keep the legend a key to THIS drawing.
   *
   * Complete has to mean "everything on the page", not "everything the
   * renderer can draw". Eight groups and twenty-five rows is two and a half
   * times the height the panel has, so a reader saw the voltage classes and
   * never learned that the scatter of dots was demand or that the size of a
   * symbol meant anything — the legend was complete in the source and truncated
   * on the screen, which is the worse of the two failures.
   *
   * What is shown follows the COMPOSITOR's own report of what it drew, not a
   * table of which level shows what, so it cannot drift away from the drawing.
   */
  update(
    metresPerPixel: number,
    shown: {
      machineMarks: boolean; dots: boolean; sizes: boolean; kV: number[];
    } = { machineMarks: true, dots: true, sizes: true, kV: [] }
  ): void {
    // A class nobody can see is not a key, it is a catalogue. At the whole
    // state the legend was offering the wire along a street and the drop into
    // a house, neither of which is within four orders of magnitude of being on
    // the page. An empty list means the frame has not reported yet, and then
    // everything is shown rather than nothing.
    for (const [kV, row] of this.voltageRows) {
      row.hidden = shown.kV.length > 0 && !shown.kV.includes(kV);
      // A class that has left the page cannot go on being held up.
      if (row.hidden && this.picked === kV) {
        this.picked = null;
        row.setAttribute('aria-pressed', 'false');
        this.host.onPickClass?.(null);
      }
    }
    if (this.machineGroup) this.machineGroup.hidden = !shown.machineMarks;
    if (this.dotGroup) this.dotGroup.hidden = !shown.dots;
    if (this.sizeGroup) this.sizeGroup.hidden = !shown.sizes;
    const factor = verticalExaggeration(metresPerPixel);
    if (this.exaggerationGroup) this.exaggerationGroup.hidden = factor < 2;
    if (!this.exaggerationRow) return;
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
