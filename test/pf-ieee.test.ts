import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cloneCase, fromMatpower } from '../src/physics/pf/case';
import { solveAC } from '../src/physics/pf/acpf';
import { branchFlows, powerBalance } from '../src/physics/pf/flows';
import { RAD } from '../src/physics/complex';

interface Fixture {
  case: string;
  tool: string;
  tool_version: string;
  baseMVA: number;
  bus: number[][];
  branch: number[][];
  gen: number[][];
  published: { vm_pu: number[]; va_deg: number[]; carries_solution: boolean };
  result: {
    vm_pu: number[];
    va_deg: number[];
    gen_pg_mw: number[];
    gen_qg_mvar: number[];
    branch_pf_mw: number[];
    branch_qf_mvar: number[];
    branch_pt_mw: number[];
    branch_qt_mvar: number[];
  };
}

const load = (name: string): Fixture =>
  JSON.parse(readFileSync(new URL(`./fixtures/pf-${name}.json`, import.meta.url), 'utf8'));

// Reference and implementation read identical per-unit data and both converge to
// ~1e-10, so these tolerances are well inside what the reference supports.
const TOL_V = 1e-6; // pu
const TOL_A = 1e-4; // degrees
const TOL_P = 1e-4; // MW / MVAr

for (const name of ['case14', 'case30', 'case_ieee30']) {
  describe(`IEEE ${name} vs pandapower`, () => {
    const fx = load(name);
    const pc = fromMatpower(fx);
    const r = solveAC(pc, { slack: 'single', enforceQLimits: false, enforcePLimits: false, tol: 1e-11, record: true });

    it('converges in a handful of Newton iterations', () => {
      expect(r.status).toBe('converged');
      expect(r.islands[0]!.iterations.length).toBeLessThanOrEqual(8);
    });

    it('matches bus voltage magnitudes and angles', () => {
      fx.result.vm_pu.forEach((v, i) => expect(Math.abs(r.vm[i]! - v)).toBeLessThan(TOL_V));
      fx.result.va_deg.forEach((a, i) => expect(Math.abs(r.va[i]! * RAD - a)).toBeLessThan(TOL_A));
    });

    it('matches generator outputs', () => {
      fx.result.gen_pg_mw.forEach((p, i) => expect(Math.abs(r.pg[i]! * fx.baseMVA - p)).toBeLessThan(TOL_P));
      fx.result.gen_qg_mvar.forEach((q, i) => expect(Math.abs(r.qg[i]! * fx.baseMVA - q)).toBeLessThan(TOL_P));
    });

    it('matches branch flows at both ends', () => {
      const f = branchFlows(pc, r);
      f.forEach((b, k) => {
        expect(Math.abs(b.Sf.re * fx.baseMVA - fx.result.branch_pf_mw[k]!)).toBeLessThan(TOL_P);
        expect(Math.abs(b.Sf.im * fx.baseMVA - fx.result.branch_qf_mvar[k]!)).toBeLessThan(TOL_P);
        expect(Math.abs(b.St.re * fx.baseMVA - fx.result.branch_pt_mw[k]!)).toBeLessThan(TOL_P);
        expect(Math.abs(b.St.im * fx.baseMVA - fx.result.branch_qt_mvar[k]!)).toBeLessThan(TOL_P);
      });
    });

    it('closes the books: generation = load + shunts + losses', () => {
      const b = powerBalance(pc, r);
      expect(Math.abs(b.residual.re)).toBeLessThan(1e-9);
      expect(Math.abs(b.residual.im)).toBeLessThan(1e-9);
    });

    if (fx.published.carries_solution) {
      it('agrees with the solution published in the case file, to its printed precision', () => {
        // Published |V| is printed to 3 decimals and angles to 2, but the original
        // study's solution is not reproducible from the published data: MATPOWER's
        // and pandapower's solutions differ from it by up to 1.3e-3 pu / 0.02° (IEEE 14)
        // and 2.0e-3 pu / 0.43° (IEEE 30). This is a coarse sanity check only; the
        // tight check is against pandapower above.
        const tolA = name === 'case_ieee30' ? 0.5 : 0.05;
        fx.published.vm_pu.forEach((v, i) => expect(Math.abs(r.vm[i]! - v)).toBeLessThan(2.5e-3));
        fx.published.va_deg.forEach((a, i) => expect(Math.abs(r.va[i]! * RAD - a)).toBeLessThan(tolA));
      });
    }
  });
}

