import { DASH_PATTERNS, DASH, FLOW_LEGEND_MW, INK, INK_35, SIGNAL, type VoltageClass } from '../render/style';
import { chevronSize, FLOW_PX_PER_MW } from '../render/flow';
import { converterSymbol, generatorSymbol, substationSymbol, warningSymbol, crossSymbol, type Symbol } from '../render/symbols';
import { el, qty, data } from './quantity';
import { rich } from './glossary';

/**
 * The KEY: always present, always complete for what the current view draws, always
 * correct because every sample is drawn from the same style tokens and functions the
 * renderer uses (voltage-class weights and dashes, symbol geometry, chevron sizing).
 */

const SVGNS = 'http://www.w3.org/2000/svg';

function svg(w: number, h: number): SVGSVGElement {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('width', String(w));
  s.setAttribute('height', String(h));
  s.setAttribute('viewBox', `0 0 ${w} ${h}`);
  s.setAttribute('aria-hidden', 'true');
  return s;
}

function strokeSample(width: number, dash: keyof typeof DASH, color = INK): SVGSVGElement {
  const s = svg(54, 14);
  const l = document.createElementNS(SVGNS, 'line');
  l.setAttribute('x1', '2');
  l.setAttribute('x2', '52');
  l.setAttribute('y1', '7');
  l.setAttribute('y2', '7');
  l.setAttribute('stroke', color);
  l.setAttribute('stroke-width', String(width));
  l.setAttribute('stroke-linecap', 'round');
  const p = DASH_PATTERNS[DASH[dash]]!;
  if (p[0] > 0) l.setAttribute('stroke-dasharray', `${p[0]} ${p[1]} ${p[2]} ${p[3]}`);
  s.appendChild(l);
  return s;
}

function symbolSample(sym: Symbol, width: number, color = INK, h = 18): SVGSVGElement {
  const s = svg(54, h);
  sym.polys.forEach((poly, i) => {
    const e = document.createElementNS(SVGNS, sym.closed[i] ? 'polygon' : 'polyline');
    e.setAttribute('points', poly.map(([x, y]) => `${27 + x},${h / 2 - y}`).join(' '));
    e.setAttribute('fill', 'none');
    e.setAttribute('stroke', color);
    e.setAttribute('stroke-width', String(width));
    e.setAttribute('stroke-linejoin', 'round');
    s.appendChild(e);
  });
  return s;
}

function chevronSample(mw: number): SVGSVGElement {
  const W = chevronSize(mw);
  const s = svg(54, Math.max(14, W + 4));
  const cy = Math.max(14, W + 4) / 2;
  const L = 0.55 * W;
  const base = document.createElementNS(SVGNS, 'line');
  base.setAttribute('x1', '2');
  base.setAttribute('x2', '52');
  base.setAttribute('y1', String(cy));
  base.setAttribute('y2', String(cy));
  base.setAttribute('stroke', INK);
  base.setAttribute('stroke-width', '2');
  s.appendChild(base);
  for (const x of [18, 18 + 2.4 * W + 6]) {
    if (x > 50) continue;
    const pl = document.createElementNS(SVGNS, 'polyline');
    pl.setAttribute('points', `${x - L / 2},${cy - W / 2} ${x + L / 2},${cy} ${x - L / 2},${cy + W / 2}`);
    pl.setAttribute('fill', 'none');
    pl.setAttribute('stroke', INK);
    pl.setAttribute('stroke-width', String(Math.max(1.25, 0.2 * W)));
    s.appendChild(pl);
  }
  return s;
}

function row(sample: Element, content: Node | string): HTMLDivElement {
  const r = document.createElement('div');
  r.className = 'row';
  const a = document.createElement('div');
  a.appendChild(sample);
  const b = document.createElement('div');
  if (typeof content === 'string') b.appendChild(rich(content));
  else b.appendChild(content);
  r.append(a, b);
  return r;
}

export interface LegendState {
  classes: VoltageClass[];
  showSignal: boolean;
  showOutOfService: boolean;
  noSolution: boolean;
}

