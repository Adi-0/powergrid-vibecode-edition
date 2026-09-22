import { CONSTRUCTIONS } from '../data/towers';
import { REGIONS } from '../data/ca/network';
import { RESIDENTIAL_KW, hourly } from '../data/ca/profiles';
import type { Grid } from '../model/grid';
import { S_BASE } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import { data, dataText, derived, el, qty, solver, type Quantity } from '../ui/quantity';
import type { Section } from '../ui/inspector';
import { rich } from '../ui/glossary';

/**
 * What the inspector says about things selected on the System sheet. Every number is
 * a display-layer quantity with its source; every term is a glossary term.
 */

const RAD = 180 / Math.PI;

function span(...parts: Array<Node | string>): HTMLSpanElement {
  const s = document.createElement('span');
  for (const p of parts) s.append(typeof p === 'string' ? rich(p) : p);
  return s;
}

/** "≈ N homes at this hour": scale for a power in MW, from the average home's demand now. */
function roundSig(x: number, sig: number): number {
  if (x === 0) return 0;
  const f = 10 ** (sig - 1 - Math.floor(Math.log10(Math.abs(x))));
  return Math.round(x * f) / f;
}

export function homesScale(mw: number, prov: Quantity['prov'], hour: number): HTMLSpanElement {
  const avg = hourly(RESIDENTIAL_KW, hour);
  // to three figures: the average it divides by is shown to three, so a reader can
  // redo the division from the displayed numbers and land on the displayed answer
  const homes = roundSig((Math.abs(mw) * 1000) / avg, 3);
  return span(
    '≈ ',
    el(qty(homes, 'homes', derived('scale.homes', prov, data('profiles.RESIDENTIAL_KW')), { digits: 0 })),
    ' at this hour (an average home now draws ',
    el(qty(avg, 'kW', data('profiles.RESIDENTIAL_KW'), { digits: 2 })),
    ')',
  );
}

