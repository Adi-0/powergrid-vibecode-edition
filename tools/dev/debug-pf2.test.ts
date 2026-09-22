import { it } from 'vitest';
import { Grid, S_BASE } from '../../src/model/grid';
import { dispatchDay } from '../../src/model/dispatch';
import { operate } from '../../src/model/operate';
import { solveAC } from '../../src/physics/pf/acpf';
import { cloneCase } from '../../src/physics/pf/case';
it('debug2', () => {
  const g = new Grid();
  const s = dispatchDay(g);
  const op = operate(g, s.steps[48]!, g.baseCase(), { participation: 'agc' });
  for (const scale of [0.1, 0.3, 0.6, 1.0]) {
    const c = cloneCase(op.pf);
    c.buses.forEach((b) => { b.pd *= scale; b.qd *= scale; });
    c.gens.forEach((gg) => { gg.pg *= scale; });
    for (const opt of [
      { enforceQLimits: false, enforcePLimits: false },
      { enforceQLimits: true, enforcePLimits: true },
    ]) {
      const r = solveAC(c, { slack: 'distributed', start: 'dc', record: true, ...opt });
      const its = r.islands[0]!.iterations.map((i) => i.maxMismatch.toExponential(1)).join(' ');
      console.log('scale', scale, JSON.stringify(opt), r.status, 'islands', r.islands.length, its, 'pinnedQ', r.islands[0]!.pinnedQ.length);
      if (r.status === 'converged') {
        let vmin = 9, vmax = 0, bmin = '', bmax = '';
        g.buses.forEach((b, i) => { if (r.vm[i]! < vmin) { vmin = r.vm[i]!; bmin = b.id; } if (r.vm[i]! > vmax) { vmax = r.vm[i]!; bmax = b.id; } });
        console.log('   V', vmin.toFixed(3), bmin, vmax.toFixed(3), bmax, 'lambda MW', (r.islands[0]!.lambda * S_BASE).toFixed(0));
      }
    }
  }
});
