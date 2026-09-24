import SIMPLIFICATIONS from '../../docs/simplifications.md?raw';
import type { LevelKind } from '../levels/level';
import { rich } from './glossary';

/**
 * Model honesty: what the view in front of the reader simplifies, and what the full
 * treatment would involve. The text is docs/simplifications.md, bundled at build time
 * (no request at run time), so the panel and the document cannot drift apart; a test
 * checks every section the app asks for exists and every section is reachable.
 */
export interface HonestyItem {
  simplified: string;
  full: string;
}

export interface HonestySection {
  id: string;
  title: string;
  items: HonestyItem[];
}

export function parseSimplifications(md: string): HonestySection[] {
  const out: HonestySection[] = [];
  let cur: HonestySection | null = null;
  for (const line of md.split('\n')) {
    const h = /^## ([a-z0-9-]+) — (.+)$/.exec(line);
    if (h) {
      cur = { id: h[1]!, title: h[2]!.trim(), items: [] };
      out.push(cur);
      continue;
    }
    const b = /^- \*\*Simplified:\*\* (.*?) \*\*Full treatment:\*\* (.*)$/.exec(line);
    if (b && cur) cur.items.push({ simplified: b[1]!.trim(), full: b[2]!.trim() });
  }
  return out;
}

export const HONESTY = parseSimplifications(SIMPLIFICATIONS);

/** The sections each level shows, most specific first; `global` closes every list. */
export const LEVEL_SECTIONS: Record<LevelKind, string[]> = {
  system: ['system', 'transmission', 'slack', 'dispatch'],
  region: ['region', 'transmission', 'slack'],
  site: ['site', 'transmission'],
  substation: ['substation', 'distribution'],
  feeder: ['feeder', 'distribution'],
  service: ['service', 'distribution'],
  plant: ['plant', 'dispatch'],
  machine: ['machine', 'smib'],
  transformer: ['transformer', 'transmission'],
  breaker: ['breaker', 'site', 'transmission'],
  poletop: ['poletop', 'service', 'distribution'],
};

/** Sections that apply because of what the reader has done (tripped, faulted, opened the working). */
export type HonestyContext = 'trip' | 'frequency' | 'fault' | 'math';

export function sectionsFor(level: LevelKind, context: Iterable<HonestyContext>): HonestySection[] {
  const ids = [...new Set([...context, ...LEVEL_SECTIONS[level], 'global'])];
  return ids.map((id) => HONESTY.find((s) => s.id === id)).filter((s): s is HonestySection => !!s);
}

/** A light rendering of the document's inline markup: **bold** and `code`; everything else as text. */
function inline(text: string): DocumentFragment {
  const f = document.createDocumentFragment();
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) f.appendChild(document.createTextNode(text.slice(last, m.index)));
    const e = document.createElement(m[1] !== undefined ? 'strong' : 'code');
    e.textContent = m[1] ?? m[2]!;
    f.appendChild(e);
    last = m.index + m[0].length;
  }
  if (last < text.length) f.appendChild(document.createTextNode(text.slice(last)));
  return f;
}

export class HonestyPanel {
  readonly root: HTMLElement;
  private body: HTMLElement;
  onClose: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('aside');
    this.root.className = 'panel sidepanel honesty';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'What is simplified here');
    const h = document.createElement('header');
    const t = document.createElement('span');
    t.textContent = 'What is simplified here';
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '✕';
    close.title = 'Close';
    close.addEventListener('click', () => this.onClose());
    h.append(t, close);
    this.body = document.createElement('div');
    this.body.className = 'body';
    // the text is the model's own documentation: every figure in it comes from there
    this.body.dataset.prov = 'doc:simplifications';
    this.root.append(h, this.body);
    parent.appendChild(this.root);
  }

  show(level: LevelKind, context: Iterable<HonestyContext>): void {
    this.root.hidden = false;
    const b = this.body;
    b.replaceChildren();
    const p = document.createElement('p');
    p.appendChild(rich('This model is physically faithful but not asset-accurate. For what is on the sheet now, here is what it leaves out, and what the full treatment would involve.'));
    b.appendChild(p);
    for (const s of sectionsFor(level, context)) {
      const h3 = document.createElement('h3');
      h3.textContent = s.title;
      b.appendChild(h3);
      for (const it of s.items) {
        const d = document.createElement('div');
        d.className = 'item';
        const a = document.createElement('p');
        a.className = 'simplified';
        a.appendChild(inline(it.simplified));
        const f = document.createElement('p');
        f.className = 'full';
        const lead = document.createElement('span');
        lead.className = 'lead';
        lead.textContent = 'The full treatment: ';
        f.append(lead, inline(it.full));
        d.append(a, f);
        b.appendChild(d);
      }
    }
  }

  hide(): void {
    this.root.hidden = true;
  }
}
