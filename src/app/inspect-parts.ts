import type { XfmrPlate, XfmrState } from '../model/xfmrState';
import { interruption, type BreakerState, type Interruption } from '../model/breakerState';
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
    text: span('Current drawn from the low-voltage winding pushes against the flux; the high side draws just enough more current to cancel that push. So the currents are in the inverse of the turns ratio, and the power passes through.'),
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
