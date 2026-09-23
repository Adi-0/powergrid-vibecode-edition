import type { Grid } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import { CCGT, plantState, type PlantState } from '../model/ccgt';
import { capability, margins, machineOf, phasors, xeOf, type Phasors } from '../model/machine';
import { GROUPS, type TripResponse } from '../model/frequency';
import { PLANTS } from '../data/ca/plants';
import { data, dataText, derived, el, qty, siQty, solver, type Prov } from '../ui/quantity';
import type { Section } from '../ui/inspector';
import { rich } from '../ui/glossary';
import { homesScale } from './inspect-system';
import type { EquipWhat } from '../levels/level';
import type { View } from './inspect-dist';

/**
 * What the inspector says in a plant and at a machine: where the fuel's energy goes,
 * what each unit makes, the generator's phasors and its capability, and — after a
 * trip — the frequency of the interconnection second by second.
 */
const SVGNS = 'http://www.w3.org/2000/svg';
const DEG = 180 / Math.PI;

function span(...parts: Array<Node | string>): HTMLSpanElement {
  const s = document.createElement('span');
  for (const p of parts) s.append(typeof p === 'string' ? rich(p) : p);
  return s;
}

const plantName = (id: string) => dataText(PLANTS.find((p) => p.id === id)!.name, data(`plants.${id}.name`));
const pct = (v: number, prov: Prov) => el(qty(v * 100, '%', prov, { digits: 1 }));

function noSolution(name: string | Node, kind: Node): View {
  return { name, kind, sections: [{ title: span('No operating point'), text: span('There is no solved state for this interval, so no flows here to report.'), rows: [] }] };
}

/** The plant with nothing selected: where every megawatt of fuel goes. */
export function plantView(grid: Grid, s: Snapshot, plantId: string, trip: TripResponse | null): View {
  const t = s.t;
  const ps = plantState(grid, s, plantId);
  const d = ps.design;
  const name = plantName(plantId);
  const kind = span('[[combined-cycle|Combined-cycle]] gas plant · ', el(qty(d.ratedMW, 'MW', data(`plants.${plantId}.mw`), { digits: 0 })), ' · two gas turbines, one steam turbine');
  const intro = span(
    'Two gas turbines burn natural gas and turn part of its heat into shaft work; their hot exhaust boils water in the [[hrsg|heat-recovery steam generators]] for a steam turbine, whose exhaust is condensed with seawater. About half the fuel’s energy becomes electricity; the rest leaves as heat — up the stacks and into Monterey Bay.',
  );
  if (s.outcome === 'none') return noSolution(name, kind);
  const sections: Section[] = [];
  if (trip) sections.push(...frequencySections(trip, t));
  const b = ps.balance;
  if (!b) {
    sections.push({
      title: span(ps.tripped ? 'Tripped' : 'Not running'),
      text: span(ps.tripped ? 'Its breakers are open: it burns no fuel and delivers nothing. The rest of the interconnection has made up its output (see the frequency response above).' : 'Not committed in this interval: the dispatch found cheaper supply.'),
      rows: [],
    });
    return { name, kind, intro, sections };
  }
  const k = (key: string) => derived(`t${t}.plant.${plantId}.${key}`, solver(`t${t}.plant.${plantId}.pg`));
  const fuelQ = k('fuelHhv');
  const netQ = solver(`t${t}.plant.${plantId}.net`);
  const share = (v: number, key: string) => span(pct(v / b.fuelHhv, derived(`t${t}.plant.${plantId}.${key}Share`, fuelQ)), ' of the fuel');
  sections.push({
    title: span('Where the fuel goes'),
    text: span('Every megawatt of fuel ends in exactly one of these. Heat is in MWth (thermal megawatts), electricity in MW: the same unit of power, whatever form it takes.'),
    rows: [
      { label: span('Fuel burned ([[hhv|higher heating value]])'), value: el(qty(b.fuelHhv, 'MWth', fuelQ, { digits: 1 })), note: span('what the gas would give if burned completely and its water vapour condensed') },
      { label: span('Delivered to the grid, at the switchyard'), value: el(qty(b.netMW, 'MW', netQ, { digits: 1, phases: '3φ' })), note: span(share(b.netMW, 'net'), ' · ', homesScale(b.netMW, netQ, s.startHour + 0.125)) },
      { label: span('Lost in the [[transformer|step-up transformers]]'), value: el(qty(b.gsuLoss, 'MW', k('gsuLoss'), { digits: 2 })), note: span('from the power flow: output at the generators less what reaches the bus') },
      { label: span('Lost in the generators'), value: el(qty(b.generatorLoss, 'MW', k('genLoss'), { digits: 2 })), note: span('windings and iron heat; generator efficiency ', el(qty(CCGT.etaGen * 100, '%', data('ccgt.etaGen'), { digits: 1 }))) },
      { label: span('Up the stacks: heat not recovered'), value: el(qty(b.stack, 'MWth', k('stack'), { digits: 1 })), note: share(b.stack, 'stack') },
      { label: span('Up the stacks: water vapour’s latent heat'), value: el(qty(b.latent, 'MWth', k('latent'), { digits: 1 })), note: span('the difference between the higher and [[lhv|lower heating value]]; ', share(b.latent, 'latent')) },
      { label: span('To the condenser, into the bay'), value: el(qty(b.condenser, 'MWth', k('condenser'), { digits: 1 })), note: share(b.condenser, 'condenser') },
      { label: span('Fuel less all of the above'), value: el(siQty(b.residual * 1e6, 'W', k('residual'))), note: span('energy closes') },
    ],
  });
  sections.push({
    title: span('The units'),
    rows: Object.entries(ps.gens).map(([u, gi]) => ({
      label: u === 'ST' ? span('Steam turbine generator') : dataText(`Gas turbine generator ${u.slice(2)}`, data(`plants.${plantId}.units.${u}.name`)),
      value: span(el(qty(s.pg[gi]!, 'MW', solver(`t${t}.gen.${plantId}-${u}.pg`), { digits: 1 })), ' · ', el(qty(s.qg[gi]!, 'MVAr', solver(`t${t}.gen.${plantId}-${u}.qg`), { digits: 1 }))),
    })),
  });
  const effQ = derived(`t${t}.plant.${plantId}.efficiency`, fuelQ, netQ);
  sections.push({
    title: span('Efficiency'),
    rows: [
      {
        label: span('[[heat-rate|Heat rate]], net ([[hhv|HHV]])'),
        value: el(qty(b.heatRate, 'Btu/kWh', k('heatRate'), { digits: 0 })),
        note: span('fuel per unit of electricity delivered; at full load the data file’s ', el(qty(d.heatRate, 'Btu/kWh', data(`plants.${plantId}.heatRate`), { digits: 0 }))),
      },
      { label: span('Net efficiency (HHV)'), value: pct(b.netMW / b.fuelHhv, effQ), note: span('a simple-cycle gas turbine alone: about a third') },
      { label: span('Gas turbines (Brayton cycle, LHV)'), value: pct(b.gt.reduce((a, g) => a + g.shaft, 0) / b.fuelLhv, k('etaGT')) },
      { label: span('Steam cycle (Rankine), of the heat in the steam'), value: pct(b.etaRankineNow, k('etaRankine')) },
      { label: span('Share of the exhaust heat the HRSGs recover'), value: pct(CCGT.etaHrsg, data('ccgt.etaHrsg')) },
    ],
  });
  return { name, kind, intro, sections };
}

