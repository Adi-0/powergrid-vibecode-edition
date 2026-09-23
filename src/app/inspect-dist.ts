import type { Grid } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import type { FeederSnap } from '../model/feederSnapshot';
import { COUPLING_BUS } from '../model/coupling';
import { EVERGREEN } from '../data/dist/evergreen';
import { nodeIndex, type Feeder } from '../model/feeder';
import { data, dataText, derived, el, qty, solver, type Prov } from '../ui/quantity';
import type { Section } from '../ui/inspector';
import { rich } from '../ui/glossary';

/**
 * What the inspector says below the transmission system: the Evergreen substation,
 * feeder 1105 and its services. Quantities are in the units the equipment is rated in
 * (MW and kV at the substation, kW and volts on a 120 V base on the feeder), every one
 * from the coupled solve with its key.
 */

export interface View {
  name: string | Node;
  kind: Node;
  intro?: Node;
  sections: Section[];
}

function span(...parts: Array<Node | string>): HTMLSpanElement {
  const s = document.createElement('span');
  for (const p of parts) s.append(typeof p === 'string' ? rich(p) : p);
  return s;
}

const VLN12 = 12470 / Math.sqrt(3);

/** Voltages and names quoted in prose, each with its source. */
const kv60 = () => el(qty(60, 'kV', data('network.bus.EVERGREEN-60.baseKV'), { digits: 0 }));
const kv12 = () => el(qty(EVERGREEN.bank.kvLowLL, 'kV', data('evergreen.bank.kvLowLL'), { digits: 2 }));
const v120 = () => el(qty(120, 'V', data('ansi.C84.1.base120'), { digits: 0 }));
const fdr = (id: string) => dataText(id, data(`evergreen.feeder.${id}`));
const leg = (n: 1 | 2) => dataText(String(n), data('notation.serviceLeg'));
const v240 = () => el(qty(240, 'V', data('ansi.C84.1.base240'), { digits: 0 }));

/** Magnitude of phase p at node index i, volts. */
export function vmag(f: FeederSnap, i: number, p: number): number {
  return Math.hypot(f.V[i * 6 + 2 * p]!, f.V[i * 6 + 2 * p + 1]!);
}

function noDetail(name: string | Node, kind: Node): View {
  return { name, kind, sections: [{ title: span('Solving'), text: span('The substation and feeder are being solved with the transmission system for this interval.'), rows: [] }] };
}

function noSolution(name: string | Node, kind: Node): View {
  return { name, kind, sections: [{ title: span('No operating point'), text: span('There is no solved state for this interval, so no flows or voltages here to report.'), rows: [] }] };
}

/** The substation with nothing selected: where its power comes from and goes. */
export function substationView(grid: Grid, s: Snapshot): View {
  const name = 'Evergreen substation';
  const kind = span('[[substation|Substation]] · ', el(qty(60, 'kV', data('network.bus.EVERGREEN-60.baseKV'), { digits: 0 })), ' / ', el(qty(EVERGREEN.bank.kvLowLL, 'kV', data('evergreen.bank.kvLowLL'), { digits: 2 })));
  const f = s.feeder;
  if (s.outcome === 'none') return noSolution(name, kind);
  if (!f) return noDetail(name, kind);
  const t = s.t;
  const bus = grid.bus(COUPLING_BUS).index;
  const lines = grid.branches.map((b, k) => ({ b, k })).filter(({ b }) => b.kind === 'line' && (b.from.id === COUPLING_BUS || b.to.id === COUPLING_BUS));
  const arriving = lines.reduce((a, { b, k }) => a + (s.inService[k] ? (b.to.id === COUPLING_BUS ? -s.pt[k]! : -s.pf[k]!) : 0), 0);
  const bankIn = f.boundaryP / 1e6;
  const onward = s.pd[bus]! - bankIn;
  let other = 0;
  f.loadIds.forEach((id, i) => {
    if (id.startsWith('OTHER:')) other += f.loadP[i]!;
  });
  const head = f.headP / 1e6;
  const otherMW = other / 1e6;
  const bankLoss = bankIn - head - otherMW;
  const arrQ = solver(`t${t}.evergreen.arriving`);
  const onQ = solver(`t${t}.evergreen.onward`);
  const bankQ = solver(`t${t}.evergreen.boundaryP`);
  const headQ = solver(`t${t}.evergreen.f1105.headP`);
  const othQ = solver(`t${t}.evergreen.otherFeeders`);
  return {
    name,
    kind,
    intro: span('Where the ', kv60(), ' [[subtransmission]] from Metcalf is stepped down to ', kv12(), ' for the streets of east San José.'),
    sections: [
      {
        title: span(kv60(), ' side'),
        text: span('Three circuits from Metcalf arrive; part of their power goes on at the same voltage to the other substations fed from here (the transmission model carries them as one load on this bus), and the rest enters the bank.'),
        rows: [
          { label: span('Arriving from Metcalf'), value: el(qty(arriving, 'MW', arrQ, { phases: '3φ' })) },
          { label: span('Going on at ', kv60()), value: el(qty(onward, 'MW', onQ, { phases: '3φ' })) },
          { label: span('Into the bank'), value: el(qty(bankIn, 'MW', bankQ, { phases: '3φ' })) },
        ],
      },
      {
        title: span(kv12(), ' side'),
        text: span('Power is conserved through the bank: what enters at ', kv60(), ' leaves on the four feeders, less what the bank turns into heat.'),
        rows: [
          { label: span('Feeder ', fdr('1105'), ' (drawn pole by pole)'), value: el(qty(head, 'MW', headQ, { phases: '3φ', digits: 3 })) },
          { label: span('Feeders ', fdr('1102'), '–', fdr('1104'), ' (lumped)'), value: el(qty(otherMW, 'MW', othQ, { phases: '3φ', digits: 3 })) },
          {
            label: span('[[losses|Lost]] in the bank, by difference'),
            value: el(qty(bankLoss * 1000, 'kW', derived(`t${t}.evergreen.bankLoss`, bankQ, headQ, othQ), { phases: '3φ', digits: 1 })),
            note: span('into the bank − feeders: ', el(qty(bankIn, 'MW', bankQ, { digits: 3 })), ' − ', el(qty(head, 'MW', headQ, { digits: 3 })), ' − ', el(qty(otherMW, 'MW', othQ, { digits: 3 }))),
          },
        ],
      },
      {
        title: span('Agreement with the transmission solution'),
        text: span(
          'The substation is solved phase by phase and the transmission system in positive sequence; they were iterated until both agreed at the ',
          kv60(),
          ' bus: ',
          el(qty(f.couplingPasses, 'passes', solver(`t${t}.evergreen.couplingPasses`), { digits: 0 })),
          ', last change ',
          el(qty(f.couplingChangeVA, 'VA', solver(`t${t}.evergreen.couplingChange`), { digits: 3 })),
          '.',
        ),
        rows: [],
      },
    ],
  };
}

