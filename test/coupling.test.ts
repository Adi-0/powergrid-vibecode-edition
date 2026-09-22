import { beforeAll, describe, expect, it } from 'vitest';
import { Grid, S_BASE } from '../src/model/grid';
import { runDay, type DayRun } from '../src/model/day';
import { makeFeeder, type Feeder } from '../src/model/feeder';
import { coupledSolve, COUPLING_BUS, type CoupledPoint } from '../src/model/coupling';
import { Complex } from '../src/physics/complex';
import { solveSweep } from '../src/physics/dist/sweep';
import { balancedSource, network, type DBranch } from '../src/physics/dist/network';

/**
 * Phase 2 done-condition: energy closes across the substation boundary — power
 * leaving the transmission bus equals power delivered at every meter plus every
 * loss in between — with the two models iterated to agreement.
 */
let grid: Grid;
let day: DayRun;
let feeder: Feeder;
const points = new Map<number, CoupledPoint>();
const HOURS = [16, 48, 76]; // 04:00, 12:00, 19:00

beforeAll(() => {
  grid = new Grid();
  day = runDay(grid);
  feeder = makeFeeder();
  for (const t of HOURS) {
    const base = day.points[t]!;
    points.set(t, coupledSolve(grid, base.step, grid.baseCase(), feeder, { participation: 'agc', warm: base.result, shuntSteps: base.shuntSteps }));
  }
}, 180_000);

const sumLoads = (cp: CoupledPoint, pred: (id: string) => boolean) => {
  let s = Complex.ZERO;
  for (const [id, v] of cp.feeder.result.loadS) if (pred(id)) s = s.add(v);
  return s;
};

describe('transmission–distribution coupling at Evergreen', () => {
  it('iterates to agreement in a few passes', () => {
    for (const t of HOURS) {
      const cp = points.get(t)!;
      expect(cp.op.status).toBe('converged');
      expect(cp.iterations).toBeLessThanOrEqual(6);
      expect(cp.lastChangeVA).toBeLessThan(1);
    }
  });

  it('closes energy across the boundary: substation input = every load + every loss − capacitor output', () => {
    for (const t of HOURS) {
      const cp = points.get(t)!;
      const r = cp.feeder.result;
      let capQ = 0;
      for (const q of r.capQ.values()) capQ += q;
      const rhs = sumLoads(cp, () => true).add(r.losses).sub(new Complex(0, capQ));
      expect(Math.abs(cp.boundaryS.re - rhs.re)).toBeLessThan(0.01); // W, out of ~10–20 MW
      expect(Math.abs(cp.boundaryS.im - rhs.im)).toBeLessThan(0.01);
    }
  });

  it('carries exactly that demand on the transmission bus, and transmission balances', () => {
    for (const t of HOURS) {
      const cp = points.get(t)!;
      expect(Math.abs(cp.op.balance!.residual.re * S_BASE)).toBeLessThan(1e-4);
      // the transmission solution's voltage at the bus is the source the feeder used
      const bi = grid.bus(COUPLING_BUS).index;
      expect(cp.history.at(-1)!.vPu).toBeCloseTo(cp.op.result.vm[bi]!, 9);
    }
  });

  it('closes energy at the feeder head: breaker CB-1105 = meters + grocery + feeder losses − capacitor', () => {
    for (const t of HOURS) {
      const cp = points.get(t)!;
      const r = cp.feeder.result;
      const head = r.branch.get('CB-1105')!.Sf;
      const meters = sumLoads(cp, (id) => !id.startsWith('OTHER'));
      let losses = Complex.ZERO;
      for (const [id, b] of r.branch) if (id !== 'EV-BANK' && id !== 'CB-1105') losses = losses.add(b.loss);
      const capQ = r.capQ.get('CAP-1')!;
      const rhs = meters.add(losses).sub(new Complex(0, capQ));
      expect(Math.abs(head.re - rhs.re)).toBeLessThan(0.01);
      expect(Math.abs(head.im - rhs.im)).toBeLessThan(0.01);
    }
  });

  it('keeps every meter within ANSI C84.1 Range A (114–126 V on the 120 V base)', () => {
    for (const t of HOURS) {
      const cp = points.get(t)!;
      for (const h of feeder.layout.homes) {
        const v = cp.feeder.result.V.get(h.meter)!;
        for (const leg of [v[0]!.abs(), v[1]!.abs()]) {
          expect(leg).toBeGreaterThan(114);
          expect(leg).toBeLessThan(126);
        }
      }
    }
  });
});

