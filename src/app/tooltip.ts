/**
 * Hover definitions.
 *
 * The rule the brief sets is absolute: no unglossed jargon, ever. Any term that
 * would be opaque to someone with no background carries a definition available
 * on hover, and the same definitions live in a searchable glossary.
 *
 * `term()` is the markup helper. Writing
 *
 *     `The ${term('bus')} voltage is ...`
 *
 * produces a span that is marked with a fine dotted underline — not a colour,
 * because the one signal colour is reserved — and that shows the definition on
 * hover. If the id is not in the glossary it throws in development, which is
 * how a term slipping through unglossed becomes a test failure rather than a
 * thing nobody notices.
 */

import { lookup, GlossaryEntry } from '../data/glossary.js';

/** Terms that have been rendered without a glossary entry, for the test. */
export const MISSING_TERMS = new Set<string>();

/**
 * Mark up a term so it carries its definition.
 *
 * @param id     glossary id, term or alias
 * @param label  text to show, if different from the canonical term
 */
export function term(id: string, label?: string): string {
  const entry = lookup(id);
  if (!entry) {
    MISSING_TERMS.add(id);
    return escapeHtml(label ?? id);
  }
  return (
    `<span class="term" data-term="${escapeAttr(entry.id)}">` +
    `${escapeHtml(label ?? entry.term)}</span>`
  );
}

/** A quantity with its symbol and unit, the way the brief requires. */
export function quantity(
  value: string,
  opts: { symbol?: string; unit?: string; termId?: string; alarm?: boolean } = {}
): string {
  const parts: string[] = [];
  if (opts.symbol) {
    parts.push(`<span class="quantity__symbol">${escapeHtml(opts.symbol)}</span>`);
  }
  parts.push(`<span class="quantity__value num">${escapeHtml(value)}</span>`);
  if (opts.unit) {
    const u = opts.termId
      ? term(opts.termId, opts.unit)
      : escapeHtml(opts.unit);
    parts.push(`<span class="quantity__unit">${u}</span>`);
  }
  return `<span class="quantity${opts.alarm ? ' is-alarm' : ''}">${parts.join('')}</span>`;
}

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const escapeAttr = escapeHtml;

/**
 * The floating definition panel.
 *
 * One instance for the whole app, attached to the document, positioned near
 * whatever is hovered and kept inside the window.
 */
export class Tooltip {
  private readonly el: HTMLDivElement;
  private hideTimer: number | null = null;
  /** Called when the reader asks to see a term in the full glossary. */
  onOpenGlossary?: (id: string) => void;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'tooltip';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);

    // One delegated listener for every `.term` in the app, present or future.
    document.addEventListener('pointerover', (e) => {
      const t = (e.target as HTMLElement | null)?.closest?.('.term');
      if (!t) return;
      const id = (t as HTMLElement).dataset.term;
      if (!id) return;
      const entry = lookup(id);
      if (entry) this.showEntry(entry, t as HTMLElement);
    });
    document.addEventListener('pointerout', (e) => {
      const t = (e.target as HTMLElement | null)?.closest?.('.term');
      if (t) this.hide();
    });
    document.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement | null)?.closest?.('.term');
      const id = (t as HTMLElement | null)?.dataset?.term;
      if (id) this.onOpenGlossary?.(id);
    });
  }

  /** Show a glossary entry beside an element. */
  showEntry(entry: GlossaryEntry, anchor: HTMLElement): void {
    const bits: string[] = [];
    bits.push(
      `<div><span class="tooltip__term">${escapeHtml(entry.term)}</span>` +
      (entry.symbol ? `<span class="tooltip__symbol">${escapeHtml(entry.symbol)}</span>` : '') +
      (entry.unit ? `<span class="tooltip__symbol">${escapeHtml(entry.unit)}</span>` : '') +
      `</div>`
    );
    bits.push(`<div class="tooltip__short">${escapeHtml(entry.short)}</div>`);
    if (entry.scale) {
      bits.push(`<div class="tooltip__scale">${escapeHtml(entry.scale)}</div>`);
    }
    this.show(bits.join(''), anchor);
  }

  /** Show arbitrary HTML beside an element. */
  show(html: string, anchor: HTMLElement): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.el.innerHTML = html;
    this.el.style.display = 'block';
    this.position(anchor);
  }

  /**
   * Show something beside a point on the drawing rather than beside an element.
   *
   * The map's own marks are not DOM nodes, so a readout for the thing under the
   * cursor has nothing to anchor to. Everything else about it is the same
   * tooltip, in the same place, with the same rules about staying on screen.
   */
  showAtPoint(html: string, x: number, y: number): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.el.innerHTML = html;
    this.el.style.display = 'block';
    const t = this.el.getBoundingClientRect();
    const margin = 8;
    let left = x + 14;
    let top = y + 16;
    if (left + t.width > window.innerWidth - margin) left = x - t.width - 14;
    if (top + t.height > window.innerHeight - margin) top = y - t.height - 14;
    this.el.style.left = `${Math.round(Math.max(margin, left))}px`;
    this.el.style.top = `${Math.round(Math.max(margin, top))}px`;
  }

  private position(anchor: HTMLElement): void {
    const a = anchor.getBoundingClientRect();
    const t = this.el.getBoundingClientRect();
    const margin = 8;
    let x = a.left;
    let y = a.bottom + 6;
    if (y + t.height > window.innerHeight - margin) y = a.top - t.height - 6;
    if (x + t.width > window.innerWidth - margin) x = window.innerWidth - t.width - margin;
    if (x < margin) x = margin;
    if (y < margin) y = margin;
    this.el.style.left = `${Math.round(x)}px`;
    this.el.style.top = `${Math.round(y)}px`;
  }

  hide(): void {
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.el.style.display = 'none';
      this.hideTimer = null;
    }, 60);
  }
}
