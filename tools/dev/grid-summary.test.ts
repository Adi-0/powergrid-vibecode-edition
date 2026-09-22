import { it } from 'vitest';
import { Grid } from '../../src/model/grid';
it('summary', () => {
  const g = new Grid();
  console.log('buses', g.buses.length, 'branches', g.branches.length, 'gens', g.gens.length, 'loads', g.loads.length, 'shunts', g.shunts.length);
  const seen = new Set<string>();
  for (const br of g.branches) {
    if (br.kind !== 'line' || seen.has(br.line!.construction)) continue;
    seen.add(br.line!.construction);
    const lc = br.line!.constants;
    console.log(br.line!.construction, 'z1/km', lc.z1.re.toFixed(4), lc.z1.im.toFixed(4), 'z0/km', lc.z0.re.toFixed(4), lc.z0.im.toFixed(4), 'b1 uS/km', (lc.y1.im * 1e6).toFixed(3), 'Zc', br.line!.zc.toFixed(1), 'SIL', br.line!.silMW.toFixed(0), 'thermal', br.rateMVA.toFixed(0));
  }
  const lines = g.branches.filter((b) => b.kind === 'line').sort((a, b) => b.line!.lengthKm - a.line!.lengthKm);
  for (const br of lines.slice(0, 8)) console.log(br.id, br.line!.lengthKm.toFixed(0), 'km', 'stClair', br.line!.stClairMW.toFixed(0), 'x pu', br.x.toFixed(4), 'b pu', br.b.toFixed(3));
  const cap: Record<string, number> = {};
  for (const gg of g.gens) cap[gg.tech.id] = (cap[gg.tech.id] ?? 0) + gg.pmaxMW;
  console.log(cap);
  console.log('peak load', g.loads.reduce((s, l) => s + l.rec.peakMW, 0), 'btm', g.loads.reduce((s, l) => s + l.rec.btmMW, 0));
  console.log(g.shunts.map((s) => `${s.bus.id}:${s.steps}x${s.stepMVAr}`).join(' '));
});
