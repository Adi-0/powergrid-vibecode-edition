import { it } from 'vitest';
import { Grid } from '../../src/model/grid';
import { runDay } from '../../src/model/day';
import { operate } from '../../src/model/operate';
it('n-1', () => {
  const g = new Grid();
  const run = runDay(g);
  const bad = run.points.filter((p) => p.status !== 'converged');
  console.log('non-converged intervals', bad.length, bad.map((p) => p.step.iv.index));
  const t = Number(process.env.T ?? 72);
  const base = run.points[t]!;
  console.log('base at', base.step.iv.startHour, 'status', base.status);
  const pf0 = g.baseCase();
  let secure = 0, insecure = 0, nosol = 0;
  const lines: string[] = [];
  g.branches.forEach((br, k) => {
    if (br.xfmr && br.id.includes('GSU')) return;
    const op = operate(g, base.step, pf0, { participation: 'governor', branchOutages: new Set([k]), warm: base.result, shuntSteps: base.shuntSteps });
    if (op.status !== 'converged') { nosol++; lines.push(`NOSOL ${br.id} ${op.status}`); return; }
    let worst = 0, wb = '';
    op.flows.forEach((f, j) => { const l = f.loading * g.branches[j]!.rateMVA / g.branches[j]!.rateEmergencyMVA; if (l > worst) { worst = l; wb = g.branches[j]!.id; } });
    let vmin = 9; g.buses.forEach((b, i) => { if (op.result.energized[i]) vmin = Math.min(vmin, op.result.vm[i]!); });
    if (worst > 1.0 || vmin < 0.9) { insecure++; lines.push(`${br.id.padEnd(34)} worst ${(worst * 100).toFixed(0)}% of emergency ${wb}  Vmin ${vmin.toFixed(3)}`); }
    else secure++;
  });
  console.log('secure', secure, 'insecure', insecure, 'no solution', nosol);
  console.log(lines.join('\n'));
});
