import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Grid } from '../../src/model/grid';
import { CONDUCTORS } from '../../src/data/conductors';
import { CONSTRUCTIONS } from '../../src/data/towers';
import { TECH, PRICES } from '../../src/data/tech';
import { SOURCES } from '../../src/data/sources';
import { PLANTS } from '../../src/data/ca/plants';
import { LOADS, SITES, REGIONS } from '../../src/data/ca/network';
import { variableCost } from '../../src/model/dispatch';

// Generates docs/model-tables.md from the data files, so the documentation of every
// parameter is always the data itself. Run: npx vitest run --config tools/dev/vitest.dev.config.ts tools/dev/gen-model-doc.test.ts
it('generate', () => {
  const g = new Grid();
  const L: string[] = [];
  const src = (id: string) => (SOURCES as Record<string, { family: string }>)[id]?.family ?? id;
  L.push('# Model tables (generated)', '', 'Generated from `src/data/` by `tools/dev/gen-model-doc.test.ts`. Do not edit by hand.', '');
  L.push('## Conductors', '', '| Conductor | Size | R (Ω/mi, 50 °C) | GMR (ft) | Diameter (in) | Ampacity (A) | Source |', '|---|---|---|---|---|---|---|');
  for (const c of Object.values(CONDUCTORS)) L.push(`| ${c.name} (${c.kind}) | ${c.size} | ${c.r_ohm_per_mi} | ${c.gmr_ft} | ${c.diameter_in} | ${c.ampacity_a} | ${src(c.src)}${'estimate' in c && c.estimate ? ' (estimate)' : ''} |`);
  L.push('', '## Line constructions and computed constants', '', 'Positive- and zero-sequence per-km values computed by modified Carson + Kron reduction (ρ = 100 Ω·m, 60 Hz).', '');
  L.push('| Construction | z₁ (Ω/km) | z₀ (Ω/km) | b₁ (µS/km) | Z_c (Ω) | SIL (MW) | Thermal (MVA) |', '|---|---|---|---|---|---|---|');
  const seen = new Set<string>();
  for (const br of g.branches) {
    if (!br.line || seen.has(br.line.construction)) continue;
    seen.add(br.line.construction);
    const lc = br.line.constants;
    const c = CONSTRUCTIONS[br.line.construction];
    L.push(`| ${c.label} | ${lc.z1.re.toFixed(4)} + j${lc.z1.im.toFixed(4)} | ${lc.z0.re.toFixed(4)} + j${lc.z0.im.toFixed(4)} | ${(lc.y1.im * 1e6).toFixed(3)} | ${br.line.zc.toFixed(1)} | ${br.line.silMW.toFixed(0)} | ${br.rateMVA.toFixed(0)} |`);
  }
  L.push('', '## Technologies', '', `Fuel prices (estimate): gas $${PRICES.gas_per_mmbtu}/MMBtu, uranium $${PRICES.uranium_per_mmbtu}/MMBtu, CO₂ $${PRICES.co2_per_tonne}/t at ${PRICES.gas_tco2_per_mmbtu} t/MMBtu.`, '');
  L.push('| Technology | Synchronous | H (s) | Droop | Heat rate (Btu/kWh) | Pmin | Ramp (/min) | Min up (h) | Source |', '|---|---|---|---|---|---|---|---|---|');
  for (const t of Object.values(TECH)) L.push(`| ${t.label} | ${t.synchronous ? 'yes' : 'no'} | ${t.H_s} | ${t.droop === null ? '—' : (t.droop * 100).toFixed(0) + ' %'} | ${t.heatRate ?? '—'} | ${(t.pminFrac * 100).toFixed(0)} % | ${(t.rampPerMin * 100).toFixed(0)} % | ${t.minUpH} | ${src(t.src)}${t.estimate ? ' (estimate)' : ''} |`);
  L.push('', '## Sites', '', `${SITES.length} sites, ${g.buses.length} buses, ${g.branches.length} branches (${g.branches.filter((b) => b.kind === 'line').length} line circuits, ${g.branches.filter((b) => b.kind === 'transformer').length} transformer banks).`, '');
  L.push('| Site | Region | Lat | Lon | kV |', '|---|---|---|---|---|');
  for (const s of SITES) L.push(`| ${s.name}${s.outOfState ? ` (${s.outOfState})` : ''} | ${REGIONS[s.region].name} | ${s.lat} | ${s.lon} | ${s.kv.join(', ')} |`);
  L.push('', '## Lines', '', '| Circuit | kV | Length (km) | Construction | R (pu) | X (pu) | B (pu) | Rating (MVA) | Emergency (MVA) | St. Clair (MW) |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const br of g.branches.filter((b) => b.line)) L.push(`| ${br.name} | ${br.kv} | ${br.line!.lengthKm.toFixed(1)} | ${br.line!.construction} | ${br.r.toFixed(5)} | ${br.x.toFixed(5)} | ${br.b.toFixed(4)} | ${br.rateMVA.toFixed(0)} | ${br.rateEmergencyMVA.toFixed(0)} | ${br.line!.stClairMW.toFixed(0)} |`);
  L.push('', '## Transformers', '', '| Bank | MVA | X (% own base) | X/R | Vector group | X (pu on 100 MVA) |', '|---|---|---|---|---|---|');
  for (const br of g.branches.filter((b) => b.xfmr)) L.push(`| ${br.name} | ${br.xfmr!.mva} | ${br.xfmr!.xPct} | ${br.xfmr!.xr} | ${br.xfmr!.vectorGroup} | ${br.x.toFixed(5)} |`);
  L.push('', '## Plants and interties', '', '| Plant | Bus | Technology | MW | Variable cost ($/MWh) | Notes |', '|---|---|---|---|---|---|');
  for (const p of PLANTS) {
    const t = TECH[p.tech];
    const cost = p.blocks ? p.blocks.map((b) => `${b.mw} MW @ ${b.cost}`).join('; ') : variableCost(p, p.tech, p.heatRate ?? t.heatRate).toFixed(1);
    const notes = [p.mustRun ? 'reliability must-run' : '', p.hours ? `${p.hours} h storage` : '', p.dailyCF ? `daily water CF ${p.dailyCF}` : '', p.mvar ? `${p.mvar} MVAr` : '', p.externalMW ? `external response ${p.externalMW} MW` : ''].filter(Boolean).join(', ');
    L.push(`| ${p.name} | ${p.bus} | ${t.label} | ${p.mw} | ${cost} | ${notes} |`);
  }
  L.push('', '## Loads (reference peak)', '', '| Bus | Peak MW | Power factor | Rooftop solar MW |', '|---|---|---|---|');
  for (const l of LOADS) L.push(`| ${l.bus} | ${l.peakMW} | ${l.pf} | ${l.btmMW} |`);
  writeFileSync(new URL('../../docs/model-tables.md', import.meta.url), L.join('\n') + '\n');
});
