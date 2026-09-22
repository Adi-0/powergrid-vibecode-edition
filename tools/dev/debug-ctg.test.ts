import { it } from 'vitest';
import { Grid, S_BASE } from '../../src/model/grid';
import { runDay } from '../../src/model/day';
import { operate } from '../../src/model/operate';
import { solveAC } from '../../src/physics/pf/acpf';
it('ctg', () => {
  const g = new Grid();
  const run = runDay(g);
  const base = run.points[72]!;
  const k = g.branches.findIndex((b) => b.id === (process.env.BR ?? 'MIDWAY–VINCENT 500 #1'));
  for (const mode of ['governor', 'agc'] as const) {
    const op = operate(g, base.step, g.baseCase(), { participation: mode, branchOutages: new Set([k]), warm: base.result, shuntSteps: base.shuntSteps, record: true });
    console.log(mode, op.status, op.result.islands.map((i) => i.iterations.length + ' its, pinnedP ' + i.pinnedP.length + ' pinnedQ ' + i.pinnedQ.length).join('|'));
    const c = op.pf;
    for (const qlim of [false, true]) {
      const r = solveAC(c, { slack: 'distributed', initial: base.result, enforceQLimits: qlim, record: true });
      console.log('  direct qlim', qlim, r.status, r.islands[0]!.iterations.map((i) => i.maxMismatch.toExponential(0)).join(' ').slice(0, 200));
      if (r.status === 'converged') {
        const rows = g.buses.map((b, i) => ({ id: b.id, v: r.vm[i]! })).sort((a, b) => a.v - b.v);
        console.log('   lowest', rows.slice(0, 5).map((x) => `${x.id} ${x.v.toFixed(3)}`).join(', '), 'lambda', (r.islands[0]!.lambda * S_BASE).toFixed(0), 'pinnedP', r.islands[0]!.pinnedP.map((i) => g.gens[i]!.id).join(','));
      }
    }
  }
});