/** The bank, with its on-load tap changer holding the 12 kV bus. */
export function bankView(s: Snapshot, feeder: Feeder): View {
  const B = EVERGREEN.bank;
  const name = dataText('Bank 1', data('evergreen.bank.name'));
  const kind = span(
    '[[transformer|Transformer]] · ',
    el(qty(B.kva / 1000, 'MVA', data('evergreen.bank.kva'), { digits: 0 })),
    ' · ',
    el(qty(B.kvHighLL, 'kV', data('evergreen.bank.kvHighLL'), { digits: 0 })),
    ' / ',
    el(qty(B.kvLowLL, 'kV', data('evergreen.bank.kvLowLL'), { digits: 2 })),
    ' · ',
    dataText(B.vectorGroup, data('evergreen.bank.vectorGroup')),
  );
  if (s.outcome === 'none') return noSolution(name, kind);
  const f = s.feeder;
  if (!f) return noDetail(name, kind);
  const t = s.t;
  const L = EVERGREEN.ltc;
  const ratio = 1 + (L.stepPct / 100) * f.ltcStep;
  const i12 = nodeIndex(feeder).get('EV-12')!;
  const v12 = [0, 1, 2].map((p) => vmag(f, i12, p));
  const avg120 = ((v12[0]! + v12[1]! + v12[2]!) / 3 / VLN12) * 120;
  return {
    name,
    kind,
    intro: span(
      'Steps ',
      kv60(),
      ' down to ',
      kv12(),
      '. Its [[ltc|tap changer]] moves one step (',
      el(qty(EVERGREEN.ltc.stepPct, '%', data('evergreen.ltc.stepPct'), { digits: 3 })),
      ') at a time, under load, to hold the low-voltage bus near its set point as the day’s demand and the high-side voltage change.',
    ),
    sections: [
      {
        title: span('Tap changer'),
        rows: [
          {
            label: span('Position'),
            value: el(qty(f.ltcStep, 'steps', solver(`t${t}.evergreen.ltc`), { digits: 0 })),
            note: span('ratio ', el(qty(ratio, '', derived(`t${t}.evergreen.ltcRatio`, solver(`t${t}.evergreen.ltc`), data('evergreen.ltc.stepPct')), { digits: 5 })), ' of nominal'),
          },
          {
            label: span(kv12(), ' bus, average of the phases'),
            value: el(qty(avg120, 'V', derived(`t${t}.evergreen.v12on120`, solver(`t${t}.feeder.V.EV-12`)), { digits: 2 })),
            note: span('on a ', v120(), ' base; set point ', el(qty(L.vset, 'V', data('evergreen.ltc.vset'), { digits: 0 })), ', band ± ', el(qty(L.band / 2, 'V', data('evergreen.ltc.band'), { digits: 0 }))),
          },
        ],
      },
      {
        title: span('Through the bank'),
        rows: [
          { label: span('In at ', kv60()), value: el(qty(f.boundaryP / 1e6, 'MW', solver(`t${t}.evergreen.boundaryP`), { phases: '3φ', digits: 3 })), note: span(el(qty(f.boundaryQ / 1e6, 'MVAr', solver(`t${t}.evergreen.boundaryQ`), { phases: '3φ', digits: 3 }))) },
          {
            label: span('Loading'),
            value: el(qty((100 * Math.hypot(f.boundaryP, f.boundaryQ)) / (B.kva * 1000), '%', derived(`t${t}.evergreen.bankLoading`, solver(`t${t}.evergreen.boundaryP`), data('evergreen.bank.kva')), { digits: 1 })),
          },
        ],
      },
      {
        title: span('Nameplate'),
        rows: [
          { label: span('[[impedance|Impedance]] $Z$'), value: span(el(qty(B.zpu.re * 100, '%', data('evergreen.bank.zpu.re'), { digits: 1 })), ' + j', el(qty(B.zpu.im * 100, '%', data('evergreen.bank.zpu.im'), { digits: 1 }))), note: span('on its own rating') },
        ],
      },
    ],
  };
}

