import type { XfmrPlate, XfmrState } from '../model/xfmrState';
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