const EQUIP: Record<EquipWhat, string> = {
  bus: 'The plant’s switchyard: where its step-up transformers, the circuits to Metcalf, the banks to the 500 kV yard, Unit 2 and the battery all meet.',
  gsu: 'A generator step-up transformer (GSU): from the generator’s voltage up to the transmission voltage. Its low-voltage winding is delta, its high-voltage winding a grounded wye — the delta blocks zero-sequence current, so a ground fault on the grid does not drive it into the generator.',
  generator: 'A synchronous generator: the turbine turns its rotor, whose magnetic field sweeps the stator winding and makes three-phase voltage. It turns in step with every other synchronous machine in the West: a two-pole machine makes one turn per cycle of the grid’s frequency.',
  turbine: 'A turbine: the gas turbine compresses air, burns gas in it and expands the hot gas through its blades; the steam turbine expands the HRSGs’ steam. Each turns its own generator.',
  hrsg: 'A heat-recovery steam generator (HRSG): banks of tubes in the gas turbine’s exhaust that boil and superheat water for the steam turbine. What it cannot recover goes up the stack.',
  stack: 'The stack: the exhaust leaves here, carrying the heat the HRSG did not recover and the latent heat of the water vapour made by burning the gas.',
  condenser: 'The condenser: the steam turbine’s exhaust steam condenses on tubes cooled by seawater, which carries the heat back to Monterey Bay. By far the largest single loss of the plant — the price of turning heat into work.',
  fuel: 'Natural gas from the pipeline, burned in the gas turbines’ combustors.',
  stator: 'The stator: the stationary part, with the three-phase winding in its slots. The rotating field induces the voltage E_f in it.',
  rotor: 'The rotor: a forged steel cylinder with the field winding in its slots, carrying direct current from the exciter. Turned by the turbine at synchronous speed.',
  exciter: 'The exciter: supplies the rotor’s field current. More field current, more internal voltage E_f — and the generator supplies more reactive power.',
  neutral: 'The stator’s neutral, grounded through a transformer and resistor so a ground fault inside the generator draws only a few amperes instead of thousands.',
  terminals: 'The stator terminals: the three phases leave through the isolated-phase bus, each conductor in its own grounded enclosure, to the step-up transformer.',
};