/** A bus: voltage per phase (the 12 kV bus) or as the transmission solution has it (60 kV). */
export function busView(grid: Grid, s: Snapshot, which: 'bus60' | 'bus12', feeder: Feeder): View {
  const t = s.t;
  if (which === 'bus60') {
    const b = grid.bus(COUPLING_BUS);
    const vm = s.vm[b.index]!;
    const kind = span('[[bus|Bus]] · ', el(qty(60, 'kV', data('network.bus.EVERGREEN-60.baseKV'), { digits: 0 })));
    const name = span(kv60(), ' bus');
    if (s.outcome === 'none') return noSolution(name, kind);
    const pv = solver(`t${t}.bus.${b.id}.vm`);
    return {
      name,
      kind,
      intro: span('The boundary between the two models: the transmission solution (balanced, positive sequence) sets this voltage; the substation below it is solved phase by phase.'),
      sections: [
        {
          title: span('Voltage'),
          rows: [
            {
              label: span('Magnitude'),
              value: span(el(qty(vm, 'pu', pv, { symbol: '|V|' }), { symbol: true }), ' = ', el(qty(vm * 60, 'kV', derived(`t${t}.bus.${b.id}.vkv`, pv, data('network.bus.EVERGREEN-60.baseKV')), { basis: 'LL', digits: 2 }))),
            },
            { label: span('[[angle|Angle]]'), value: el(qty((s.va[b.index]! * 180) / Math.PI, '°', solver(`t${t}.bus.${b.id}.va`))) },
          ],
        },
      ],
    };
  }
  const f = s.feeder;
  const kind = span('[[bus|Bus]] · ', el(qty(12.47, 'kV', data('evergreen.bank.kvLowLL'), { digits: 2 })), ' · switchgear');
  const name = span(kv12(), ' bus');
  if (s.outcome === 'none') return noSolution(name, kind);
  if (!f) return noDetail(name, kind);
  return {
    name,
    kind,
    intro: span('Four feeder breakers take power from here to the streets. Its voltage is what the tap changer watches.'),
    sections: [
      {
        title: span('Voltage, each phase to neutral'),
        rows: [0, 1, 2].map((p) => {
          const v = vmag(f, nodeIndex(feeder).get('EV-12')!, p);
          const q = solver(`t${t}.feeder.V.EV-12.${'abc'[p]}`);
          return {
            label: span('Phase ', dataText('abc'[p]!, data('notation.phase'))),
            value: el(qty(v / 1000, 'kV', q, { basis: 'LN', digits: 3 })),
            note: span('= ', el(qty((v / VLN12) * 120, 'V', derived(`t${t}.feeder.V.EV-12.${'abc'[p]}.on120`, q), { digits: 2 })), ' on a ', v120(), ' base'),
          };
        }),
      },
    ],
  };
}

/** Feeder 1105 at its breaker. */
export function feederBreakerView(s: Snapshot, feeder: Feeder): View {
  const t = s.t;
  const kind = span('[[feeder|Feeder]] breaker · ', el(qty(12.47, 'kV', data('evergreen.bank.kvLowLL'), { digits: 2 })));
  const name = span('Feeder ', fdr('1105'));
  if (s.outcome === 'none') return noSolution(name, kind);
  const f = s.feeder;
  if (!f) return noDetail(name, kind);
  const homes = feeder.layout.homes.length;
  const hq = solver(`t${t}.evergreen.f1105.headP`);
  return {
    name,
    kind,
    intro: span(
      'One of four feeders out of Evergreen, drawn pole by pole: a three-phase trunk along the arterial, single-phase laterals down the side streets, ',
      el(qty(feeder.layout.transformers.length, 'pole-top transformers', data('evergreen.layout.transformers'), { digits: 0 })),
      ' and ',
      el(qty(homes, 'homes', data('evergreen.layout.homes'), { digits: 0 })),
      '.',
    ),
    sections: [
      {
        title: span('At the breaker'),
        rows: [
          { label: span('[[real-power|Real power]]'), value: el(qty(f.headP / 1000, 'kW', hq, { symbol: 'P', phases: '3φ', digits: 1 }), { symbol: true }) },
          { label: span('[[reactive-power|Reactive power]]'), value: el(qty(f.headQ / 1000, 'kvar', solver(`t${t}.evergreen.f1105.headQ`), { symbol: 'Q', phases: '3φ', digits: 1 }), { symbol: true }) },
        ],
      },
    ],
  };
}

export type { Prov };

// ---------------------------------------------------------------- the feeder

const SVGNS = 'http://www.w3.org/2000/svg';

/** Branch index by id in the feeder model (the order snapshots use). */
const branchIdx = new WeakMap<Feeder, Map<string, number>>();
function bidx(f: Feeder): Map<string, number> {
  let m = branchIdx.get(f);
  if (!m) {
    m = new Map(f.base.branches.map((b, k) => [b.id, k]));
    branchIdx.set(f, m);
  }
  return m;
}