describe('element physics', () => {
  it('a Δ–grounded-wye step-down bank puts the low side 30° behind the high side (ANSI)', () => {
    const net = network(
      'H',
      [
        { id: 'H', kind: 'primary', phases: [0, 1, 2], vbaseLN: 60000 / Math.sqrt(3) },
        { id: 'L', kind: 'primary', phases: [0, 1, 2], vbaseLN: 12470 / Math.sqrt(3) },
      ],
      [{ kind: 'transformer', id: 'T', from: 'H', to: 'L', conn: 'DYg', kva: 30000, kvHighLL: 60, kvLowLL: 12.47, zpu: new Complex(0.004, 0.08) }],
      [],
      [],
    );
    const r = solveSweep(net, balancedSource(60000 / Math.sqrt(3)));
    const va = r.V.get('L')![0]!;
    expect(va.argDeg()).toBeCloseTo(-30, 9);
    expect(va.abs()).toBeCloseTo(12470 / Math.sqrt(3), 6);
  });

  it('a center-tapped transformer: ideal at no load, and its losses are I²R in each winding', () => {
    const ct: DBranch = { kind: 'centertap', id: 'T', from: 'P', to: 'S', phase: 0, kva: 50, kvPrimaryLN: 7.2, zpu: new Complex(0.012, 0.018) };
    const nodes = [
      { id: 'P', kind: 'primary' as const, phases: [0] as Array<0>, vbaseLN: 7200 },
      { id: 'S', kind: 'secondary' as const, phases: [0, 1] as Array<0 | 1>, vbaseLN: 120 },
    ];
    const src = balancedSource(7200);
    const noLoad = solveSweep(network('P', nodes, [ct], [], []), src);
    const v = noLoad.V.get('S')!;
    expect(v[0]!.abs()).toBeCloseTo(120, 9); // +120 V
    expect(v[1]!.sub(v[0]!.neg()).abs()).toBeLessThan(1e-9); // leg 2 = −leg 1
    // unbalanced load: 3 kW on leg 1, 1 kW on leg 2, 4 kW across 240 V
    const loaded = solveSweep(
      network('P', nodes, [ct], [
        { id: 'a', node: 'S', conn: 'L1N', phases: [], kw: 3, kvar: 0, model: 'PQ', vRated: 120 },
        { id: 'b', node: 'S', conn: 'L2N', phases: [], kw: 1, kvar: 0, model: 'PQ', vRated: 120 },
        { id: 'c', node: 'S', conn: 'L12', phases: [], kw: 4, kvar: 0, model: 'PQ', vRated: 240 },
      ], []),
      src,
    );
    const br = loaded.branch.get('T')!;
    const n = 7200 / 120;
    const z0r = 0.5 * 0.012 * (7200 * 7200) / 50000;
    const z1r = 0.012 * (120 * 120) / 50000;
    const I1 = br.It[0]!;
    const I2 = br.It[1]!;
    const IA = I1.sub(I2).scale(1 / n);
    const expectLoss = IA.abs2() * z0r + I1.abs2() * z1r + I2.abs2() * z1r;
    expect(br.loss.re).toBeCloseTo(expectLoss, 6);
    // and the primary current is (I1 − I2)/n: ampere-turns balance
    expect(br.If[0]!.sub(IA).abs()).toBeLessThan(1e-12);
  });
});
