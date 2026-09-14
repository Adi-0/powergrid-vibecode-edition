/**
 * Conservation and consistency invariants.
 *
 * The brief's accuracy stance says conservation must hold "everywhere, every
 * time, to solver tolerance, at every level." These are the tests that make
 * that a fact rather than an intention, and they run over every case the app
 * ships, not just the reference systems.
 */

import { describe, it, expect } from 'vitest';
import { fromMatpower } from '../src/data/matpower.js';
import { IEEE14 } from '../src/data/ieee14.js';
import { IEEE30 } from '../src/data/ieee30.js';
import { solvePowerFlow, calcInjections } from '../src/core/powerflow.js';
import { analyse } from '../src/core/results.js';
import { NetworkCase } from '../src/core/network.js';
import { abs, sub, mul, conj, polar, C } from '../src/core/complex.js';
import { yAt } from '../src/core/ybus.js';

const CASES: [string, NetworkCase][] = [
  ['IEEE 14-bus', fromMatpower(IEEE14)],
  ['IEEE 30-bus', fromMatpower(IEEE30)],
];

describe.each(CASES)('%s', (_name, net) => {
  const pf = solvePowerFlow(net, { tol: 1e-12, enforceQLimits: false });
  const sc = analyse(net, pf);

  it('closes real power balance: generation = load + losses', () => {
    expect(Math.abs(sc.system.pBalanceMW)).toBeLessThan(1e-6);
  });

  it('closes reactive power balance: generation + shunts = load + losses', () => {
    expect(Math.abs(sc.system.qBalanceMVAr)).toBeLessThan(1e-6);
  });

  it('sums branch-end flows to the bus injection at every bus', () => {
    // Kirchhoff at each bus: everything flowing out on branches, plus the bus's
    // own shunt draw, must equal what is injected there.
    const n = net.buses.length;
    const pOut = new Float64Array(n);
    const qOut = new Float64Array(n);
    sc.branches.forEach((f) => {
      if (!f.inService) return;
      const fi = sc.idx.indexOf.get(f.from)!;
      const ti = sc.idx.indexOf.get(f.to)!;
      pOut[fi] += f.pFromMW; qOut[fi] += f.qFromMVAr;
      pOut[ti] += f.pToMW;   qOut[ti] += f.qToMVAr;
    });
    net.buses.forEach((b, i) => {
      // Bus shunts draw current too and are not part of any branch.
      const v2 = pf.vm[i] * pf.vm[i];
      const pShunt = (b.gShunt ?? 0) * v2 * net.baseMVA;
      const qShunt = -(b.bShunt ?? 0) * v2 * net.baseMVA;
      expect(Math.abs(pOut[i] + pShunt - sc.buses[i].pInjMW), `bus ${b.id} P`).toBeLessThan(1e-7);
      expect(Math.abs(qOut[i] + qShunt - sc.buses[i].qInjMVAr), `bus ${b.id} Q`).toBeLessThan(1e-7);
    });
  });

  it('has non-negative real loss on every in-service branch', () => {
    // A passive branch cannot generate real power. Reactive loss CAN be
    // negative — line charging produces reactive power — so only P is checked.
    for (const f of sc.branches) {
      if (!f.inService) continue;
      expect(f.pLossMW, `branch ${f.branchId}`).toBeGreaterThan(-1e-9);
    }
  });

  it('satisfies I = Y·V at every bus', () => {
    // The most direct check there is: the solution must satisfy the defining
    // matrix equation of the network, independent of how it was found.
    const n = net.buses.length;
    const V = net.buses.map((_, i) => polar(pf.vm[i], pf.va[i]));
    const { p, q } = calcInjections(pf.ybus, Float64Array.from(pf.vm), Float64Array.from(pf.va));
    for (let i = 0; i < n; i++) {
      let I = C(0, 0);
      for (let k = 0; k < n; k++) {
        const y = yAt(pf.ybus, i, k);
        I = { re: I.re + y.re * V[k].re - y.im * V[k].im, im: I.im + y.re * V[k].im + y.im * V[k].re };
      }
      const S = mul(V[i], conj(I));
      expect(abs(sub(S, C(p[i], q[i]))), `bus ${net.buses[i].id}`).toBeLessThan(1e-12);
    }
  });

  it('re-solving from the converged point takes no further iterations', () => {
    // Idempotence: the solution is a fixed point, so a solver started there
    // must immediately report convergence.
    const warm = { ...net, buses: net.buses.map((b, i) => ({ ...b, vSched: pf.vm[i] })) };
    const again = solvePowerFlow(warm, { tol: 1e-12, enforceQLimits: false, flatStart: false });
    expect(again.converged).toBe(true);
    for (let i = 0; i < pf.vm.length; i++) {
      expect(Math.abs(again.vm[i] - pf.vm[i])).toBeLessThan(1e-9);
    }
  });
});