/** Everything between CB-1105 and the meters: kind of element → W lost. */
function feederLosses(fd: Feeder, f: FeederSnap): Record<'primary' | 'transformers' | 'secondary' | 'grocery' | 'wiring', number> {
  const out = { primary: 0, transformers: 0, secondary: 0, grocery: 0, wiring: 0 };
  fd.base.branches.forEach((b, k) => {
    if (b.id === 'EV-BANK' || b.id === 'CB-1105') return;
    const loss = f.flows[k * 4]! - f.flows[k * 4 + 2]!;
    if (b.kind === 'centertap') out.transformers += loss;
    else if (b.id === 'XF-C1') out.grocery += loss;
    else if (b.id.endsWith('-CIRCUIT')) out.wiring += loss;
    else if (fd.base.nodes.get(b.to)?.kind === 'secondary') out.secondary += loss;
    else out.primary += loss;
  });
  return out;
}

/** The chain of nodes from the 12 kV bus down to a node. */
export function pathTo(fd: Feeder, node: string): string[] {
  const parent = new Map(fd.base.branches.map((b) => [b.to, b.from]));
  const path = [node];
  for (let n = node; parent.has(n) && n !== 'EV-12'; ) {
    n = parent.get(n)!;
    path.unshift(n);
  }
  return path;
}

/** Voltage on a 120 V base at a node: the path's phase on the primary, leg 1 on the secondary. */
export function v120At(fd: Feeder, f: FeederSnap, node: string, phase: number): number {
  const i = nodeIndex(fd).get(node)!;
  const n = fd.base.nodes.get(node)!;
  if (n.kind === 'secondary') return vmag(f, i, 0);
  return (vmag(f, i, phase) / n.vbaseLN) * 120;
}

