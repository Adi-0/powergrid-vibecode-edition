import { invWave, INVERTER_EFF, type InvState } from '../model/invState';
import { COMPONENTS } from '../data/components';
import { data, dataText, derived, el, qty, solver, type Prov } from '../ui/quantity';
import type { Section } from '../ui/inspector';
import { rich } from '../ui/glossary';
import type { View } from './inspect-dist';

/**
 * What the inspector says inside a home's solar inverter: where its power comes from,
 * how the switches turn direct current into alternating, and where it goes — into the
 * home, out through the meter, and into the state's rooftop total.
 */

function span(...parts: Array<Node | string>): HTMLSpanElement {
  const s = document.createElement('span');
  for (const p of parts) s.append(typeof p === 'string' ? rich(p) : p);
  return s;
}

const SVGNS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

function svgText(parent: Element, x: number, y: number, t: string, prov: string, opts: { anchor?: string; size?: number } = {}): void {
  const e = svgEl('text', { x, y, 'font-size': opts.size ?? 9, 'text-anchor': opts.anchor ?? 'start', fill: 'var(--ink)', 'data-prov': prov }, parent);
  e.textContent = t;
}

const chartDiv = (n: Node) => {
  const d = document.createElement('div');
  d.className = 'chart';
  d.appendChild(n);
  return d;
};

/**
 * One cycle as the inverter makes it: the bridge's output, full DC one way or the
 * other in pulses whose widths follow the sine (light), the line's voltage it is made
 * to match (heavy), and the current pushed out, in step with it (dashed). The cursor,
 * moved by the app, marks the instant the drawing shows.
 */
function pwmChart(st: InvState): SVGSVGElement {
  const W = 330;
  const H = 150;
  const L = 30;
  const R = 12;
  const T = 16;
  const B = 24;
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-label': 'The bridge’s pulses, the line voltage and the current, one cycle' }) as SVGSVGElement;
  const Tc = 1 / COMPONENTS.fHz;
  const X = (t: number) => L + (t / Tc) * (W - L - R);
  const Y = (u: number) => T + ((1 - u) / 2) * (H - T - B);
  svgEl('line', { x1: L, y1: Y(0), x2: W - R, y2: Y(0), stroke: 'var(--ink-35)', 'stroke-width': 1 }, s);
  // the pulses: ±V_dc, as a step line
  const N = 900;
  const pts: string[] = [];
  let prev: number | null = null;
  for (let k = 0; k <= N; k++) {
    const t = (Tc * k) / N;
    const u = invWave(st, t).leg;
    if (prev !== null && u !== prev) pts.push(`${X(t).toFixed(1)},${Y(prev).toFixed(1)}`);
    pts.push(`${X(t).toFixed(1)},${Y(u).toFixed(1)}`);
    prev = u;
  }
  svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: 'var(--ink-35)', 'stroke-width': 0.8 }, s);
  // the line's voltage, per unit of V_dc, and the current, scaled to the same peak
  const line = (f: (t: number) => number, w: number, dash = '') => {
    const q: string[] = [];
    for (let k = 0; k <= 120; k++) {
      const t = (Tc * k) / 120;
      q.push(`${X(t).toFixed(1)},${Y(f(t)).toFixed(1)}`);
    }
    const e = svgEl('polyline', { points: q.join(' '), fill: 'none', stroke: 'var(--ink)', 'stroke-width': w }, s);
    if (dash) e.setAttribute('stroke-dasharray', dash);
  };
  line((t) => invWave(st, t).v / st.vdc, 1.8);
  // the current, drawn at a smaller height so it shows beside the voltage it keeps step with
  if (st.iac > 0) line((t) => (0.55 * st.m * invWave(st, t).i) / (Math.SQRT2 * st.iac), 1.1, '6 3');
  svgText(s, L - 4, Y(1) + 3, '+V_dc', 'notation:formula', { anchor: 'end', size: 8 });
  svgText(s, L - 4, Y(-1) + 3, '−V_dc', 'notation:formula', { anchor: 'end', size: 8 });
  svgText(s, L, T - 5, 'the bridge’s pulses (light), the line’s voltage (heavy), the current (dashed, not to scale)', 'notation:formula', { size: 8 });
  svgText(s, W - R, H - 6, 'one cycle', 'notation:formula', { anchor: 'end', size: 8 });
  const c = svgEl('line', { x1: L, y1: T - 2, x2: L, y2: H - B, stroke: 'var(--ink)', 'stroke-width': 1.4, 'data-cap-cursor': '1', 'data-x0': L, 'data-w': W - L - R, 'data-period': Tc }, s);
  c.setAttribute('opacity', '0.7');
  return s;
}

const provOf = (x: string): Prov => {
  const i = x.indexOf(':');
  const src = x.slice(0, i);
  const key = x.slice(i + 1);
  return src === 'solver' ? solver(key) : src === 'data' ? data(key) : derived(key);
};

