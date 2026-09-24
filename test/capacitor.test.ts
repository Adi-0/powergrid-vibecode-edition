import { beforeAll, describe, expect, it } from 'vitest';
import { Grid } from '../src/model/grid';
import { runDay, type DayRun } from '../src/model/day';
import { operate } from '../src/model/operate';
import { snapshot } from '../src/model/snapshot';
import { capBankState, capWave } from '../src/model/capState';
import { COMPONENTS } from '../src/data/components';

/**
 * The capacitor bank level's physics: what it shows agrees with the power flow, the
 * reader's switching is a real re-solve that the controller respects, and the
 * waveforms it animates are the solved phasors' (current a quarter turn ahead of the
 * voltage; each phase's power in and out, the three together none).
 */
describe('capacitor banks', () => {
  let g: Grid;
  let day: DayRun;
  const T = 76;
  beforeAll(() => {
    g = new Grid();
    day = runDay(g);
  }, 120_000);

  it('supplies exactly what the power flow has at its bus: Q = n·Q_step·|V|²', () => {
    const s = snapshot(g, day.points[T]!);
    let n = 0;
    g.shunts.forEach((sh, k) => {
      if (sh.stepMVAr <= 0) return;
      const st = capBankState(g, s, k, false, null)!;
      expect(st.q).toBeCloseTo(s.shuntMVAr[sh.bus.index]!, 9);
      // and the energy check the math panel ends on
      expect(st.omega * st.wPeak / 1e6).toBeCloseTo(st.q1, 9);
      n++;
    });
    expect(n).toBeGreaterThan(40);
  });

  it('holds a bank where the reader switches it, and the bus voltage follows', () => {
    const k = g.shunts.findIndex((sh) => sh.stepMVAr > 0 && sh.bus.site.id === 'TESLA');
    const sh = g.shunts[k]!;
    const step = day.schedule.steps[T]!;
    const base = g.baseCase();
    const all = operate(g, step, base, { participation: 'agc', shuntHold: new Map([[k, sh.steps]]) });
    const none = operate(g, step, base, { participation: 'agc', shuntHold: new Map([[k, 0]]) });
    expect(all.status).toBe('converged');
    expect(none.status).toBe('converged');
    expect(all.shuntSteps[k]).toBe(sh.steps);
    expect(none.shuntSteps[k]).toBe(0);
    const i = sh.bus.index;
    expect(all.result.vm[i]!).toBeGreaterThan(none.result.vm[i]!);
  });

  it('animates the solved phasors: current leads voltage by 90°, and the three phases’ power sums to zero', () => {
    const s = snapshot(g, day.points[T]!);
    const k = g.shunts.findIndex((sh) => sh.stepMVAr > 0 && s.shuntSteps[g.shunts.indexOf(sh)]! > 0);
    const st = capBankState(g, s, k, false, null)!;
    const period = 1 / COMPONENTS.fHz;
    let sumP = 0;
    const N = 240;
    for (let j = 0; j < N; j++) {
      const tau = (j / N) * period;
      const [a, b, c] = [0, 1, 2].map((p) => capWave(st, tau, p));
      // balanced three-phase: no net power into the bank at any instant
      expect(Math.abs(a!.p + b!.p + c!.p)).toBeLessThan(1e-9 * st.q);
      sumP += a!.p;
    }
    // one phase: in and out, nothing kept over a cycle
    expect(Math.abs(sumP / N)).toBeLessThan(1e-9 * st.q);
    // the current peaks where the voltage crosses zero, a quarter cycle earlier
    const th = (st.vaDeg * Math.PI) / 180;
    const tZero = ((Math.PI / 2 - th) / st.omega + period) % period;
    const w = capWave(st, tZero, 0);
    expect(Math.abs(w.v)).toBeLessThan(1e-6 * st.vLN);
    expect(Math.abs(w.i)).toBeCloseTo(Math.SQRT2 * st.amps, 6);
    // and the peak of one phase's power is its reactive power
    let pk = 0;
    for (let j = 0; j < N; j++) pk = Math.max(pk, capWave(st, (j / N) * period, 0).p);
    expect(pk).toBeCloseTo(st.q1, 3);
  });

  it('builds each can from the step, and meets IEEE 18’s discharge rule', () => {
    const s = snapshot(g, day.points[T]!);
    const k = g.shunts.findIndex((sh) => sh.stepMVAr > 0 && sh.bus.kv >= 200);
    const st = capBankState(g, s, k, false, null)!;
    const d = st.design;
    // S groups in series of P in parallel: the phase's capacitance again
    expect((st.cCan * d.parallel) / d.series).toBeCloseTo(st.cStep, 15);
    // the cans' kvar add up to the phase's
    if (st.inService > 0) expect((st.qCan * d.series * d.parallel * st.inService) / 1000).toBeCloseTo(st.q1, 6);
    // the largest resistor that reaches 50 V from the rated peak in 5 minutes
    const v0 = Math.SQRT2 * d.canKV * 1000;
    const R = COMPONENTS.discharge.s / (st.cCan * Math.log(v0 / COMPONENTS.discharge.v));
    expect(v0 * Math.exp(-COMPONENTS.discharge.s / (R * st.cCan))).toBeCloseTo(COMPONENTS.discharge.v, 6);
  });
});