export function siteView(grid: Grid, s: Snapshot, siteId: string): { name: string; kind: Node; intro?: Node; sections: Section[] } {
  const site = grid.sites.find((x) => x.id === siteId)!;
  const t = s.t;
  const buses = grid.buses.filter((b) => b.site.id === siteId && !b.terminalOf);
  const sections: Section[] = [];
  // no operating point, or cut off: there are no voltages or flows to report
  const noSolution = s.outcome === 'none';
  const dark = !noSolution && buses.every((b) => !s.energized[b.index]);
  if (noSolution || dark) {
    const pdDark = buses.reduce((a, b) => a + s.pd[b.index]!, 0);
    sections.push({
      title: span(noSolution ? 'No operating point' : 'No supply'),
      text: noSolution
        ? span('The power flow found no steady state for this interval, so there are no voltages or flows here to report. The notice over the sheet says why.')
        : span(
            'Cut off from every generator: no voltage, no current. The demand this substation serves, ',
            el(qty(pdDark, 'MW', solver(`t${t}.site.${siteId}.pd`), { phases: '3φ' })),
            ', is unserved (a blackout here, not a low voltage).',
          ),
      rows: [],
    });
    return { name: site.name, kind: siteKind(grid, siteId), ...(siteIntro(grid, siteId) ? { intro: siteIntro(grid, siteId)! } : {}), sections };
  }
  // voltages
  sections.push({
    title: span('[[bus|Bus]] voltages'),
    text: span(
      'Magnitude in [[per-unit]] of the bus’s nominal [[line-to-line]] voltage, and [[angle]] relative to the [[reference-bus|reference bus]] (',
      (() => {
        const ref = grid.buses.find((b) => b.id === grid.refBus)!;
        return span(dataText(ref.site.name, data('model.grid.refBus')), ' ', el(qty(ref.kv, 'kV', data(`network.bus.${ref.id}.kv`), { digits: 0 })));
      })(),
      ').',
    ),
    rows: buses.flatMap((b) => {
      const vm = s.vm[b.index]!;
      const va = s.va[b.index]! * RAD;
      const base = qty(b.kv, 'kV', data(`network.bus.${b.id}.baseKV`), { basis: 'LL', digits: b.kv >= 100 ? 0 : 1 });
      const pv = solver(`t${t}.bus.${b.id}.vm`);
      return [
        {
          label: span(el(qty(b.kv, 'kV', data(`network.bus.${b.id}.baseKV`), { digits: b.kv >= 100 ? 0 : 1 })), ' bus'),
          value: span(
            el(qty(vm, 'pu', pv, { symbol: '|V|', base }), { symbol: true }),
            ' = ',
            el(qty(vm * b.kv, 'kV', derived(`t${t}.bus.${b.id}.vkv`, pv, data(`network.bus.${b.id}.baseKV`)), { basis: 'LL', digits: 2 })),
          ),
        },
        {
          label: span(''),
          value: el(qty(va, '°', solver(`t${t}.bus.${b.id}.va`), { symbol: 'θ' }), { symbol: true }),
        },
      ];
    }),
  });
  // generation
  const gens = grid.gens.filter((g) => g.bus.site.id === siteId);
  if (gens.length) {
    const byPlant = new Map<string, typeof gens>();
    for (const g of gens) byPlant.set(g.plant.id, [...(byPlant.get(g.plant.id) ?? []), g]);
    const rows: Section['rows'] = [];
    for (const [pid, gs] of byPlant) {
      const p = gs[0]!.plant;
      const P = gs.reduce((a, g) => a + s.pg[g.index]!, 0);
      const Q = gs.reduce((a, g) => a + s.qg[g.index]!, 0);
      const on = gs.some((g) => s.genOnline[g.index]);
      const cap = gs.reduce((a, g) => a + g.pmaxMW, 0);
      rows.push({
        label: span(dataText(p.name, data(`plants.${pid}.name`)), ' — ', dataText(gs[0]!.tech.label.toLowerCase(), data(`tech.${p.tech}.label`))),
        value: on
          ? span(el(qty(P, 'MW', solver(`t${t}.plant.${pid}.p`), { phases: '3φ' })))
          : span('offline'),
        note: on
          ? span(
              el(qty(Q, 'MVAr', solver(`t${t}.plant.${pid}.q`), { symbol: 'Q', phases: '3φ' }), { symbol: true }),
              ' · rated ',
              el(qty(cap, 'MW', data(`plants.${pid}.mw`), { digits: 0 })),
              p.tech === 'syncon' ? '' : ' · ',
              p.tech === 'syncon' ? '' : homesScale(P, solver(`t${t}.plant.${pid}.p`), s.startHour + 0.125),
            )
          : undefined,
      });
    }
    sections.push({ title: span('Generation here ([[real-power|real power]] $P$, generator reference: output positive)'), rows });
  }
  // demand
  const pd = buses.reduce((a, b) => a + s.pd[b.index]!, 0);
  const qd = buses.reduce((a, b) => a + s.qd[b.index]!, 0);
  const hasLoad = grid.loads.some((l) => l.bus.site.id === siteId);
  if (hasLoad) {
    sections.push({
      title: span('Demand here (load reference: consumption positive)'),
      text: span('What customers served from this substation draw, net of [[btm-solar|rooftop solar]].'),
      rows: [
        {
          label: span('[[real-power|Real power]]'),
          value: el(qty(pd, 'MW', solver(`t${t}.site.${siteId}.pd`), { symbol: 'P', phases: '3φ' }), { symbol: true }),
          note: homesScale(pd, solver(`t${t}.site.${siteId}.pd`), s.startHour + 0.125),
        },
        {
          label: span('[[reactive-power|Reactive power]]'),
          value: el(qty(qd, 'MVAr', solver(`t${t}.site.${siteId}.qd`), { symbol: 'Q', phases: '3φ' }), { symbol: true }),
        },
      ],
    });
  }
  // price
  const lmpBus = buses.find((b) => b.kv >= 200) ?? buses[0]!;
  sections.push({
    title: span('Price'),
    rows: [
      {
        label: span('[[lmp|LMP]] at the ', el(qty(lmpBus.kv, 'kV', data(`network.bus.${lmpBus.id}.baseKV`), { digits: 0 })), ' bus'),
        value: el(qty(s.lmp[lmpBus.index]!, '$/MWh', solver(`t${t}.bus.${lmpBus.id}.lmp`))),
        note: span('The cost of serving one more megawatt here; the [[marginal-unit|marginal unit]] systemwide costs ', el(qty(s.energyPrice, '$/MWh', solver(`t${t}.energyPrice`))), '.'),
      },
    ],
  });
  const intro = siteIntro(grid, siteId);
  return { name: site.name, kind: siteKind(grid, siteId), ...(intro ? { intro } : {}), sections };
}