/** A piece of equipment in the plant. */
export function equipView(grid: Grid, s: Snapshot, plantId: string, what: EquipWhat, id: string): View {
  const t = s.t;
  const ps = plantState(grid, s, plantId);
  const b = ps.balance;
  const unit = id.startsWith(`${plantId}-`) ? id.slice(plantId.length + 1) : '';
  const titles: Record<EquipWhat, string> = {
    bus: 'Switchyard',
    gsu: `Step-up transformer, ${unit}`,
    generator: unit === 'ST' ? 'Steam turbine generator' : `Gas turbine generator ${unit.slice(2)}`,
    turbine: unit === 'ST' ? 'Steam turbine' : `Gas turbine ${unit.slice(2)}`,
    hrsg: `Heat-recovery steam generator ${unit.slice(2)}`,
    stack: `Stack ${unit.slice(2)}`,
    condenser: 'Condenser',
    fuel: 'Fuel gas',
    stator: 'Stator',
    rotor: 'Rotor',
    exciter: 'Exciter',
    neutral: 'Neutral grounding',
    terminals: 'Terminals',
  };
  const name = /\d/.test(titles[what]) ? dataText(titles[what], data(`plants.${plantId}.equip.${id}.${what}`)) : titles[what];
  const kind = span(plantName(plantId));
  const rows: Section['rows'] = [];
  const k = (key: string) => derived(`t${t}.plant.${plantId}.${key}`, solver(`t${t}.plant.${plantId}.pg`));
  const gi = ps.gens[unit];
  const gtIdx = unit === 'GT1' ? 0 : unit === 'GT2' ? 1 : -1;
  if (b && gtIdx >= 0 && (what === 'turbine' || what === 'hrsg' || what === 'stack')) {
    const g = b.gt[gtIdx]!;
    const exAll = b.gt.reduce((a, x) => a + x.exhaust, 0);
    if (what === 'turbine') {
      rows.push({ label: span('Fuel in ([[lhv|LHV]])'), value: el(qty(g.fuelLhv, 'MWth', k(`${unit}.fuel`), { digits: 1 })) });
      rows.push({ label: span('Shaft work to the generator'), value: el(qty(g.shaft, 'MW', k(`${unit}.shaft`), { digits: 1 })) });
      rows.push({ label: span('Hot exhaust to the HRSG'), value: el(qty(g.exhaust, 'MWth', k(`${unit}.exhaust`), { digits: 1 })) });
    } else if (what === 'hrsg') {
      rows.push({ label: span('Exhaust heat in'), value: el(qty(g.exhaust, 'MWth', k(`${unit}.exhaust`), { digits: 1 })) });
      rows.push({ label: span('Taken up by the steam'), value: el(qty((b.steamHeat * g.exhaust) / exAll, 'MWth', k(`${unit}.steam`), { digits: 1 })) });
    } else {
      rows.push({ label: span('Heat up this stack (with latent heat)'), value: el(qty(((b.stack + b.latent) * g.exhaust) / exAll, 'MWth', k(`${unit}.stack`), { digits: 1 })) });
    }
  }
  if (b && unit === 'ST' && what === 'turbine') {
    rows.push({ label: span('Heat in the steam'), value: el(qty(b.steamHeat, 'MWth', k('steamHeat'), { digits: 1 })) });
    rows.push({ label: span('Shaft work to the generator'), value: el(qty(b.stShaft, 'MW', k('ST.shaft'), { digits: 1 })) });
  }
  if (b && what === 'condenser') rows.push({ label: span('Heat to the bay'), value: el(qty(b.condenser, 'MWth', k('condenser'), { digits: 1 })) });
  if (b && what === 'fuel') rows.push({ label: span('Gas burned ([[hhv|HHV]])'), value: el(qty(b.fuelHhv, 'MWth', k('fuelHhv'), { digits: 1 })) });
  if (gi !== undefined && (what === 'generator' || what === 'gsu')) {
    rows.push({ label: span('Output at the terminals'), value: span(el(qty(s.pg[gi]!, 'MW', solver(`t${t}.gen.${id}.pg`), { digits: 1 })), ' · ', el(qty(s.qg[gi]!, 'MVAr', solver(`t${t}.gen.${id}.qg`), { digits: 1 }))) });
    const kx = ps.gsus[unit];
    if (what === 'gsu' && kx !== undefined) {
      rows.push({ label: span('Into the 230 kV bus'), value: el(qty(-s.pf[kx]!, 'MW', solver(`t${t}.branch.${grid.branches[kx]!.id}.pf`), { digits: 2 })) });
      rows.push({ label: span('Lost in this transformer'), value: el(qty(s.pf[kx]! + s.pt[kx]!, 'MW', derived(`t${t}.branch.${grid.branches[kx]!.id}.loss`, solver(`t${t}.branch.${grid.branches[kx]!.id}.pf`), solver(`t${t}.branch.${grid.branches[kx]!.id}.pt`)), { digits: 3 })) });
      rows.push({ label: span('Connection ([[vector-group|vector group]])'), value: dataText('YNd1', data(`network.xfmr.${grid.branches[kx]!.id}.vectorGroup`)) });
    }
  }
  return { name, kind, intro: span(EQUIP[what]), sections: rows.length ? [{ title: span('Now'), rows }] : [] };
}

