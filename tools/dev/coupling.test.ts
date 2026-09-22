import { it } from 'vitest';
import { Grid, S_BASE } from '../../src/model/grid';
import { runDay } from '../../src/model/day';
import { makeFeeder } from '../../src/model/feeder';
import { coupledSolve, COUPLING_BUS } from '../../src/model/coupling';
import { Complex } from '../../src/physics/complex';
it('coupling', () => {
  const g = new Grid();
  const run = runDay(g);
  const f = makeFeeder();
  for (const t of [16, 48, 76]) {
    const base = run.points[t]!;
    const t0 = performance.now();
    const cp = coupledSolve(g, base.step, g.baseCase(), f, { participation: 'agc', warm: base.result, shuntSteps: base.shuntSteps });
    const r = cp.feeder.result;
    let loads = Complex.ZERO; for (const s of r.loadS.values()) loads = loads.add(s);
    let capQ = 0; for (const q of r.capQ.values()) capQ += q;
    const closeD = cp.boundaryS.sub(loads.add(r.losses).sub(new Complex(0, capQ)));
    const bi = g.bus(COUPLING_BUS).index;
    const tBus = new Complex(cp.op.pf.buses[bi]!.pd, cp.op.pf.buses[bi]!.qd).scale(S_BASE * 1e6);
    console.log('t', t, 'status', cp.op.status, 'its', cp.iterations, 'ms', (performance.now() - t0).toFixed(0), 'hist', cp.history.map((h) => `${h.vPu.toFixed(5)}∠${h.angleDeg.toFixed(3)} ${h.sMW.toFixed(4)}MW`).join(' | '));
    console.log('   D closure W', closeD.re.toExponential(2), 'var', closeD.im.toExponential(2), 'T residual MW', ((cp.op.balance?.residual.re ?? NaN) * S_BASE).toExponential(1), 'T bus load MW', (tBus.re / 1e6).toFixed(3));
  }
});
