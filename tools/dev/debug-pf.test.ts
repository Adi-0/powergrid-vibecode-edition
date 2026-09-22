import { it } from 'vitest';
import { Grid } from '../../src/model/grid';
import { dispatchDay } from '../../src/model/dispatch';
import { operate } from '../../src/model/operate';
it('debug', () => {
  const g = new Grid();
  const s = dispatchDay(g);
  const step = s.steps[48]!;
  const base = g.baseCase();
  const op = operate(g, step, base, { participation: 'agc', record: true });
  console.log(op.status, op.result.islands.map((i) => `${i.buses.length}:${i.status}:${i.reason ?? ''}`));
  for (const it of op.result.islands[0]!.iterations) {
    console.log(it.k, it.maxMismatch.toExponential(2), g.buses[it.worstBus]!.id, it.worstKind, 'lam', it.lambda.toFixed(3));
  }
  let gen = 0; step.genMW.forEach((v) => (gen += v));
  console.log('gen', gen.toFixed(0), 'net', step.netLoadMW.toFixed(0));
  const pf = op.pf;
  console.log('ksum', pf.gens.reduce((a, gg) => a + gg.participation, 0), 'online', pf.gens.filter((x) => x.inService).length);
});
