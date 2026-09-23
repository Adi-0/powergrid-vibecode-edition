import { describe, expect, it } from 'vitest';
import fx from './fixtures/ieee13-zsc.json';
import { ieee13 } from '../src/data/dist/ieee13';
import { CMatrix } from '../src/physics/linalg';
import { Complex } from '../src/physics/complex';
import { theveninAt, feederFault } from '../src/physics/dist/fault';
import type { Phase } from '../src/physics/dist/network';

/**
 * The feeder's phase-domain Thevenin matrices against OpenDSS's fault-study
 * short-circuit matrices on the IEEE 13-node feeder (tools/ref/ieee13_zsc.py): take
 * OpenDSS's matrix at the regulator's source bus 650 as the source, add this model's
 * line matrices down each path, and compare at every primary bus of the same voltage.
 */
type Bus = { nodes: number[]; zsc: number[][][] };
const B = fx.buses as Record<string, Bus>;
const full = (b: Bus): CMatrix => {
  const M = new CMatrix(3, 3);
  b.nodes.forEach((ni, i) => b.nodes.forEach((nj, j) => M.set(ni - 1, nj - 1, new Complex(b.zsc[i]![j]![0]!, b.zsc[i]![j]![1]!))));
  return M;
};

describe('feeder faults, phase by phase, against OpenDSS on IEEE 13', () => {
  const net = ieee13({ distributed: 'third', taps: [0, 0, 0] });
  const z650 = full(B['650']!);
  for (const bus of ['632', '670', '671', '680', '633', '645', '646', '692', '675', '684', '611', '652']) {
    it(`Thevenin matrix at ${bus}`, () => {
      const ref = B[bus]!;
      const Z = theveninAt(net, '650', z650, bus)!;
      expect(Z).not.toBeNull();
      if (bus === '645' || bus === '646') {
        // OpenDSS's IEEE 13 file connects configuration 603 as phases c, b (Bus1=632.3.2),
        // which swaps Kersting's Z_bb and Z_cc; compare what the swap leaves unchanged
        const R = full(ref);
        const sum = (M: CMatrix) => M.get(1, 1).add(M.get(2, 2));
        expect(sum(Z).sub(sum(R)).abs()).toBeLessThan(2e-3);
        expect(Z.get(1, 2).sub(R.get(1, 2)).abs()).toBeLessThan(1.5e-3);
        return;
      }
      for (const ni of ref.nodes)
        for (const nj of ref.nodes) {
          const r = full(ref).get(ni - 1, nj - 1);
          const m = Z.get(ni - 1, nj - 1);
          // the regulator's small leakage impedance (OpenDSS) is the only element this model leaves out
          expect(m.sub(r).abs(), `${bus} Z[${ni}${nj}] ${m} vs ${r}`).toBeLessThan(2e-3 * Math.max(0.05, r.abs()) + 1.5e-3);
        }
    });
  }

  it('fault currents follow: a bolted fault on one phase is V / Z_pp', () => {
    const Z = theveninAt(net, '650', z650, '671')!;
    const V = [0, -120, 120].map((a) => Complex.polarDeg(2401.8, a));
    const I = feederFault(Z, V, 'slg', [0 as Phase]);
    expect(I[0].abs()).toBeCloseTo(V[0]!.div(Z.get(0, 0)).abs(), 9);
    const I3 = feederFault(Z, V, '3ph', [0, 1, 2]);
    // three-phase: balanced source, but IEEE 13's lines are untransposed, so the phases differ
    const m = I3.map((x) => x.abs());
    expect(Math.max(...m) / Math.min(...m)).toBeLessThan(1.3);
    const Ill = feederFault(Z, V, 'll', [1, 2]);
    expect(Ill[1].add(Ill[2]).abs()).toBeLessThan(1e-9);
    expect(Ill[1].abs()).toBeLessThan(I3[1]!.abs());
  });
});
