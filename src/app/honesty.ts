/**
 * The model-honesty panel, and the glossary.
 *
 * Model honesty is a UI feature, not an appendix. Every view carries a quiet,
 * always-available control that says what is simplified HERE and what the full
 * treatment would involve — filtered to the level the reader is actually
 * looking at, so the answer is about what is in front of them.
 *
 * It reads `src/data/simplifications.ts`, which is also the source
 * `docs/simplifications.md` is generated from, so the panel and the
 * documentation cannot disagree.
 */

import { SIMPLIFICATIONS, simplificationsFor, ScopeId } from '../data/simplifications.js';
import {
  GLOSSARY_CATEGORIES, searchGlossary, lookup, GlossaryEntry,
} from '../data/glossary.js';
import { escapeHtml } from './tooltip.js';

type PanelKind = 'honesty' | 'glossary';

export class SidePanel {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private kind: PanelKind = 'honesty';
  private scope: ScopeId = 'system';
  private query = '';
  private highlight: string | null = null;

  constructor(onClose: () => void) {
    this.element = document.createElement('aside');
    this.element.className = 'panel panel--side';
    this.element.style.display = 'none';
    this.element.innerHTML =
      `<div class="panel__head">` +
      `<span class="panel__title"></span>` +
      `<span class="panel__sub"></span>` +
      `<button class="panel__close" title="Close">×</button>` +
      `</div><div class="panel__body"></div>`;
    this.title = this.element.querySelector('.panel__title') as HTMLElement;
    this.sub = this.element.querySelector('.panel__sub') as HTMLElement;
    this.body = this.element.querySelector('.panel__body') as HTMLElement;
    (this.element.querySelector('.panel__close') as HTMLElement)
      .addEventListener('click', onClose);

    this.body.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('glossary__search')) {
        this.query = t.value;
        this.renderGlossaryList();
      }
    });
  }

  get isOpen(): boolean {
    return this.element.style.display !== 'none';
  }

  close(): void {
    this.element.style.display = 'none';
  }

  openHonesty(scope: ScopeId): void {
    this.kind = 'honesty';
    this.scope = scope;
    this.element.style.display = 'flex';
    this.render();
  }

  openGlossary(highlight?: string): void {
    this.kind = 'glossary';
    this.highlight = highlight ?? null;
    if (highlight) {
      const e = lookup(highlight);
      if (e) this.query = e.term;
    }
    this.element.style.display = 'flex';
    this.render();
  }

  /** Keep the honesty panel pointed at the level the reader is looking at. */
  setScope(scope: ScopeId): void {
    if (this.scope === scope) return;
    this.scope = scope;
    if (this.kind === 'honesty' && this.isOpen) this.render();
  }

  private render(): void {
    if (this.kind === 'honesty') this.renderHonesty();
    else this.renderGlossary();
  }

  // --- model honesty -------------------------------------------------------

  private renderHonesty(): void {
    this.title.textContent = 'What this model leaves out';
    this.sub.textContent = `at the ${this.scope} level`;

    const items = simplificationsFor(this.scope);
    const order = { material: 0, modest: 1, cosmetic: 2 } as const;
    items.sort((a, b) => order[a.severity] - order[b.severity]);

    const severityNote: Record<string, string> = {
      material: 'Changes the kind of answer you get.',
      modest: 'Shifts numbers by a few per cent, or hides a secondary effect.',
      cosmetic: 'Would not change any answer you read.',
    };

    this.body.innerHTML =
      `<p class="note">A model that hides its own edges teaches confident ` +
      `wrongness. Here is every place this one is not the whole story, for what ` +
      `you are looking at now.</p>` +
      items.map((s) => `
        <section class="honesty__item honesty__item--${s.severity}">
          <h4 class="honesty__title">${escapeHtml(s.title)}</h4>
          <p class="honesty__severity">${escapeHtml(severityNote[s.severity])}</p>
          <dl class="kv kv--stacked">
            <dt>What the model does</dt><dd>${escapeHtml(s.whatWeDo)}</dd>
            <dt>The full treatment</dt><dd>${escapeHtml(s.fullTreatment)}</dd>
            <dt>What that means for you</dt><dd>${escapeHtml(s.consequence)}</dd>
          </dl>
        </section>`).join('') +
      `<p class="note">${SIMPLIFICATIONS.length} entries in total, across every ` +
      `level. The same list is in <code>docs/simplifications.md</code>, generated ` +
      `from the same data this panel reads.</p>`;
  }

  // --- glossary ------------------------------------------------------------

  private renderGlossary(): void {
    this.title.textContent = 'Glossary';
    this.sub.textContent = 'every term, in plain language';
    this.body.innerHTML =
      `<input class="glossary__search" type="search" placeholder="Search terms…" ` +
      `value="${escapeHtml(this.query)}" />` +
      `<div class="glossary__list"></div>`;
    this.renderGlossaryList();
    const input = this.body.querySelector('.glossary__search') as HTMLInputElement;
    input.focus();
    input.select();
  }

  private renderGlossaryList(): void {
    const list = this.body.querySelector('.glossary__list');
    if (!list) return;
    const results = searchGlossary(this.query);

    if (this.query.trim()) {
      list.innerHTML = results.map((e) => this.entryHtml(e)).join('') ||
        `<p class="empty">Nothing matches that. Every term used anywhere in the ` +
        `interface has an entry here, so if you saw it on screen, try a shorter ` +
        `search.</p>`;
      return;
    }

    list.innerHTML = GLOSSARY_CATEGORIES.map((cat) => {
      const entries = results.filter((e) => e.category === cat.id);
      if (entries.length === 0) return '';
      return (
        `<h4 class="glossary__heading">${escapeHtml(cat.name)}</h4>` +
        entries.map((e) => this.entryHtml(e)).join('')
      );
    }).join('');
  }

  private entryHtml(e: GlossaryEntry): string {
    const hi = this.highlight === e.id ? ' is-highlighted' : '';
    return `
      <section class="glossary__entry${hi}" id="glossary-${escapeHtml(e.id)}">
        <h5 class="glossary__term">${escapeHtml(e.term)}
          ${e.symbol ? `<span class="glossary__symbol">${escapeHtml(e.symbol)}</span>` : ''}
          ${e.unit ? `<span class="glossary__unit">${escapeHtml(e.unit)}</span>` : ''}
        </h5>
        <p class="glossary__short">${escapeHtml(e.short)}</p>
        ${e.long ? `<p class="glossary__long">${escapeHtml(e.long)}</p>` : ''}
        ${e.scale ? `<p class="glossary__scale"><b>Scale.</b> ${escapeHtml(e.scale)}</p>` : ''}
        ${e.standard ? `<p class="glossary__standard">${escapeHtml(e.standard)}</p>` : ''}
      </section>`;
  }
}
