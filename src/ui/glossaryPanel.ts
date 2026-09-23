import { TERMS } from './glossary';

/**
 * The glossary: every term of art the app uses, searchable by its name, its notation
 * or its plain-language definition. Clicking a term anywhere in the app opens it here.
 */
export class GlossaryPanel {
  readonly root: HTMLElement;
  private list: HTMLElement;
  private scroller!: HTMLElement;
  private input: HTMLInputElement;
  onClose: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('aside');
    this.root.className = 'panel sidepanel glossary';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Glossary');
    const h = document.createElement('header');
    const t = document.createElement('span');
    t.textContent = 'Glossary';
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '✕';
    close.title = 'Close';
    close.addEventListener('click', () => this.onClose());
    h.append(t, close);
    const body = document.createElement('div');
    body.className = 'body';
    this.input = document.createElement('input');
    this.input.type = 'search';
    this.input.placeholder = 'Search terms, symbols, definitions';
    this.input.setAttribute('aria-label', 'Search the glossary');
    this.input.addEventListener('input', () => this.filter(this.input.value));
    this.list = document.createElement('dl');
    // definitions are the glossary's own text: any figure in them comes from there
    this.list.dataset.prov = 'doc:glossary';
    for (const term of [...TERMS].sort((a, b) => a.term.localeCompare(b.term))) {
      const dt = document.createElement('dt');
      dt.id = `g-${term.id}`;
      dt.dataset.term = term.id;
      dt.textContent = term.term;
      if (term.notation) {
        const n = document.createElement('span');
        n.className = 'notation';
        // as written in the glossary (its notations are plain strings, not formula markup)
        n.textContent = term.notation;
        dt.append(' ', n);
      }
      const dd = document.createElement('dd');
      dd.dataset.term = term.id;
      dd.textContent = term.plain + (term.more ? ` ${term.more}` : '');
      this.list.append(dt, dd);
    }
    body.append(this.input, this.list);
    this.scroller = body;
    this.root.append(h, body);
    parent.appendChild(this.root);
  }

  private filter(q: string): number {
    const s = q.trim().toLowerCase();
    let shown = 0;
    for (const term of TERMS) {
      const hit = !s || term.term.toLowerCase().includes(s) || term.plain.toLowerCase().includes(s) || (term.notation ?? '').toLowerCase().includes(s) || term.id.includes(s);
      for (const e of this.list.querySelectorAll<HTMLElement>(`[data-term="${term.id}"]`)) e.hidden = !hit;
      if (hit) shown++;
    }
    return shown;
  }

  show(focus?: string): void {
    this.root.hidden = false;
    this.input.value = '';
    this.filter('');
    if (focus) {
      const e = this.list.querySelector<HTMLElement>(`#g-${focus}`);
      if (e) {
        // scroll the panel only (scrollIntoView would move the page too)
        this.scroller.scrollTop = e.offsetTop - this.scroller.offsetTop - 40;
        e.classList.add('focus');
        window.setTimeout(() => e.classList.remove('focus'), 1500);
      }
    } else this.input.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }
}
