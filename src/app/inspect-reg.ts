import type { RegState } from '../model/regState';
import { ANSI_A } from '../levels/feeder';
import { data, dataText, derived, el, qty, solver, type Prov } from '../ui/quantity';
import type { Section } from '../ui/inspector';
import { rich } from '../ui/glossary';
import type { View } from './inspect-dist';
import { EVERGREEN } from '../data/dist/evergreen';

/**
 * What the inspector says inside feeder 1105's voltage regulator: why the voltage
 * needs lifting (the profile along the trunk), what the regulator did (each phase's
 * tap), and how its control decided (line-drop compensation and the band).
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

function svgText(parent: Element, x: number, y: number, t: string, prov: string, opts: { anchor?: string; size?: number; italic?: boolean } = {}): void {
  const e = svgEl('text', { x, y, 'font-size': opts.size ?? 9, 'text-anchor': opts.anchor ?? 'start', fill: 'var(--ink)', 'data-prov': prov }, parent);
  if (opts.italic) e.setAttribute('font-style', 'italic');
  e.textContent = t;
}

const chartDiv = (n: Node) => {
  const d = document.createElement('div');
  d.className = 'chart';
  d.appendChild(n);
  return d;
};

const PHASE_DASH = ['', '6 3', '10 3 2 3'];

/**
 * The voltage along the trunk, each phase, on the 120 V base: it falls with distance
 * as the load draws current through the line, the regulator lifts it back, and ANSI
 * C84.1 Range A bounds it (at the service, after the transformer and the drop, so the
 * primary needs headroom). The control's band is marked where it holds it.
 */
function profileChart(st: RegState): SVGSVGElement {
  const W = 330;
  const H = 170;
  const L = 34;
  const R = 12;
  const T = 16;
  const B = 28;
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-label': 'Voltage along the feeder, each phase' }) as SVGSVGElement;
  const xMax = st.profile.x[st.profile.x.length - 1]!;
  // the scale fits the voltages and the control's band; Range A shows only where it falls inside
  const all = st.profile.v.flat();
  const c0 = st.control;
  const vLo = Math.floor(Math.min(...all, c0.vset - c0.band / 2) - 0.6);
  const vHi = Math.ceil(Math.max(...all, c0.vset + c0.band / 2) + 0.6);
  const X = (x: number) => L + (x / xMax) * (W - L - R);
  const Y = (v: number) => T + ((vHi - v) / (vHi - vLo)) * (H - T - B);
  // Range A
  for (const v of [ANSI_A.low, ANSI_A.high]) {
    if (v < vLo || v > vHi) continue;
    svgEl('line', { x1: L, y1: Y(v), x2: W - R, y2: Y(v), stroke: 'var(--ink-35)', 'stroke-width': 1, 'stroke-dasharray': '5 3' }, s);
    svgText(s, W - R, Y(v) - 3, 'ANSI C84.1 Range A', `data:c84.rangeA.${v === ANSI_A.low ? 'low' : 'high'}`, { anchor: 'end', size: 8 });
  }
  for (const v of [vLo, vHi]) svgText(s, L - 4, Y(v) + 3, `${v}`, 'derived:reg.profile.axis', { anchor: 'end', size: 8 });
  // the control's band, at the regulator
  const c = st.control;
  const xr = X(st.xReg);
  svgEl('rect', { x: xr, y: Y(c.vset + c.band / 2), width: X(xMax) - xr, height: Y(c.vset - c.band / 2) - Y(c.vset + c.band / 2), fill: 'var(--ink-15)' }, s);
  svgText(s, X(xMax) - 2, Y(c.vset + c.band / 2) - 3, 'the band the control holds', 'notation:formula', { anchor: 'end', size: 8 });
  // the regulator
  svgEl('line', { x1: xr, y1: T - 4, x2: xr, y2: H - B, stroke: 'var(--ink)', 'stroke-width': 1, 'stroke-dasharray': '2 2' }, s);
  svgText(s, xr - 3, T - 6, 'regulator', 'notation:formula', { anchor: 'end', size: 8 });
  // each phase: a step up at the regulator (its two nodes are a few metres apart)
  for (let p = 0; p < 3; p++) {
    const pts = st.profile.x.map((x, i) => `${X(x).toFixed(1)},${Y(st.profile.v[i]![p]!).toFixed(1)}`);
    const e = svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: 'var(--ink)', 'stroke-width': p === 0 ? 1.8 : 1.1, 'stroke-linejoin': 'round' }, s);
    if (PHASE_DASH[p]) e.setAttribute('stroke-dasharray', PHASE_DASH[p]!);
  }
  // what the control sees, phase a
  svgEl('circle', { cx: xr + 8, cy: Y(st.phases[0]!.vRelay), r: 3, fill: 'var(--ink)' }, s);
  svgText(s, xr + 14, Y(st.phases[0]!.vRelay) + 3, 'what the control sees, phase a', 'notation:formula', { size: 8 });
  svgText(s, L, H - 14, 'substation', 'notation:formula', { size: 8 });
  svgText(s, W - R, H - 14, 'end of the trunk', 'notation:formula', { size: 8, anchor: 'end' });
  svgText(s, L - 4, T - 6, 'V, on a 120 V base', 'data:evergreen.REG-1.control.ptRatio', { size: 8 });
  return s;
}

