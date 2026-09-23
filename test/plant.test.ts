import { beforeAll, describe, expect, it } from 'vitest';
import { Grid } from '../src/model/grid';
import { runDay, type DayRun } from '../src/model/day';
import { PLANTS } from '../src/data/ca/plants';
import { CCGT, ccgtBalance, ccgtDesign, ccgtSplit } from '../src/model/ccgt';

/**
 * Moss Landing Unit 1, a 2-on-1 combined cycle modelled unit by unit: the plant's energy
 * closes from fuel to the 230 kV bus at every interval it runs, and the design point
 * reproduces the heat rate in the data file.
 */
const rec = PLANTS.find((p) => p.id === 'ML1')!;
const d = ccgtDesign(rec);

describe('combined-cycle plant', () => {
  it('design point reproduces the data file’s heat rate and split', () => {
    const sp = ccgtSplit(d, rec.mw);
    expect(sp.gt).toBeCloseTo(d.gtMW, 9);
    expect(sp.st).toBeCloseTo(d.stMW, 9);
    const b = ccgtBalance(d, [sp.gt, sp.gt], sp.st, rec.mw);
    expect(b.heatRate).toBeCloseTo(rec.heatRate!, 6);
    // the implied steam cycle and gas turbines are in their textbook ranges
    expect(d.etaRankine).toBeGreaterThan(0.3);
    expect(d.etaRankine).toBeLessThan(0.4);
    const etaGt = d.gtMW / d.gtFuelLhv;
    expect(etaGt).toBeGreaterThan(0.34);
    expect(etaGt).toBeLessThan(0.42);
  });

  it('part load: split adds up, the steam share rises, the heat rate worsens', () => {
    let lastHr = 0;
    for (const f of [1, 0.8, 0.6, 0.45]) {
      const P = rec.mw * f;
      const sp = ccgtSplit(d, P);
      expect(2 * sp.gt + sp.st).toBeCloseTo(P, 9);
      expect(sp.st / P).toBeGreaterThanOrEqual(d.stMW / rec.mw - 1e-12);
      const hr = ccgtBalance(d, [sp.gt, sp.gt], sp.st, P).heatRate;
      expect(hr).toBeGreaterThan(lastHr);
      lastHr = hr;
    }
  });

  describe('on the solved day', () => {
    let g: Grid;
    let day: DayRun;
    beforeAll(() => {
      g = new Grid();
      day = runDay(g);
    }, 120_000);

    it('energy closes from fuel to the 230 kV bus; transformer losses are the power flow’s own', () => {
      const gens = g.gens.filter((x) => x.plant.id === 'ML1');
      const gsus = g.branches.filter((b) => b.id.startsWith('ML1-'));
      expect(gens.length).toBe(3);
      expect(gsus.length).toBe(3);
      let running = 0;
      for (const op of day.points) {
        const pg = gens.map((x) => op.result.pg[x.index]! * 100);
        if (pg.every((v) => v < 1e-6)) continue;
        running++;
        // from = 230 kV bus: power delivered into the 230 kV bus is −P entering at that end
        const net = gsus.reduce((a, b) => a - op.flows[b.index]!.Sf.re * 100, 0);
        const gsuLoss = gsus.reduce((a, b) => a + op.flows[b.index]!.loss.re * 100, 0);
        const gt = gens.filter((x) => x.unitId !== 'ST').map((x) => op.result.pg[x.index]! * 100);
        const st = op.result.pg[gens.find((x) => x.unitId === 'ST')!.index]! * 100;
        const b = ccgtBalance(d, gt, st, net);
        expect(b.gsuLoss).toBeCloseTo(gsuLoss, 6);
        expect(Math.abs(b.residual)).toBeLessThan(1e-9);
        expect(b.fuelHhv).toBeCloseTo(b.netMW + b.gsuLoss + b.generatorLoss + b.stack + b.latent + b.condenser, 9);
        expect(b.latent / b.fuelHhv).toBeCloseTo(1 - 1 / CCGT.hhvOverLhv, 12);
        expect(b.heatRate).toBeGreaterThan(rec.heatRate! - 1);
        expect(b.heatRate).toBeLessThan(rec.heatRate! * 1.3);
        // the steam turbine only follows (no governor), so what it makes still matches the heat it gets
        expect(b.etaRankineNow).toBeCloseTo(d.etaRankine, 1);
      }
      expect(running).toBeGreaterThan(0);
    });
  });
});
