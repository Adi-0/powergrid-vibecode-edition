import type { XfmrPlate, XfmrState } from '../model/xfmrState';
import { interruption, type BreakerState, type Interruption } from '../model/breakerState';
import type { PoleTopState } from '../model/poletopState';
import type { SpanCircuit, SpanState } from '../model/spanState';
import { conductorTemperature, sagAt } from '../physics/ieee738';
import type { SpanLevel } from '../levels/span';
import { capWave, type CapBankState } from '../model/capState';
import type { Grid } from '../model/grid';
import { CONDUCTORS } from '../data/conductors';
import type { CoreGeom, Winding } from '../levels/transformer';
import { COMPONENTS } from '../data/components';
import { data, dataText, derived, el, qty, solver, type Prov } from '../ui/quantity';
import type { Section } from '../ui/inspector';
import { rich } from '../ui/glossary';
import type { View } from './inspect-dist';

/**
 * What the inspector says inside a component opened up: how the thing works, in the
 * order the drawing shows it, each step with the live numbers that go with it; and
 * for each part picked, what it is for.
 */

function span(...parts: Array<Node | string>): HTMLSpanElement {
  const s = document.createElement('span');
  for (const p of parts) s.append(typeof p === 'string' ? rich(p) : p);
  return s;
}

/** A provenance string (`solver:…`, `data:…`, `derived:…`) as the display layer's Prov. */
export function provOf(s: string): Prov {
  const i = s.indexOf(':');
  const src = s.slice(0, i);
  const key = s.slice(i + 1);
  return src === 'solver' ? solver(key) : src === 'data' ? data(key) : derived(key);
}

const S3 = Math.sqrt(3);

/** The windings that carry the terminals' current (not the tertiary, not the taps). */
function mainWindings(core: CoreGeom): Winding[] {
  return core.windings.filter((w) => w.role !== 'tertiary' && w.role !== 'tap');
}

/** A winding's voltage, and its provenance from the nameplate. */
function windingKV(p: XfmrPlate, w: Winding): { v: number; prov: Prov; basis: 'LL' | 'LN' } {
  const key = `${p.dataKey}.winding.${w.role}.kv`;
  if (w.role === 'tertiary') return { v: w.kv, prov: data(p.keys.tertiaryKV), basis: 'LL' };
  if (w.role === 'series') return { v: w.kv, prov: derived(key, data(p.keys.hvKV), data(p.keys.lvKV)), basis: 'LN' };
  const src = w.role === 'hv' ? p.keys.hvKV : p.keys.lvKV;
  return { v: w.kv, prov: w.conn === 'D' ? data(src) : derived(key, data(src)), basis: w.conn === 'D' ? 'LL' : 'LN' };
}

/** The current in one phase's winding, A: a line current, or a delta's (÷√3), or an autotransformer's difference. */
export function windingAmps(w: Winding, st: XfmrState): number {
  switch (w.role) {
    case 'hv':
    case 'series':
      return w.conn === 'D' ? st.iH / S3 : st.iH;
    case 'lv':
    case 'tap':
      return w.conn === 'D' ? st.iL / S3 : st.iL;
    case 'common':
      return st.iL - st.iH;
    default:
      return 0;
  }
}

function header(p: XfmrPlate): { name: HTMLSpanElement; kind: HTMLSpanElement } {
  const name = dataText(p.name, data(p.keys.name));
  const kind = span(
    '[[transformer|Transformer]] · ',
    el(qty(p.mva, 'MVA', data(p.keys.mva), { digits: 0 })),
    ' · ',
    el(qty(p.hvKV, 'kV', data(p.keys.hvKV), { digits: 0, basis: 'LL' })),
    ' / ',
    el(qty(p.lvKV, 'kV', data(p.keys.lvKV), { digits: p.lvKV >= 100 ? 0 : 2, basis: 'LL' })),
    ' · ',
    dataText(p.vectorGroup, data(p.keys.vectorGroup)),
    p.vectorGroup.startsWith('YNa') ? span(' · [[autotransformer]]') : '',
  );
  return { name, kind };
}

/** The transformer with nothing picked: how it works, step by step, with its numbers now. */
export function transformerLevelView(p: XfmrPlate, core: CoreGeom, st: XfmrState | null): View {
  const { name, kind } = header(p);
  const intro = span('Opened on the plane through its three [[core|core]] limbs, one per phase. What happens inside, in the order the drawing shows it:');
  if (!st) return { name, kind, intro, sections: [{ title: span('No operating point'), text: span('The power flow found no steady state for this interval: there is no voltage, flux or current here to report.'), rows: [] }] };
  if (!st.on)
    return {
      name,
      kind,
      intro,
      sections: [{ title: span('Out of service'), text: span('No voltage on it: no flux in the core, no current in the windings, no heat. The oil is still; the other banks and the network carry its share.'), rows: [] }],
    };
  const t = st.t;
  const key = p.key;
  const d = (k: string, ...from: Prov[]) => derived(`t${t}.${key}.${k}`, ...from);
  const pvH = provOf(st.prov.vH);
  const pvL = provOf(st.prov.vL);
  const ppH = provOf(st.prov.pH);
  const pqH = provOf(st.prov.qH);
  const ppL = provOf(st.prov.pL);
  const pqL = provOf(st.prov.qL);
  const vHq = d('vHkV', pvH, data(p.keys.hvKV));
  const vLq = d('vLkV', pvL, data(p.keys.lvKV));
  const iHq = d('iH', ppH, pqH, vHq);
  const iLq = d('iL', ppL, pqL, vLq);
  const sections: Section[] = [];

  sections.push({
    title: span('Voltage drives a flux'),
    text: span('The high-side [[voltage]] drives a [[flux|magnetic flux]] around the steel core, alternating with it: the arrows, one limb per phase. The voltage sets its size; the load does not.'),
    rows: [
      { label: span('High-side voltage $|V_H|$'), value: el(qty(st.vHkV, 'kV', vHq, { digits: 1, basis: 'LL' })), note: span(el(qty(st.vH, 'pu', pvH, { digits: 4, base: qty(p.hvKV, 'kV', data(p.keys.hvKV), { digits: 0, basis: 'LL' }) }))) },
      { label: span('Flux, share of its rated peak'), value: el(qty(st.vH * 100, '%', d('fluxPct', pvH), { digits: 1 })), note: span('flux ∝ $V/f$; the frequency is steady at ', el(qty(COMPONENTS.fHz, 'Hz', data('components.fHz'), { digits: 0 }))) },
    ],
  });

  const ws = mainWindings(core);
  const a = p.hvKV / p.lvKV;
  const aq = derived(`${p.dataKey}.ratio`, data(p.keys.hvKV), data(p.keys.lvKV));
  sections.push({
    title: span('The same voltage in every turn'),
    text: span('The flux passes through every [[turn]] on its limb, so every turn carries the same voltage, and a [[winding]]’s voltage is its number of turns times that. The [[turns-ratio|turns ratio]] is the voltage ratio.'),
    rows: [
      ...ws.map((w) => {
        const v = windingKV(p, w);
        return {
          label: span(w.name, w.conn === 'D' ? ' ([[delta|Δ]])' : w.conn === 'Y' ? ' ([[wye|Y]])' : ''),
          value: el(qty(v.v, 'kV', v.prov, { digits: 1, basis: v.basis })),
          note: span('drawn with ', el(qty(w.turns, 'turns', derived(`${p.dataKey}.drawnTurns.${w.role}`, v.prov, data('components.drawnTurns')), { digits: 0 }))),
        };
      }),
      {
        label: span('Ratio of the terminals $a = V_H / V_L$'),
        value: el(qty(a, '', aq, { digits: 3 })),
        note: span('now ', el(qty(st.vHkV, 'kV', vHq, { digits: 1, basis: 'LL' })), ' in, ', el(qty(st.vLkV, 'kV', vLq, { digits: 2, basis: 'LL' })), ' out', st.ltcRatio !== undefined ? ' (the tap changer adjusts it)' : ''),
      },
    ],
  });

  const rows3 = [
    { label: span('High side $I_H$'), value: el(qty(st.iH, 'A', iHq, { digits: 0 })), note: span('carrying ', el(qty(st.pH, 'MW', ppH, { digits: 2, phases: '3φ' })), ' in') },
    { label: span('Low side $I_L$'), value: el(qty(st.iL, 'A', iLq, { digits: 0 })), note: span('carrying ', el(qty(-st.pL, 'MW', d('pLout', ppL), { digits: 2, phases: '3φ' })), ' out') },
  ];
  if (p.vectorGroup.startsWith('YNa'))
    rows3.push({ label: span('Common winding: the difference $I_L − I_H$'), value: el(qty(st.iL - st.iH, 'A', d('iCommon', iHq, iLq), { digits: 0 })), note: span('the series winding carries $I_H$; the rest of the power passes straight through the shared turns') });
  sections.push({
    title: span('Current flows the other way'),
    text: span('Current drawn from the low-voltage winding pushes against the flux; the high side draws just enough more current to cancel that push. The marks on the section show it: where one winding’s current comes out of the cut (⊙) the other’s goes in (⊗), and they turn over together, about a quarter cycle apart from the flux. So the currents are in the inverse of the turns ratio, and the power passes through.'),
    rows: rows3,
  });

  const lossKW = st.loss * 1000;
  const lq = d('loss', ppH, ppL);
  sections.push({
    title: span('What is lost warms the oil'),
    text: span('The windings’ [[resistance]] turns a little of the power into heat, $I^2R$. The oil carries it off: up the ducts between the windings, over the top into the [[radiator|radiators]], down as it cools. The chevrons.'),
    rows: [
      { label: span('[[losses|Losses]] $P_{loss} = P_H + P_L$'), value: el(qty(lossKW, 'kW', lq, { digits: 1, phases: '3φ' })), note: span(el(qty(st.pH > 0 ? (100 * st.loss) / st.pH : 0, '%', d('lossPct', lq, ppH), { digits: 3 })), ' of what passes through') },
      { label: span('[[loading|Loading]]'), value: el(qty(st.loading * 100, '%', provOf(st.prov.loading), { digits: 1 })), note: span('of its ', el(qty(p.mva, 'MVA', data(p.keys.mva), { digits: 0 })), ' rating') },
    ],
  });

  if (p.ltc && st.step !== undefined && st.prov.step)
    sections.push({
      title: span('[[ltc|Tap changer]]'),
      text: span('Under load, it moves the low-voltage winding’s connection one tap at a time, adding or removing turns, to hold the low-voltage bus near its set point as the demand and the high-side voltage change. The dial on its head shows the tap in use.'),
      rows: [
        { label: span('Position'), value: el(qty(st.step, 'steps', provOf(st.prov.step), { digits: 0 })), note: span('of ± ', el(qty(p.ltc.maxSteps, 'steps', data(p.keys.maxSteps ?? p.keys.name), { digits: 0 })), ', each ', el(qty(p.ltc.stepPct, '%', data(p.keys.stepPct ?? p.keys.name), { digits: 3 }))) },
        { label: span('Ratio, share of nominal'), value: el(qty(st.ltcRatio!, '', d('ltcRatio', provOf(st.prov.step), data(p.keys.stepPct ?? p.keys.name)), { digits: 5 })) },
      ],
    });
  return { name, kind, intro, sections };
}

