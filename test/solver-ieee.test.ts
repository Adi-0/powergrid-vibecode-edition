/**
 * Solver validation against the published IEEE reference systems.
 *
 * Three independent lines of evidence, because no single one is sufficient:
 *
 *  1. The Newton–Raphson residual itself. After convergence, substituting the
 *     solution back into the power-flow equations must leave a mismatch far
 *     below 1e-6 per-unit. This proves the answer satisfies the equations.
 *  2. Agreement with a structurally different algorithm. Gauss–Seidel shares
 *     no Jacobian, no factorisation and no update rule with Newton–Raphson, so
 *     agreement to 1e-6 is evidence that both implement the same physics.
 *  3. Agreement with the published bus tables, to the precision those tables
 *     carry. See docs/decisions/0003-ieee-reference-tolerances.md for why the
 *     IEEE 30-bus table is reproduced less tightly than the 14-bus one.
 */

import { describe, it, expect } from 'vitest';
import { fromMatpower, MatpowerCase } from '../src/data/matpower.js';
import { IEEE14 } from '../src/data/ieee14.js';
import { IEEE30 } from '../src/data/ieee30.js';
import { solvePowerFlow } from '../src/core/powerflow.js';
import { solveGaussSeidel } from '../src/core/gauss-seidel.js';
import { analyse } from '../src/core/results.js';

/** Tolerances against the published tables, per case. See decision 0003. */
const PUBLISHED_TOLERANCE: Record<string, { vpu: number; angleDeg: number; why: string }> = {
  ieee14: {
    vpu: 2e-3,
    angleDeg: 3e-2,
    why: 'Published table is rounded to 3 dp / 2 dp; this is that rounding.',
  },
  ieee30: {
    vpu: 5e-3,
    angleDeg: 1.0,
    why:
      'The published bus table of case_ieee30.m is not self-consistent with its ' +
      'own generator records — bus 2 is listed at 1.043 pu while the generator ' +
      'at bus 2 sets 1.045 pu, and a PV bus sits at its setpoint by definition. ' +
      'The table is the historical IEEE report solution, not a solve of this ' +
      'exact data. Agreement is therefore asserted loosely here and tightly in ' +
      'the cross-method test, which does not depend on the table.',
  },
};

describe.each([IEEE14, IEEE30])('$name', (mc: MatpowerCase) => {
  const net = fromMatpower(mc);
  const pf = solvePowerFlow(net, { tol: 1e-12, enforceQLimits: false, flatStart: true });

  it('converges from a flat start', () => {
    expect(pf.converged).toBe(true);
    expect(pf.iterations).toBeLessThanOrEqual(10);
  });

  it('leaves a power-flow residual far below 1e-6 per-unit', () => {
    expect(pf.finalMismatch).toBeLessThan(1e-6);
    expect(pf.finalMismatch).toBeLessThan(1e-10);
  });

  it('agrees with an independent Gauss–Seidel solve to 1e-6', () => {
    const gs = solveGaussSeidel(net, { tol: 1e-11 });
    expect(gs.converged).toBe(true);
    for (let i = 0; i < pf.vm.length; i++) {
      expect(Math.abs(pf.vm[i] - gs.vm[i])).toBeLessThan(1e-6);
      expect(Math.abs(pf.va[i] - gs.va[i])).toBeLessThan(1e-6);
    }
  });

  it('holds every PV and slack bus exactly at its scheduled voltage', () => {
    net.buses.forEach((b, i) => {
      if (b.type === 'PQ') return;
      expect(Math.abs(pf.vm[i] - b.vSched!)).toBeLessThan(1e-12);
    });
  });

  it('reproduces the published bus table within its stated precision', () => {
    const tol = PUBLISHED_TOLERANCE[mc.id];
    const ref = mc.reference!;
    pf.vm.forEach((v, i) => {
      expect(Math.abs(v - ref.voltages[i][0]),
        `bus ${net.buses[i].id} |V|: ${tol.why}`).toBeLessThan(tol.vpu);
      const deg = (pf.va[i] * 180) / Math.PI;
      expect(Math.abs(deg - ref.voltages[i][1]),
        `bus ${net.buses[i].id} angle: ${tol.why}`).toBeLessThan(tol.angleDeg);
    });
  });
});

describe('IEEE 14-bus published loss figure', () => {
  it('total real loss is 13.393 MW', () => {
    const net = fromMatpower(IEEE14);
    const sc = analyse(net, solvePowerFlow(net, { tol: 1e-12, enforceQLimits: false }));
    expect(sc.system.pLossMW).toBeCloseTo(13.393, 2);
  });
});