function siteKind(grid: Grid, siteId: string): Node {
  const site = grid.sites.find((x) => x.id === siteId)!;
  const region = REGIONS[site.region];
  return span(
    site.outOfState ? '[[intertie|Intertie]] point · ' : '[[substation|Substation]] · ',
    dataText(site.outOfState ?? region.name, data(`network.site.${siteId}.region`)),
  );
}

function siteIntro(grid: Grid, siteId: string): Node | undefined {
  const site = grid.sites.find((x) => x.id === siteId)!;
  return site.plain ? span(dataText(site.plain, data(`network.site.${siteId}.plain`))) : undefined;
}

export function branchView(grid: Grid, s: Snapshot, k: number): { name: string; kind: Node; intro?: Node; sections: Section[] } {
  const br = grid.branches[k]!;
  const t = s.t;
  const id = br.id;
  const L = br.line!;
  const pf = s.pf[k]!;
  const qf = s.qf[k]!;
  const pt = s.pt[k]!;
  const qt = s.qt[k]!;
  const from = br.from.site.name;
  const to = br.to.site.name;
  const sections: Section[] = [];
  const kind = span(
    '[[line|Transmission line]] · ',
    el(qty(br.kv, 'kV', data(`network.line.${id}.kv`), { digits: 0, basis: 'LL' })),
    ' · [[circuit]] ',
    dataText(`${br.circuit} of ${br.circuitsInCorridor}`, data(`network.line.${id}.circuit`)),
  );
  const pfq = solver(`t${t}.branch.${id}.pf`);
  const ptq = solver(`t${t}.branch.${id}.pt`);
  const noSolution = s.outcome === 'none';
  const dark = !s.energized[br.from.index] && !s.energized[br.to.index];
  if (!s.inService[k]) {
    sections.push({
      title: span('Out of service'),
      text: span(
        noSolution
          ? 'This circuit is open. With it out, the power flow found no steady state (see the notice over the sheet).'
          : 'This circuit is open: it carries nothing, and its flow has moved onto the rest of the network.',
      ),
      rows: [],
    });
  } else if (noSolution) {
    sections.push({ title: span('No operating point'), text: span('The power flow found no steady state for this interval, so there is no flow here to report.'), rows: [] });
  } else if (dark) {
    sections.push({ title: span('No supply'), text: span('Both ends are cut off from every generator: the circuit is energised by nothing and carries nothing.'), rows: [] });
  }
  if (s.inService[k] && !noSolution && !dark) sections.push({
    title: span('Flow'),
    text: span(
      'Reference direction: from ',
      dataText(from, data(`network.line.${id}.from`)),
      ' to ',
      dataText(to, data(`network.line.${id}.to`)),
      '. At each end, power entering the line is positive; so the far end reads negative when power goes through. [[complex-power|Complex power]] $S = VI^*$ (current conjugated).',
    ),
    rows: [
      {
        label: span('Entering at ', dataText(from, data(`network.line.${id}.from`))),
        value: el(qty(pf, 'MW', pfq, { symbol: 'P', sub: 'f', phases: '3φ' }), { symbol: true }),
        note: span(el(qty(qf, 'MVAr', solver(`t${t}.branch.${id}.qf`), { symbol: 'Q', sub: 'f', phases: '3φ' }), { symbol: true })),
      },
      {
        label: span('Entering at ', dataText(to, data(`network.line.${id}.to`))),
        value: el(qty(pt, 'MW', ptq, { symbol: 'P', sub: 't', phases: '3φ' }), { symbol: true }),
        note: span(el(qty(qt, 'MVAr', solver(`t${t}.branch.${id}.qt`), { symbol: 'Q', sub: 't', phases: '3φ' }), { symbol: true })),
      },
      {
        label: span('[[losses|Losses]] $P_{loss} = P_f + P_t$'),
        value: el(qty(pf + pt, 'MW', derived(`t${t}.branch.${id}.loss`, pfq, ptq), { symbol: 'P', sub: 'loss', phases: '3φ' }), { symbol: true }),
        note: span(
          'Reactive: ',
          el(qty(qf + qt, 'MVAr', derived(`t${t}.branch.${id}.qloss`, solver(`t${t}.branch.${id}.qf`), solver(`t${t}.branch.${id}.qt`)), { phases: '3φ' })),
          ' ($I^2X$ absorbed less charging supplied)',
        ),
      },
      {
        label: span('[[loading|Loading]] (larger end, of normal [[rating]])'),
        value: el(qty(s.loading[k]! * 100, '%', solver(`t${t}.branch.${id}.loading`))),
        note: span(
          'Normal rating ',
          el(qty(br.rateMVA, 'MVA', data(`network.line.${id}.rateMVA`), { digits: 0 })),
          ' · [[emergency-rating|emergency]] ',
          el(qty(br.rateEmergencyMVA, 'MVA', data(`network.line.${id}.rateEmergencyMVA`), { digits: 0 })),
        ),
      },
    ],
  });
  // end voltages
  const vf = s.vm[br.from.index]!;
  const vt = s.vm[br.to.index]!;
  if (!noSolution && !dark) sections.push({
    title: span('Voltages at the ends ([[phasor|phasors]], [[rms|RMS]])'),
    rows: [
      {
        label: dataText(from, data(`network.line.${id}.from`)),
        value: span(
          el(qty(vf, 'pu', solver(`t${t}.bus.${br.from.id}.vm`))),
          ' ∠ ',
          el(qty(s.va[br.from.index]! * RAD, '°', solver(`t${t}.bus.${br.from.id}.va`))),
        ),
      },
      {
        label: dataText(to, data(`network.line.${id}.to`)),
        value: span(el(qty(vt, 'pu', solver(`t${t}.bus.${br.to.id}.vm`))), ' ∠ ', el(qty(s.va[br.to.index]! * RAD, '°', solver(`t${t}.bus.${br.to.id}.va`)))),
      },
    ],
    text: span('Real power flows from the leading [[angle]] toward the lagging one; the difference in magnitude mostly drives [[reactive-power|reactive power]].'),
  });
  // parameters
  const zb = (br.kv * br.kv) / S_BASE;
  const zbq = qty(zb, 'Ω', derived(`network.line.${id}.zbase`, data(`network.line.${id}.kv`), data('model.S_BASE')));
  sections.push({
    title: span('The line ([[pi-model|π model]], whole length)'),
    rows: [
      { label: span('Length'), value: el(qty(L.lengthKm, 'km', data(`network.line.${id}.lengthKm`), { digits: 1 })) },
      {
        label: span('Series [[impedance]] $Z = R + jX$'),
        value: span(
          el(qty(L.zTotal.re, 'Ω', data(`network.line.${id}.R`), { phases: '1φ' })),
          ' + j',
          el(qty(L.zTotal.im, 'Ω', data(`network.line.${id}.X`), { phases: '1φ' })),
        ),
        note: span(
          '= ',
          el(qty(br.r, 'pu', data(`network.line.${id}.r_pu`), { digits: 5 })),
          ' + j',
          el(qty(br.x, 'pu', data(`network.line.${id}.x_pu`), { digits: 5, base: zbq })),
        ),
      },
      {
        label: span('Charging [[susceptance]] $B$'),
        value: el(qty(L.yTotal.im * 1e6, 'µS', data(`network.line.${id}.B`), { digits: 1, phases: '1φ' })),
        note: span('= ', el(qty(br.b, 'pu', data(`network.line.${id}.b_pu`), { digits: 4 }))),
      },
      {
        label: span('[[sil|Surge impedance loading]]'),
        value: el(qty(L.silMW, 'MW', data(`network.line.${id}.sil`), { digits: 0 })),
        note: span('$Z_c$ = ', el(qty(L.zc, 'Ω', data(`network.line.${id}.zc`), { digits: 1 })), '; [[st-clair|St. Clair]] limit at this length ', el(qty(L.stClairMW, 'MW', data(`network.line.${id}.stClair`), { digits: 0 }))),
      },
      {
        label: span('Construction'),
        value: span(''),
        note: dataText(CONSTRUCTIONS[L.construction].label, data(`towers.${L.construction}.label`)),
      },
    ],
  });
  const intro = br.pathName ? span(dataText(br.pathName, data(`network.line.${id}.name`)), br.note ? ': ' : '', br.note ? dataText(br.note, data(`network.line.${id}.note`)) : '') : undefined;
  return { name: br.name, kind, ...(intro ? { intro } : {}), sections };
}