/** A small line chart: voltage along the way to the outlet against the ANSI band. */
function profileChart(pts: Array<{ km: number; v: number }>, key: string): SVGSVGElement {
  const W = 340;
  const H = 120;
  const L = 34;
  const B = 18;
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('width', String(W));
  s.setAttribute('height', String(H));
  s.setAttribute('viewBox', `0 0 ${W} ${H}`);
  s.setAttribute('aria-label', 'Voltage along the path from the substation to the outlet');
  const v0 = 112;
  const v1 = 128;
  const x1 = Math.max(...pts.map((p) => p.km)) * 1.02 || 1;
  const X = (km: number) => L + (km / x1) * (W - L - 6);
  const Y = (v: number) => 4 + ((v1 - v) / (v1 - v0)) * (H - B - 8);
  const line = (a: [number, number], b: [number, number], attrs: Record<string, string>) => {
    const e = document.createElementNS(SVGNS, 'line');
    e.setAttribute('x1', String(a[0]));
    e.setAttribute('y1', String(a[1]));
    e.setAttribute('x2', String(b[0]));
    e.setAttribute('y2', String(b[1]));
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    s.appendChild(e);
  };
  const text = (x: number, y: number, t: string, prov: string, anchor = 'end') => {
    const e = document.createElementNS(SVGNS, 'text');
    e.setAttribute('x', String(x));
    e.setAttribute('y', String(y));
    e.setAttribute('font-size', '9.5');
    e.setAttribute('text-anchor', anchor);
    e.setAttribute('fill', 'var(--ink-60)');
    e.setAttribute('data-prov', prov);
    e.textContent = t;
    s.appendChild(e);
  };
  // ANSI C84.1 Range A: the band a service voltage should stay in
  for (const v of [114, 126]) {
    line([L, Y(v)], [W - 6, Y(v)], { stroke: 'var(--ink-35)', 'stroke-dasharray': '5 3', 'stroke-width': '1' });
    text(L - 4, Y(v) + 3, `${v} V`, `data:ansi.C84.1.rangeA.${v === 114 ? 'low' : 'high'}`);
  }
  line([L, Y(120)], [W - 6, Y(120)], { stroke: 'var(--ink-15)', 'stroke-width': '1' });
  text(L - 4, Y(120) + 3, '120 V', 'data:ansi.C84.1.base120');
  line([L, H - B], [W - 6, H - B], { stroke: 'var(--ink)', 'stroke-width': '1' });
  text(L, H - 4, '0', `derived:${key}.axis`, 'start');
  text(W - 6, H - 4, `${x1.toFixed(1)} km`, `derived:${key}.axis`);
  const poly = document.createElementNS(SVGNS, 'polyline');
  poly.setAttribute('points', pts.map((p) => `${X(p.km).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' '));
  poly.setAttribute('fill', 'none');
  poly.setAttribute('stroke', 'var(--ink)');
  poly.setAttribute('stroke-width', '1.6');
  poly.setAttribute('stroke-linejoin', 'round');
  s.appendChild(poly);
  for (const p of pts) {
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', X(p.km).toFixed(1));
    c.setAttribute('cy', Y(p.v).toFixed(1));
    c.setAttribute('r', '1.8');
    c.setAttribute('fill', 'var(--ink)');
    s.appendChild(c);
  }
  return s;
}

/** The feeder with nothing selected: its balance, and the voltage on the way to the outlet. */
export function feederView(s: Snapshot, fd: Feeder): View {
  const t = s.t;
  const name = span('Feeder ', fdr('1105'));
  const kind = span('[[feeder|Feeder]] · ', kv12(), ' · out of Evergreen');
  if (s.outcome === 'none') return noSolution(name, kind);
  const f = s.feeder;
  if (!f) return noDetail(name, kind);
  let homes = 0;
  let pv = 0;
  let grocery = 0;
  f.loadIds.forEach((id, i) => {
    const p = f.loadP[i]!;
    if (id.startsWith('OTHER:')) return;
    if (id.startsWith('GROCERY:')) grocery += p;
    else {
      homes += p;
      if (id.endsWith(':PV')) pv += p;
    }
  });
  const loss = feederLosses(fd, f);
  const lossTotal = loss.primary + loss.transformers + loss.secondary + loss.grocery + loss.wiring;
  const headQ = solver(`t${t}.evergreen.f1105.headP`);
  const homesQ = solver(`t${t}.feeder.meters.homes`);
  const grocQ = solver(`t${t}.feeder.meters.grocery`);
  const lossQ = solver(`t${t}.feeder.losses`);
  const kw = (w: number, q: Prov, d = 1) => el(qty(w / 1000, 'kW', q, { digits: d }));
  // the path to the outlet, and its voltage profile
  const path = pathTo(fd, fd.layout.outlet.node);
  const lat = fd.layout.laterals.find((l) => l.nodes.includes(path.find((n) => /^L\d+-/.test(n)) ?? ''));
  const phase = lat?.phase ?? 0;
  let km = 0;
  const pts = path.map((n, i) => {
    if (i) {
      const a = fd.layout.pos.get(path[i - 1]!)!;
      const b = fd.layout.pos.get(n)!;
      km += Math.hypot(b.x - a.x, b.z - a.z) / 1000;
    }
    return { km, v: v120At(fd, f, n, phase) };
  });
  const chart = profileChart(pts, `t${t}.feeder.profile`);
  const viaReg = path.includes('F4R');
  const cap = span(
    'At the substation the tap changer holds the bus near its set point; down the trunk and the lateral the voltage falls with the current',
    viaReg ? ', the [[regulator|regulator]] lifts it back' : '',
    ', and the pole-top transformer, the drop and the home’s own wiring take the last few volts. The dashed lines are [[c84|ANSI C84.1]] Range A.',
  );
  const box = document.createElement('div');
  chart.style.display = 'block';
  chart.style.margin = '4px 0 6px';
  box.append(chart, cap);
  return {
    name,
    kind,
    intro: span('Everything that enters at the breaker leaves through a meter or as heat on the way.'),
    sections: [
      {
        title: span('Balance this interval'),
        rows: [
          { label: span('Into the feeder at breaker CB-', fdr('1105')), value: kw(f.headP, headQ) },
          { label: span('Through the homes’ meters'), value: kw(homes, homesQ), note: span('net of ', el(qty(-pv / 1000, 'kW', solver(`t${t}.feeder.meters.pv`), { digits: 1 })), ' of [[btm-solar|rooftop solar]]') },
          { label: span('Through the grocery’s meter'), value: kw(grocery, grocQ) },
          {
            label: span('[[losses|Lost]] on the way'),
            value: kw(lossTotal, lossQ, 2),
            note: span(
              'lines ',
              kw(loss.primary, solver(`t${t}.feeder.losses.primary`), 2),
              ' · pole-top transformers ',
              kw(loss.transformers, solver(`t${t}.feeder.losses.transformers`), 2),
              ' · secondaries and drops ',
              kw(loss.secondary, solver(`t${t}.feeder.losses.secondary`), 2),
              ' · grocery transformer ',
              kw(loss.grocery, solver(`t${t}.feeder.losses.grocery`), 2),
              ' · house wiring ',
              kw(loss.wiring, solver(`t${t}.feeder.losses.wiring`), 3),
            ),
          },
          {
            label: span('Meters + losses − head'),
            value: el(qty(homes + grocery + lossTotal - f.headP, 'W', derived(`t${t}.feeder.balanceResidual`, homesQ, grocQ, lossQ, headQ), { digits: 3 })),
            note: span('what does not close: power is conserved to the solver’s tolerance'),
          },
        ],
      },
      { title: span('Voltage on the way to the outlet (', v120mark(), ' base)'), text: box, rows: [] },
    ],
  };
}

const v120mark = () => el(qty(120, 'V', data('ansi.C84.1.base120'), { digits: 0 }));

/** A primary line, fuse, recloser or regulator on the feeder. */
export function feederElementView(s: Snapshot, fd: Feeder, id: string, what: 'line' | 'device'): View {
  const t = s.t;
  const k = bidx(fd).get(id);
  const br = k !== undefined ? fd.base.branches[k]! : null;
  const name = dataText(id === 'CAP-1' ? 'Capacitor bank' : br?.kind === 'regulator' ? 'Regulator' : id === 'RCL-1' ? 'Recloser' : id.startsWith('FU-') ? `Fuse ${id.slice(3)}` : `Line ${id}`, data(`evergreen.element.${id}`));
  const kind = span(
    id === 'CAP-1' ? '[[capacitor-bank|Capacitor]] bank · three-phase' : br?.kind === 'regulator' ? '[[regulator|Voltage regulator]] · three single-phase units' : id.startsWith('FU-') ? '[[fuse|Fuse]] · protects a lateral' : id === 'RCL-1' ? '[[recloser|Recloser]]' : 'Overhead line',
  );
  if (s.outcome === 'none') return noSolution(name, kind);
  const f = s.feeder;
  if (!f) return noDetail(name, kind);
  if (id === 'CAP-1') {
    return {
      name,
      kind,
      intro: span('Supplies reactive power close to where the motors and air conditioners draw it, so less of it has to come down the feeder — which lowers the current and lifts the voltage.'),
      sections: [
        {
          title: span('Now'),
          rows: [
            { label: span('Reactive power supplied'), value: el(qty(f.capQ / 1000, 'kvar', solver(`t${t}.feeder.CAP-1.q`), { digits: 1 })), note: span('rated ', el(qty(EVERGREEN.capacitor.kvarPerPhase * 3, 'kvar', data('evergreen.capacitor.kvarPerPhase'), { digits: 0 })), ' at its rated voltage; it supplies in proportion to the voltage squared') },
          ],
        },
      ],
    };
  }
  if (!br || k === undefined) return { name, kind, sections: [] };
  const pq = solver(`t${t}.feeder.${id}.pf`);
  const rows: Section['rows'] = [
    { label: span('[[real-power|Real power]] entering'), value: el(qty(f.flows[k * 4]! / 1000, 'kW', pq, { digits: 1 })) },
    { label: span('[[reactive-power|Reactive power]] entering'), value: el(qty(f.flows[k * 4 + 1]! / 1000, 'kvar', solver(`t${t}.feeder.${id}.qf`), { digits: 1 })) },
    { label: span('[[losses|Lost]] in it'), value: el(qty((f.flows[k * 4]! - f.flows[k * 4 + 2]!) / 1000, 'kW', derived(`t${t}.feeder.${id}.loss`, pq, solver(`t${t}.feeder.${id}.pt`)), { digits: 3 })) },
  ];
  if (br.kind === 'regulator')
    rows.push({
      label: span('Taps, phases a b c'),
      value: span(...f.regTaps.flatMap((x, i) => [i ? ' ' : '', el(qty(x, '', solver(`t${t}.feeder.REG-1.tap.${i}`), { digits: 0 }))])),
      note: span('each step 0.625 %, up to 16 either way; it holds its set point at a point down the line by line-drop compensation'),
    });
  return { name, kind, sections: [{ title: span('Now'), rows }] };
}

/** A pole-top transformer and the homes it serves. */
export function distTransformerView(s: Snapshot, fd: Feeder, id: string): View {
  const t = s.t;
  const tr = fd.layout.transformers.find((x) => x.id === id)!;
  const name = dataText(`Transformer ${id.slice(2)}`, data(`evergreen.layout.transformers.${id}`));
  const kind = span(
    '[[transformer|Pole-top transformer]] · ',
    el(qty(tr.kva, 'kVA', data(`evergreen.layout.transformers.${id}.kva`), { digits: 0 })),
    ' · single-phase, phase ',
    dataText('abc'[tr.phase]!, data(`evergreen.layout.transformers.${id}.phase`)),
  );
  if (s.outcome === 'none') return noSolution(name, kind);
  const f = s.feeder;
  if (!f) return noDetail(name, kind);
  const k = bidx(fd).get(id)!;
  const p = f.flows[k * 4]!;
  const q = f.flows[k * 4 + 1]!;
  const served = fd.layout.homes.filter((h) => h.transformer === id);
  const vp = v120At(fd, f, tr.primary, tr.phase);
  const vs = v120At(fd, f, tr.secondary, 0);
  const pq = solver(`t${t}.feeder.${id}.pf`);
  return {
    name,
    kind,
    intro: span(
      'Steps the lateral’s ',
      el(qty(7.2, 'kV', data('evergreen.layout.transformers.kvPrimaryLN'), { digits: 1, basis: 'LN' })),
      ' down to a center-tapped secondary: two legs of ',
      v120(),
      ' either side of a grounded neutral, ',
      el(qty(240, 'V', data('ansi.C84.1.base240'), { digits: 0 })),
      ' across both.',
    ),
    sections: [
      {
        title: span('Now'),
        rows: [
          { label: span('In, from the lateral'), value: el(qty(p / 1000, 'kW', pq, { digits: 2 })), note: span(el(qty(q / 1000, 'kvar', solver(`t${t}.feeder.${id}.qf`), { digits: 2 }))) },
          {
            label: span('Loading'),
            value: el(qty((100 * Math.hypot(p, q)) / (tr.kva * 1000), '%', derived(`t${t}.feeder.${id}.loading`, pq, data(`evergreen.layout.transformers.${id}.kva`)), { digits: 0 })),
          },
          { label: span('Primary, on a ', v120mark(), ' base'), value: el(qty(vp, 'V', solver(`t${t}.feeder.V.${tr.primary}`), { digits: 2 })) },
          { label: span('Secondary, leg ', leg(1), ' to neutral'), value: el(qty(vs, 'V', solver(`t${t}.feeder.V.${tr.secondary}`), { digits: 2 })) },
          { label: span('Homes on it'), value: el(qty(served.length, '', data(`evergreen.layout.transformers.${id}.homes`), { digits: 0 })) },
        ],
      },
    ],
  };
}

/** A home: its meter and its service voltage. */
export function homeView(s: Snapshot, fd: Feeder, id: string): View {
  const t = s.t;
  const h = fd.layout.homes.find((x) => x.id === id)!;
  const name = span('A home on ', dataText(h.transformer.slice(2), data(`evergreen.layout.homes.${id}.transformer`)));
  const kind = span('Customer · ', v120mark(), '/', el(qty(240, 'V', data('ansi.C84.1.base240'), { digits: 0 })), ' service', h.pvKW > 0 ? span(' · ', el(qty(h.pvKW, 'kW', data(`evergreen.layout.homes.${id}.pvKW`), { digits: 0 })), ' of rooftop solar') : '');
  if (s.outcome === 'none') return noSolution(name, kind);
  const f = s.feeder;
  if (!f) return noDetail(name, kind);
  const parts: Record<string, number> = {};
  f.loadIds.forEach((lid, i) => {
    if (lid.startsWith(`${id}:`)) parts[lid.slice(id.length + 1)] = f.loadP[i]!;
    if (lid === 'OUTLET:appliance' && fd.layout.outlet.home === id) parts['OUTLET'] = f.loadP[i]!;
  });
  const meter = Object.values(parts).reduce((a, b) => a + b, 0);
  const i = nodeIndex(fd).get(id)!;
  const v1 = vmag(f, i, 0);
  const v2 = vmag(f, i, 1);
  const v12 = Math.hypot(f.V[i * 6]! - f.V[i * 6 + 2]!, f.V[i * 6 + 1]! - f.V[i * 6 + 3]!);
  const w = (x: number, key: string) => el(qty(x / 1000, 'kW', solver(`t${t}.feeder.load.${id}.${key}`), { digits: 2 }));
  const rows: Section['rows'] = [
    { label: span('Through the meter'), value: el(qty(meter / 1000, 'kW', solver(`t${t}.feeder.meter.${id}`), { digits: 2 })) },
  ];
  if (parts['L1'] !== undefined) rows.push({ label: span(v120(), ' circuits, leg ', leg(1)), value: w(parts['L1']!, 'L1') });
  if (parts['L2'] !== undefined) rows.push({ label: span(v120(), ' circuits, leg ', leg(2)), value: w(parts['L2']!, 'L2') });
  if (parts['AC'] !== undefined) rows.push({ label: span('Air conditioner, ', v240()), value: w(parts['AC']!, 'AC') });
  if (parts['PV'] !== undefined) rows.push({ label: span('[[btm-solar|Rooftop solar]]'), value: w(parts['PV']!, 'PV') });
  if (parts['OUTLET'] !== undefined) rows.push({ label: span('The hair dryer at the outlet'), value: w(parts['OUTLET']!, 'outlet') });
  return {
    name,
    kind,
    sections: [
      { title: span('The meter now'), rows },
      {
        title: span('Service voltage'),
        rows: [
          { label: span('Leg ', leg(1), ' to neutral'), value: el(qty(v1, 'V', solver(`t${t}.feeder.V.${id}.1`), { digits: 2 })) },
          { label: span('Leg ', leg(2), ' to neutral'), value: el(qty(v2, 'V', solver(`t${t}.feeder.V.${id}.2`), { digits: 2 })) },
          { label: span('Leg to leg'), value: el(qty(v12, 'V', solver(`t${t}.feeder.V.${id}.12`), { digits: 2 })) },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------- the service and the outlet

/**
 * The chain from the transmission system to the wall outlet, every voltage on one
 * 120 V base so the steps can be compared: each transformer's ratio is absorbed by the
 * base, and what remains is the drop each element causes.
 */
export function outletTraceView(grid: Grid, s: Snapshot, fd: Feeder): View {
  const t = s.t;
  const name = span('The wall outlet');
  const kind = span('A ', v120(), ' receptacle on a ', dataText('12 AWG', data('evergreen.WIRING_12AWG.label')), ' copper branch circuit');
  if (s.outcome === 'none') return noSolution(name, kind);
  const f = s.feeder;
  if (!f) return noDetail(name, kind);
  const L = fd.layout;
  const path = pathTo(fd, L.outlet.node);
  const lat = L.laterals.find((l) => l.nodes.some((n) => path.includes(n)))!;
  const ph = lat.phase;
  const tr = L.transformers.find((x) => path.includes(x.secondary))!;
  // transmission side: Metcalf 230 kV, Metcalf 60 kV, Evergreen 60 kV
  const tx = (id: string, kv: number) => {
    const b = grid.bus(id);
    return { v: s.vm[b.index]! * 120, q: solver(`t${t}.bus.${id}.vm`), kv };
  };
  const m230 = tx('METCALF-230', 230);
  const m60 = tx('METCALF-60', 60);
  const e60 = tx(COUPLING_BUS, 60);
  const node = (id: string, p: number) => ({ v: v120At(fd, f, id, p), q: solver(`t${t}.feeder.V.${id}`) });
  const steps: Array<{ where: Node; what: Node; v: number; q: Prov }> = [
    { where: span('Metcalf ', el(qty(230, 'kV', data('network.bus.METCALF-230.baseKV'), { digits: 0 })), ' bus'), what: span('the transmission solution'), ...m230 },
    { where: span('Metcalf ', kv60(), ' bus'), what: span('through Metcalf’s ', el(qty(230, 'kV', data('network.bus.METCALF-230.baseKV'), { digits: 0 })), '/', kv60(), ' banks'), ...m60 },
    { where: span('Evergreen ', kv60(), ' bus'), what: span('along the three ', kv60(), ' circuits from Metcalf'), ...e60 },
    { where: span('Evergreen ', kv12(), ' bus'), what: span('through the bank and its tap changer'), ...node('EV-12', ph) },
    { where: span('Trunk, where lateral ', dataText(lat.id, data(`evergreen.layout.laterals.${lat.id}`)), ' leaves'), what: span('along the three-phase trunk'), ...node(lat.tap, ph) },
    { where: span('Pole ', dataText(tr.id.slice(2), data(`evergreen.layout.transformers.${tr.id}`))), what: span('along the lateral, phase ', dataText('abc'[ph]!, data(`evergreen.layout.laterals.${lat.id}.phase`))), ...node(tr.primary, ph) },
    { where: span('Secondary, leg ', leg(1)), what: span('through the pole-top transformer'), ...node(tr.secondary, 0) },
    { where: span('The meter'), what: span('along the service drop'), ...node(L.outlet.home, 0) },
    { where: span('The outlet'), what: span('along ', el(qty(L.outlet.lengthM, 'm', data('evergreen.layout.outlet.lengthM'), { digits: 0 })), ' of ', dataText('12 AWG', data('evergreen.WIRING_12AWG.label')), ', there and back'), ...node(L.outlet.node, 0) },
  ];
  const vOut = steps[steps.length - 1]!.v;
  const rows: Section['rows'] = steps.map((st, i) => {
    const prev = steps[i - 1];
    return {
      label: st.where,
      value: el(qty(st.v, 'V', st.q, { digits: 2 })),
      note: prev
        ? span(st.what, ': ', el(qty(st.v - prev.v, 'V', derived(`t${t}.trace.step${i}`, st.q, prev.q), { digits: 2 })))
        : span(st.what),
    };
  });
  const i = f.loadIds.indexOf('OUTLET:appliance');
  return {
    name,
    kind,
    intro: span(
      'Where the chain ends: a hair dryer drawing ',
      el(qty(i >= 0 ? f.loadP[i]! : 0, 'W', solver(`t${t}.feeder.load.OUTLET`), { digits: 0 })),
      ' at ',
      el(qty(vOut, 'V', steps[steps.length - 1]!.q, { digits: 1 })),
      '. Every voltage below is on a ',
      v120(),
      ' base, so a transformer’s ratio disappears into the base and what is left is the drop each part of the way causes — traced back to the transmission system.',
    ),
    sections: [
      { title: span('From the transmission system to the outlet'), rows },
      {
        title: span('Is it in range?'),
        text: span(
          vOut >= 114 && vOut <= 126
            ? 'Yes: inside [[c84|ANSI C84.1]] Range A at the meter and at the outlet.'
            : 'No: outside [[c84|ANSI C84.1]] Range A — a utility would act on this.',
        ),
        rows: [],
      },
    ],
  };
}

/** The service with nothing selected: what the transformer takes and where it goes. */
export function serviceView(s: Snapshot, fd: Feeder, transformerId: string): View {
  const t = s.t;
  const tr = fd.layout.transformers.find((x) => x.id === transformerId)!;
  const name = span('Service from pole ', dataText(transformerId.slice(2), data(`evergreen.layout.transformers.${transformerId}`)));
  const kind = span('[[transformer|Pole-top transformer]] and its homes · ', v120(), '/', v240());
  if (s.outcome === 'none') return noSolution(name, kind);
  const f = s.feeder;
  if (!f) return noDetail(name, kind);
  const k = bidx(fd).get(transformerId)!;
  const inP = f.flows[k * 4]!;
  const homes = fd.layout.homes.filter((h) => h.transformer === transformerId);
  let meters = 0;
  f.loadIds.forEach((id, i) => {
    const hid = id.startsWith('OUTLET:') ? fd.layout.outlet.home : id.slice(0, id.lastIndexOf(':'));
    if (homes.some((h) => h.id === hid)) meters += f.loadP[i]!;
  });
  const inQ = solver(`t${t}.feeder.${transformerId}.pf`);
  const mQ = solver(`t${t}.feeder.service.${transformerId}.meters`);
  return {
    name,
    kind,
    intro: span('The last transformer before the customers. Everything it takes from the lateral goes through these meters, less what the can, the secondary and the drops turn into heat.'),
    sections: [
      {
        title: span('Balance this interval'),
        rows: [
          { label: span('In from the lateral, phase ', dataText('abc'[tr.phase]!, data(`evergreen.layout.transformers.${transformerId}.phase`))), value: el(qty(inP / 1000, 'kW', inQ, { digits: 3 })) },
          { label: span('Through ', el(qty(homes.length, 'meters', data(`evergreen.layout.transformers.${transformerId}.homes`), { digits: 0 }))), value: el(qty(meters / 1000, 'kW', mQ, { digits: 3 })) },
          { label: span('[[losses|Lost]] in the can, secondary, drops and wiring'), value: el(qty((inP - meters) / 1000, 'kW', derived(`t${t}.feeder.service.${transformerId}.losses`, inQ, mQ), { digits: 3 })) },
        ],
      },
    ],
  };
}