/** A part picked inside the transformer: what it is for, with its numbers. */
export function transformerPartView(p: XfmrPlate, core: CoreGeom, st: XfmrState | null, what: string, sub?: string): View {
  const on = !!st?.on;
  const t = st?.t ?? 0;
  const d = (k: string, ...from: Prov[]) => derived(`t${t}.${p.key}.${k}`, ...from);
  const kind = span('Part of ', dataText(p.name, data(p.keys.name)));
  const rows: Section['rows'] = [];
  switch (what) {
    case 'core': {
      if (on && st) rows.push({ label: span('Flux, share of its rated peak'), value: el(qty(st.vH * 100, '%', d('fluxPct', provOf(st.prov.vH)), { digits: 1 })) });
      return {
        name: 'Core',
        kind,
        intro: span('Thin sheets of silicon steel, each insulated from the next, stacked into three limbs and joined by yokes top and bottom; the sheets meet in mitred joints. Steel carries flux thousands of times more easily than oil or air, so nearly all of it stays in the core and links both windings. Solid steel would let the flux drive [[eddy-current|eddy currents]] round inside it; thin sheets stop them.'),
        sections: [{ title: span('Now'), rows, text: span(on ? 'The three limbs’ fluxes are a third of a cycle apart and add to zero at every instant, so they return through one another: no fourth limb is needed.' : 'No voltage, no flux.') }],
      };
    }
    case 'winding': {
      const w = core.windings.find((x) => x.role === sub) ?? core.windings[0]!;
      const v = windingKV(p, w);
      if (w.role !== 'tap') rows.push({ label: span('Voltage across it'), value: el(qty(v.v, 'kV', v.prov, { digits: 1, basis: v.basis })), note: span(w.conn === 'D' ? 'connected in [[delta]]: it sees line-to-line voltage' : w.conn === 'Y' ? 'connected in [[wye]]: it sees line-to-neutral voltage' : 'part of the [[autotransformer]]’s one tapped winding') });
      if (on && st && w.role !== 'tertiary') {
        const i = windingAmps(w, st);
        rows.push({ label: span('Current in it, each phase'), value: el(qty(i, 'A', d(`i.${w.role}`, provOf(st.prov.pH), provOf(st.prov.pL)), { digits: 0 })) });
      }
      rows.push({ label: span('Turns drawn'), value: el(qty(w.turns, 'turns', derived(`${p.dataKey}.drawnTurns.${w.role}`, v.prov, data('components.drawnTurns')), { digits: 0 })), note: span('a real winding has hundreds to thousands') });
      const why: Record<string, string> = {
        hv: 'The high-voltage winding: many turns of thinner conductor, outermost, where it is easiest to insulate from the grounded core.',
        lv: 'The low-voltage winding: fewer turns of thicker conductor (it carries more current), innermost, next to the core.',
        series: 'The autotransformer’s series winding: the turns between its low-voltage and its high-voltage terminal. It carries the high-side current.',
        common: 'The autotransformer’s common winding: the turns shared by both sides, from the neutral to the low-voltage terminal. It carries only the difference of the two sides’ currents, which is why an autotransformer is smaller than two separate windings would be.',
        tertiary: 'A third winding, connected in [[delta]] and carrying no load here: it gives the currents that keep the phases balanced a path to circulate. See the [[tertiary]] entry.',
        tap: 'The tapped winding: in series with the low-voltage winding, one section per step, each brought out to the [[ltc|tap changer]], which picks how many are in circuit.',
      };
      return { name: w.name, kind, intro: span(why[w.role] ?? ''), sections: [{ title: span(on ? 'Now' : 'Nameplate'), rows }] };
    }
    case 'bushing': {
      const hv = sub === 'hv';
      if (on && st) {
        rows.push({ label: span('Voltage'), value: el(qty(hv ? st.vHkV : st.vLkV, 'kV', d(hv ? 'vHkV' : 'vLkV', provOf(hv ? st.prov.vH : st.prov.vL)), { digits: 1, basis: 'LL' })) });
        rows.push({ label: span('Current'), value: el(qty(hv ? st.iH : st.iL, 'A', d(hv ? 'iH' : 'iL', provOf(hv ? st.prov.pH : st.prov.pL)), { digits: 0 })) });
      }
      return {
        name: hv ? 'High-voltage bushings' : 'Low-voltage bushings',
        kind,
        intro: span('A [[bushing]] carries the conductor through the grounded steel lid: a conductor down its centre, insulation built up around it, porcelain or polymer sheds outside. Its lower end stands in the oil, where the lead to the winding is joined.'),
        sections: rows.length ? [{ title: span('Now'), rows }] : [],
      };
    }
    case 'tapchanger':
      return {
        name: 'Tap changer',
        kind,
        intro: span('An on-load [[ltc|tap changer]]: a selector picks the next tap while a diverter switch, in its own oil compartment, moves the current over through resistors so the circuit is never broken. The dial on its head shows the position.'),
        sections: on && st?.step !== undefined && st.prov.step ? [{ title: span('Now'), rows: [{ label: span('Position'), value: el(qty(st.step, 'steps', provOf(st.prov.step), { digits: 0 })) }] }] : [],
      };
    case 'radiator': {
      if (on && st) rows.push({ label: span('Heat given to the air'), value: el(qty(st.loss * 1000, 'kW', d('loss', provOf(st.prov.pH), provOf(st.prov.pL)), { digits: 1 })), note: span('in steady state, all the losses') });
      return {
        name: 'Radiators',
        kind,
        intro: span('Thin steel panels the oil runs down through. Warm oil from the top of the tank enters at the top, gives its heat to the air, grows denser as it cools and sinks, returning at the bottom: the loop runs on its own, with no pump. Fans can be added to push more air through.'),
        sections: rows.length ? [{ title: span('Now'), rows }] : [],
      };
    }
    case 'conservator':
      return {
        name: 'Conservator',
        kind,
        intro: span('A tank above the lid, partly full of oil and joined to the main tank by a pipe. Oil expands as it warms; the conservator takes the extra and gives it back as it cools, so the main tank stays full and the windings stay covered. On the pipe, a relay traps any gas a fault inside would make.'),
        sections: [],
      };
    default: {
      if (on && st) rows.push({ label: span('Heat the oil carries'), value: el(qty(st.loss * 1000, 'kW', d('loss', provOf(st.prov.pH), provOf(st.prov.pL)), { digits: 1 })) });
      return {
        name: 'Tank and oil',
        kind,
        intro: span('A steel tank full of mineral oil. The oil does two jobs: it insulates the windings from each other and from the grounded tank, and it carries their heat to the radiators.'),
        sections: rows.length ? [{ title: span('Now'), rows }] : [],
      };
    }
  }
}

