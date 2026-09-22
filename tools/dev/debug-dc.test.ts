import { it } from 'vitest';
import { Grid, S_BASE } from '../../src/model/grid';
import { dispatchDay } from '../../src/model/dispatch';
import { operate } from '../../src/model/operate';
import { solveDC } from '../../src/physics/pf/dcpf';
it('dc', () => {
  const g = new Grid();
  const s = dispatchDay(g);
  for (const t of [12, 48, 76]) {
    const step = s.steps[t]!;
    const op = operate(g, step, g.baseCase(), { participation: 'agc' });
    const pf = op.pf;
    const pinj = new Float64Array(pf.buses.length);
    pf.buses.forEach((b, i) => (pinj[i] = -b.pd));
    pf.gens.forEach((gg) => { if (gg.inService) pinj[gg.bus] = pinj[gg.bus]! + gg.pg; });
    let mis = 0; pinj.forEach((v) => (mis += v));
    // spread mismatch onto the ref bus neighbour: add to Tesla 500
    const ref = g.bus('TESLA-500').index;
    pinj[ref] = pinj[ref]! - mis;
    const dc = solveDC(pf, pinj, ref);
    const rows = g.branches.map((b, k) => ({ id: b.id, mw: dc.pf[k]! * S_BASE, rate: b.rateMVA, st: b.line?.stClairMW ?? b.rateMVA, dth: (dc.va[b.from.index]! - dc.va[b.to.index]!) * 180 / Math.PI }));
    rows.sort((a, b) => Math.abs(b.mw) / b.st - Math.abs(a.mw) / a.st);
    console.log('t', t, step.iv.startHour, 'mismatch MW', (mis * S_BASE).toFixed(0), 'status AC', op.status);
    for (const r of rows.slice(0, 12)) console.log('  ', r.id.padEnd(34), r.mw.toFixed(0).padStart(6), 'rate', r.rate.toFixed(0).padStart(5), 'stClair', r.st.toFixed(0).padStart(5), 'dθ', r.dth.toFixed(1));
    const imp = g.gens.filter((x) => x.tech.id.startsWith('import')).map((x) => `${x.id}:${step.genMW[x.index]!.toFixed(0)}`);
    console.log('  imports', imp.join(' '));
  }
});
