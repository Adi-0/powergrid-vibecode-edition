import { it } from 'vitest';
import { Grid, S_BASE } from '../../src/model/grid';
import { dispatchDay } from '../../src/model/dispatch';
import { operate } from '../../src/model/operate';
import { solveAC } from '../../src/physics/pf/acpf';
import { cloneCase } from '../../src/physics/pf/case';
import { branchFlows } from '../../src/physics/pf/flows';
it('debug3', () => {
  const g = new Grid();
  const s = dispatchDay(g);
  const t = Number(process.env.T ?? 48);
  const op = operate(g, s.steps[t]!, g.baseCase(), { participation: 'agc' });
  console.log('op status', op.status);
  // give every shunt all steps of caps in, reactors out, to isolate P-transfer issues
  let last: ReturnType<typeof solveAC> | null = null;
  let lastScale = 0;
  let lastCase = null as ReturnType<typeof cloneCase> | null;
  for (let scale = 0.5; scale <= 1.001; scale += 0.05) {
    const c = cloneCase(op.pf);
    c.buses.forEach((b) => { b.pd *= scale; b.qd *= scale; });
    c.gens.forEach((gg) => { gg.pg *= scale; });
    g.shunts.forEach((sh) => { if (sh.stepMVAr > 0) c.buses[sh.bus.index]!.bs += sh.steps * sh.stepMVAr / S_BASE * 0.5; });
    const r = solveAC(c, { slack: 'distributed', start: 'dc', enforceQLimits: false, enforcePLimits: false, ...(last ? { initial: last } : {}) });
    console.log('scale', scale.toFixed(2), r.status);
    if (r.status !== 'converged') break;
    last = r; lastScale = scale; lastCase = c;
  }
  if (last && lastCase) {
    const rows = g.buses.map((b, i) => ({ id: b.id, v: last!.vm[i]!, a: last!.va[i]! * 180 / Math.PI })).sort((a, b) => a.v - b.v);
    console.log('last converged scale', lastScale.toFixed(2));
    console.log('lowest V:', rows.slice(0, 8).map((r) => `${r.id} ${r.v.toFixed(3)}`).join(', '));
    console.log('highest V:', rows.slice(-5).map((r) => `${r.id} ${r.v.toFixed(3)}`).join(', '));
    const byA = [...rows].sort((a, b) => a.a - b.a);
    console.log('angle range', byA[0]!.id, byA[0]!.a.toFixed(1), byA.at(-1)!.id, byA.at(-1)!.a.toFixed(1));
    const f = branchFlows(lastCase, last);
    const fr = g.branches.map((b, k) => ({ id: b.id, p: f[k]!.Sf.re * S_BASE, q: f[k]!.Sf.im * S_BASE, ql: f[k]!.loss.im * S_BASE, st: b.line?.stClairMW ?? b.rateMVA, dth: (last!.va[b.from.index]! - last!.va[b.to.index]!) * 180 / Math.PI }));
    fr.sort((a, b) => Math.abs(b.dth) - Math.abs(a.dth));
    for (const r of fr.slice(0, 10)) console.log('  ', r.id.padEnd(34), 'P', r.p.toFixed(0).padStart(6), 'Q', r.q.toFixed(0).padStart(6), 'Qloss', r.ql.toFixed(0).padStart(5), 'st', r.st.toFixed(0), 'dθ', r.dth.toFixed(1));
  }
});