// ---------------------------------------------------------------------------- the breaker

const SVGNS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

function svgText(parent: Element, x: number, y: number, t: string, prov: string, opts: { anchor?: string; size?: number; italic?: boolean } = {}): void {
  const e = svgEl('text', { x, y, 'font-size': opts.size ?? 9, 'text-anchor': opts.anchor ?? 'start', fill: 'var(--ink)', 'data-prov': prov }, parent);
  if (opts.italic) e.setAttribute('font-style', 'italic');
  e.textContent = t;
}

const PHASE_DASH = ['', '6 3', '10 3 2 3'];

/**
 * The three phase currents through the opening, real time: the trip at 0 (drawn as the
 * reference voltage crosses zero rising), the contacts parting, the arcs burning (the
 * shaded span), each phase going to zero at its own current zero.
 */
export function interruptChart(st: BreakerState, plan: Interruption, key: string, cursorMs: number | null = null): SVGSVGElement {
  const W = 330;
  const H = 176;
  const L = 36;
  const R = 10;
  const T = 18;
  const Bm = 26;
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-label': 'The three phase currents as the breaker opens' }) as SVGSVGElement;
  const t0 = -5;
  const t1 = 50;
  const X = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const Y = (v: number) => T + ((1 - v) / 2) * (H - T - Bm);
  const w = (2 * Math.PI * COMPONENTS.fHz) / 1000;
  // the arcs' span, lightly shaded
  svgEl('rect', { x: X(plan.partMs), y: T, width: X(Math.max(...plan.clearMs)) - X(plan.partMs), height: H - T - Bm, fill: 'var(--ink-15)' }, s);
  svgEl('line', { x1: L, y1: Y(0), x2: W - R, y2: Y(0), stroke: 'var(--ink-35)', 'stroke-width': 1 }, s);
  for (const t of [0, 10, 20, 30, 40, 50]) {
    svgEl('line', { x1: X(t), y1: H - Bm, x2: X(t), y2: H - Bm + 3, stroke: 'var(--ink-35)', 'stroke-width': 1 }, s);
    svgText(s, X(t), H - 12, `${t}`, 'data:components.breaker.chartMs', { anchor: 'middle', size: 8.5 });
  }
  svgText(s, W - R, H - 2, 'ms after the trip', 'notation:formula', { anchor: 'end', size: 8.5 });
  svgText(s, L - 4, Y(1) + 3, '+peak', 'notation:formula', { anchor: 'end', size: 8 });
  svgText(s, L - 4, Y(-1) + 3, '−peak', 'notation:formula', { anchor: 'end', size: 8 });
  // the traces: each phase until its zero, then flat
  plan.thetaDeg.forEach((th, p) => {
    const pts: string[] = [];
    const tc = plan.clearMs[p]!;
    for (let t = t0; t <= t1; t += 0.2) {
      const v = t < tc ? Math.sin(w * t + (th * Math.PI) / 180) : 0;
      pts.push(`${X(t).toFixed(1)},${Y(v).toFixed(1)}`);
    }
    const e = svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: 'var(--ink)', 'stroke-width': p === 0 ? 1.8 : 1.1, 'stroke-linejoin': 'round' }, s);
    if (PHASE_DASH[p]) e.setAttribute('stroke-dasharray', PHASE_DASH[p]!);
  });
  // where each clears
  plan.clearMs.forEach((tc, p) => {
    svgEl('circle', { cx: X(tc), cy: Y(0), r: 3, fill: 'var(--ground)', stroke: 'var(--ink)', 'stroke-width': 1.3 }, s);
    svgText(s, X(tc) + 5, Y(0) - 5 - p * 10, `${'abc'[p]} out`, 'notation:formula', { size: 8.5 });
  });
  // the trip and the contacts parting
  for (const [t, label, anchor] of [
    [0, 'trip', 'start'],
    [plan.partMs, 'contacts part', 'end'],
  ] as const) {
    svgEl('line', { x1: X(t), y1: T - 4, x2: X(t), y2: H - Bm, stroke: 'var(--ink)', 'stroke-width': 1, 'stroke-dasharray': '3 2' }, s);
    svgText(s, X(t) + (anchor === 'start' ? 3 : -3), T - 7, label, `derived:${key}.chart`, { size: 8.5, anchor });
  }
  if (cursorMs !== null && cursorMs >= t0 && cursorMs <= t1) svgEl('line', { x1: X(cursorMs), y1: T - 4, x2: X(cursorMs), y2: H - Bm, stroke: 'var(--ink)', 'stroke-width': 2 }, s);
  return s;
}

export interface BreakerHead {
  name: Node;
  kv: number;
  kvProv: Prov;
}

/** The breaker with nothing picked: what it carries, and how it will open. */
export function breakerLevelView(head: BreakerHead, st: BreakerState | null, key: string, busyMs: number | null): View {
  const kind = span('[[breaker|Circuit breaker]] · dead tank, ', dataText('SF₆', data('notation.SF6')), ' · ', el(qty(head.kv, 'kV', head.kvProv, { digits: 0, basis: 'LL' })));
  const intro = span('Three poles, one per phase, each a sealed tank of [[sf6|sulfur hexafluoride]] gas with a pair of contacts inside; the pole nearest you is cut open. A spring-driven mechanism opens or closes all three together.');
  if (!st) return { name: head.name, kind, intro, sections: [{ title: span('No operating point'), text: span('No solved state for this interval: nothing to report.'), rows: [] }] };
  const t = st.t;
  const pP = provOf(st.prov.p);
  const pQ = provOf(st.prov.q);
  const pV = provOf(st.prov.v);
  const iq = derived(`t${t}.${key}.I`, pP, pQ, pV);
  const sections: Section[] = [];
  if (!st.closed || !st.energized) {
    sections.push({
      title: span(st.closed ? 'Closed, no supply' : 'Open'),
      text: span(st.closed ? 'Its contacts are closed but the bus behind it has no source: no current.' : 'Its contacts are apart, the gap filled with gas: no current flows, and the circuit beyond is out of service. Closing it puts the circuit back and the network is solved again.'),
      rows: [],
    });
    return { name: head.name, kind, intro, sections };
  }
  sections.push({
    title: span('What it carries'),
    rows: [
      { label: span('[[current|Current]] in each pole $I$'), value: el(qty(st.amps, 'A', iq, { digits: 0 })), note: span('[[rms|RMS]]; each wave peaks at ', el(qty(Math.SQRT2 * st.amps, 'A', derived(`t${t}.${key}.Ipeak`, iq), { digits: 0, peak: true }))) },
      { label: span('[[real-power|Real power]] out onto the circuit'), value: el(qty(st.p, 'MW', pP, { digits: 1, phases: '3φ' })), note: span(el(qty(st.q, 'MVAr', pQ, { digits: 1, phases: '3φ' }))) },
      { label: span('Bus voltage'), value: el(qty(st.vkV, 'kV', derived(`t${t}.${key}.V`, pV), { digits: 1, basis: 'LL' })) },
    ],
  });
  const plan = interruption(st);
  const B = COMPONENTS.breaker;
  const chart = document.createElement('div');
  chart.className = 'chart';
  chart.appendChild(interruptChart(st, plan, `t${t}.${key}`, busyMs));
  const ck = (p: number) => derived(`t${t}.${key}.clear.${'abc'[p]}`, iq, provOf(st.prov.va), data('components.breaker'));
  sections.push({
    title: span('How it opens'),
    text: span(
      'A trip releases the opening spring. The moving contact slides off the fixed one, but the current does not stop: it jumps the widening gap as an [[arc]]. The moving puffer squeezes the gas and blows it through the nozzle across the arc. Alternating current passes through zero twice a cycle; at a [[current-zero|zero]] the arc goes out, and the gas, cooled and blown clean, holds off the voltage that returns. Each phase clears at its own zero:',
      chart,
      span('Phase $a$ solid (its pole is the one cut open), $b$ dashed, $c$ dash-dot; shaded while the arcs burn.'),
    ),
    rows: [
      { label: span('Trip to contacts parting'), value: el(qty(B.partMs, 'ms', data('components.breaker.partMs'), { digits: 0 })), note: span('trip coil, latch, spring (typical)') },
      ...[0, 1, 2].map((p) => ({ label: span(`Phase ${'abc'[p]} clears`), value: el(qty(plan.clearMs[p]!, 'ms', ck(p), { digits: 1 })), note: p === 0 ? span('at its first current zero after the shortest arc the gas can put out, ', el(qty(B.minArcMs, 'ms', data('components.breaker.minArcMs'), { digits: 0 }))) : undefined })),
      { label: span('Its rated [[interrupting-time|interrupting time]]'), value: el(qty((B.ratedCycles * 1000) / COMPONENTS.fHz, 'ms', derived(`${key}.ratedMs`, data('components.breaker.ratedCycles'), data('components.fHz')), { digits: 1 })), note: span(el(qty(B.ratedCycles, 'cycles', data('components.breaker.ratedCycles'), { digits: 0 })), ' of ', el(qty(COMPONENTS.fHz, 'Hz', data('components.fHz'), { digits: 0 }))) },
    ].map((r) => (r.note ? r : { label: r.label, value: r.value })),
  });
  return { name: head.name, kind, intro, sections };
}