export function transformerView(grid: Grid, s: Snapshot, k: number): { name: string; kind: Node; intro?: Node; sections: Section[] } {
  const br = grid.branches[k]!;
  const X = br.xfmr!;
  const t = s.t;
  const id = br.id;
  const hv = br.from.kv >= br.to.kv ? br.from : br.to;
  const lv = hv === br.from ? br.to : br.from;
  const sections: Section[] = [];
  const bank = grid.branches.filter((b) => b.kind === 'transformer' && b.from.site.id === br.from.site.id && b.from.kv === br.from.kv && b.to.kv === br.to.kv);
  const kind = span(
    '[[transformer|Transformer]] · ',
    el(qty(X.hvKV, 'kV', data(`network.xfmr.${id}.hvKV`), { digits: 0 })),
    ' / ',
    el(qty(X.lvKV, 'kV', data(`network.xfmr.${id}.lvKV`), { digits: X.lvKV >= 100 ? 0 : 1 })),
    ' · bank ',
    dataText(`${bank.indexOf(br) + 1} of ${bank.length}`, data(`network.xfmr.${id}.bank`)),
  );
  const intro = span(
    'Steps power between the ',
    el(qty(hv.kv, 'kV', data(`network.bus.${hv.id}.baseKV`), { digits: 0 })),
    ' and ',
    el(qty(lv.kv, 'kV', data(`network.bus.${lv.id}.baseKV`), { digits: lv.kv >= 100 ? 0 : 1 })),
    ' buses at ',
    dataText(br.from.site.name, data(`network.site.${br.from.site.id}.name`)),
    '. Two windings on one core; the voltage changes by the turns ratio and the current by its inverse, so the power is the same on both sides less a small loss.',
  );
  const noSolution = s.outcome === 'none';
  const dark = !s.energized[br.from.index] && !s.energized[br.to.index];
  if (!s.inService[k]) sections.push({ title: span('Out of service'), text: span('Open on both sides: it carries nothing, and the other banks and the network take its share.'), rows: [] });
  else if (noSolution) sections.push({ title: span('No operating point'), text: span('The power flow found no steady state for this interval, so there is no flow here to report.'), rows: [] });
  else if (dark) sections.push({ title: span('No supply'), text: span('Both sides are cut off from every generator.'), rows: [] });
  else {
    // flows at the high- and low-voltage sides (positive into the transformer)
    const hvIsFrom = hv === br.from;
    const pH = hvIsFrom ? s.pf[k]! : s.pt[k]!;
    const qH = hvIsFrom ? s.qf[k]! : s.qt[k]!;
    const pL = hvIsFrom ? s.pt[k]! : s.pf[k]!;
    const pHq = solver(`t${t}.branch.${id}.${hvIsFrom ? 'pf' : 'pt'}`);
    const pLq = solver(`t${t}.branch.${id}.${hvIsFrom ? 'pt' : 'pf'}`);
    sections.push({
      title: span('Flow'),
      text: span(pH >= 0 ? 'Power is stepping down: it enters on the high-voltage side.' : 'Power is stepping up: it enters on the low-voltage side.'),
      rows: [
        {
          label: span('Entering, high side'),
          value: el(qty(pH, 'MW', pHq, { symbol: 'P', sub: 'H', phases: '3φ' }), { symbol: true }),
          note: span(el(qty(qH, 'MVAr', solver(`t${t}.branch.${id}.${hvIsFrom ? 'qf' : 'qt'}`), { symbol: 'Q', sub: 'H', phases: '3φ' }), { symbol: true })),
        },
        { label: span('Entering, low side'), value: el(qty(pL, 'MW', pLq, { symbol: 'P', sub: 'L', phases: '3φ' }), { symbol: true }) },
        {
          label: span('[[losses|Losses]] $P_{loss} = P_H + P_L$'),
          value: el(qty(pH + pL, 'MW', derived(`t${t}.branch.${id}.loss`, pHq, pLq), { symbol: 'P', sub: 'loss', phases: '3φ', digits: 3 }), { symbol: true }),
        },
        {
          label: span('[[loading|Loading]] (of normal [[rating]])'),
          value: el(qty(s.loading[k]! * 100, '%', solver(`t${t}.branch.${id}.loading`))),
          note: span(
            'Normal rating ',
            el(qty(br.rateMVA, 'MVA', data(`network.xfmr.${id}.rateMVA`), { digits: 0 })),
            ' · [[emergency-rating|emergency]] ',
            el(qty(br.rateEmergencyMVA, 'MVA', data(`network.xfmr.${id}.rateEmergencyMVA`), { digits: 0 })),
          ),
        },
      ],
    });
  }
  sections.push({
    title: span('Nameplate'),
    rows: [
      { label: span('Rating'), value: el(qty(X.mva, 'MVA', data(`network.xfmr.${id}.mva`), { digits: 0 })) },
      {
        label: span('Leakage [[reactance]] $X$'),
        value: el(qty(X.xPct, '%', data(`network.xfmr.${id}.xPct`), { digits: 1 })),
        note: span('on its own rating; ', el(qty(br.x, 'pu', derived(`network.xfmr.${id}.x_pu`, data(`network.xfmr.${id}.xPct`), data(`network.xfmr.${id}.mva`), data('model.S_BASE')), { digits: 5 })), ' on the system base'),
      },
      { label: span('$X/R$ ratio'), value: el(qty(X.xr, '', data(`network.xfmr.${id}.xr`), { digits: 0 })) },
      { label: span('[[vector-group|Vector group]]'), value: dataText(X.vectorGroup, data(`network.xfmr.${id}.vectorGroup`)) },
    ],
  });
  return { name: br.name, kind, intro, sections };
}

