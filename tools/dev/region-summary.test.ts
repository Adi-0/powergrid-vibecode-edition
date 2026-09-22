import { it } from 'vitest';
import { Grid } from '../../src/model/grid';
it('region summary', () => {
  const g = new Grid();
  for (const reg of ['bay', 'la', 'central']) {
    const sites = g.sites.filter((s) => s.region === reg);
    console.log(`== ${reg}: ${sites.length} sites`);
    for (const s of sites) {
      const buses = g.buses.filter((b) => b.site.id === s.id);
      const xf = g.branches.filter((b) => b.kind !== 'line' && b.from.site.id === s.id);
      const loads = g.loads.filter((l) => buses.includes(l.bus)).map((l) => `${l.bus.kv}kV:${l.rec.peakMW}`);
      const gens = [...new Set(g.gens.filter((x) => x.bus.site.id === s.id).map((x) => `${x.plant.id}@${x.bus.kv}${x.bus.terminalOf ? 'T' : ''}`))];
      console.log(s.id.padEnd(14), 'buses', buses.map((b) => b.kv).join('/'), '| xf', xf.map((b) => `${b.from.kv}-${b.to.kv}`).join(','), '| loads', loads.join(','), '| gens', gens.join(','));
    }
    const lines = g.branches.filter((b) => b.kind === 'line' && (b.from.site.region === reg || b.to.site.region === reg));
    const ext = lines.filter((b) => b.from.site.region !== reg || b.to.site.region !== reg).map((b) => b.id);
    console.log('lines', lines.length, 'crossing out', ext.length, ext.join(' | '));
  }
  console.log('hvdc', g.hvdc.map((h) => `${h.rec.id ?? ''} ${h.from.id}->${h.to.id} ${h.rec.scheduleMW}`).join('; '));
  console.log('branch kinds', [...new Set(g.branches.map((b) => b.kind))]);
});
