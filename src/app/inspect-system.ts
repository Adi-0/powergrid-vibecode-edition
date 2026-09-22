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
