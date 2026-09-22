import { describe, expect, it } from 'vitest';
import { solveLP } from '../src/physics/lp';

describe('linear programming (two-phase simplex)', () => {
  it('solves a textbook LP and returns its shadow prices', () => {
    // max 3x + 5y  s.t. x ≤ 4, 2y ≤ 12, 3x + 2y ≤ 18  (optimum x=2, y=6, value 36)
    const r = solveLP({ c: [-3, -5], Aub: [[1, 0], [0, 2], [3, 2]], bub: [4, 12, 18], lb: [0, 0], ub: [Infinity, Infinity] });
    expect(r.status).toBe('optimal');
    expect(r.x[0]).toBeCloseTo(2, 9);
    expect(r.x[1]).toBeCloseTo(6, 9);
    expect(r.objective).toBeCloseTo(-36, 9);
    // shadow prices of the max problem are (0, 1.5, 1); for the min they flip sign
    expect(r.dualUb[0]).toBeCloseTo(0, 9);
    expect(r.dualUb[1]).toBeCloseTo(-1.5, 9);
    expect(r.dualUb[2]).toBeCloseTo(-1, 9);
  });

  it('dispatches two units in merit order; the equality dual is the marginal cost', () => {
    // cheap unit 20 $/MWh up to 100 MW, dear unit 50 $/MWh up to 200 MW, demand 150 MW
    const r = solveLP({ c: [20, 50], Aeq: [[1, 1]], beq: [150], lb: [0, 0], ub: [100, 200] });
    expect(r.x[0]).toBeCloseTo(100, 9);
    expect(r.x[1]).toBeCloseTo(50, 9);
    expect(r.dualEq[0]).toBeCloseTo(50, 9);
  });

  it('prices congestion: a binding line limit separates the two ends', () => {
    // Two buses. Cheap unit at A (20), dear unit at B (50), load 150 at B.
    // Line A→B limited to 80 MW: flow = pA. So pA ≤ 80, pA + pB = 150.
    const r = solveLP({ c: [20, 50], Aeq: [[1, 1]], beq: [150], Aub: [[1, 0]], bub: [80], lb: [0, 0], ub: [100, 200] });
    expect(r.x[0]).toBeCloseTo(80, 9);
    expect(r.x[1]).toBeCloseTo(70, 9);
    expect(r.dualEq[0]).toBeCloseTo(50, 9); // price at B (the load's bus, set by the dear unit)
    expect(r.dualUb[0]).toBeCloseTo(-30, 9); // one more MW of line capacity saves 50 − 20
  });

  it('handles negative right-hand sides and lower bounds', () => {
    // min x + y s.t. x + y ≥ 5 (as −x − y ≤ −5), 1 ≤ x ≤ 3, 0 ≤ y ≤ 10
    const r = solveLP({ c: [1, 2], Aub: [[-1, -1]], bub: [-5], lb: [1, 0], ub: [3, 10] });
    expect(r.status).toBe('optimal');
    expect(r.x[0]).toBeCloseTo(3, 9);
    expect(r.x[1]).toBeCloseTo(2, 9);
    // loosening to x + y ≥ 4 lets y drop by 1 at 2 $ each: the dual is −2
    expect(r.dualUb[0]).toBeCloseTo(-2, 9);
  });

  it('reports infeasibility', () => {
    const r = solveLP({ c: [1], Aeq: [[1]], beq: [5], lb: [0], ub: [3] });
    expect(r.status).toBe('infeasible');
  });
});
