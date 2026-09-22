import { it } from 'vitest';
import { Grid } from '../../src/model/grid';
import { runDay } from '../../src/model/day';
it('t', () => {
  const g = new Grid();
  const run = runDay(g);
  for (const p of run.points) if (p.status !== 'converged') {
    const s = p.step;
    console.log('interval', s.iv.index, s.iv.startHour, p.status, p.result.islands.map((i) => `${i.buses.length}:${i.status}:${i.iterations.length}`).join('|'), 'pinnedP', p.result.islands[0]?.pinnedP.length);
  }
  const p94 = run.points[94]!, p95 = run.points[95]!;
  console.log('94', p94.status, '95 gross', p95.step.grossLoadMW.toFixed(0), 'short', p95.step.shortfallMW, 'over', p95.step.overgenerationMW);
});