describe('distributed slack on IEEE 14', () => {
  const pc = fromMatpower(load('case14'));
  pc.gens.forEach((g) => {
    g.participation = 1;
    g.pmax = 10;
    g.pmin = -10;
  });
  // The fixture's slack row holds its solved output; schedule it at zero so there
  // is a real imbalance (~232 MW plus losses) for the governors to share.
  pc.gens[0]!.pg = 0;

  it('shares the imbalance among all participating units and still balances', () => {
    const r = solveAC(pc, { slack: 'distributed', enforceQLimits: false, tol: 1e-11 });
    expect(r.status).toBe('converged');
    // each unit moves by the same amount (equal participation)
    const d = pc.gens.map((g, i) => r.pg[i]! - g.pg);
    for (const x of d) expect(x).toBeCloseTo(d[0]!, 9);
    expect(d[0]!).toBeGreaterThan(0);
    const b = powerBalance(pc, r);
    expect(Math.abs(b.residual.re)).toBeLessThan(1e-9);
  });

  it('pins units at their limit and moves the rest of the imbalance to the others', () => {
    const c2 = cloneCase(pc);
    c2.gens[1]!.pmax = c2.gens[1]!.pg + 0.01; // unit at bus 2 has only 1 MW of headroom
    c2.gens[1]!.pmin = 0;
    const r = solveAC(c2, { slack: 'distributed', enforceQLimits: false, tol: 1e-11 });
    expect(r.status).toBe('converged');
    expect(r.pg[1]!).toBeCloseTo(c2.gens[1]!.pmax, 9);
    expect(Math.abs(powerBalance(c2, r).residual.re)).toBeLessThan(1e-9);
  });

  it('reports insufficient generation when every governor runs out of headroom', () => {
    const c3 = cloneCase(pc);
    c3.gens.forEach((g) => (g.pmax = g.pg + 0.01));
    const r = solveAC(c3, { slack: 'distributed', enforceQLimits: false });
    expect(r.status).toBe('insufficient-generation');
    expect(r.islands[0]!.reason).toMatch(/no steady operating point/);
  });
});

describe('no steady-state solution is an answer', () => {
  it('an island with load and no source is dark, not a low-voltage solution', () => {
    const pc = fromMatpower(load('case14'));
    // bus 14 (index 13) connects only through 9–14 and 13–14
    pc.branches.forEach((br) => {
      if (br.to === 13 || br.from === 13) br.inService = false;
    });
    const r = solveAC(pc, { slack: 'single', enforceQLimits: false });
    expect(r.status).toBe('no-source');
    expect(r.energized[13]).toBe(0);
    expect(r.vm[13]).toBe(0);
    expect(r.islands).toHaveLength(2);
    expect(r.islands[0]!.status).toBe('converged');
  });

  it('loading far past the nose of the P–V curve gives no solution, never a number', () => {
    const pc = fromMatpower(load('case14'));
    pc.buses.forEach((b) => {
      b.pd *= 6;
      b.qd *= 6;
    });
    const r = solveAC(pc, { slack: 'single', enforceQLimits: false });
    expect(r.status).not.toBe('converged');
    expect(['diverged', 'singular', 'max-iterations']).toContain(r.status);
    expect(r.islands[0]!.reason).toBeTruthy();
    expect(r.energized.every((e) => e === 0)).toBe(true);
  });
});
