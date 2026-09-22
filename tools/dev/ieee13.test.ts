import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ieee13, IEEE13_PUBLISHED, IEEE13_V_LN } from '../../src/data/dist/ieee13';
import { solveSweep } from '../../src/physics/dist/sweep';
import { balancedSource } from '../../src/physics/dist/network';
it('ieee13', () => {
  const ods = JSON.parse(readFileSync('test/fixtures/ieee13-opendss.json', 'utf8'));
  for (const dist of ['exact', 'third'] as const) {
    const net = ieee13({ distributed: dist });
    const r = solveSweep(net, balancedSource(IEEE13_V_LN));
    let dmP = 0, daP = 0, dmO = 0, daO = 0;
    const rows: string[] = [];
    for (const [n, ph] of Object.entries(IEEE13_PUBLISHED)) {
      const base = net.nodes.get(n)!.vbaseLN;
      for (const [p, [m, a]] of Object.entries(ph)) {
        const v = r.V.get(n)![{ a: 0, b: 1, c: 2 }[p as 'a']!]!;
        const pu = v.abs() / base, deg = v.argDeg();
        dmP = Math.max(dmP, Math.abs(pu - m)); daP = Math.max(daP, Math.abs(deg - a));
        const o = ods.nodes[n.toLowerCase()]?.phases[p];
        if (o) { dmO = Math.max(dmO, Math.abs(pu - o.pu)); daO = Math.max(daO, Math.abs(deg - o.deg)); }
        rows.push(`${n}.${p} ${pu.toFixed(4)}∠${deg.toFixed(2)}  pub ${m.toFixed(4)}∠${a.toFixed(2)}`);
      }
    }
    console.log(dist, 'conv', r.converged, 'its', r.iterations, 'vs published max dV', dmP.toFixed(5), 'dA', daP.toFixed(3), '| vs OpenDSS dV', dmO.toFixed(5), 'dA', daO.toFixed(3));
    console.log('  head kW', (r.headS.re / 1000).toFixed(3), 'kvar', (r.headS.im / 1000).toFixed(3), 'losses', (r.losses.re / 1000).toFixed(3), (r.losses.im / 1000).toFixed(3));
    if (dist === 'exact') console.log(rows.join('\n'));
  }
  const reg = solveSweep(ieee13({ taps: [0, 0, 0] }), balancedSource(IEEE13_V_LN), { regulate: true });
  console.log('LDC taps from 0:', JSON.stringify([...reg.taps.values()]));
});