/** A part picked inside the breaker. */
export function breakerPartView(head: BreakerHead, st: BreakerState | null, key: string, what: string): View {
  const kind = span('Part of ', head.name);
  const on = !!st && st.closed && st.energized;
  const iq = st ? derived(`t${st.t}.${key}.I`, provOf(st.prov.p), provOf(st.prov.q), provOf(st.prov.v)) : null;
  const amps = on && st && iq ? [{ title: span('Now'), rows: [{ label: span('Current through it'), value: el(qty(st.amps, 'A', iq, { digits: 0 })) }] }] : [];
  switch (what) {
    case 'fixed':
      return { name: 'Fixed contact', kind, intro: span('Spring-loaded fingers grip the moving contact when closed and carry the load current. In their middle, the arcing pin: the last point of contact as the breaker opens, so the arc burns there, on tips made to survive it, and not on the fingers.'), sections: amps };
    case 'moving':
      return { name: 'Moving contact and nozzle', kind, intro: span('A tube that slides off the arcing pin. The nozzle round its mouth, of an insulating plastic, shapes the blast of gas so it flows along the arc and carries its heat away.'), sections: amps };
    case 'rod':
      return { name: 'Operating rod', kind, intro: span('An insulating rod from the crank at the tank’s end to the moving contact: the mechanism outside, at earth potential, moves contacts that are at line voltage.'), sections: [] };
    case 'ct':
      return {
        name: 'Current transformers',
        kind,
        intro: span('Rings round the conductor at the foot of each bushing: the line current passes through them as a single turn, and their own winding of many turns gives a small current in proportion. That is what the protective relays measure: they decide when to trip this breaker.'),
        sections: amps,
      };
    case 'mechanism':
      return { name: 'Operating mechanism', kind, intro: span('A cabinet of springs, latches and coils. A motor keeps the closing spring charged; closing also charges the opening spring. A trip signal energizes the trip coil, which releases the latch, and the opening spring drives all three poles apart through the gang shaft, in a few hundredths of a second.'), sections: [] };
    default:
      return {
        name: 'Tank and gas',
        kind,
        intro: span('A steel tank at earth potential, filled with [[sf6|sulfur hexafluoride]] under pressure: a gas that insulates several times better than air and recovers from an arc very fast, which is what lets a gap of a few centimetres hold off hundreds of kilovolts moments after the current has stopped.'),
        sections: amps,
      };
  }
}

// ---------------------------------------------------------------------------- the pole-top transformer

/** A service leg's number, and a transformer terminal's standard name (H1, X2…): notation. */
const leg = (n: 1 | 2) => dataText(String(n), data('notation.serviceLeg'));
const terminal = (t: string) => dataText(t, data('notation.C57.12.terminals'));

/** The pole-top transformer with nothing picked: how one wire becomes two legs and a neutral. */
export function poletopLevelView(id: string, st: PoleTopState | null, turns: { primary: number; secondaryHalf: number }): View {
  const name = dataText(`Transformer ${id.slice(2)}`, data(`evergreen.layout.transformers.${id}`));
  const kva = st?.kva;
  const kind = span('Pole-top [[transformer]] · ', kva !== undefined ? el(qty(kva, 'kVA', data(`evergreen.layout.transformers.${id}.kva`), { digits: 0 })) : '', ' · single-phase, [[center-tap|center-tapped]]');
  const intro = span('Opened on the plane through its axis. How one wire of the lateral becomes a home’s two legs and a neutral:');
  if (!st) return { name, kind, intro, sections: [{ title: span('No operating point'), text: span('No solved state for this interval.'), rows: [] }] };
  if (!st.on) return { name, kind, intro, sections: [{ title: span('No supply'), text: span('No voltage on its primary: no flux, no current, nothing on the legs.'), rows: [] }] };
  const t = st.t;
  const pvP = provOf(st.prov.vP);
  const pvS = provOf(st.prov.vS);
  const pI = provOf(st.prov.I);
  const d = (k: string, ...from: Prov[]) => derived(`t${t}.pt.${id}.${k}`, ...from);
  const nq = derived('evergreen.poletop.ratio', data('evergreen.layout.transformers.kvPrimaryLN'), data('ansi.C84.1.base120'));
  return {
    name,
    kind,
    intro,
    sections: [
      {
        title: span('One winding in, two halves out'),
        text: span('The primary, many turns of fine wire, takes the voltage between the lateral’s phase and the neutral. The secondary’s turns are in two halves in series, each with a fraction of the primary’s turns, so each gives that fraction of its voltage. Where the halves meet, the center tap, is bonded to the tank and grounded: it becomes the neutral.'),
        rows: [
          { label: span('Primary, line to neutral'), value: el(qty(st.vP, 'V', pvP, { digits: 0, basis: 'LN' })), note: span('of a rated ', el(qty(7200, 'V', data('evergreen.layout.transformers.kvPrimaryLN'), { digits: 0, basis: 'LN' }))) },
          { label: span('Turns, primary to each half'), value: el(qty(7200 / 120, '', nq, { digits: 0 })), note: span('drawn ', el(qty(turns.primary, 'turns', data('components.poletop.drawnPrimary'), { digits: 0 })), ' to ', el(qty(turns.secondaryHalf, 'turn', data('components.poletop.drawnHalf'), { digits: 0 })), ' in each half') },
          { label: span('Leg ', leg(1), ' to neutral'), value: el(qty(st.v1, 'V', pvS, { digits: 1, basis: 'LN' })) },
          { label: span('Leg ', leg(2), ' to neutral'), value: el(qty(st.v2, 'V', pvS, { digits: 1, basis: 'LN' })), note: span('the other half, the opposite way round') },
          { label: span('Leg to leg'), value: el(qty(st.v12, 'V', d('v12', pvS), { digits: 1, basis: 'LL' })), note: span('both halves in series: what an air conditioner or an oven uses') },
        ],
      },
      {
        title: span('Two legs, and the neutral between'),
        text: span('A home’s lights and outlets hang between one leg and the neutral, its big appliances across both legs. The neutral carries only what the two legs do not share: when they carry the same, it carries nothing. The primary carries the legs’ current divided by the turns ratio.'),
        rows: [
          { label: span('Leg ', leg(1), ' current $I_1$'), value: el(qty(st.i1, 'A', pI, { digits: 1 })), note: span(el(qty(st.p1 / 1000, 'kW', d('p1', pvS, pI), { digits: 2, phases: '1φ' })), ' out') },
          { label: span('Leg ', leg(2), ' current $I_2$'), value: el(qty(st.i2, 'A', pI, { digits: 1 })), note: span(el(qty(st.p2 / 1000, 'kW', d('p2', pvS, pI), { digits: 2, phases: '1φ' })), ' out') },
          { label: span('Neutral $|I_1 + I_2|$'), value: el(qty(st.iN, 'A', d('iN', pI), { digits: 1 })) },
          { label: span('Primary $I_p$'), value: el(qty(st.ip, 'A', pI, { digits: 2 })) },
        ],
      },
      {
        title: span('What passes through'),
        rows: [
          { label: span('In from the lateral'), value: el(qty(st.p / 1000, 'kW', provOf(st.prov.pf), { digits: 2, phases: '1φ' })), note: span(el(qty(st.q / 1000, 'kvar', provOf(st.prov.qf), { digits: 2 }))) },
          { label: span('[[losses|Lost]] as heat'), value: el(qty(st.loss, 'W', d('loss', provOf(st.prov.pf), provOf(st.prov.pt)), { digits: 0 })), note: span('taken to the air by the oil and the can') },
          { label: span('[[loading|Loading]]'), value: el(qty((100 * Math.hypot(st.p, st.q)) / (st.kva * 1000), '%', d('loading', provOf(st.prov.pf), data(`evergreen.layout.transformers.${id}.kva`)), { digits: 0 })) },
        ],
      },
    ],
  };
}