/** The inverter with nothing picked. */
export function invView(name: string, st: InvState | null): View {
  const title = dataText(name, data('level.inverter.name'));
  const intro = span('Solar panels make [[direct-current|direct current]]: it flows one way only. The grid runs on alternating current, reversing a hundred and twenty times a second. The [[inverter]] makes the one from the other: four switches connect the panels to the line one way round and then the other, in pulses whose widths follow a sine ([[pwm|pulse-width modulation]]), and coils smooth the pulses into a sine current, pushed out in step with the line’s voltage.');
  if (!st) return { name: title, kind: span('[[inverter|Solar inverter]]'), intro, sections: [{ title: span('No operating point'), text: span('No solved state for this interval.'), rows: [] }] };
  const t = st.t;
  const kind = span('[[inverter|Solar inverter]] · ', el(qty(st.ratingKW, 'kW', data(`evergreen.layout.homes.${st.homeId}.pvKW`), { digits: 0 })), ' AC · ', el(qty(st.vdc, 'V', data('components.inverter.vdc'), { digits: 0 })), ' DC link');
  const pA = provOf(st.prov.pAC);
  const pV = provOf(st.prov.V);
  const d = (k: string, ...from: Prov[]) => derived(`t${t}.inv:${st.homeId}.${k}`, ...from);
  const sections: Section[] = [];
  if (st.pAC <= 1) {
    sections.push({ title: span('No sun'), text: span('The panels give nothing now. The inverter waits, its relay open, and the home runs on the grid.'), rows: [{ label: span('The home’s use'), value: el(qty(st.use / 1000, 'kW', d('use', provOf(st.prov.meter)), { digits: 2 })) }] });
  } else {
    const pDC = d('pDC', pA, data('solar.PV_DEFAULTS.inverterEff'));
    sections.push({
      title: span('From the roof'),
      rows: [
        { label: span('Sun on the panels'), value: el(qty(st.poa, 'W/m²', derived(`t${t}.solar.poa.EVERGREEN`), { digits: 0 })), note: span('a clear day, the panels tilted toward the south') },
        { label: span('Power from the panels'), value: el(qty(st.pDC / 1000, 'kW', pDC, { digits: 3 })), note: st.clipped ? span('they could give ', el(qty(st.pAvail / 1000, 'kW', d('pAvail'), { digits: 2 })), ': held back at the inverter’s rating') : span('steady, as the chevrons down the conduit show') },
        { label: span('At the DC link'), value: el(qty(st.vdc, 'V', data('components.inverter.vdc'), { digits: 0 })), note: span(el(qty(st.idc, 'A', d('idc', pDC), { digits: 2 })), ' from the panels') },
      ],
    });
    sections.push({
      title: span('Chopped into AC'),
      text: span('Each pulse puts the full DC voltage across the output, one way or the other; where the sine is high the pulses one way are long, where it is low they are short. The filter coils do not let the current change quickly, so it follows the pulses’ average: the sine.', chartDiv(pwmChart(st))),
      rows: [{ label: span('How deep the modulation runs, $m$'), value: el(qty(st.m, '', d('m', pV), { digits: 3 })), note: span('the sine’s peak over the DC voltage: it must stay below one') }],
    });
    sections.push({
      title: span('Out, in step with the grid'),
      text: span('The control watches the line’s voltage and pushes its current out in step with it, at unity power factor. The power out then pulses, from nothing to twice its average, twice a cycle; the panels’ power is steady; the [[dc-link|DC link]] capacitors take in the difference and give it back.'),
      rows: [
        { label: span('Power out'), value: el(qty(st.pAC / 1000, 'kW', pA, { digits: 3 })), note: span('lost as heat on the way: ', el(qty(st.loss, 'W', d('loss', pA), { digits: 0 }))) },
        { label: span('Current out, RMS'), value: el(qty(st.iac, 'A', d('iac', pA, pV), { digits: 2 })), note: span('in phase with the voltage') },
        { label: span('Line voltage, leg to leg'), value: el(qty(st.v12, 'V', pV, { digits: 1 })) },
      ],
    });
  }
  sections.push({
    title: span('The home, and everyone’s'),
    text: span('What the panels make goes first to whatever is running in the home; the rest flows out through the meter to the neighbours. Across California, rooftop panels like these are what hollow out the middle of the day on the time strip below: the duck’s belly.'),
    rows: [
      { label: span('The home’s own use'), value: el(qty(st.use / 1000, 'kW', d('use', provOf(st.prov.meter), pA), { digits: 2 })) },
      { label: span('Through the meter'), value: el(qty(st.meter / 1000, 'kW', provOf(st.prov.meter), { digits: 2 })), note: span(st.meter < 0 ? 'negative: selling to the grid' : 'bought from the grid') },
      { label: span('All of California’s [[btm-solar|rooftop solar]] now'), value: el(qty(st.btmMW, 'MW', provOf(st.prov.btm), { digits: 0 })) },
    ],
  });
  void INVERTER_EFF;
  return { name: title, kind, intro, sections };
}

/** A part of the inverter, picked. */
export function invPartView(name: string, st: InvState | null, what: string): View {
  const view = invView(name, st);
  const texts: Record<string, string> = {
    case: 'The inverter’s case, on the outside wall, its cover and near side cut away here.',
    dcin: 'The DC input and its disconnect: the panels’ two conductors come down the conduit to here. The disconnect lets the panels be cut off before anyone works inside.',
    dclink: 'The DC link capacitors: they hold the panels’ voltage steady against the switching, and take in and give back the difference between the steady power from the roof and the pulsing power out.',
    bridge: 'The H-bridge: four switches (transistors) on two legs. S1 and S4 together put the panels across the output one way round; S2 and S3 the other. Never both on one leg: that would short the DC.',
    filter: 'The filter inductors: coils that resist any quick change of current, so the current out follows the pulses’ average, a sine, instead of their edges.',
    relay: 'The output relay: closed while the inverter is feeding the line, opened within seconds if the grid goes away (anti-islanding), so the panels never keep a dead line alive.',
    control: 'The control: it tracks the voltage at which the panels give the most ([[mppt|MPPT]]), times the switches so the current is a sine in step with the line’s voltage, and watches the grid for trouble ([[anti-islanding]]).',
  };
  return { ...view, intro: span(texts[what] ?? '') };
}
