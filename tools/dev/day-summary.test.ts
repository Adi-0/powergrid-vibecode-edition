import { it } from 'vitest';
import { Grid, S_BASE } from '../../src/model/grid';
import { runDay } from '../../src/model/day';
it('day', () => {
  const g = new Grid();
  const t0 = performance.now();
  const run = runDay(g);
  console.log('ms', (performance.now() - t0).toFixed(0));
  const sumBy = (p: typeof run.points[number], pred: (t: string) => boolean) =>
    g.gens.reduce((s, gg, i) => s + (pred(gg.tech.id) ? p.genMW[i]! : 0), 0);
  console.log('hh:mm  status  gross   btm    net  solar  wind  hydro  stor   gas   imp  curt  loss  maxLoad          Vmin  Vmax  marginal');
  for (const p of run.points) {
    if (p.step.iv.index % 4 !== 0) continue;
    let maxL = 0, maxB = '';
    p.flows.forEach((f, k) => { if (f.loading > maxL) { maxL = f.loading; maxB = g.branches[k]!.id; } });
    let vmin = 9, vmax = 0;
    g.buses.forEach((b, i) => { const v = p.result.vm[i]!; if (p.result.energized[i]) { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); } });
    const h = p.step.iv.startHour;
    console.log(
      `${String(Math.floor(h)).padStart(2, '0')}:00`, p.status.padEnd(9),
      p.step.grossLoadMW.toFixed(0).padStart(6), p.step.btmMW.toFixed(0).padStart(5), p.step.netLoadMW.toFixed(0).padStart(6),
      sumBy(p, (t) => t === 'solar_pv').toFixed(0).padStart(6), sumBy(p, (t) => t === 'wind').toFixed(0).padStart(5),
      sumBy(p, (t) => t === 'hydro').toFixed(0).padStart(6), sumBy(p, (t) => t === 'battery' || t === 'pumped_storage').toFixed(0).padStart(6),
      sumBy(p, (t) => t.startsWith('gas')).toFixed(0).padStart(6), sumBy(p, (t) => t.startsWith('import')).toFixed(0).padStart(5),
      p.step.curtailedMW.toFixed(0).padStart(5), p.lossesMW.toFixed(0).padStart(5),
      `${(maxL * 100).toFixed(0)}% ${maxB}`.padEnd(34), vmin.toFixed(3), vmax.toFixed(3), p.step.marginal?.plantId ?? '-', p.step.marginal?.costPerMWh.toFixed(1) ?? '', 'short', p.step.shortfallMW.toFixed(0), 'resid', ((p.balance?.residual.re ?? NaN) * S_BASE).toExponential(1),
    );
  }
});