export class Legend {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private last = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('aside');
    this.root.className = 'panel legend';
    this.root.setAttribute('aria-label', 'Key');
    const h = document.createElement('header');
    h.textContent = 'Key';
    const toggle = document.createElement('button');
    toggle.className = 'close';
    const setCollapsed = (c: boolean) => {
      this.root.classList.toggle('collapsed', c);
      toggle.textContent = c ? '+' : '–';
      toggle.title = c ? 'Show the key' : 'Collapse the key';
      toggle.setAttribute('aria-expanded', String(!c));
    };
    // On a phone the key starts folded to its heading so the map is visible; it is one
    // tap from complete.
    setCollapsed(window.matchMedia?.('(max-width: 760px)').matches ?? false);
    toggle.addEventListener('click', () => setCollapsed(!this.root.classList.contains('collapsed')));
    h.appendChild(toggle);
    this.body = document.createElement('div');
    this.body.className = 'body';
    this.root.append(h, this.body);
    parent.appendChild(this.root);
  }

  update(s: LegendState): void {
    const key = JSON.stringify([s.classes.map((c) => c.id), s.showSignal, s.showOutOfService, s.noSolution]);
    if (key === this.last) return;
    this.last = key;
    const b = this.body;
    b.replaceChildren();
    // voltage classes
    const g1 = document.createElement('div');
    g1.className = 'group';
    for (const c of s.classes) {
      const content = document.createElement('span');
      content.append(el(qty(c.kvNominal, 'kV', data(`style.voltageClass.${c.id}.kvNominal`), { digits: 0, basis: 'LL' })), document.createTextNode(' '));
      content.appendChild(rich(c.role === 'Subtransmission' ? '[[subtransmission]]' : c.role === 'Bulk transmission' ? 'bulk [[transmission]]' : '[[transmission]]'));
      g1.appendChild(row(strokeSample(c.weight, c.dash), content));
    }
    const note = document.createElement('div');
    note.className = 'note';
    note.appendChild(rich('Line weight and dash show voltage class; one stroke per [[circuit]].'));
    g1.appendChild(note);
    // symbols
    const g2 = document.createElement('div');
    g2.className = 'group';
    g2.appendChild(row(symbolSample(substationSymbol(7), 1.4), '[[substation]]'));
    const s500 = symbolSample(substationSymbol(9), 2);
    const inner = symbolSample(substationSymbol(4), 0.8);
    s500.append(...Array.from(inner.childNodes));
    const big = document.createElement('span');
    big.append(rich('[[substation]] on the bulk system'));
    g2.appendChild(row(s500, big));
    g2.appendChild(row(symbolSample(generatorSymbol(6.2), 1), 'Synchronous generator ([[inertia]])'));
    g2.appendChild(row(symbolSample(converterSymbol(11.5), 1), 'Inverter-based plant: solar, wind, battery (no inertia)'));
    // flow
    const g3 = document.createElement('div');
    g3.className = 'group';
    FLOW_LEGEND_MW.forEach((mw, i) => {
      const c = document.createElement('span');
      c.append(document.createTextNode('flow of '), el(qty(mw, 'MW', data(`style.FLOW_LEGEND_MW.${i}`), { digits: 0 })));
      g3.appendChild(row(chevronSample(mw), c));
    });
    const fn = document.createElement('div');
    fn.className = 'note';
    fn.append(rich('Chevrons point the way [[real-power|real power]] flows; size and speed ∝ MW ('));
    fn.append(el(qty(1 / FLOW_PX_PER_MW, 'MW', data('render.flow.FLOW_PX_PER_MW'), { digits: 0 })), document.createTextNode(' per px).'));
    g3.appendChild(fn);
    b.append(g1, g2, g3);
    // signal and out of service
    {
      const g4 = document.createElement('div');
      g4.className = 'group';
      g4.appendChild(row(symbolSample(warningSymbol(13), 1.4, SIGNAL), 'Something is wrong: over [[rating]], voltage out of range, no source'));
      g4.appendChild(row(strokeSample(3, 'solid', SIGNAL), 'Branch over its [[rating]]'));
      if (s.showOutOfService) {
        const svgX = strokeSample(2, 'hidden', INK_35);
        svgX.append(...Array.from(symbolSample(crossSymbol(9), 1.4).childNodes));
        g4.appendChild(row(svgX, 'Out of service (tripped)'));
      }
      if (s.noSolution) g4.appendChild(row(strokeSample(2.1, 'solid', INK_35), 'Grey and still: no operating point, so nothing drawn is a solved flow'));
      b.appendChild(g4);
    }
  }
}
