import { DASH_PATTERNS, DASH, INK, INK_35, INK_60, SIGNAL, type VoltageClass } from '../render/style';
import { chevronSizeFor, type FlowScale, type LevelKind } from '../levels/level';
import { converterSymbol, generatorSymbol, substationSymbol, transformerSymbol, warningSymbol, crossSymbol, faultSymbol, type Symbol } from '../render/symbols';
import { el, qty, data, dataText } from './quantity';
import { rich } from './glossary';
import { COMPONENTS } from '../data/components';

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

function chevronSample(W: number): SVGSVGElement {
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

/** A small drawing for the key: polylines in a 54 × h box (y down), stroke width, dash. */
function drawSample(h: number, parts: Array<{ pts: Array<[number, number]>; w: number; color?: string; dash?: string; closed?: boolean }>): SVGSVGElement {
  const s = svg(54, h);
  for (const p of parts) {
    const e = document.createElementNS(SVGNS, p.closed ? 'polygon' : 'polyline');
    e.setAttribute('points', p.pts.map(([x, y]) => `${x},${y}`).join(' '));
    e.setAttribute('fill', 'none');
    e.setAttribute('stroke', p.color ?? INK);
    e.setAttribute('stroke-width', String(p.w));
    e.setAttribute('stroke-linejoin', 'round');
    if (p.dash) e.setAttribute('stroke-dasharray', p.dash);
    s.appendChild(e);
  }
  return s;
}

/** The Substation level: equipment drawn to scale. */
function substationRows(g: HTMLElement): void {
  yardRows(g);
  g.appendChild(row(drawSample(14, [{ pts: [[4, 7], [50, 7]], w: 1.3, dash: '5 3' }]), 'Underground cable, from the switchgear out under the fence'));
}

/** Equipment drawn in a yard (Site and Substation levels), each as a small drawing. */
function yardRows(g: HTMLElement): void {
  g.appendChild(row(drawSample(18, [{ pts: [[4, 3], [30, 3], [50, 9]], w: 1 }, { pts: [[4, 9], [50, 9]], w: 1 }, { pts: [[4, 15], [30, 15], [50, 9]], w: 1 }]), 'Inside a yard, one conductor per phase — [[three-phase|three per circuit]]. On the map one stroke stands for all three.'));
  g.appendChild(row(drawSample(14, [{ pts: [[4, 4], [50, 4]], w: 1.8 }, { pts: [[4, 10], [50, 10]], w: 1.8 }]), '[[bus|Bus]]: rigid tubes on post insulators'));
  g.appendChild(row(drawSample(20, [{ pts: [[12, 19], [12, 6]], w: 0.8 }, { pts: [[42, 19], [42, 6]], w: 0.8 }, { pts: [[12, 6], [42, 6]], w: 1.4 }, { pts: [[9, 11], [15, 11]], w: 0.6 }, { pts: [[39, 11], [45, 11]], w: 0.6 }]), '[[disconnect|Disconnect switch]]: a blade between two [[insulator|insulators]], opened to isolate equipment'));
  g.appendChild(row(drawSample(20, [{ pts: [[14, 13], [40, 13], [40, 19], [14, 19], [14, 13]], w: 1.2 }, { pts: [[17, 13], [10, 3]], w: 0.8 }, { pts: [[37, 13], [44, 3]], w: 0.8 }]), '[[breaker|Circuit breaker]]: a tank that interrupts current, its [[bushing|bushings]] rising to the conductors'));
  g.appendChild(row(drawSample(22, [{ pts: [[8, 21], [8, 3], [26, 3], [26, 21]], w: 1.2 }, { pts: [[40, 21], [45, 2], [50, 21]], w: 0.8 }, { pts: [[38, 5], [52, 5]], w: 0.8 }]), '[[gantry|Gantry]] where a line ends in the yard; outside, the tower that carries it away'));
  g.appendChild(row(drawSample(22, [{ pts: [[14, 20], [40, 20], [40, 8], [14, 8], [14, 20]], w: 1.2 }, { pts: [[18, 8], [18, 2]], w: 0.8 }, { pts: [[27, 8], [27, 2]], w: 0.8 }, { pts: [[36, 8], [36, 4]], w: 0.8 }, { pts: [[42, 10], [42, 18]], w: 0.6 }, { pts: [[45, 10], [45, 18]], w: 0.6 }]), '[[transformer|Transformer]]: tank, cooling radiators, high-voltage bushings on one side and low on the other'));
  g.appendChild(row(drawSample(14, [{ pts: [[4, 7], [50, 7]], w: 0.6, color: INK_60, dash: '18 5' }]), 'Fence'));
}

/** The Site level: a station's yard, drawn from the network data. */
function siteRows(g: HTMLElement): void {
  yardRows(g);
  g.appendChild(row(drawSample(18, [{ pts: [[10, 17], [24, 17], [24, 7], [10, 7], [10, 17]], w: 1 }, { pts: [[34, 17], [34, 2]], w: 1 }, { pts: [[42, 17], [42, 2]], w: 1 }]), 'A plant beside its bay, by kind: turbine hall and stack, powerhouse, turbines, panels, batteries'));
}

/** The Plant level: machinery to scale, pipes, the shaft, the enclosed bus. */
function plantRows(g: HTMLElement): void {
  g.appendChild(row(drawSample(22, [{ pts: [[16, 18], [30, 21], [42, 15], [42, 5], [28, 2], [16, 8], [16, 18]], w: 1.2 }, { pts: [[16, 8], [30, 11], [42, 5]], w: 1.2 }, { pts: [[30, 11], [30, 21]], w: 1.2 }]), 'Machinery drawn to scale: turbines, [[hrsg|HRSGs]], stacks, generators, transformers'));
  g.appendChild(row(drawSample(14, [{ pts: [[4, 7], [50, 7]], w: 0.8 }]), 'Pipe: natural gas, steam, seawater'));
  g.appendChild(row(drawSample(14, [{ pts: [[4, 7], [50, 7]], w: 2 }]), 'Shaft: turbine to generator'));
  g.appendChild(row(drawSample(14, [{ pts: [[4, 4], [50, 4], [50, 10], [4, 10], [4, 4]], w: 1 }]), 'Isolated-phase bus: the generator’s three conductors, each in its own enclosure'));
}

/** The Machine level: a generator cut open. */
function machineRows(g: HTMLElement): void {
  const cyl = drawSample(22, [
    { pts: [[8, 5], [44, 5]], w: 1.2 },
    { pts: [[8, 17], [44, 17]], w: 1.2 },
    { pts: [[8, 5], [5, 8], [5, 14], [8, 17]], w: 1.2 },
    { pts: [[44, 5], [47, 8], [47, 14], [44, 17]], w: 1.2 },
  ]);
  g.appendChild(row(cyl, 'Round parts drawn as a draughtsman would: end circles and the two outline edges'));
  g.appendChild(row(drawSample(14, [{ pts: [[4, 7], [50, 7]], w: 0.6, color: INK_60 }]), 'Slots of the rotor’s field winding'));
  g.appendChild(row(drawSample(14, [{ pts: [[4, 12], [16, 2], [28, 12], [40, 2], [50, 9]], w: 0.8, color: INK_60 }]), 'Break line: the turbine continues off the sheet'));
}

/** The Transformer level: a transformer cut open. */
function transformerRows(g: HTMLElement): void {
  const arrow = drawSample(14, [{ pts: [[8, 7], [46, 7]], w: 1.4 }, { pts: [[39, 3], [46, 7], [39, 11]], w: 1.4 }]);
  const fx = document.createElement('span');
  fx.append(
    rich('[[flux|Magnetic flux]] around the core, alternating: one phase per limb, a third of a cycle apart. Shown '),
    el(qty(COMPONENTS.slowdown, '', data('components.slowdown'), { digits: 0 })),
    document.createTextNode(' times slower than its '),
    el(qty(COMPONENTS.fHz, 'Hz', data('components.fHz'), { digits: 0 })),
  );
  g.appendChild(row(arrow, fx));
  g.appendChild(
    row(
      drawSample(18, [
        { pts: [[10, 2], [44, 2], [44, 16], [10, 16], [10, 2]], w: 0.8 },
        { pts: [[14, 5], [40, 5]], w: 2.2, color: INK_35 },
        { pts: [[14, 9], [40, 9]], w: 2.2, color: INK_35 },
        { pts: [[14, 13], [40, 13]], w: 2.2, color: INK_35 },
      ]),
      'A [[winding]] cut through: each block one [[turn]], drawn in the ratio of the windings’ voltages',
    ),
  );
  g.appendChild(row(drawSample(18, [{ pts: [[8, 2], [46, 2], [46, 16], [8, 16], [8, 2]], w: 1.4 }, { pts: [[16, 2], [16, 16]], w: 0.6, color: INK_60 }, { pts: [[24, 2], [24, 16]], w: 0.6, color: INK_60 }, { pts: [[32, 2], [32, 16]], w: 0.6, color: INK_60 }, { pts: [[40, 2], [40, 16]], w: 0.6, color: INK_60 }]), 'The [[core]] cut through: its thin steel sheets'));
  g.appendChild(row(drawSample(18, [{ pts: [[6, 16], [20, 4], [48, 4]], w: 0.6, color: INK_35 }, { pts: [[6, 16], [34, 16], [48, 4]], w: 0.6, color: INK_35 }]), 'Cut away: the half toward you, in light outline'));
}

/** The Breaker level: a breaker's pole cut open. */
function breakerRows(g: HTMLElement): void {
  g.appendChild(row(drawSample(18, [{ pts: [[6, 9], [14, 5], [20, 13], [27, 5], [34, 13], [40, 5], [48, 9]], w: 2.2 }]), 'An [[arc]], while the contacts part: the current going on across the gap'));
  g.appendChild(row(drawSample(14, [{ pts: [[8, 7], [44, 7]], w: 1.4 }, { pts: [[14, 3], [8, 7], [14, 11]], w: 1.4 }]), 'Gas blown through the nozzle across the arc'));
  g.appendChild(row(drawSample(14, [{ pts: [[4, 7], [50, 7]], w: 2.6, color: INK_60 }]), 'Insulating operating rod'));
  const t = document.createElement('span');
  t.append(rich('The opening plays in its real order, '), el(qty(COMPONENTS.slowdown, '', data('components.slowdown'), { digits: 0 })), document.createTextNode(' times slower'));
  g.appendChild(row(drawSample(18, [{ pts: [[4, 9], [16, 3], [28, 15], [40, 3], [50, 9]], w: 1 }]), t));
}

/** The Pole-top level: the service transformer opened. */
function poletopRows(g: HTMLElement): void {
  const arrow = drawSample(14, [{ pts: [[8, 7], [46, 7]], w: 1.4 }, { pts: [[39, 3], [46, 7], [39, 11]], w: 1.4 }]);
  const fx = document.createElement('span');
  fx.append(rich('[[flux|Magnetic flux]] in the core, alternating: up the middle leg, back down the outer two. Shown '), el(qty(COMPONENTS.slowdown, '', data('components.slowdown'), { digits: 0 })), document.createTextNode(' times slower'));
  g.appendChild(row(arrow, fx));
  g.appendChild(row(drawSample(18, [{ pts: [[8, 2], [20, 2], [20, 16], [8, 16], [8, 2]], w: 0.8 }, { pts: [[11, 5], [17, 5]], w: 5, color: INK_35 }, { pts: [[11, 13], [17, 13]], w: 5, color: INK_35 }, { pts: [[26, 2], [46, 2], [46, 16], [26, 16], [26, 2]], w: 0.8 }, { pts: [[29, 4], [43, 4]], w: 0.8, color: INK_35 }, { pts: [[29, 7], [43, 7]], w: 0.8, color: INK_35 }, { pts: [[29, 10], [43, 10]], w: 0.8, color: INK_35 }, { pts: [[29, 13], [43, 13]], w: 0.8, color: INK_35 }]), 'The coil cut through: the secondary’s two thick halves, the primary’s many fine [[turn|turns]]'));
  g.appendChild(row(drawSample(18, [{ pts: [[6, 16], [20, 4], [48, 4]], w: 0.6, color: INK_35 }, { pts: [[6, 16], [34, 16], [48, 4]], w: 0.6, color: INK_35 }]), 'Cut away: the half toward you, in light outline'));
}

/** The Feeder level: poles, devices, pole-top transformers, homes. */
function feederRows(g: HTMLElement): void {
  g.appendChild(row(drawSample(14, [{ pts: [[4, 7], [50, 7]], w: 1.8 }]), 'Three-phase trunk; thinner: a single-phase lateral'));
  g.appendChild(row(symbolSample({ polys: [[[-2, -4], [2, -4], [2, 4], [-2, 4]]], closed: [true] }, 1), '[[fuse|Fuse]] where a lateral leaves the trunk'));
  g.appendChild(row(symbolSample({ polys: [[[-4.5, -4.5], [4.5, -4.5], [4.5, 4.5], [-4.5, 4.5]]], closed: [true] }, 1), '[[recloser|Recloser]]'));
  const reg = symbolSample(transformerSymbol(0.01), 1);
  reg.replaceChildren(...Array.from(symbolSample({ polys: [circleSample(5.5), [[-7, -6], [7, 6]], [[3.5, 6], [7, 6], [7, 2.5]]], closed: [true, false, false] }, 1).childNodes));
  g.appendChild(row(reg, '[[regulator|Voltage regulator]]'));
  g.appendChild(row(symbolSample({ polys: [[[-5, 2], [5, 2]], [[-5, -2], [5, -2]], [[0, 2], [0, 7]], [[0, -2], [0, -7]]], closed: [false, false, false, false] }, 1), '[[capacitor-bank|Capacitor bank]]'));
  g.appendChild(row(symbolSample(transformerSymbol(2.6), 1), 'Pole-top [[transformer|transformer]]; from it, the service drops'));
  g.appendChild(row(drawSample(18, [{ pts: [[20, 14], [34, 14], [40, 10], [40, 4], [26, 4], [20, 8], [20, 14]], w: 1 }, { pts: [[20, 8], [34, 8], [40, 4]], w: 1 }, { pts: [[34, 8], [34, 14]], w: 1 }, { pts: [[24, 6.5], [34, 6.5]], w: 0.6 }]), 'A home, to scale; a line on the roof: [[btm-solar|rooftop solar]]'));
}

function circleSample(r: number): Array<[number, number]> {
  const p: Array<[number, number]> = [];
  for (let i = 0; i < 24; i++) p.push([r * Math.cos((i / 24) * Math.PI * 2), r * Math.sin((i / 24) * Math.PI * 2)]);
  return p;
}

/** The Region level's own symbols: layers, busbars, transformers, risers and drops. */
function regionRows(g: HTMLElement): void {
  const plate = DASH_PATTERNS[DASH.dashDot]!;
  g.appendChild(row(drawSample(14, [{ pts: [[2, 10], [16, 3], [52, 3], [38, 10], [2, 10]], w: 0.8, color: INK_35, dash: plate.join(' ') }]), 'A voltage layer: every circuit at that voltage in the region'));
  g.appendChild(row(drawSample(22, [{ pts: [[27, 21], [27, 1]], w: 0.8, color: INK_35, dash: '5 3' }, { pts: [[16, 6], [38, 6]], w: 3.2 }]), '[[bus|Busbar]] of a [[substation]] on its layer; the dashed axis joins its layers'));
  const tx = symbolSample(transformerSymbol(4.2), 1.1, INK, 22);
  const v = document.createElementNS(SVGNS, 'line');
  for (const [k, val] of Object.entries({ x1: 27, x2: 27, y1: 0, y2: 22, stroke: INK, 'stroke-width': 1.4 })) v.setAttribute(k, String(val));
  tx.insertBefore(v, tx.firstChild);
  g.appendChild(row(tx, '[[transformer|Transformer]] between two layers'));
  const gen = symbolSample(generatorSymbol(6.2), 1, INK, 28);
  for (const c of Array.from(gen.children)) c.setAttribute('transform', 'translate(0 7)');
  const rise = document.createElementNS(SVGNS, 'line');
  for (const [k, val] of Object.entries({ x1: 27, x2: 27, y1: 14, y2: 1, stroke: INK, 'stroke-width': 1 })) rise.setAttribute(k, String(val));
  gen.appendChild(rise);
  g.appendChild(row(gen, 'Generation rising from the ground into its bus'));
  g.appendChild(row(drawSample(24, [{ pts: [[27, 1], [27, 20]], w: 1 }, { pts: [[22.5, 15], [27, 22], [31.5, 15]], w: 1.4 }]), 'Demand descending to the customers on the ground'));
  g.appendChild(row(drawSample(14, [{ pts: [[2, 7], [40, 7]], w: 2.1 }, { pts: [[36, 11], [44, 3]], w: 1.4, color: INK_35 }]), 'Circuit continuing to a substation outside the region'));
  const dc = drawSample(14, [{ pts: [[2, 7], [52, 7]], w: 2.1, dash: '1.5 3' }]);
  dc.append(...Array.from(symbolSample(converterSymbol(9), 1, INK, 14).childNodes));
  g.appendChild(row(dc, '[[hvdc|DC link]], a converter at each end'));
}

export interface LegendState {
  level: LevelKind;
  classes: VoltageClass[];
  flowScale: FlowScale;
  showSignal: boolean;
  showOutOfService: boolean;
  noSolution: boolean;
  /** A fault is on the sheet (its mark, open devices, the section without supply). */
  fault?: boolean;
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
    const key = JSON.stringify([s.level, s.classes.map((c) => c.id), s.flowScale, s.showSignal, s.showOutOfService, s.noSolution, s.fault]);
    if (key === this.last) return;
    this.last = key;
    const b = this.body;
    b.replaceChildren();
    // voltage classes
    const g1 = document.createElement('div');
    g1.className = 'group';
    for (const c of s.classes) {
      const content = document.createElement('span');
      // below 1 kV a class is named by its service voltages (120/240 V), not a kV figure
      content.append(
        c.kvNominal >= 1
          ? el(qty(c.kvNominal, 'kV', data(`style.voltageClass.${c.id}.kvNominal`), { digits: c.kvNominal >= 20 ? 0 : 0, basis: 'LL' }))
          : dataText(c.label, data(`style.voltageClass.${c.id}.label`)),
        document.createTextNode(' '),
      );
      const roles: Record<string, string> = {
        'Bulk transmission': 'bulk [[transmission]]',
        Transmission: '[[transmission]]',
        Subtransmission: '[[subtransmission]]',
        'Primary distribution': 'primary [[distribution]]',
        'Secondary / service': 'secondary and service',
        'Generator voltage': 'generator voltage, inside the plant',
      };
      content.appendChild(rich(roles[c.role] ?? c.role.toLowerCase()));
      g1.appendChild(row(strokeSample(c.weight, c.dash), content));
    }
    const note = document.createElement('div');
    note.className = 'note';
    note.appendChild(rich('Line weight and dash show voltage class; one stroke per [[circuit]].'));
    g1.appendChild(note);
    // symbols
    const g2 = document.createElement('div');
    g2.className = 'group';
    if (s.level === 'region') {
      regionRows(g2);
    } else if (s.level === 'substation') {
      substationRows(g2);
    } else if (s.level === 'site') {
      siteRows(g2);
    } else if (s.level === 'feeder' || s.level === 'service') {
      feederRows(g2);
    } else if (s.level === 'plant') {
      plantRows(g2);
    } else if (s.level === 'machine') {
      machineRows(g2);
    } else if (s.level === 'transformer') {
      transformerRows(g2);
    } else if (s.level === 'breaker') {
      breakerRows(g2);
    } else if (s.level === 'poletop') {
      poletopRows(g2);
    } else {
    g2.appendChild(row(symbolSample(substationSymbol(7), 1.4), '[[substation]]'));
    const s500 = symbolSample(substationSymbol(9), 2);
    const inner = symbolSample(substationSymbol(4), 0.8);
    s500.append(...Array.from(inner.childNodes));
    const big = document.createElement('span');
    big.append(rich('[[substation]] on the bulk system'));
    g2.appendChild(row(s500, big));
    g2.appendChild(row(symbolSample(generatorSymbol(6.2), 1), 'Synchronous generator ([[inertia]])'));
    g2.appendChild(row(symbolSample(converterSymbol(11.5), 1), 'Inverter-based plant: solar, wind, battery (no inertia)'));
    }
    // flow
    const g3 = document.createElement('div');
    g3.className = 'group';
    const fs = s.flowScale;
    fs.samples.forEach((v, i) => {
      const c = document.createElement('span');
      c.append(document.createTextNode(s.level === 'transformer' ? 'heat of ' : 'flow of '), el(qty(v, fs.unit, data(`style.flowScale.${s.level}.samples.${i}`), { digits: 0 })));
      g3.appendChild(row(chevronSample(chevronSizeFor(v, fs)), c));
    });
    const fn = document.createElement('div');
    fn.className = 'note';
    fn.append(
      rich(
        s.level === 'plant' || s.level === 'machine'
          ? `Chevrons show where power goes, whatever its form — fuel, heat, steam, shaft work, electricity; size and speed ∝ ${fs.unit} (`
          : s.level === 'transformer'
            ? `Chevrons carry heat: the windings’ [[losses]], taken by the oil to the radiators; size and speed ∝ ${fs.unit} (`
            : s.level === 'breaker'
              ? `Chevrons: [[real-power|real power]] through the pole cut open, one phase of the three; size and speed ∝ ${fs.unit} (`
              : s.level === 'poletop'
                ? `Chevrons: [[real-power|real power]] out along each leg to the homes; size and speed ∝ ${fs.unit} (`
              : `Chevrons point the way [[real-power|real power]] flows; size and speed ∝ ${fs.unit} (`,
      ),
    );
    fn.append(el(qty(fs.perPx, fs.unit, data(`style.flowScale.${s.level}.perPx`), { digits: fs.perPx < 10 ? 1 : 0 })), document.createTextNode(' per px on this sheet).'));
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
      if (s.fault) {
        g4.appendChild(row(symbolSample(faultSymbol(16), 1.6, SIGNAL, 22), 'A [[fault|fault]]; chevrons: its current'));
        g4.appendChild(row(symbolSample(crossSymbol(9), 1.4), 'Protective device open'));
        g4.appendChild(row(strokeSample(1.8, 'hidden', SIGNAL), 'Without supply'));
      }
      b.appendChild(g4);
    }
  }
}