/**
 * A region's energy balance for the interval: what it generates, what arrives over the
 * circuits that cross its edge, what its customers take, and — by conservation — what
 * its own lines and transformers turn into heat.
 */
export function regionView(grid: Grid, s: Snapshot, regionId: keyof typeof REGIONS, siteIds: string[]): { name: string; kind: Node; intro?: Node; sections: Section[] } {
  const t = s.t;
  const inRegion = new Set(siteIds);
  const region = REGIONS[regionId];
  const kind = span('[[region|Region]] · ', el(qty(siteIds.length, 'substations', data(`network.region.${regionId}.sites`), { digits: 0 })));
  const intro = span(dataText(region.plain, data(`network.region.${regionId}.plain`)));
  if (s.outcome === 'none')
    return { name: region.name, kind, intro, sections: [{ title: span('No operating point'), text: span('There is no solved state for this interval, so no balance to show.'), rows: [] }] };
  const buses = grid.buses.filter((b) => inRegion.has(b.site.id));
  // customers' demand: bus demand less what DC links draw or deliver there
  let demand = 0;
  for (const b of buses) if (s.energized[b.index]) demand += s.pd[b.index]!;
  let dcIn = 0;
  for (const h of grid.hvdc) {
    const f = inRegion.has(h.from.site.id);
    const to = inRegion.has(h.to.site.id);
    if (f) demand -= h.rec.scheduleMW;
    if (to) demand += h.rec.scheduleMW * (1 - h.rec.lossFrac);
    if (!f && to) dcIn += h.rec.scheduleMW * (1 - h.rec.lossFrac);
    if (f && !to) dcIn -= h.rec.scheduleMW;
  }
  const gen = grid.gens.filter((g) => inRegion.has(g.bus.site.id) && s.genOnline[g.index]).reduce((a, g) => a + s.pg[g.index]!, 0);
  // over the edge: power entering each crossing circuit at its far end arrives here
  const crossings: Array<{ k: number; mw: number }> = [];
  grid.branches.forEach((b, k) => {
    const fi = inRegion.has(b.from.site.id);
    const ti = inRegion.has(b.to.site.id);
    if (fi === ti || !s.inService[k]) return;
    crossings.push({ k, mw: fi ? -s.pf[k]! : -s.pt[k]! });
  });
  const imp = crossings.reduce((a, c) => a + c.mw, 0) + dcIn;
  const genQ = solver(`t${t}.region.${regionId}.gen`);
  const impQ = solver(`t${t}.region.${regionId}.import`);
  const demQ = solver(`t${t}.region.${regionId}.demand`);
  const losses = gen + imp - demand;
  const sections: Section[] = [
    {
      title: span('Balance this interval'),
      text: span('Power is conserved: what the region generates and what arrives over its edge is what its customers take, plus what its own lines and transformers turn into heat.'),
      rows: [
        { label: span('Generated in the region'), value: el(qty(gen, 'MW', genQ, { phases: '3φ' })) },
        {
          label: span(imp >= 0 ? 'Arriving over its edge' : 'Leaving over its edge'),
          value: el(qty(Math.abs(imp), 'MW', impQ, { phases: '3φ' })),
          note: span('over ', el(qty(crossings.length, 'circuits', solver(`t${t}.region.${regionId}.crossings`), { digits: 0 })), dcIn ? ' and a DC link' : ''),
        },
        { label: span('Taken by customers'), value: el(qty(demand, 'MW', demQ, { phases: '3φ' })), note: homesScale(demand, demQ, s.startHour + 0.125) },
        {
          label: span('[[losses|Lost]] in the region, by difference'),
          value: el(qty(losses, 'MW', derived(`t${t}.region.${regionId}.losses`, genQ, impQ, demQ), { phases: '3φ' })),
          note: span(
            imp >= 0 ? 'generated + arriving − taken: ' : 'generated − leaving − taken: ',
            el(qty(gen, 'MW', genQ)),
            imp >= 0 ? ' + ' : ' − ',
            el(qty(Math.abs(imp), 'MW', impQ)),
            ' − ',
            el(qty(demand, 'MW', demQ)),
          ),
        },
      ],
    },
  ];
  // the largest arrivals
  const top = [...crossings].sort((a, b) => b.mw - a.mw).slice(0, 4);
  sections.push({
    title: span('Largest flows over the edge'),
    rows: top.map((c) => {
      const b = grid.branches[c.k]!;
      return {
        label: dataText(b.name, data(`network.line.${b.id}.name`)),
        value: el(qty(c.mw, 'MW', solver(`t${t}.branch.${b.id}.intoRegion`), { phases: '3φ' })),
      };
    }),
  });
  return { name: region.name, kind, intro, sections };
}
