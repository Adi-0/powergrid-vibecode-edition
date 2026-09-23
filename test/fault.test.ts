import { describe, expect, it } from 'vitest';
import fx from './fixtures/fault-4bus.json';
import { Complex, c } from '../src/physics/complex';
import { branchSeqCurrent, buildYbus, factor, fault, phaseOf, type FaultType, type SeqBranch, type SeqNetwork } from '../src/physics/fault/seq';

/**
 * The sequence-network fault method against OpenDSS's phase-domain solution of the same
 * four-bus system (tools/ref/fault.py): fault currents, line and transformer currents
 * (which test the zero-sequence paths and the delta–wye phase shifts), and bus voltages.
 */
const S = fx.system;
const j = (x: number) => c(0, x);
const BUS: Record<string, number> = { b1: 0, b2: 1, b3: 2, b4: 3 };
const T1: SeqBranch = { from: 0, to: 1, z1: j(S.T1.x), z0: j(S.T1.x), xfmr: { from: 'D', to: 'Yg' } };
const L23: SeqBranch = { from: 1, to: 2, z1: c(S.L23.r1, S.L23.x1), z0: c(S.L23.r0, S.L23.x0) };
const T2: SeqBranch = { from: 2, to: 3, z1: j(S.T2.x), z0: j(S.T2.x), xfmr: { from: 'Yg', to: 'D' } };
const net: SeqNetwork = {
  n: 4,
  branches: [T1, L23, T2],
  sources: [
    { bus: 0, z1: j(S.G1.x1), z2: j(S.G1.x2), z0: j(S.G1.x0 + 3 * S.G1.xn) },
    { bus: 3, z1: j(S.G2.x1), z2: j(S.G2.x2), z0: j(S.G2.x0 + 3 * S.G2.xn) },
  ],
};
// T1's from side (delta, 13.8 kV) is its low side; T2's from side (138 kV) its high side
const hvFrom = (k: number) => k !== 0;
const Y = buildYbus(net, hvFrom);
// no load: pre-fault voltages 1.0 pu, the 138 kV buses 30° ahead of the 13.8 kV ones
const vpre = [Complex.polarDeg(1, 0), Complex.polarDeg(1, 30), Complex.polarDeg(1, 30), Complex.polarDeg(1, 0)];

const close = (a: Complex, b: number[], tol: number, what: string) => {
  expect(Math.hypot(a.re - b[0]!, a.im - b[1]!), `${what}: ${a.re.toFixed(5)}+j${a.im.toFixed(5)} vs ${b[0]!.toFixed(5)}+j${b[1]!.toFixed(5)}`).toBeLessThan(tol);
};

describe('faults by symmetrical components, against OpenDSS', () => {
  for (const f of fx.faults) {
    const k = BUS[f.bus]!;
    const zbase = f.bus === 'b1' || f.bus === 'b4' ? 13.8 ** 2 / 100 : 138 ** 2 / 100;
    const zf = c(S.rFaultOhm / zbase, 0);
    it(`${f.type} at ${f.bus}`, () => {
      const r = fault(Y, k, f.type as FaultType, vpre, zf);
      // the factored path gives the same answer
      const rf = fault(factor(Y), k, f.type as FaultType, vpre, zf);
      expect(rf.ia.sub(r.ia).abs() + rf.ib.sub(r.ib).abs() + rf.ic.sub(r.ic).abs()).toBeLessThan(1e-9);
      const ph = [r.ia, r.ib, r.ic];
      // which phases the OpenDSS fault element connects
      const phases = f.type === '3ph' ? [0, 1, 2] : f.type === 'slg' ? [0] : f.type === 'll' ? [1] : [1, 2];
      phases.forEach((p, i) => close(ph[p]!, f.faultCurrentPu[i]!, 2e-4, `fault current phase ${'abc'[p]}`));
      // bus voltages during the fault
      for (const [b, v] of Object.entries(f.voltagesPu)) {
        const i = BUS[b]!;
        const pv = phaseOf(r.v0[i]!, r.v1[i]!, r.v2[i]!);
        pv.forEach((x, p) => close(x, v[p]!, 2e-4, `V${'abc'[p]} at ${b}`));
      }
      // line current leaving bus 2, and T1's 138 kV winding current (from bus 2 into T1)
      const seqI = (b: SeqBranch, hv: boolean) => [0, 1, 2].map((s) => branchSeqCurrent(b, s === 0 ? r.v0 : s === 1 ? r.v1 : r.v2, s as 0 | 1 | 2, hv));
      const [l0, l1, l2] = seqI(L23, true);
      phaseOf(l0!, l1!, l2!).forEach((x, p) => close(x, f.lineAtB2Pu[p]!, 2e-4, `line 2–3 phase ${'abc'[p]}`));
      const T1rev: SeqBranch = { ...T1, from: 1, to: 0, xfmr: { from: 'Yg', to: 'D' } };
      const [t0, t1, t2] = seqI(T1rev, true);
      phaseOf(t0!, t1!, t2!).forEach((x, p) => close(x, f.t1HvPu[p]!, 2e-4, `T1 138 kV phase ${'abc'[p]}`));
    });
  }
});