/** A part picked inside the pole-top transformer. */
export function poletopPartView(id: string, st: PoleTopState | null, what: string, sub?: string): View {
  const kind = span('Part of ', dataText(`transformer ${id.slice(2)}`, data(`evergreen.layout.transformers.${id}`)));
  const on = !!st?.on;
  const pI = st ? provOf(st.prov.I) : null;
  switch (what) {
    case 'core':
      return { name: 'Core', kind, intro: span('Two loops of thin steel strip, wound and cut, set side by side: their shared middle leg passes through the coil, and the flux goes up it and back down the two outer legs, half each way.'), sections: [] };
    case 'winding':
      return sub === 'primary'
        ? { name: 'Primary winding', kind, intro: span('Many turns of fine insulated wire, outside the secondary. One end comes in on the bushing on the lid (', terminal('H1'), '), from the lateral; the other (', terminal('H2'), ') is bonded to the tank and the system neutral.'), sections: on && st && pI ? [{ title: span('Now'), rows: [{ label: span('Current'), value: el(qty(st.ip, 'A', pI, { digits: 2 })) }] }] : [] }
        : {
            name: 'Secondary winding',
            kind,
            intro: span('A few turns of wide conductor, in two halves, innermost. Its ends come out as ', terminal('X1'), ' and ', terminal('X3'), ', its middle as ', terminal('X2'), ', the center tap. It carries the primary’s current many times over, so its turns are that much thicker.'),
            sections: on && st && pI ? [{ title: span('Now'), rows: [{ label: span('Leg ', leg(1)), value: el(qty(st.i1, 'A', pI, { digits: 1 })) }, { label: span('Leg ', leg(2)), value: el(qty(st.i2, 'A', pI, { digits: 1 })) }] }] : [],
          };
    case 'bushing':
      return sub === 'X'
        ? { name: 'Secondary bushings', kind, intro: span(terminal('X1'), ' and ', terminal('X3'), ' carry the two legs out to the street; ', terminal('X2'), ', the center tap, is strapped to the tank and to the ground wire down the pole, and becomes the neutral that every home shares. Grounding it holds each leg near its voltage above the earth a person stands on.'), sections: [] }
        : { name: 'Primary bushing', kind, intro: span('Carries the lateral’s phase, through a fuse and a short lead, into the tank to the primary winding.'), sections: [] };
    default:
      return { name: 'Tank and oil', kind, intro: span('A steel can full of mineral oil, which insulates the windings and carries their heat to the can’s walls; a transformer this small needs no radiators. Its losses are a few hundred watts at most.'), sections: [] };
  }
}

// ---------------------------------------------------------------------------- a span

const chartDiv = (n: Node) => {
  const d = document.createElement('div');
  d.className = 'chart';
  d.appendChild(n);
  return d;
};

/** A span with nothing (or one circuit) picked: the weather, the wire's temperature, its sag, its limit today. */
export function spanView(grid: Grid, level: SpanLevel, st: SpanState | null, pick: number | null): View {
  const cs = level.cs;
  const g = level.geom;
  const here = grid.sites.find((x) => x.id === level.siteId)!;
  const far = grid.sites.find((x) => x.id === cs.far)!;
  const name = span('Span from ', dataText(here.name, data(`network.site.${here.id}.name`)), ' toward ', dataText(far.name, data(`network.site.${far.id}.name`)));
  const c = st ? (st.circuits.find((x) => x.branch === pick) ?? st.circuits[0]!) : null;
  const cond = c ? CONDUCTORS[c.conductor] : null;
  const kind = span(
    'Overhead [[line]] · a span of ',
    el(qty(g.S, 'm', derived(`${cs.key}.S`, data('conductors.SPAN_WEATHER.spanM')), { digits: 0 })),
    cond && c ? span(' · ', dataText(`${cond.name} ACSR`, data(`conductors.${c.conductor}.name`)), c.bundle > 1 ? span(', ', el(qty(c.bundle, 'per phase', data(`towers.bundle.${c.conductor}`), { digits: 0 }))) : '') : '',
  );
  const intro = span('One span, from the tower outside the yard to the next. How hot the wire runs, and so how low it hangs, is set by the current it carries and the weather it hangs in:');
  if (!st || !c) return { name, kind, intro, sections: [{ title: span('No operating point'), text: span('No solved state for this interval.'), rows: [] }] };
  const t = st.t;
  const key = `t${t}.${cs.key}.${c.branch}`;
  const d = (k: string, ...from: Prov[]) => derived(`${key}.${k}`, ...from);
  const iq = provOf(st.prov.amps[st.circuits.indexOf(c)]!);
  const wq = data(`conductors.SPAN_WEATHER.windMs.${st.wind}`);
  const tq = d('Ts', iq, data(st.prov.air.slice(5)), wq);
  const b = c.balance;
  const clearance = cs.H - c.sag;
  const clearanceMax = cs.H - c.sagMax;
  const lim = c.ampacity > 0 ? (100 * c.amps) / c.ampacity : 0;
  const sections: Section[] = [
    {
      title: span('The weather it hangs in'),
      rows: [
        { label: span('Air'), value: el(qty(st.weather.Ta, '°C', data(st.prov.air.slice(5)), { digits: 1 })), note: span('this hour, in this region') },
        { label: span('Sun, above the horizon'), value: el(qty(Math.max(0, st.weather.sunAltDeg), '°', derived(st.prov.sun.slice(8)), { digits: 1 })) },
        { label: span('Wind, across the line'), value: el(qty(st.weather.windMs, 'm/s', wq, { digits: 2 })), note: span(st.wind === 'rating' ? 'the light wind line ratings assume; try another below' : st.wind === 'still' ? 'still air: only the wire’s own warmth moves the air' : 'a steady breeze') },
      ],
    },
    {
      title: span('How hot the wire runs'),
      text: span('The current heats the wire through its [[resistance]], and the sun warms it. The air carries heat away, and the wire radiates it. It settles where the two balance.'),
      rows: [
        { label: span('[[current|Current]] per phase'), value: el(qty(c.amps, 'A', iq, { digits: 0 })), note: c.bundle > 1 ? span(el(qty(c.perSub, 'A', d('perSub', iq), { digits: 0 })), ' in each of its conductors') : undefined },
        { label: span('Heat in: the current $I^2R$'), value: el(qty(b.qj, 'W/m', d('qj', tq), { digits: 2 })) },
        { label: span('Heat in: the sun'), value: el(qty(b.qs, 'W/m', d('qs', tq), { digits: 2 })) },
        { label: span('Heat out: carried by the air'), value: el(qty(b.qc, 'W/m', d('qc', tq), { digits: 2 })) },
        { label: span('Heat out: radiated'), value: el(qty(b.qr, 'W/m', d('qr', tq), { digits: 2 })) },
        { label: span('The wire’s temperature'), value: el(qty(c.Ts, '°C', tq, { digits: 1 })), note: span('where heat in equals heat out') },
      ].map((r) => (r.note ? r : { label: r.label, value: r.value })),
    },
    {
      title: span('How low it hangs'),
      text: span(
        'Warmer, the aluminium grows longer. A longer wire between the same two towers hangs lower, closer to whatever is beneath it; and as it sags its tension eases, which pulls it back up a little. Seen from the side:',
        chartDiv(spanProfile(c, g.S, cs.H, cs.towerH, key)),
      ),
      rows: [
        { label: span('Sag at mid-span'), value: el(qty(c.sag, 'm', d('sag', tq), { digits: 2 })), note: span('tension ', el(qty(c.tension / 1000, 'kN', d('H', tq), { digits: 1 })), ' in each conductor') },
        { label: span('Clearance to the ground'), value: el(qty(clearance, 'm', d('clearance', tq), { digits: 2 })), note: span('schematic towers, flat ground') },
        { label: span('At its limit of ', el(qty(c.maxTempC, '°C', data(`conductors.CONDUCTOR_MECH.${c.conductor}.maxTempC`), { digits: 0 }))), value: el(qty(c.sagMax, 'm', d('sagMax', data(`conductors.CONDUCTOR_MECH.${c.conductor}.maxTempC`)), { digits: 2 })), note: span('sag; clearance ', el(qty(clearanceMax, 'm', d('clearanceMax'), { digits: 2 }))) },
      ],
    },
    {
      title: span('Its limit, today'),
      text: span('A line’s [[rating]] is, at bottom, how hot it may run: how far it may sag. In today’s weather, this is the current that would take it there. The dot is now:', chartDiv(spanCurves(st, c, key))),
      rows: [
        { label: span('Current at its limit, per phase'), value: el(qty(c.ampacity, 'A', d('ampacity', wq, data(st.prov.air.slice(5))), { digits: 0 })) },
        { label: span('Carrying now, of that'), value: el(qty(lim, '%', d('ofLimit', iq), { digits: 1 })) },
        { label: span('The fixed rating the power flow uses'), value: el(qty(c.ratingAmps, 'A', derived(`network.line.${grid.branches[c.branch]!.id}.ratingAmps`, data(`network.line.${grid.branches[c.branch]!.id}.rateMVA`)), { digits: 0 })), note: span('per phase: a planning value, for all weather') },
      ],
    },
  ];
  return { name, kind, intro, sections };
}

