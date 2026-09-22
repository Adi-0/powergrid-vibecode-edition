import { it } from 'vitest';
import { makeFeeder, solveFeeder } from '../../src/model/feeder';
it('feeder', () => {
  const f = makeFeeder();
  console.log('nodes', f.base.nodes.size, 'branches', f.base.branches.length, 'homes', f.layout.homes.length, 'xfmrs', f.layout.transformers.length);
  for (const h of [4, 12, 19]) {
    const t0 = performance.now();
    const s = solveFeeder(f, h, 1.0, 0);
    const r = s.result;
    const vmin = (() => { let m = 9, id = ''; for (const [n, v] of r.V) { const node = f.base.nodes.get(n)!; for (const p of node.phases) { const pu = v[p]!.abs() / node.vbaseLN; if (pu < m) { m = pu; id = n; } } } return [m, id]; })();
    const o = r.V.get(f.layout.outlet.node)![0]!;
    const hv = r.V.get(f.layout.outlet.home)!;
    console.log(`h${h}`, 'conv', r.converged, 'its', r.iterations, 'ms', (performance.now() - t0).toFixed(1), 'ltc', s.ltcStep, 'taps', JSON.stringify([...r.taps.values()]),
      'sub kW', (s.substationS.re / 1e3).toFixed(1), 'kvar', (s.substationS.im / 1e3).toFixed(1), 'feeder kW', (s.feederHeadS.re / 1e3).toFixed(1),
      'losses kW', (r.losses.re / 1e3).toFixed(2), 'Vmin', (vmin[0] as number).toFixed(4), vmin[1], 'outlet V', o.abs().toFixed(2), '∠', o.argDeg().toFixed(2), 'panel L1', hv[0]!.abs().toFixed(2), 'L2', hv[1]!.abs().toFixed(2), 'L12', hv[0]!.sub(hv[1]!).abs().toFixed(2));
  }
});
