import { it } from 'vitest';
import { makeFeeder, solveFeeder } from '../../src/model/feeder';
it('sweep bench', () => {
  const f = makeFeeder();
  solveFeeder(f, 19.1, 1.02, -0.3);
  const t0 = performance.now();
  const N = 5;
  let st;
  for (let i = 0; i < N; i++) st = solveFeeder(f, 19.1, 1.02, -0.3);
  const ms = (performance.now() - t0) / N;
  const r = st!.result;
  const o = st!.net.nodes;
  console.log(`solveFeeder ${ms.toFixed(1)} ms; iterations ${r.iterations}; ltc ${st!.ltcStep}; head ${(st!.feederHeadS.re / 1000).toFixed(3)} kW; nodes ${o.size}; branches ${st!.net.branches.length}; loads ${st!.net.loads.length}`);
  const out = r.V.get(f.layout.outlet.node)!;
  console.log('outlet V', out[0].abs().toFixed(6), 'losses', (r.losses.re / 1000).toFixed(6), 'headS', (r.headS.re / 1000).toFixed(6));
});