/**
 * The span in profile, as a line designer draws it: seen from the side, heights drawn
 * at a larger scale than lengths (said so), the conductor now, where it would hang at
 * its limit, the ground, and the clearance at mid-span.
 */
function spanProfile(c: SpanCircuit, S: number, H: number, towerH: number, key: string): SVGSVGElement {
  const W = 330;
  const Hh = 150;
  const L = 16;
  const R = 16;
  const T = 12;
  const B = 22;
  const s = svgEl('svg', { width: W, height: Hh, viewBox: `0 0 ${W} ${Hh}`, 'aria-label': 'The span seen from the side' }) as SVGSVGElement;
  const kx = (W - L - R) / S;
  const ky = (Hh - T - B) / (towerH * 1.05);
  const X = (x: number) => L + x * kx;
  const Y = (y: number) => Hh - B - y * ky;
  // ground
  svgEl('line', { x1: 4, y1: Y(0), x2: W - 4, y2: Y(0), stroke: 'var(--ink-60)', 'stroke-width': 1 }, s);
  for (let x = 0; x <= S; x += S / 16) svgEl('line', { x1: X(x) - 3, y1: Y(0) + 4, x2: X(x) + 1, y2: Y(0), stroke: 'var(--ink-35)', 'stroke-width': 0.8 }, s);
  // towers
  for (const x0 of [0, S]) {
    svgEl('polyline', { points: `${X(x0) - 5},${Y(0)} ${X(x0) - 1.5},${Y(towerH)} ${X(x0) + 1.5},${Y(towerH)} ${X(x0) + 5},${Y(0)}`, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1 }, s);
    svgEl('line', { x1: X(x0) - 8, y1: Y(H + 1.5), x2: X(x0) + 8, y2: Y(H + 1.5), stroke: 'var(--ink)', 'stroke-width': 1 }, s);
  }
  const curve = (D: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      pts.push(`${X(u * S).toFixed(1)},${Y(H - 4 * D * u * (1 - u)).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  svgEl('polyline', { points: curve(c.sagMax), fill: 'none', stroke: 'var(--ink-35)', 'stroke-width': 1, 'stroke-dasharray': '5 3' }, s);
  svgEl('polyline', { points: curve(c.sag), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.8 }, s);
  // the clearance at mid-span
  const xm = X(S / 2);
  const yLow = Y(H - c.sag);
  svgEl('line', { x1: xm, y1: yLow, x2: xm, y2: Y(0), stroke: 'var(--ink)', 'stroke-width': 1 }, s);
  for (const y of [yLow, Y(0)]) svgEl('line', { x1: xm - 4, y1: y, x2: xm + 4, y2: y, stroke: 'var(--ink)', 'stroke-width': 1 }, s);
  svgText(s, xm + 6, (yLow + Y(0)) / 2 + 3, `${(H - c.sag).toFixed(1)} m`, `derived:${key}.clearance`, { size: 9 });
  svgText(s, X(S * 0.72), Y(H - 4 * c.sagMax * 0.72 * 0.28) + 12, 'at its limit', 'notation:formula', { size: 8.5 });
  svgText(s, W - 4, Hh - 4, `heights drawn ${(ky / kx).toFixed(1)} times the lengths`, `derived:${key}.profileScale`, { size: 8, anchor: 'end' });
  return s;
}

/**
 * Two small graphs worked from the same physics: the conductor's temperature against
 * the current it carries, in today's weather (where it crosses its limit is its
 * ampacity), and its sag against its temperature. The point now is marked on each.
 */
function spanCurves(st: SpanState, c: SpanCircuit, key: string): SVGSVGElement {
  const W = 330;
  const Hh = 132;
  const s = svgEl('svg', { width: W, height: Hh, viewBox: `0 0 ${W} ${Hh}`, 'aria-label': 'Temperature against current, and sag against temperature' }) as SVGSVGElement;
  const box = (x0: number, w: number) => ({ x0, w, y0: 14, h: Hh - 38 });
  const A = box(34, 125);
  const Bx = box(196, 125);
  // left: temperature against current per phase
  const iMax = Math.max(c.ampacity * 1.25, c.amps * 1.1, 1);
  const tMin = Math.floor(st.weather.Ta / 10) * 10;
  const tMax = Math.max(130, c.maxTempC + 20);
  const xa = (i: number) => A.x0 + (i / iMax) * A.w;
  const ya = (T: number) => A.y0 + A.h - ((T - tMin) / (tMax - tMin)) * A.h;
  const pts: string[] = [];
  for (let k = 0; k <= 36; k++) {
    const I = (iMax * k) / 36;
    const Ts = conductorTemperature(st.conductor, st.weather, I / c.bundle).Ts;
    pts.push(`${xa(I).toFixed(1)},${Math.max(A.y0 - 4, ya(Ts)).toFixed(1)}`);
  }
  svgEl('polyline', { points: `${A.x0},${A.y0} ${A.x0},${A.y0 + A.h} ${A.x0 + A.w},${A.y0 + A.h}`, fill: 'none', stroke: 'var(--ink-60)', 'stroke-width': 1 }, s);
  svgEl('line', { x1: A.x0, y1: ya(c.maxTempC), x2: A.x0 + A.w, y2: ya(c.maxTempC), stroke: 'var(--ink-35)', 'stroke-width': 1, 'stroke-dasharray': '5 3' }, s);
  svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.5 }, s);
  svgEl('line', { x1: xa(c.ampacity), y1: ya(c.maxTempC), x2: xa(c.ampacity), y2: A.y0 + A.h, stroke: 'var(--ink)', 'stroke-width': 0.8, 'stroke-dasharray': '2 2' }, s);
  svgEl('circle', { cx: xa(c.amps), cy: ya(c.Ts), r: 3, fill: 'var(--ink)' }, s);
  svgText(s, A.x0 - 3, ya(c.maxTempC) + 3, `${c.maxTempC}`, `data:conductors.CONDUCTOR_MECH.${c.conductor}.maxTempC`, { anchor: 'end', size: 8 });
  svgText(s, A.x0 - 3, ya(tMin) + 3, `${tMin}`, `derived:${key}.axisT`, { anchor: 'end', size: 8 });
  svgText(s, xa(c.ampacity), A.y0 + A.h + 10, `${Math.round(c.ampacity)} A`, `derived:${key}.ampacity`, { anchor: 'middle', size: 8 });
  svgText(s, A.x0, A.y0 - 4, '°C, the wire', 'notation:formula', { size: 8 });
  svgText(s, A.x0 + A.w, A.y0 + A.h + 22, 'current, per phase', 'notation:formula', { anchor: 'end', size: 8 });
  // right: sag against temperature
  const TT = [st.weather.Ta - 10, c.maxTempC + 20];
  const sags = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((j) => {
    const T = TT[0]! + ((TT[1]! - TT[0]!) * j) / 8;
    return { T, D: sagAt(st.mech, T).D };
  });
  const dMin = Math.floor(sags[0]!.D);
  const dMax = Math.ceil(sags[sags.length - 1]!.D + 0.5);
  const xb = (T: number) => Bx.x0 + ((T - TT[0]!) / (TT[1]! - TT[0]!)) * Bx.w;
  const yb = (D: number) => Bx.y0 + ((D - dMin) / (dMax - dMin)) * Bx.h;
  svgEl('polyline', { points: `${Bx.x0},${Bx.y0} ${Bx.x0},${Bx.y0 + Bx.h} ${Bx.x0 + Bx.w},${Bx.y0 + Bx.h}`, fill: 'none', stroke: 'var(--ink-60)', 'stroke-width': 1 }, s);
  svgEl('polyline', { points: sags.map((p) => `${xb(p.T).toFixed(1)},${yb(p.D).toFixed(1)}`).join(' '), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.5 }, s);
  svgEl('line', { x1: xb(c.maxTempC), y1: Bx.y0, x2: xb(c.maxTempC), y2: Bx.y0 + Bx.h, stroke: 'var(--ink-35)', 'stroke-width': 1, 'stroke-dasharray': '5 3' }, s);
  svgEl('circle', { cx: xb(c.Ts), cy: yb(c.sag), r: 3, fill: 'var(--ink)' }, s);
  svgText(s, Bx.x0 - 3, yb(dMin) + 3, `${dMin}`, `derived:${key}.axisD`, { anchor: 'end', size: 8 });
  svgText(s, Bx.x0 - 3, yb(dMax) + 3, `${dMax}`, `derived:${key}.axisD`, { anchor: 'end', size: 8 });
  svgText(s, Bx.x0, Bx.y0 - 4, 'sag, m (down)', 'notation:formula', { size: 8 });
  svgText(s, xb(c.maxTempC), Bx.y0 + Bx.h + 10, 'limit', 'notation:formula', { anchor: 'middle', size: 8 });
  svgText(s, Bx.x0 + Bx.w, Bx.y0 + Bx.h + 22, 'the wire’s temperature', 'notation:formula', { anchor: 'end', size: 8 });
  return s;
}

// ---------------------------------------------------------------------------- a capacitor bank

/**
 * Two cycles of one phase: its voltage and current (each scaled to its own peak, the
 * current a quarter cycle ahead), and below, the power into each phase — in and out,
 * the three together flat at nothing. A cursor (moved by the app as the drawing
 * animates) marks the instant the drawing shows. At the right, the phasors.
 */
function capChart(st: CapBankState, key: string, one: boolean): SVGSVGElement {
  const W = 330;
  const H = one ? 112 : 176;
  const L = 30;
  const Rw = 78;
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-label': 'Voltage, current and power over two cycles' }) as SVGSVGElement;
  const x1 = W - Rw;
  const T = 1 / COMPONENTS.fHz;
  const X = (t: number) => L + (t / (2 * T)) * (x1 - L);
  const top = { y0: 14, h: 72 };
  const Yt = (u: number) => top.y0 + ((1 - u) / 2) * top.h;
  const th = (st.vaDeg * Math.PI) / 180;
  const line = (f: (t: number) => number, Y: (u: number) => number, w: number, dash = '', color = 'var(--ink)') => {
    const pts: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const t = (2 * T * i) / 120;
      pts.push(`${X(t).toFixed(1)},${Y(f(t)).toFixed(1)}`);
    }
    const e = svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linejoin': 'round' }, s);
    if (dash) e.setAttribute('stroke-dasharray', dash);
  };
  svgEl('line', { x1: L, y1: Yt(0), x2: x1, y2: Yt(0), stroke: 'var(--ink-35)', 'stroke-width': 1 }, s);
  line((t) => Math.cos(st.omega * t + th), Yt, 1.8);
  line((t) => Math.cos(st.omega * t + th + Math.PI / 2), Yt, 1.2, '6 3');
  svgText(s, L - 4, Yt(0.95) + 3, 'v', 'notation:formula', { anchor: 'end', size: 9, italic: true });
  svgText(s, L - 4, Yt(0.55) + 3, 'i', 'notation:formula', { anchor: 'end', size: 9, italic: true });
  svgText(s, L, top.y0 - 4, 'voltage (solid), current (dashed), each to its own peak', 'notation:formula', { size: 8 });
  let yEnd = top.y0 + top.h;
  if (!one) {
    const bot = { y0: top.y0 + top.h + 18, h: 58 };
    const Yb = (u: number) => bot.y0 + ((1 - u) / 2) * bot.h;
    svgEl('line', { x1: L, y1: Yb(0), x2: x1, y2: Yb(0), stroke: 'var(--ink-35)', 'stroke-width': 1 }, s);
    const pk = Math.max(1e-9, st.q1);
    for (const p of [1, 2]) line((t) => capWave(st, t, p).p / pk, Yb, 0.9, PHASE_DASH[p], 'var(--ink-60)');
    line((t) => capWave(st, t, 0).p / pk, Yb, 1.6);
    line((t) => [0, 1, 2].reduce((a, p) => a + capWave(st, t, p).p, 0) / pk, Yb, 2.4);
    svgText(s, L - 4, Yb(0.9) + 3, 'p', 'notation:formula', { anchor: 'end', size: 9, italic: true });
    svgText(s, L, bot.y0 - 4, 'power into each phase: in, then out; the three together (heavy): none', 'notation:formula', { size: 8 });
    yEnd = bot.y0 + bot.h;
  }
  for (const [t, label] of [
    [T, 'one cycle'],
    [2 * T, 'two'],
  ] as const) {
    svgEl('line', { x1: X(t), y1: yEnd, x2: X(t), y2: yEnd + 3, stroke: 'var(--ink-35)', 'stroke-width': 1 }, s);
    svgText(s, X(t), yEnd + 12, label, 'notation:formula', { anchor: 'end', size: 8 });
  }
  // the cursor: the app moves it with the drawing
  const c = svgEl('line', { x1: L, y1: top.y0 - 2, x2: L, y2: yEnd, stroke: 'var(--ink)', 'stroke-width': 1.4, 'data-cap-cursor': '1', 'data-x0': L, 'data-w': x1 - L, 'data-period': 2 * T }, s);
  c.setAttribute('opacity', '0.7');
  // the phasors: V at its angle, I a quarter turn ahead (counter-clockwise)
  const cx = x1 + Rw / 2 + 4;
  const cy = top.y0 + top.h / 2 + 4;
  const r = 26;
  svgEl('circle', { cx, cy, r, fill: 'none', stroke: 'var(--ink-15)', 'stroke-width': 1 }, s);
  const arrow = (ang: number, dash: string) => {
    const x = cx + r * Math.cos(ang);
    const y = cy - r * Math.sin(ang);
    const e = svgEl('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: 'var(--ink)', 'stroke-width': 1.5 }, s);
    if (dash) e.setAttribute('stroke-dasharray', dash);
    const hx = Math.cos(ang);
    const hy = -Math.sin(ang);
    svgEl('polyline', { points: `${x - 6 * hx - 3 * hy},${y - 6 * hy + 3 * hx} ${x},${y} ${x - 6 * hx + 3 * hy},${y - 6 * hy - 3 * hx}`, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.3 }, s);
    return [x, y] as const;
  };
  const [vx, vy] = arrow(th, '');
  const [ix, iy] = arrow(th + Math.PI / 2, '4 2');
  svgText(s, vx + 4, vy + 4, 'V', 'notation:formula', { size: 9, italic: true });
  svgText(s, ix + 3, iy - 2, 'I', 'notation:formula', { size: 9, italic: true });
  svgText(s, cx, cy + r + 14, '90° ahead', 'data:notation.quarterTurn', { anchor: 'middle', size: 8 });
  void key;
  return s;
}

export interface CapHead {
  name: Node;
  kvProv: Prov;
  key: string;
}

/** A capacitor bank with nothing picked: what it supplies, how, and why here. */
export function capBankView(head: CapHead, st: CapBankState | null): View {
  const intro = span('Steps of three stacks of cans, one stack per phase, each step switched on its own. A capacitor stores energy as its voltage rises and gives it all back as it falls: on balance it takes in nothing. What it supplies is [[reactive-power|reactive power]], the to-and-fro current that motors’ and transformers’ magnetic fields need, here, so that it need not come over the lines.');
  if (!st) return { name: head.name, kind: span('[[capacitor-bank|Capacitor bank]]'), intro, sections: [{ title: span('No operating point'), text: span('No solved state for this interval.'), rows: [] }] };
  const t = st.t;
  const d = (x: string, ...from: Prov[]) => derived(`t${t}.${head.key}.${x}`, ...from);
  const stepQ = data(`model.shunt.${st.shunt}.stepMVAr`);
  const kind = span('[[capacitor-bank|Capacitor bank]] · ', el(qty(st.steps, 'steps', data(`model.shunt.${st.shunt}.steps`), { digits: 0 })), ' of ', el(qty(st.stepMVAr, 'MVAr', stepQ, { digits: 0, phases: '3φ' })), ' · ', el(qty(st.kvNom, 'kV', head.kvProv, { digits: 0, basis: 'LL' })));
  const pv = provOf(st.prov.vm);
  const ps = provOf(st.prov.steps);
  const sections: Section[] = [];
  if (!st.energized) return { name: head.name, kind, intro, sections: [{ title: span('No supply'), text: span('The bus it stands on has no source in this solution: nothing flows.'), rows: [] }] };
  sections.push({
    title: span('What it supplies now'),
    rows: [
      { label: span('Steps in service'), value: span(el(qty(st.inService, '', ps, { digits: 0 })), ' of ', el(qty(st.steps, '', data(`model.shunt.${st.shunt}.steps`), { digits: 0 }))), note: span(st.held ? 'held where you switched it' : 'switched by the voltage controller') },
      { label: span('[[voltage|Voltage]] $|V|$'), value: el(qty(st.vLL, 'kV', d('vLL', pv), { digits: 2, basis: 'LL' })), note: span(el(qty(st.vm, 'pu', pv, { digits: 4 }))) },
      { label: span('[[reactive-power|Reactive power]] supplied $Q$'), value: el(qty(st.q, 'MVAr', d('Q', pv, ps, stepQ), { digits: 1, phases: '3φ' })), note: span('each step’s rating times the voltage squared') },
      { label: span('[[current|Current]] in each phase $|I|$'), value: el(qty(st.amps, 'A', d('I', pv, ps, stepQ), { digits: 0 })), note: span('[[rms|RMS]]; a quarter cycle ahead of the voltage') },
    ],
  });
  if (st.inService > 0)
    sections.push({
      title: span('A quarter cycle ahead'),
      text: span('The current is greatest as the voltage passes through zero, and nothing when it peaks: the plates fill fastest as the voltage starts to climb. So energy flows in for a quarter cycle and back out for the next. The three phases take turns, and together take nothing at any instant.', chartDiv(capChart(st, head.key, false))),
      rows: [],
    });
  const b = st.before && st.before.t === st.t ? st.before : null;
  const whyRows: Section['rows'] = [{ label: span('The loads here draw'), value: el(qty(st.qLoad, 'MVAr', provOf(st.prov.qLoad), { digits: 1, phases: '3φ' })), note: span('for their magnetic fields') }];
  if (b) {
    const was = (k: string) => solver(`t${b.t}.seq${b.seq}.${k}`);
    whyRows.push(
      { label: span('Steps, before you switched'), value: el(qty(b.steps, '', was(`shunt.${st.shunt}.steps`), { digits: 0 })), note: span('now ', el(qty(st.inService, '', ps, { digits: 0 }))) },
      { label: span('Voltage, before'), value: el(qty(b.vm, 'pu', was(`bus.${st.busId}.vm`), { digits: 4 })), note: span('now ', el(qty(st.vm, 'pu', pv, { digits: 4 }))) },
      { label: span('Its reactive power, before'), value: el(qty(b.q, 'MVAr', was(`bus.${st.busId}.shunt`), { digits: 1, phases: '3φ' })), note: span('now ', el(qty(st.q, 'MVAr', d('Q', pv, ps, stepQ), { digits: 1, phases: '3φ' }))) },
      { label: span('The whole system’s [[losses]], before'), value: el(qty(b.losses, 'MW', was('losses'), { digits: 1 })), note: span('now ', el(qty(st.losses, 'MW', provOf(st.prov.losses), { digits: 1 }))) },
    );
  }
  sections.push({
    title: span('Why here'),
    text: span(b ? 'What changed when you switched, the network solved again:' : 'Switch a step out and the bus voltage sags: the reactive power must then come from generators farther away, and its current warms every line on the way. Try it below.'),
    rows: whyRows,
  });
  return { name: head.name, kind, intro, sections };
}

/** A part of the bank, picked. */
export function capBankPartView(head: CapHead, st: CapBankState | null, what: string): View {
  const view = capBankView(head, st);
  if (!st) return view;
  const t = st.t;
  const cls = st.kvNom >= 200 ? 230 : 115;
  const S = qty(st.design.series, '', data(`components.capacitor.series.${cls}`), { digits: 0 });
  const Pp = qty(st.design.parallel, '', data(`components.capacitor.parallel.${cls}`), { digits: 0 });
  const vg = qty(st.vLN / st.design.series, 'kV', derived(`t${t}.${head.key}.vGroup`, provOf(st.prov.vm)), { digits: 2, basis: 'LN' });
  const texts: Record<string, HTMLSpanElement> = {
    stack: span('One phase of one step: ', el(S), ' groups in series up the stack, each group ', el(Pp), ' cans side by side. Each group takes its share of the phase voltage, ', el(vg), ' now; the tiers are insulated from each other because each sits at a higher voltage than the one below. The bottom joins the other two phases at the step’s grounded neutral.'),
    switch: span('Each step has its own switch. Switched in, the step adds its capacitance to the bus; switched out, it is drawn light and its switch hangs open. A controller steps them in when the voltage sags and out when it rises: you can hold them yourself.'),
    bus: span('The bank’s own short bus: rigid tubes on post insulators, one per phase, running over the steps. The bank’s breaker, back at the main bus, can take the whole bank off at once.'),
  };
  return { ...view, intro: texts[what] ?? view.intro };
}

/** The can with nothing picked: what a capacitor is, and what this one does now. */
export function canView(head: CapHead, st: CapBankState | null, bankKey: string): View {
  const intro = span('A capacitor is two sheets of aluminium foil, very large and very close together, kept apart by thin plastic film, wound up into flat rolls to fit the case. Put a voltage across it and charge gathers on the sheets, + on one and − on the other, with an electric field in the film between them.');
  if (!st) return { name: head.name, kind: span('[[capacitor|Capacitor]] can'), intro, sections: [] };
  const t = st.t;
  const cls = st.kvNom >= 200 ? 230 : 115;
  const cq = derived(`t${t}.${head.key}.Ccan`, data(`model.shunt.${st.shunt}.stepMVAr`), data(`components.capacitor.series.${cls}`), data(`components.capacitor.parallel.${cls}`));
  const vRated = st.kvNom / Math.sqrt(3) / st.design.series;
  const kind = span('[[capacitor|Capacitor]] can · ', el(qty(st.cCan * 1e6, 'µF', cq, { digits: 2 })), ' · rated ', el(qty(vRated, 'kV', derived(`t${t}.${head.key}.Vrated`, head.kvProv, data(`components.capacitor.series.${cls}`)), { digits: 2 })));
  const sections: Section[] = [];
  const pv = provOf(st.prov.vm);
  if (st.vCan > 0) {
    const dv = derived(`t${t}.${head.key}.Vcan`, pv);
    sections.push({
      title: span('Now'),
      rows: [
        { label: span('Voltage across it'), value: el(qty(st.vCan, 'kV', dv, { digits: 3 })), note: span('[[rms|RMS]]; its share of the phase voltage') },
        { label: span('[[current|Current]] through it'), value: el(qty(st.iCan, 'A', derived(`t${t}.${head.key}.Ican`, dv, cq), { digits: 1 })) },
        { label: span('[[reactive-power|Reactive power]]'), value: el(qty(st.qCan, 'kvar', derived(`t${t}.${head.key}.Qcan`, dv, cq), { digits: 0 })) },
        { label: span('Energy held at the voltage’s peak'), value: el(qty(st.cCan * (st.vCan * 1e3) ** 2, 'J', derived(`t${t}.${head.key}.W`, dv, cq), { digits: 0 })), note: span('$W = ½ C V_{peak}^2$, all of it given back a quarter cycle later') },
      ],
    });
    sections.push({
      title: span('Every half cycle'),
      text: span('The charge follows the voltage: + and − change places every half cycle. The current in the terminals is that charge coming and going, so it is greatest when the charge is changing fastest, as the voltage passes through zero.', chartDiv(capChart(st, head.key, true))),
      rows: [],
    });
  } else sections.push({ title: span('Switched out'), text: span('Its step is switched out: no voltage across it, no charge, no field.'), rows: [] });
  const D = COMPONENTS.discharge;
  const v0 = Math.SQRT2 * vRated * 1000;
  const R = D.s / (st.cCan * Math.log(v0 / D.v));
  const dr = derived(`t${t}.${head.key}.R`, cq, data('components.discharge.v'), data('components.discharge.s'));
  sections.push({
    title: span('Switched off'),
    text: span('Cut off from the bus, the plates keep their charge, at up to the peak of the voltage. The discharge resistor across the terminals drains it: [[ieee18|IEEE 18]] asks for ', el(qty(D.v, 'V', data('components.discharge.v'), { digits: 0 })), ' or less within ', el(qty(D.s / 60, 'min', data('components.discharge.s'), { digits: 0 })), '.'),
    rows: [
      { label: span('Largest resistor that does it'), value: el(qty(R / 1e6, 'MΩ', dr, { digits: 2 })) },
      { label: span('Its time constant $τ = RC$'), value: el(qty(R * st.cCan, 's', derived(`t${t}.${head.key}.tau`, dr, cq), { digits: 1 })), note: span('the charge falls to about a third in each') },
    ],
  });
  void bankKey;
  return { name: head.name, kind, intro, sections };
}

/** A part of the can, picked. */
export function canPartView(head: CapHead, st: CapBankState | null, bankKey: string, what: string): View {
  const view = canView(head, st, bankKey);
  const texts: Record<string, string> = {
    case: 'A sealed stainless steel case, filled with an insulating fluid that soaks the film and leaves no air where a spark could start.',
    element: 'An element: two long strips of aluminium foil with plastic film between and on top, wound into a roll and pressed flat. The elements are stacked and joined so the can has the capacitance and voltage it needs.',
    plate: 'Aluminium foil, a few thousandths of a millimetre thick: one plate. The larger the plates and the closer together, the more charge they hold for a given voltage: that is the capacitance.',
    film: 'Polypropylene film, the dielectric: it keeps the plates apart and holds the electric field. Drawn here thousands of times thicker than it is.',
    resistor: 'The discharge resistor, across the terminals inside the case: always connected, it wastes a trickle while the can is in service and drains its charge once it is switched off.',
    bushing: 'The terminals: porcelain bushings carrying the connections through the lid. This can’s two terminals join the next groups in its series string.',
  };
  return { ...view, intro: span(texts[what] ?? '') };
}