/**
 * Line-drop compensation, drawn: the output voltage as the PT gives it, less the drop
 * the compensator's R′ + jX′ makes with the line's current — what is left is the
 * voltage the control holds, the load centre's.
 */
function ldcChart(st: RegState): SVGSVGElement {
  const W = 330;
  const H = 120;
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-label': 'Line-drop compensation, phase a' }) as SVGSVGElement;
  const ph = st.phases[0]!;
  const th = (ph.degL * Math.PI) / 180;
  // rotate so the PT voltage lies along x
  const rot = (re: number, im: number): [number, number] => [re * Math.cos(-th) - im * Math.sin(-th), re * Math.sin(-th) + im * Math.cos(-th)];
  const pt = [ph.vPT, 0] as const;
  const drop = rot(ph.dropRe, ph.dropIm);
  const relay: [number, number] = [pt[0] - drop[0], pt[1] - drop[1]];
  // a scale that shows the drop: the tip region magnified
  const x0 = 24;
  const y0 = H - 24;
  const k = (W - 60) / ph.vPT;
  const kd = Math.min(18, 70 / Math.max(1e-6, Math.hypot(...drop)));
  const P = (x: number, y: number): [number, number] => [x0 + x * k, y0 - y * k];
  const tip = P(pt[0], 0);
  const r = [tip[0] - drop[0] * kd, tip[1] + drop[1] * kd] as const;
  const arrow = (a: readonly [number, number], b: readonly [number, number], w: number, dash = '') => {
    const e = svgEl('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'var(--ink)', 'stroke-width': w }, s);
    if (dash) e.setAttribute('stroke-dasharray', dash);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    svgEl('polyline', { points: `${b[0] - 6 * ux - 3 * uy},${b[1] - 6 * uy + 3 * ux} ${b[0]},${b[1]} ${b[0] - 6 * ux + 3 * uy},${b[1] - 6 * uy - 3 * ux}`, fill: 'none', stroke: 'var(--ink)', 'stroke-width': w }, s);
  };
  arrow([x0, y0], tip, 1.6);
  arrow(tip, r, 1.2, '4 2');
  arrow([x0, y0], r, 1.2);
  void relay;
  svgText(s, tip[0] - 4, tip[1] + 14, 'V_PT: the output, on the 120 V base', 'data:evergreen.REG-1.control.ptRatio', { anchor: 'end', size: 8 });
  svgText(s, r[0] + 4, r[1] - 4, 'less the line’s drop (magnified)', 'notation:formula', { size: 8 });
  svgText(s, (x0 + r[0]) / 2, (y0 + r[1]) / 2 - 8, 'V_relay: the load centre', 'notation:formula', { size: 8, anchor: 'middle' });
  return s;
}

const provOf = (s: string): Prov => {
  const i = s.indexOf(':');
  const src = s.slice(0, i);
  const key = s.slice(i + 1);
  return src === 'solver' ? solver(key) : src === 'data' ? data(key) : derived(key);
};

/** The regulator with nothing picked. */
export function regView(st: RegState | null): View {
  const kind = span('[[regulator|Step-voltage regulator]] · one single-phase unit per phase · ', el(qty(EVERGREEN.regulator.maxSteps, 'taps', data('evergreen.regulator.maxSteps'), { digits: 0 })), ' each way of ', el(qty(EVERGREEN.regulator.stepPct, '%', data('evergreen.regulator.stepPct'), { digits: 3 })));
  const intro = span('Along a feeder the voltage sags, as the load draws current through the line. A regulator lifts it back: an [[autotransformer]] whose small series winding adds or takes away a slice of the voltage, chosen one tap at a time while it carries the load. Its control watches the voltage and holds it inside a band.');
  if (!st) return { name: dataText('Voltage regulator REG-1', data('evergreen.element.REG-1')), kind, intro, sections: [{ title: span('No operating point'), text: span('No solved state for this interval.'), rows: [] }] };
  const t = st.t;
  const pv = provOf(st.prov.V);
  const pt = provOf(st.prov.tap);
  const pi = provOf(st.prov.I);
  const sections: Section[] = [];
  sections.push({
    title: span('Along the feeder'),
    text: span('Each phase’s voltage from the substation to the end of the trunk, scaled by the potential transformer’s ratio to the base the control uses (', el(qty(st.control.ptRatio, '', data('evergreen.REG-1.control.ptRatio'), { digits: 0 })), ' to one). It falls with distance, steps up at the regulator, and must leave room for the fall through the pole-top transformer and the service to the homes.', chartDiv(profileChart(st))),
    rows: [],
  });
  sections.push({
    title: span('What each unit is doing'),
    rows: st.phases.map((p, i) => ({
      label: span(`Phase ${'abc'[i]}`),
      value: span(el(qty(p.tap, '', solver(`t${t}.feeder.REG-1.tap.${i}`), { digits: 0 })), p.tap > 0 ? ' raise' : p.tap < 0 ? ' lower' : ' neutral'),
      note: span(el(qty(p.vS / st.control.ptRatio, 'V', derived(`t${t}.reg.${i}.vS120`, pv, data('evergreen.REG-1.control.ptRatio')), { digits: 2 })), ' in, ', el(qty(p.vL / st.control.ptRatio, 'V', derived(`t${t}.reg.${i}.vL120`, pv, data('evergreen.REG-1.control.ptRatio')), { digits: 2 })), ' out, on the control’s base'),
    })),
  });
  const a = st.phases[0]!;
  sections.push({
    title: span('How the control decides'),
    text: span('It does not hold the voltage at its own terminals but at the load centre, farther down. From the current it measures it works out the drop a stretch of line would cause (the [[ldc|line-drop compensation]], R′ + jX′), takes it off, and moves a tap only when what is left strays outside the band.', chartDiv(ldcChart(st))),
    rows: [
      { label: span('Set point'), value: el(qty(st.control.vset, 'V', st.vsetHeld !== null ? derived(`t${t}.reg.vsetHeld`) : data('evergreen.REG-1.control.vset'), { digits: 1 })), note: span(st.vsetHeld !== null ? 'as you set it' : 'as installed', '; the band ± ', el(qty(st.control.band / 2, 'V', data('evergreen.REG-1.control.band'), { digits: 1 }))) },
      { label: span('Compensator'), value: span('R′ ', el(qty(st.control.r, 'V', data('evergreen.REG-1.control.r'), { digits: 1 })), ', X′ ', el(qty(st.control.x, 'V', data('evergreen.REG-1.control.x'), { digits: 1 }))), note: span('at the CT’s rated current, ', el(qty(st.control.ctPrimary, 'A', data('evergreen.REG-1.control.ctPrimary'), { digits: 0 }))) },
      { label: span('Phase a: line current'), value: el(qty(a.amps, 'A', pi, { digits: 1 })) },
      { label: span('Phase a: what the control sees'), value: el(qty(a.vRelay, 'V', derived(`t${t}.reg.0.vRelay`, pv, pi), { digits: 2 })), note: span(a.inBand ? 'inside the band: no change' : 'outside the band: a tap change is due') },
    ],
  });
  void pt;
  return { name: dataText('Voltage regulator REG-1', data('evergreen.element.REG-1')), kind, intro, sections };
}

/** A part of the regulator, picked. */
export function regPartView(st: RegState | null, what: string): View {
  const view = regView(st);
  const texts: Record<string, string> = {
    unit: 'One single-phase regulator: an oil-filled tank holding an [[autotransformer]] and its tap changer. One per phase, so each phase is regulated on its own: the feeder’s phases carry different loads.',
    dial: 'The position dial: the tap now, raise to one side of neutral and lower to the other. Real dials also carry drag hands that mark the highest and lowest taps since they were last reset.',
    core: 'The core, in section: laminated steel carrying the flux.',
    shunt: 'The shunt winding: many turns across the line, between the load bushing L and the common SL.',
    series: 'The series winding: a tenth of the shunt winding’s turns, in eight tapped sections. Its voltage, added or subtracted, is the regulator’s whole range: ten percent each way.',
    selector: 'The tap selector: two fingers that step along the eight taps and neutral. Both on one tap, or bridging two: sixteen positions each way.',
    reversing: 'The reversing switch: it turns the series winding round, so the same taps add to the voltage (raise) or take away from it (lower).',
    preventive: 'The preventive autotransformer: where the fingers bridge two taps it sits across them, giving the voltage halfway between, and keeps the current from dropping as the fingers move — the load is never interrupted.',
    control: 'The control: it reads the voltage through a potential transformer and the current through a current transformer, works out the voltage at the load centre, and after a time delay steps a tap to bring it back inside the band.',
    bypass: 'Bypass switches: open in service. Closed, they carry the line past the regulator so that it can be taken out, once its tap is at neutral.',
  };
  return { ...view, intro: span(texts[what] ?? '') };
}
