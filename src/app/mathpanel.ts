/**
 * The math panel: the working, in full, for whatever is selected.
 *
 * This is the panel the whole project is an argument for. Everything else shows
 * a reader what the system is doing; this shows them why that is the answer,
 * in the form they would have to write it down themselves.
 *
 * FOUR STAGES, EVERY TIME, IN THIS ORDER. The brief specifies them and they are
 * not negotiable:
 *
 *   1. the equation in its general form, in the notation the field uses;
 *   2. the same equation with this object's values substituted;
 *   3. the arithmetic;
 *   4. the result, with its units.
 *
 * Stages 2 and 3 are the same string here, because the substituted line IS the
 * arithmetic — see `src/math/expr.ts` for why that matters.
 *
 * WHAT THE PANEL WILL NOT DO. It will not round differently from what it
 * evaluates. It will not print a per-unit number without its base. It will not
 * assume a sign convention. Each of those is a way of being subtly unhelpful
 * that looks like helpfulness, and each is guarded by a test.
 */

import { Derivation, DerivationStep, BaseQuantity } from '../math/derive.js';
import { pretty, num } from '../math/expr.js';
import { escapeHtml } from './tooltip.js';

export interface MathPanelHost {
  onClose: () => void;
}

export class MathPanel {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly host: MathPanelHost;
  private derivations: Derivation[] = [];
  private active = 0;

  constructor(host: MathPanelHost) {
    this.host = host;
    this.element = document.createElement('aside');
    this.element.className = 'panel panel--math';
    this.element.style.display = 'none';
    this.element.innerHTML =
      `<div class="panel__head">` +
      `<span class="panel__title"></span>` +
      `<span class="panel__sub"></span>` +
      `<button class="panel__close" title="Close">×</button>` +
      `</div>` +
      `<div class="math__tabs"></div>` +
      `<div class="panel__body"></div>`;
    this.title = this.element.querySelector('.panel__title') as HTMLElement;
    this.sub = this.element.querySelector('.panel__sub') as HTMLElement;
    this.tabs = this.element.querySelector('.math__tabs') as HTMLElement;
    this.body = this.element.querySelector('.panel__body') as HTMLElement;

    (this.element.querySelector('.panel__close') as HTMLElement)
      .addEventListener('click', () => this.close());
    this.tabs.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
      if (!t) return;
      this.active = Number(t.dataset.tab);
      this.render();
    });
  }

  get isOpen(): boolean {
    return this.element.style.display !== 'none';
  }

  /** Show a set of derivations for one selected object. */
  show(derivations: Derivation[]): void {
    this.derivations = derivations.filter(Boolean);
    if (this.derivations.length === 0) {
      this.close();
      return;
    }
    this.active = 0;
    this.element.style.display = 'flex';
    this.render();
  }

  /**
   * Refresh in place, keeping the reader where they were.
   *
   * The whole page re-solves when the hour moves, and the math panel has to
   * follow — a derivation showing last hour's numbers beside this hour's
   * drawing would be the single worst bug this app could have. The active tab
   * and the scroll position are preserved, because the reader is in the middle
   * of following a chain of arithmetic and being thrown back to the top of it
   * is its own kind of wrong.
   */
  update(derivations: Derivation[]): void {
    if (!this.isOpen) return;
    const scroll = this.body.scrollTop;
    const keep = this.derivations[this.active]?.id;
    this.derivations = derivations.filter(Boolean);
    if (this.derivations.length === 0) { this.close(); return; }
    const found = this.derivations.findIndex((d) => d.id === keep);
    this.active = found >= 0 ? found : 0;
    this.render();
    this.body.scrollTop = scroll;
  }

  close(): void {
    this.element.style.display = 'none';
    this.derivations = [];
    this.host.onClose();
  }

  private render(): void {
    const d = this.derivations[this.active];
    if (!d) return;

    this.title.textContent = d.title;
    this.sub.textContent = d.subtitle;

    this.tabs.innerHTML = this.derivations.length > 1
      ? this.derivations.map((x, i) =>
          `<button class="math__tab" data-tab="${i}" aria-pressed="${i === this.active}">` +
          `${escapeHtml(x.title)}</button>`).join('')
      : '';
    this.tabs.style.display = this.derivations.length > 1 ? '' : 'none';

    const parts: string[] = [];

    if (d.standard) {
      parts.push(
        `<p class="math__standard">${escapeHtml(d.standard)}</p>`
      );
    }

    // The sign convention comes FIRST, before any arithmetic, because it is
    // the thing a reader has to hold in their head while reading the rest.
    if (d.convention) {
      parts.push(
        `<section class="math__convention">` +
        `<h4 class="inspect__heading">Reference direction</h4>` +
        `<p class="note">${escapeHtml(d.convention)}</p>` +
        (d.diagram ? `<div class="math__diagram">${d.diagram}</div>` : '') +
        `</section>`
      );
    }

    if (d.bases && d.bases.length > 0) {
      parts.push(
        `<section class="math__bases">` +
        `<h4 class="inspect__heading">Bases in force</h4>` +
        d.bases.map(baseRow).join('') +
        `</section>`
      );
    }

    parts.push(
      `<ol class="math__steps">` +
      d.steps.map((s, i) => this.stepHTML(s, i + 1)).join('') +
      `</ol>`
    );

    if (d.closing) {
      parts.push(`<p class="math__closing">${escapeHtml(d.closing)}</p>`);
    }

    this.body.innerHTML = parts.join('');
  }

  private stepHTML(s: DerivationStep, index: number): string {
    const value = num(s.value, s.decimals ?? 4);
    const agrees = s.checkAgainst
      ? `<div class="math__check">` +
        `Same as ${escapeHtml(s.checkAgainst.name)}: ` +
        `<span class="num">${num(s.checkAgainst.value, s.decimals ?? 4)}</span>` +
        `</div>`
      : '';
    return (
      `<li class="math__step">` +
      `<div class="math__label"><span class="math__index num">${index}</span>` +
      `${escapeHtml(s.label)}</div>` +
      `<div class="math__general">${escapeHtml(s.general)}</div>` +
      `<div class="math__work num">= ${escapeHtml(pretty(s.substituted))}</div>` +
      `<div class="math__result num">= ${escapeHtml(pretty(value))}` +
      (s.unit ? `<span class="math__unit">${escapeHtml(s.unit)}</span>` : '') +
      `</div>` +
      agrees +
      (s.note ? `<p class="note">${escapeHtml(s.note)}</p>` : '') +
      `</li>`
    );
  }
}

/**
 * One per-unit base.
 *
 * Never abbreviated and never omitted: a per-unit number whose base is not on
 * the same page is not a number a reader can do anything with.
 */
function baseRow(b: BaseQuantity): string {
  return (
    `<div class="math__base">` +
    `<span class="math__base-symbol">${escapeHtml(b.symbol)}</span>` +
    `<span class="math__base-value num">${num(b.value, 3, true)}` +
    `<span class="math__unit">${escapeHtml(b.unit)}</span></span>` +
    `<span class="math__base-note">${escapeHtml(b.note)}</span>` +
    `</div>`
  );
}