// ---------------------------------------------------------------- the machine

function svgEl(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

function svgText(parent: Element, x: number, y: number, t: string, prov: string, opts: { anchor?: string; italic?: boolean; size?: number } = {}): void {
  const e = svgEl('text', { x, y, 'font-size': opts.size ?? 10, 'text-anchor': opts.anchor ?? 'start', fill: 'var(--ink)', 'data-prov': prov }, parent);
  if (opts.italic) e.setAttribute('font-style', 'italic');
  e.textContent = t;
}

function arrow(parent: Element, x0: number, y0: number, x1: number, y1: number, w = 1.4, color = 'var(--ink)', dash?: string): void {
  const l = svgEl('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: color, 'stroke-width': w }, parent);
  if (dash) l.setAttribute('stroke-dasharray', dash);
  const a = Math.atan2(y1 - y0, x1 - x0);
  const h = 6;
  svgEl('polyline', { points: `${x1 - h * Math.cos(a - 0.4)},${y1 - h * Math.sin(a - 0.4)} ${x1},${y1} ${x1 - h * Math.cos(a + 0.4)},${y1 - h * Math.sin(a + 0.4)}`, fill: 'none', stroke: color, 'stroke-width': w }, parent);
}

/** Phasor diagram, generator reference: V_t along the reference, I_a at −φ, R_aI_a and jX_dI_a to E_f. */
function phasorDiagram(p: Phasors, key: string): SVGSVGElement {
  const W = 340;
  const H = 190;
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-label': 'Phasor diagram of the generator' }) as SVGSVGElement;
  // rotate so V_t lies along +x
  const rot = -p.theta;
  const scale = Math.min((W - 60) / Math.max(p.Ef, p.V, 1), 110 / Math.max(0.2, p.Ef * Math.sin(Math.abs(p.delta)) + 0.1));
  const ox = 24;
  const oy = H - 34;
  const P = (re: number, im: number): [number, number] => [ox + re * scale, oy - im * scale];
  const c = (m: number, a: number): [number, number] => [m * Math.cos(a + rot), m * Math.sin(a + rot)];
  const [vx, vy] = c(p.V, p.theta);
  const [ix, iy] = c(p.I, p.iAngle);
  const rI = [p.rec.ra * ix, p.rec.ra * iy];
  const xI = [-p.rec.xd * iy, p.rec.xd * ix];
  const [ex, ey] = c(p.Ef, p.efAngle);
  svgEl('line', { x1: ox - 10, y1: oy, x2: W - 8, y2: oy, stroke: 'var(--ink-15)', 'stroke-width': 1 }, s);
  arrow(s, ...P(0, 0), ...P(vx, vy), 1.6);
  arrow(s, ...P(0, 0), ...P(ix * 0.9, iy * 0.9), 1.2, 'var(--ink-60)');
  arrow(s, ...P(vx, vy), ...P(vx + rI[0]!, vy + rI[1]!), 1);
  arrow(s, ...P(vx + rI[0]!, vy + rI[1]!), ...P(vx + rI[0]! + xI[0]!, vy + rI[1]! + xI[1]!), 1.2, 'var(--ink)', '4 2');
  arrow(s, ...P(0, 0), ...P(ex, ey), 2);
  // angles: δ between V_t and E_f, φ between V_t and I_a
  const arc = (r: number, a0: number, a1: number) => {
    const n = 20;
    const pts: string[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const [x, y] = P(r * Math.cos(a), r * Math.sin(a));
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: 'var(--ink-60)', 'stroke-width': 0.8 }, s);
  };
  arc(p.V * 0.45, 0, p.delta);
  arc(p.I * 0.5, -p.phi, 0);
  const lab = (x: number, y: number, t: string, sub: string) => {
    const e = svgEl('text', { x, y, 'font-size': 11, 'font-style': 'italic', fill: 'var(--ink)', 'data-prov': 'notation:formula' }, s);
    e.textContent = t;
    if (sub) {
      const ts = svgEl('tspan', { 'font-size': 8, dy: 3, 'font-style': 'normal' }, e);
      ts.textContent = sub;
    }
  };
  const [lvx, lvy] = P(vx, vy);
  lab(lvx - 4, lvy - 8, 'V', 't'); // above its tip; I_a's label goes below (they are near-colinear at high power factor)
  const [lex, ley] = P(ex, ey);
  lab(lex + 4, ley, 'E', 'f');
  const [lix, liy] = P(ix * 0.9, iy * 0.9);
  lab(lix - 14, liy + 16, 'I', 'a');
  const [mx, my] = P(vx + rI[0]! + xI[0]! / 2, vy + rI[1]! + xI[1]! / 2);
  lab(mx + 6, my, 'jX', 'd');
  const [dx, dy] = P(p.V * 0.5 * Math.cos(p.delta / 2), p.V * 0.5 * Math.sin(p.delta / 2));
  lab(dx + 3, dy, 'δ', '');
  const [fx, fy] = P(p.I * 0.55 * Math.cos(-p.phi / 2), p.I * 0.55 * Math.sin(-p.phi / 2));
  lab(fx + 3, fy + 8, 'φ', '');
  svgText(s, W - 8, H - 6, 'Generator reference: current out of the machine; terminal voltage along the reference', 'notation:formula', { anchor: 'end', size: 8.5 });
  return s;
}

/** Capability chart: P up, Q across (over-excited to the right), with the operating point. */
function capabilityChart(p: Phasors, cap: ReturnType<typeof capability>, qmin: number, qmax: number, key: string): SVGSVGElement {
  const W = 340;
  const H = 262;
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-label': 'Capability chart of the generator' }) as SVGSVGElement;
  const mva = p.rec.mva;
  const q0 = -0.9;
  const q1 = 1.05;
  const p1 = 1.1;
  const L = 34;
  const B = 70; // room below the axis: ticks, which side is which, and the key
  const X = (q: number) => L + ((q - q0) / (q1 - q0)) * (W - L - 10);
  const Y = (pp: number) => H - B - (pp / p1) * (H - B - 14);
  const ax = Y(0);
  // axes, ticks (MW and MVAr from the per-unit chart times the rating)
  svgEl('line', { x1: X(q0), y1: ax, x2: X(q1), y2: ax, stroke: 'var(--ink)', 'stroke-width': 1 }, s);
  svgEl('line', { x1: X(0), y1: ax, x2: X(0), y2: Y(p1), stroke: 'var(--ink)', 'stroke-width': 1 }, s);
  svgText(s, X(0) + 4, Y(p1) + 6, 'P, MW', 'notation:formula', { size: 9 });
  for (const q of [-0.5, 0.5]) svgText(s, X(q), ax + 12, (q * mva).toFixed(0), `derived:machines.${p.rec.gen}.chart.q`, { anchor: 'middle', size: 8.5 });
  svgText(s, X(q1), ax + 12, 'Q, MVAr', 'notation:formula', { anchor: 'end', size: 9 });
  for (const pp of [0.5, 1]) svgText(s, X(0) - 3, Y(pp) + 3, (pp * mva).toFixed(0), `derived:machines.${p.rec.gen}.chart.p`, { anchor: 'end', size: 8.5 });
  svgText(s, X(-0.45), ax + 24, '← under-excited: absorbs Q', 'notation:formula', { size: 8.5, anchor: 'middle' });
  svgText(s, X(0.55), ax + 24, 'over-excited: supplies Q →', 'notation:formula', { size: 8.5, anchor: 'middle' });
  const path = (pts: Array<[number, number]>, attrs: Record<string, string | number>) =>
    svgEl('polyline', { points: pts.filter(([pp, q]) => pp >= -1e-9 && pp <= p1 && q >= q0 && q <= q1).map(([pp, q]) => `${X(q).toFixed(1)},${Y(pp).toFixed(1)}`).join(' '), fill: 'none', ...attrs }, s);
  // limits: armature current (circle), field current (arc), steady-state stability (arc), turbine (line)
  path(cap.armature.filter(([pp]) => pp >= 0), { stroke: 'var(--ink)', 'stroke-width': 1.3 });
  path(cap.field, { stroke: 'var(--ink)', 'stroke-width': 1.3, 'stroke-dasharray': '6 3' });
  path(cap.stability, { stroke: 'var(--ink)', 'stroke-width': 1.3, 'stroke-dasharray': '2 2' });
  svgEl('line', { x1: X(q0), y1: Y(cap.turbineP), x2: X(q1), y2: Y(cap.turbineP), stroke: 'var(--ink-60)', 'stroke-width': 1 }, s);
  // the power flow's rectangle of reactive limits
  for (const q of [qmin / mva, qmax / mva]) svgEl('line', { x1: X(q), y1: ax, x2: X(q), y2: Y(cap.turbineP), stroke: 'var(--ink-35)', 'stroke-width': 1, 'stroke-dasharray': '1.5 3' }, s);
  // operating point
  const ox = X(p.Q);
  const oy = Y(p.P);
  svgEl('circle', { cx: ox, cy: oy, r: 4.2, fill: 'var(--ground)', stroke: 'var(--ink)', 'stroke-width': 1.6 }, s);
  svgEl('circle', { cx: ox, cy: oy, r: 1.4, fill: 'var(--ink)' }, s);
  // the chart's own key
  const keyRow = (y: number, x: number, dash: string | null, color: string, label: string) => {
    const l = svgEl('line', { x1: x, y1: y - 3, x2: x + 18, y2: y - 3, stroke: color, 'stroke-width': 1.3 }, s);
    if (dash) l.setAttribute('stroke-dasharray', dash);
    svgText(s, x + 22, y, label, 'notation:formula', { size: 8.5 });
  };
  keyRow(ax + 40, L, null, 'var(--ink)', 'armature current');
  keyRow(ax + 40, L + 110, '6 3', 'var(--ink)', 'field current');
  keyRow(ax + 40, L + 205, '2 2', 'var(--ink)', 'stability');
  keyRow(ax + 54, L, null, 'var(--ink-60)', 'turbine');
  keyRow(ax + 54, L + 110, '1.5 3', 'var(--ink-35)', 'the power flow’s Q limits');
  void key;
  return s;
}

/** The generator: its phasors at this interval and where it sits in its capability. */
export function machineView(grid: Grid, s: Snapshot, genId: string, vsetNow: number, vsetSched: number): View {
  const t = s.t;
  const rec = machineOf(genId)!;
  const g = grid.gens.find((x) => x.id === genId)!;
  const name = dataText(rec.name, data(`machines.${genId}.name`));
  const kind = span('[[synchronous-generator|Synchronous generator]] · ', el(qty(rec.mva, 'MVA', data(`machines.${genId}.mva`), { digits: 0 })), ' · ', el(qty(rec.kv, 'kV', data(`machines.${genId}.kv`), { digits: 0, basis: 'LL' })), ' · two-pole');
  const intro = span('The turbine turns the rotor; the field current in the rotor sets the internal voltage ', rich('$E_f$'), '. Its angle ahead of the terminal voltage, the load angle ', rich('$δ$'), ', rises with real power; its size, with the field current, sets the reactive power. Raise the excitation and watch the operating point move along the chart.');
  if (s.outcome === 'none') return noSolution(name, kind);
  const on = s.genOnline[g.index] === 1 && s.energized[g.bus.index] === 1;
  if (!on) return { name, kind, intro, sections: [{ title: span('Not running'), text: span('The unit is offline in this interval.'), rows: [] }] };
  const V = s.vm[g.bus.index]!;
  const th = s.va[g.bus.index]!;
  const p = phasors(rec, V, th, s.pg[g.index]!, s.qg[g.index]!);
  const gsu = grid.branches.find((b) => b.id === `${genId} GSU`)!;
  const cap = capability(rec, V, xeOf(rec, gsu.xfmr!.mva, gsu.xfmr!.xPct));
  const m = margins(p, cap);
  const key = `t${t}.machine.${genId}`;
  const S = (k: string) => derived(`${key}.${k}`, solver(`t${t}.gen.${genId}.pg`), solver(`t${t}.gen.${genId}.qg`), solver(`t${t}.bus.${g.bus.id}.vm`));
  const pu = (v: number, k: string, digits = 4) => el(qty(v, 'pu', S(k), { digits }));
  const wrap = (n: Node) => {
    const d = document.createElement('div');
    d.className = 'chart';
    d.appendChild(n);
    return d;
  };
  const sections: Section[] = [
    {
      title: span('At its terminals'),
      rows: [
        { label: span('$|V_t|$, terminal voltage'), value: span(el(qty(V, 'pu', solver(`t${t}.bus.${g.bus.id}.vm`), { digits: 4 })), ' · ', el(qty(V * rec.kv, 'kV', S('vkv'), { digits: 2, basis: 'LL' }))) },
        { label: span('$P$, real power out'), value: el(qty(s.pg[g.index]!, 'MW', solver(`t${t}.gen.${genId}.pg`), { digits: 1, phases: '3φ' })) },
        { label: span('$Q$, reactive power out'), value: el(qty(s.qg[g.index]!, 'MVAr', solver(`t${t}.gen.${genId}.qg`), { digits: 1, phases: '3φ' })), note: span(p.Q >= 0 ? 'over-excited: supplying reactive power to the grid' : 'under-excited: absorbing reactive power from the grid') },
        { label: span('$|I_a|$, armature current'), value: span(pu(p.I, 'I'), ' · ', el(qty(p.I * p.iBaseKA, 'kA', S('IkA'), { digits: 2 }))), note: span('per phase, RMS; ', pct(m.armature, S('armatureUse')), ' of its rating') },
        { label: span('$φ$, power-factor angle'), value: el(qty(p.phi * DEG, '°', S('phi'), { digits: 2 })), note: span('power factor ', el(qty(Math.cos(p.phi), '', S('pf'), { digits: 3 })), p.phi >= 0 ? ' lagging' : ' leading') },
      ],
    },
    {
      title: span('Inside: ', rich('$E_f = V_t + (R_a + jX_d) I_a$')),
      text: span('Round-rotor model, per phase, per unit on the machine’s rating (', el(qty(rec.mva, 'MVA', data(`machines.${genId}.mva`), { digits: 0 })), ', ', el(qty(rec.kv, 'kV', data(`machines.${genId}.kv`), { digits: 0, basis: 'LL' })), '). Currents out of the machine positive (generator reference).'),
      rows: [
        { label: span('$|E_f|$, internal voltage'), value: span(pu(p.Ef, 'Ef'), ' · ', el(qty(p.Ef * p.vBaseLN, 'kV', S('EfkV'), { digits: 2, basis: 'LN' }))), note: span('proportional to field current; ', pct(m.field, S('fieldUse')), ' of the field limit') },
        { label: span('$δ$, load angle ($E_f$ ahead of $V_t$)'), value: el(qty(p.delta * DEG, '°', S('delta'), { digits: 2 })) },
        { label: span('Rotor angle against the system reference'), value: el(qty(p.efAngle * DEG, '°', S('rotorAngle'), { digits: 2 })) },
        { label: span('$X_d$, synchronous reactance'), value: el(qty(rec.xd, 'pu', data(`machines.${genId}.xd`), { digits: 2 })) },
        { label: span('$R_a$, armature resistance'), value: el(qty(rec.ra, 'pu', data(`machines.${genId}.ra`), { digits: 3 })) },
      ],
    },
    { title: span('Phasor diagram'), rows: [], text: wrap(phasorDiagram(p, key)) },
    {
      title: span('[[capability-curve|Capability]] at this terminal voltage'),
      text: wrap(capabilityChart(p, cap, g.qminMVAr, g.qmaxMVAr, key)),
      rows: [
        { label: span('Excitation: voltage set-point'), value: el(qty(vsetNow, 'pu', vsetNow === vsetSched ? data(`network.gen.${genId}.vset`) : { src: 'input', key: `vset.${genId}` }, { digits: 3 })), note: vsetNow === vsetSched ? span('as scheduled') : span('changed from the schedule’s ', el(qty(vsetSched, 'pu', data(`network.gen.${genId}.vset`), { digits: 3 }))) },
        { label: span('Turbine limit'), value: el(qty(rec.turbineMW, 'MW', data(`machines.${genId}.turbineMW`), { digits: 1 })), note: span(pct(m.turbine, S('turbineUse')), ' used') },
      ],
    },
    {
      title: span('[[sequence-networks|Sequence]] reactances'),
      text: span('For faults and unbalance: what the machine looks like to each sequence, and just after a disturbance.'),
      rows: [
        { label: span("$X''_d$, subtransient (first cycles)"), value: el(qty(rec.xdpp, 'pu', data(`machines.${genId}.xdpp`), { digits: 2 })) },
        { label: span("$X'_d$, transient (first second)"), value: el(qty(rec.xdp, 'pu', data(`machines.${genId}.xdp`), { digits: 2 })) },
        { label: span('$X_2$, negative sequence'), value: el(qty(rec.x2, 'pu', data(`machines.${genId}.x2`), { digits: 2 })) },
        { label: span('$X_0$, zero sequence'), value: el(qty(rec.x0, 'pu', data(`machines.${genId}.x0`), { digits: 2 })), note: span('the neutral is high-resistance grounded, so almost no zero-sequence current flows') },
        { label: span('$H$, inertia constant'), value: el(qty(g.tech.H_s, 's', data(`tech.${g.tech.id}.H_s`), { digits: 1 })), note: span('stored kinetic energy at synchronous speed over rating') },
      ],
    },
  ];
  return { name, kind, intro, sections };
}

// ---------------------------------------------------------------- frequency

/** f(t) after the trip, with the nadir marked and the settling frequency. */
function frequencyChart(r: TripResponse, key: string): SVGSVGElement {
  const W = 340;
  const H = 150;
  const L = 44;
  const B = 22;
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-label': 'Frequency after the trip' }) as SVGSVGElement;
  const f0 = r.params.f0;
  const lo = Math.min(r.nadirHz, ...Array.from(r.f)) - 0.01;
  const span_ = Math.max(0.05, f0 - lo);
  const fmin = f0 - Math.ceil((span_ / 0.05) * 1.1) * 0.05;
  const fmax = f0 + 0.01;
  const X = (t: number) => L + (t / r.params.tEnd) * (W - L - 8);
  const Y = (f: number) => 6 + ((fmax - f) / (fmax - fmin)) * (H - B - 10);
  for (let f = fmin; f <= f0 + 1e-9; f += 0.05) {
    svgEl('line', { x1: L, y1: Y(f), x2: W - 8, y2: Y(f), stroke: Math.abs(f - f0) < 1e-9 ? 'var(--ink-35)' : 'var(--ink-15)', 'stroke-width': 1 }, s);
    svgText(s, L - 4, Y(f) + 3, `${f.toFixed(2)}`, `derived:${key}.axis`, { anchor: 'end', size: 8.5 });
  }
  svgText(s, L - 4, 10, 'Hz', 'notation:formula', { anchor: 'end', size: 8.5 });
  for (let t = 0; t <= r.params.tEnd; t += 10) svgText(s, X(t), H - 8, `${t}`, `data:sfr.tEnd`, { anchor: 'middle', size: 8.5 });
  svgText(s, W - 8, H - 8, 's', 'notation:formula', { anchor: 'end', size: 8.5 });
  // settled frequency
  svgEl('line', { x1: L, y1: Y(r.settledHz), x2: W - 8, y2: Y(r.settledHz), stroke: 'var(--ink-60)', 'stroke-width': 1, 'stroke-dasharray': '5 3' }, s);
  const pts = Array.from(r.t, (t, i) => `${X(t).toFixed(1)},${Y(r.f[i]!).toFixed(1)}`).join(' ');
  svgEl('polyline', { points: pts, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, s);
  // the nadir
  const nx = X(r.nadirT);
  const ny = Y(r.nadirHz);
  svgEl('line', { x1: nx, y1: ny, x2: nx, y2: ny + 12, stroke: 'var(--ink)', 'stroke-width': 1 }, s);
  svgText(s, nx + 4, ny + 14, `nadir ${r.nadirHz.toFixed(3)} Hz`, `solver:${key}.nadir`, { size: 9 });
  return s;
}

export function frequencySections(r: TripResponse, t: number): Section[] {
  const key = `t${t}.trip.${r.plantId}`;
  const q = (k: string) => solver(`${key}.${k}`);
  const k = r.t.length - 1;
  const wrap = (n: Node) => {
    const d = document.createElement('div');
    d.className = 'chart';
    d.appendChild(n);
    return d;
  };
  const groups = r.groups.map((g, i) => ({ g, mw: r.dPm[i]![k]! })).filter((x) => Math.abs(x.mw) > 0.05);
  return [
    {
      title: span('The trip: frequency, second by second'),
      text: span(
        'Losing ',
        el(qty(r.lossMW, 'MW', q('loss'), { digits: 1 })),
        ' at once, every spinning machine in the West slows together, giving up stored energy; governors open valves and gates as frequency falls, and load draws a little less. A separate time-domain model (fixed-step fourth-order Runge–Kutta, step ',
        el(qty(r.step * 1000, 'ms', data('sfr.h'), { digits: 0 })),
        '), not the power flow.',
        wrap(frequencyChart(r, key)),
      ),
      rows: [
        { label: span('$df/dt$ at the first instant'), value: el(qty(r.rocof, 'Hz/s', q('rocof'), { digits: 4 })), note: span('$−ΔP f_0 / 2H_{sys}S_{sys}$: set by inertia alone, before any governor moves') },
        { label: span('Lowest frequency ([[nadir]])'), value: el(qty(r.nadirHz, 'Hz', q('nadir'), { digits: 3 })), note: span('at ', el(qty(r.nadirT, 's', q('nadirT'), { digits: 2 })), ' after the trip') },
        { label: span('Where it settles'), value: el(qty(r.settledHz, 'Hz', q('settled'), { digits: 3 })), note: span('governors hold it below ', el(qty(r.params.f0, 'Hz', data('sfr.f0'), { digits: 0 })), ' until automatic generation control brings it back over minutes') },
        { label: span('Stored kinetic energy after the trip'), value: el(qty(r.kineticMWs / 1000, 'GW·s', q('kinetic'), { digits: 1 })) },
      ],
    },
    {
      title: span('Who picked up, after ', el(qty(r.params.tEnd, 's', data('sfr.tEnd'), { digits: 0 }))),
      rows: [
        ...groups.map((x) => ({ label: span(GROUPS[x.g] ?? x.g), value: el(qty(x.mw, 'MW', q(`pickup.${x.g}`), { digits: 1 })) })),
        { label: span('Load, drawing less at lower frequency'), value: el(qty(r.dLoad[k]!, 'MW', q('loadRelief'), { digits: 1 })), note: span('[[load-damping|load damping]] ', rich('$D$'), ' = ', el(qty(r.params.D, '%/%', data('sfr.D'), { digits: 1 }))) },
        { label: span('Units at their limit'), value: el(qty(r.atLimit, '', q('atLimit'), { digits: 0 })), note: span('already at full output: nothing more to give') },
      ],
    },
  ];
}
