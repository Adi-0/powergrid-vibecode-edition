import { it } from 'vitest';
import { Grid, S_BASE } from '../../src/model/grid';
import { dispatchDay } from '../../src/model/dispatch';
import { operate } from '../../src/model/operate';
import { solveAC } from '../../src/physics/pf/acpf';
import { branchFlows } from '../../src/physics/pf/flows';
it('q', () => {
  const g = new Grid();
  const s = dispatchDay(g);
  const t = Number(process.env.T ?? 76);
  const op = operate(g, s.steps[t]!, g.baseCase(), { participation: 'agc' });
  console.log('status', op.status, op.result.islands[0]?.reason?.slice(0, 60));
  const c = op.pf;
  // all caps in
  g.shunts.forEach((sh) => { c.buses[sh.bus.index]!.bs = sh.stepMVAr > 0 ? sh.steps * sh.stepMVAr / S_BASE : 0; });
  const r = solveAC(c, { slack: 'distributed', start: 'dc', enforceQLimits: false });
  console.log('relaxed all caps', r.status);
  if (r.status !== 'converged') return;
  const over = g.gens.map((gg, i) => ({ id: gg.id, bus: gg.bus.id, q: r.qg[i]! * S_BASE, qmax: gg.qmaxMVAr, qmin: gg.qminMVAr, on: c.gens[i]!.inService })).filter((x) => x.on && (x.q > x.qmax || x.q < x.qmin));
  console.log('gens beyond Q limits:', over.map((x) => `${x.id}@${x.bus} q=${x.q.toFixed(0)} [${x.qmin.toFixed(0)},${x.qmax.toFixed(0)}]`).join('\n  '));
  const rows = g.buses.map((b, i) => ({ id: b.id, v: r.vm[i]! })).sort((a, b) => a.v - b.v);
  console.log('lowest V:', rows.slice(0, 10).map((x) => `${x.id} ${x.v.toFixed(3)}`).join(', '));
  const f = branchFlows(c, r);
  const fr = g.branches.map((b, k) => ({ id: b.id, p: f[k]!.Sf.re * S_BASE, load: f[k]!.loading, ql: f[k]!.loss.im * S_BASE })).sort((a, b) => b.load - a.load);
  console.log('top loadings:', fr.slice(0, 10).map((x) => `${x.id} ${(x.load * 100).toFixed(0)}%`).join(', '));
  const onl = g.gens.filter((gg, i) => c.gens[i]!.inService && gg.tech.id.startsWith('gas')).map((gg) => `${gg.id}:${(s.steps[t]!.genMW[gg.index]!).toFixed(0)}`);
  console.log('gas online:', onl.join(' '));
});
