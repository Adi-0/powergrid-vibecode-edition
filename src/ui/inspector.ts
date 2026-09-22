import { rich } from './glossary';

/**
 * The inspector: what the selected thing is (plain language first), then its numbers
 * with symbols, units and conventions, then where to read further. Built from rows;
 * every number in a row is a display-layer span.
 */
export type Content = Node | string;

export interface Section {
  title: Content;
  rows: Array<{ label: Content; value: Content; note?: Content }>;
  text?: Content;
}

const node = (c: Content): Node => (typeof c === 'string' ? rich(c) : c);

export class Inspector {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private titleEl: HTMLElement;
  onClose: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('aside');
    this.root.className = 'panel inspector';
    this.root.hidden = true;
    this.root.setAttribute('aria-live', 'polite');
    const h = document.createElement('header');
    this.titleEl = document.createElement('span');
    this.titleEl.textContent = 'Inspector';
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '✕';
    close.title = 'Close (Esc)';
    close.addEventListener('click', () => this.onClose());
    h.append(this.titleEl, close);
    this.body = document.createElement('div');
    this.body.className = 'body';
    this.root.append(h, this.body);
    parent.appendChild(this.root);
  }

  show(opts: { header: string; name: Content; kind: Content; intro?: Content; sections: Section[] }): void {
    this.root.hidden = false;
    this.titleEl.textContent = opts.header;
    const b = this.body;
    const scroll = b.scrollTop;
    b.replaceChildren();
    const h2 = document.createElement('h2');
    h2.appendChild(node(opts.name));
    const kind = document.createElement('div');
    kind.className = 'kind';
    kind.appendChild(node(opts.kind));
    b.append(h2, kind);
    if (opts.intro) {
      const p = document.createElement('p');
      p.appendChild(node(opts.intro));
      b.appendChild(p);
    }
    for (const s of opts.sections) {
      const h3 = document.createElement('h3');
      h3.appendChild(node(s.title));
      b.appendChild(h3);
      if (s.text) {
        const p = document.createElement('p');
        p.appendChild(node(s.text));
        b.appendChild(p);
      }
      if (s.rows.length) {
        const t = document.createElement('table');
        for (const r of s.rows) {
          const tr = document.createElement('tr');
          const a = document.createElement('td');
          a.appendChild(node(r.label));
          const v = document.createElement('td');
          v.appendChild(node(r.value));
          tr.append(a, v);
          t.appendChild(tr);
          if (r.note) {
            const tr2 = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 2;
            td.className = 'scale';
            td.appendChild(node(r.note));
            tr2.appendChild(td);
            t.appendChild(tr2);
          }
        }
        b.appendChild(t);
      }
    }
    b.scrollTop = scroll;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
