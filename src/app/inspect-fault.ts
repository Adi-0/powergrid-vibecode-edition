import type { Grid } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import type { Feeder } from '../model/feeder';
import type { FeederFaultResult } from '../model/feederFault';
import { busFaultLevel, type FaultStudy } from '../model/faultStudy';
import { breakerTime, fuseClear, fuseMelt, recloserSlow, tocTime, type ProtResult } from '../model/protection';
import { C37_112, PROTECTION } from '../data/dist/protection';
import { data, dataText, derived, el, qty, solver } from '../ui/quantity';
import type { Section } from '../ui/inspector';
import { rich } from '../ui/glossary';
import type { View } from './inspect-dist';

/**
 * What the inspector says about a fault: on the feeder, the fault current and the
 * protection's sequence, second by second, against the devices' time–current curves;
 * at a transmission bus, the fault levels its breakers must interrupt.
 */
const SVGNS = 'http://www.w3.org/2000/svg';

function span(...parts: Array<Node | string>): HTMLSpanElement {
  const s = document.createElement('span');
  for (const p of parts) s.append(typeof p === 'string' ? rich(p) : p);
  return s;
}

function svgEl(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

function svgText(parent: Element, x: number, y: number, t: string, prov: string, opts: { anchor?: string; size?: number; color?: string } = {}): void {
  const e = svgEl('text', { x, y, 'font-size': opts.size ?? 9, 'text-anchor': opts.anchor ?? 'start', fill: opts.color ?? 'var(--ink)', 'data-prov': prov }, parent);
  e.textContent = t;
}

const wrap = (n: Node) => {
  const d = document.createElement('div');
  d.className = 'chart';
  d.appendChild(n);
  return d;
};

export interface FeederEvent {
  node: string;
  permanent: boolean;
  res: FeederFaultResult;
  prot: ProtResult;
  /** Customers (homes) beyond each device that ends open, and beyond those that opened and reclosed. */
  outHomes: number;
  momentaryHomes: number;
}

const DEVICE_NAME: Record<string, string> = { 'CB-1105': 'Feeder breaker CB-1105', 'RCL-1': 'Recloser RCL-1' };
const devName = (id: string) => dataText(DEVICE_NAME[id] ?? `Fuse ${id.slice(3)}`, data(`evergreen.devices.${id}`));
const KIND: Record<string, string> = { slg: 'single line-to-ground', ll: 'line-to-line', dlg: 'double line-to-ground', '3ph': 'three-phase' };

/** Time–current curves, log–log: every device on the fault's path, and the fault current. */
function tccChart(ev: FeederEvent, key: string): SVGSVGElement {
  const W = 340;
  const H = 250;
  const L = 36;
  const B = 58;
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-label': 'Time–current curves of the devices on the fault’s path' }) as SVGSVGElement;
  const i0 = 100;
  const i1 = 20000;
  const t0 = 0.01;
  const t1 = 100;
  const X = (i: number) => L + ((Math.log10(i) - Math.log10(i0)) / (Math.log10(i1) - Math.log10(i0))) * (W - L - 8);
  const Y = (t: number) => 6 + ((Math.log10(t1) - Math.log10(t)) / (Math.log10(t1) - Math.log10(t0))) * (H - B - 6);
  const ax = Y(t0);
  for (const i of [100, 1000, 10000]) {
    svgEl('line', { x1: X(i), y1: Y(t1), x2: X(i), y2: ax, stroke: 'var(--ink-15)', 'stroke-width': 1 }, s);
    svgText(s, X(i), ax + 11, i >= 1000 ? `${i / 1000} kA` : `${i} A`, 'notation:axis', { anchor: 'middle', size: 8.5 });
  }
  for (const t of [0.01, 0.1, 1, 10, 100]) {
    svgEl('line', { x1: L, y1: Y(t), x2: W - 8, y2: Y(t), stroke: 'var(--ink-15)', 'stroke-width': 1 }, s);
    svgText(s, L - 3, Y(t) + 3, `${t}`, 'notation:axis', { anchor: 'end', size: 8.5 });
  }
  svgText(s, L - 3, 12, 's', 'notation:formula', { anchor: 'end', size: 8.5 });
  const curve = (f: (i: number) => number, attrs: Record<string, string | number>) => {
    const pts: string[] = [];
    for (let k = 0; k <= 160; k++) {
      const i = i0 * (i1 / i0) ** (k / 160);
      const t = f(i);
      if (!Number.isFinite(t) || t > t1 || t < t0) continue;
      pts.push(`${X(i).toFixed(1)},${Y(t).toFixed(1)}`);
    }
    if (pts.length > 1) svgEl('polyline', { points: pts.join(' '), fill: 'none', ...attrs }, s);
  };
  const on = new Set(ev.res.devices);
  const CB = PROTECTION.breaker;
  const RC = PROTECTION.recloser;
  // breaker relay: 51 then 50 (phase)
  curve((i) => Math.min(tocTime(CB.p51, i), i > CB.p50 ? CB.instS : Infinity) + CB.openS, { stroke: 'var(--ink)', 'stroke-width': 1.5 });
  if (on.has(RC.id)) {
    curve((i) => (i > RC.phaseMin ? RC.fastS : Infinity), { stroke: 'var(--ink)', 'stroke-width': 1.2, 'stroke-dasharray': '2 2' });
    curve((i) => recloserSlow(i, 0), { stroke: 'var(--ink)', 'stroke-width': 1.2, 'stroke-dasharray': '6 3' });
  }
  const fuse = ev.res.devices.find((d) => d.startsWith('FU-'));
  if (fuse) {
    curve(fuseMelt, { stroke: 'var(--ink-60)', 'stroke-width': 1.2 });
    curve(fuseClear, { stroke: 'var(--ink-60)', 'stroke-width': 1.2, 'stroke-dasharray': '6 3' });
  }
  // the fault current: the signal colour, with its own dash
  const Iph = Math.max(...ev.res.I.map((x) => x.abs()));
  svgEl('line', { x1: X(Iph), y1: Y(t1), x2: X(Iph), y2: ax, stroke: 'var(--signal)', 'stroke-width': 1.6, 'stroke-dasharray': '4 2' }, s);
  svgText(s, X(Iph) + 3, Y(t1) + 9, `${(Iph / 1000).toFixed(2)} kA`, `solver:${key}.Iph`, { size: 8.5, color: 'var(--signal)' });
  const keyRow = (y: number, x: number, dash: string | null, color: string, label: string) => {
    const l = svgEl('line', { x1: x, y1: y - 3, x2: x + 16, y2: y - 3, stroke: color, 'stroke-width': 1.3 }, s);
    if (dash) l.setAttribute('stroke-dasharray', dash);
    svgText(s, x + 20, y, label, 'notation:formula', { size: 8.5 });
  };
  keyRow(ax + 26, L, null, 'var(--ink)', 'breaker relay (51, 50)');
  if (on.has(RC.id)) {
    keyRow(ax + 26, L + 150, '2 2', 'var(--ink)', 'recloser fast');
    keyRow(ax + 38, L + 150, '6 3', 'var(--ink)', 'recloser delayed');
  }
  if (fuse) {
    keyRow(ax + 38, L, null, 'var(--ink-60)', 'fuse: minimum melt');
    keyRow(ax + 50, L, '6 3', 'var(--ink-60)', 'fuse: total clearing');
  }
  keyRow(ax + 50, L + 150, '4 2', 'var(--signal)', 'the fault current');
  return s;
}

/** The sequence on a time axis: when current flows, and each operation. */
function timeline(ev: FeederEvent, tp: number, key: string): SVGSVGElement {
  const W = 340;
  const H = 34 + 16 * (new Set(ev.prot.events.map((e) => e.device)).size + 1);
  const L = 92;
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-label': 'The protection sequence in time' }) as SVGSVGElement;
  const tEnd = Math.max(1, Math.ceil(ev.prot.clearedAt + 1));
  const X = (t: number) => L + (t / tEnd) * (W - L - 10);
  const rows = ['current', ...new Set(ev.prot.events.map((e) => e.device).filter((d) => d !== 'fault'))];
  const Y = (r: number) => 14 + r * 16;
  rows.forEach((r, k) => {
    svgText(s, L - 6, Y(k) + 3, r === 'current' ? 'fault current' : (DEVICE_NAME[r] ?? `fuse ${r.slice(3)}`), r === 'current' ? 'notation:axis' : `data:evergreen.devices.${r}`, { anchor: 'end', size: 8.5 });
    svgEl('line', { x1: L, y1: Y(k), x2: W - 10, y2: Y(k), stroke: 'var(--ink-15)', 'stroke-width': 1 }, s);
  });
  for (const [a, b] of ev.prot.conducting) svgEl('line', { x1: X(a), y1: Y(0), x2: X(Math.max(b, a + 0.004)), y2: Y(0), stroke: 'var(--signal)', 'stroke-width': 5 }, s);
  const mark: Record<string, string> = { trip: '▾', open: '○', reclose: '●', melt: '◇', clear: '◆', lockout: '■', out: '×', fault: '' };
  for (const e of ev.prot.events) {
    if (e.device === 'fault') continue;
    const k = rows.indexOf(e.device);
    svgText(s, X(e.t), Y(k) + 3.5, mark[e.what] ?? '·', 'notation:formula', { anchor: 'middle', size: 9 });
  }
  const ay = H - 12;
  // ticks short of the end, so the unit has the end to itself
  for (let t = 0; t < tEnd - 0.5; t += tEnd > 8 ? 2 : 1) svgText(s, X(t), ay + 9, `${t}`, 'notation:axis', { anchor: 'middle', size: 8.5 });
  svgText(s, W - 10, ay + 9, 's', 'notation:formula', { anchor: 'end', size: 8.5 });
  // the playback cursor
  const cx = X(Math.max(0, Math.min(tEnd, tp)));
  svgEl('line', { class: 'cursor', x1: cx, y1: 4, x2: cx, y2: ay, stroke: 'var(--ink)', 'stroke-width': 1, 'data-x0': L, 'data-w': W - L - 10, 'data-tend': tEnd }, s);
  void key;
  return s;
}

const WHAT: Record<string, string> = {
  trip: 'trips',
  open: 'opens: the current stops',
  reclose: 'recloses',
  melt: 'melts',
  clear: 'clears: the arc is out',
  lockout: 'locks out: stays open',
  out: 'goes out on its own (a temporary fault)',
};

export function feederFaultView(fd: Feeder, s: Snapshot, ev: FeederEvent, tp: number): View {
  const t = s.t;
  const key = `t${t}.fault.${ev.node}`;
  const r = ev.res;
  const phases = r.phases.map((p) => 'abc'[p]).join('');
  const name = span('A fault at ', dataText(ev.node, data(`evergreen.nodes.${ev.node}`)));
  const kind = span(`${ev.permanent ? 'Permanent' : 'Temporary'} [[fault|fault]] · ${KIND[r.kind]} · phase${phases.length > 1 ? 's' : ''} ${phases}`);
  const intro = span(
    ev.permanent
      ? 'Something is touching the line and stays — a fallen tree, a broken insulator. Protection must isolate it: the device nearest the fault opens and stays open; everything beyond it is without supply until a crew repairs it.'
      : 'A flashover that goes out once the current stops — a branch brushing the line, a bird, lightning. Reclosing gets it back: open briefly, close again, and most customers see only a blink.',
  );
  const sections: Section[] = [];
  const Q = (k: string) => solver(`${key}.${k}`);
  sections.push({
    title: span('Fault current'),
    text: span('Load is neglected in a fault calculation; the currents are the network’s response to the fault alone, RMS, symmetrical.'),
    rows: [
      ...[0, 1, 2]
        .filter((p) => r.I[p]!.abs() > 1e-6)
        .map((p) => ({ label: span(`$I_${'abc'[p]}$, into the fault`), value: el(qty(r.I[p]!.abs() / 1000, 'kA', Q(`I${'abc'[p]}`), { digits: 3 })) })),
      { label: span('$3I_0$, residual (to ground)'), value: el(qty(r.residual.abs() / 1000, 'kA', Q('3I0'), { digits: 3 })), note: span('what the ground elements ([[c372|50N]], [[c372|51N]]) measure') },
      {
        label: span('Thevenin impedance, faulted phase ($Z_{pp}$)'),
        value: span(el(qty(r.Z.get(r.phases[0]!, r.phases[0]!).re, 'Ω', Q('R'), { digits: 4 })), ' + j', el(qty(r.Z.get(r.phases[0]!, r.phases[0]!).im, 'Ω', Q('X'), { digits: 4 }))),
        note: span('the source through the substation bank, plus every line on the way'),
      },
    ],
  });
  const rows = ev.prot.events
    .filter((e) => e.device !== 'fault' || e.what === 'out')
    .map((e) => ({
      label: span(el(qty(e.t, 's', Q(`event.${e.device}.${e.what}.${e.t.toFixed(4)}`), { digits: 3 }))),
      value: span(e.device === 'fault' ? 'the fault' : devName(e.device), ' ', WHAT[e.what] ?? e.what, e.how ? span(' (', e.how === 'fast' || e.how === 'delayed' ? `${e.how} curve` : dataText(e.how, data(`c37.2.${e.how}`)), ')') : ''),
    }));
  sections.push({ title: span('What protection did, in order'), text: wrap(timeline(ev, tp, key)), rows });
  sections.push({
    title: span('[[tcc|Time–current curves]]'),
    text: span(
      'Each device operates where the fault current (the vertical line) crosses its curve. Series devices are set so the one nearest the fault is fastest, and the next one back waits at least the [[cti|coordination time interval]] (',
      el(qty(PROTECTION.cti, 's', data('protection.cti'), { digits: 1 })),
      ') longer. Relay curves: [[c37112|IEEE C37.112]] very inverse.',
      wrap(tccChart(ev, key)),
    ),
    rows: [],
  });
  sections.push({
    title: span('Afterwards'),
    rows: [
      { label: span('Homes without supply'), value: el(qty(ev.outHomes, 'homes', Q('outHomes'), { digits: 0 })), note: ev.outHomes ? span('until the fault is repaired: a sustained interruption') : span('none') },
      { label: span('Homes that saw a blink'), value: el(qty(ev.momentaryHomes, 'homes', Q('momentaryHomes'), { digits: 0 })), note: span('a momentary interruption while the recloser was open') },
    ],
  });
  void fd;
  return { name, kind, intro, sections };
}

/** A transmission bus's fault levels: what its breakers must be able to interrupt. */
export function busFaultSection(grid: Grid, s: Snapshot, fs: FaultStudy, siteId: string): Section | null {
  const buses = grid.buses.filter((b) => b.site.id === siteId && !b.terminalOf && s.energized[b.index]);
  if (!buses.length) return null;
  const rows: Section['rows'] = [];
  for (const b of buses) {
    const f = busFaultLevel(grid, fs, b.index);
    const k = `t${s.t}.bus.${b.id}.fault`;
    rows.push({
      label: span(el(qty(b.kv, 'kV', data(`network.bus.${b.id}.baseKV`), { digits: 0, basis: 'LL' })), ' bus'),
      value: span(el(qty(f.i3kA, 'kA', solver(`${k}.i3`), { digits: 1 })), ' · ', el(qty(f.i1kA, 'kA', solver(`${k}.i1`), { digits: 1 }))),
      note: span('three-phase · line-to-ground; ', el(qty(f.mva3, 'MVA', derived(`${k}.mva`, solver(`${k}.i3`)), { digits: 0 })), ' short-circuit, X/R ', el(qty(f.xr, '', solver(`${k}.xr`), { digits: 1 }))),
    });
  }
  return {
    title: span('If a [[fault|fault]] struck here'),
    text: span('Fault current in the first cycles (subtransient), by [[sequence-networks|symmetrical components]] from this interval’s solution. Inverter-based plants are left out: they limit their current to little more than rated.'),
    rows,
  };
}

export { C37_112 };

/** The feeder's reliability over a simulated record: IEEE 1366 indices, and what fuse saving buys. */
export function reliabilitySection(r: import('../model/reliability').ReliabilityRun, t: number): Section {
  const Q = (k: string) => solver(`t${t}.reliability.${k}`);
  return {
    title: span('Reliability, over a simulated record ([[saifi|IEEE 1366]])'),
    text: span(
      'Faults placed at random along the feeder, ',
      el(qty(r.faults, 'faults', Q('faults'), { digits: 0 })),
      ' in ',
      el(qty(r.years, 'years', data('reliability.years'), { digits: 0 })),
      ', each run through the protection sequence above, then the customers counted who lost supply, and for how long.',
    ),
    rows: [
      { label: span('SAIFI: interruptions per customer per year'), value: el(qty(r.saifi, '', Q('saifi'), { digits: 3 })), note: span('with every lateral fault blowing its fuse instead: ', el(qty(r.fuseBlowing.saifi, '', Q('saifiFB'), { digits: 3 }))) },
      { label: span('SAIDI: minutes without supply per customer per year'), value: el(qty(r.saidi, 'min', Q('saidi'), { digits: 1 })) },
      { label: span('CAIDI: minutes per interruption'), value: el(qty(r.caidi, 'min', Q('caidi'), { digits: 1 })) },
      { label: span('MAIFI_E: blinks per customer per year'), value: el(qty(r.maifiE, '', Q('maifi'), { digits: 3 })), note: span('the price of fuse saving: brief interruptions for everyone beyond the recloser') },
    ],
  };
}
