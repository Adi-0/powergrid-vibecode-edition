import { it } from 'vitest';
import { Grid } from '../../src/model/grid';
import { runDay } from '../../src/model/day';
import { coupledSolve } from '../../src/model/coupling';
import { makeFeeder } from '../../src/model/feeder';
import { feederSnap } from '../../src/model/feederSnapshot';
it('coupled bench', () => {
  const g = new Grid();
  const day = runDay(g);
  const f = makeFeeder();
  const base = g.baseCase();
  for (const t of [76, 50, 12]) {
    const w = day.points[t]!;
    const t0 = performance.now();
    const cp = coupledSolve(g, w.step, base, f, { participation: 'agc', warm: w.result, shuntSteps: w.shuntSteps });
    const ms = performance.now() - t0;
    const fsn = feederSnap(cp);
    console.log(`t=${t} ${ms.toFixed(0)} ms passes ${cp.iterations} change ${cp.lastChangeVA.toExponential(2)} VA; head ${(fsn.headP / 1e3).toFixed(1)} kW; boundary ${(fsn.boundaryP / 1e6).toFixed(3)} MW; ltc ${fsn.ltcStep} reg ${fsn.regTaps}`);
  }
});
