import { beforeAll, describe, expect, it } from 'vitest';
import { Grid, S_BASE } from '../src/model/grid';
import { runDay, type DayRun } from '../src/model/day';
import { operate } from '../src/model/operate';
import { TECH } from '../src/data/tech';

/**
 * Phase 1 done-condition for the synthetic network: it converges at every interval
 * of the 24-hour profile, power balance holds to solver tolerance, it is broadly
 * N-1 secure at the peak, and its deliberately tight corridors are tight.
 */
let grid: Grid;
let day: DayRun;

beforeAll(() => {
  grid = new Grid();
  day = runDay(grid);
}, 120_000);

describe('synthetic California network: structure', () => {
  it('has roughly 40–80 transmission buses', () => {
    expect(grid.buses.length).toBeGreaterThanOrEqual(40);
    expect(grid.buses.length).toBeLessThanOrEqual(80);
  });

  it('has line constants in the textbook range for each voltage class', () => {
    for (const br of grid.branches) {
      if (!br.line) continue;
      const { constants: lc, zc, silMW } = br.line;
      const x = lc.z1.im; // Ω/km
      const b = lc.y1.im * 1e6; // µS/km
      if (br.kv === 500) {
        expect(x).toBeGreaterThan(0.25);
        expect(x).toBeLessThan(0.4);
        expect(zc).toBeGreaterThan(230);
        expect(zc).toBeLessThan(300);
        expect(silMW).toBeGreaterThan(800);
        expect(silMW).toBeLessThan(1100);
      } else if (br.kv === 230) {
        expect(x).toBeGreaterThan(0.3);
        expect(x).toBeLessThan(0.55);
        expect(zc).toBeGreaterThan(260);
        expect(zc).toBeLessThan(420);
      }
      expect(b).toBeGreaterThan(2.5);
      expect(b).toBeLessThan(6);
      // zero-sequence impedance is larger than positive (earth return)
      expect(lc.z0.im).toBeGreaterThan(2 * lc.z1.im);
    }
  });

  it('has inverter-based plants with no inertia and synchronous plants with some', () => {
    for (const g of grid.gens) {
      if (g.tech.synchronous) expect(g.tech.H_s).toBeGreaterThan(0);
      else expect(g.tech.H_s).toBe(0);
    }
    expect(TECH.solar_pv.synchronous).toBe(false);
  });
});

describe('the quasi-static day', () => {
  it('converges at every interval of the 24-hour profile', () => {
    expect(day.points).toHaveLength(96);
    const bad = day.points.filter((p) => p.status !== 'converged').map((p) => p.step.iv.startHour);
    expect(bad).toEqual([]);
  });

  it('balances power at every interval: generation = load + shunts + losses', () => {
    for (const p of day.points) {
      const b = p.balance!;
      expect(Math.abs(b.residual.re * S_BASE)).toBeLessThan(1e-4); // MW
      expect(Math.abs(b.residual.im * S_BASE)).toBeLessThan(1e-4); // MVAr
    }
  });

  it('keeps every branch within its normal rating and every bus within 0.95–1.07 pu', () => {
    for (const p of day.points) {
      p.flows.forEach((f) => expect(f.loading).toBeLessThanOrEqual(1.005));
      grid.buses.forEach((b, i) => {
        expect(p.result.vm[i]!).toBeGreaterThan(0.94);
        expect(p.result.vm[i]!).toBeLessThan(1.075);
      });
    }
  });

  it('has losses of a realistic 1–3 % of demand', () => {
    for (const p of day.points) {
      const f = p.lossesMW / p.step.netLoadMW;
      expect(f).toBeGreaterThan(0.01);
      expect(f).toBeLessThan(0.03);
    }
  });

  it('lets the duck curve emerge: midday net load far below the evening peak', () => {
    const net = day.points.map((p) => p.step.netLoadMW - p.step.solarMW - p.step.windMW);
    const noon = net[48]!;
    const evening = Math.max(...net.slice(68, 84));
    expect(noon).toBeLessThan(0.6 * evening);
    // storage charges in the belly and discharges on the neck
    const stor = (t: number) =>
      grid.gens.reduce((s, g, i) => s + (g.tech.id === 'battery' ? day.points[t]!.genMW[i]! : 0), 0);
    expect(stor(48)).toBeLessThan(-1000);
    expect(stor(78)).toBeGreaterThan(1000);
  });
});

describe('security at the evening peak (18:00)', () => {
  const T = 72;
  it('is broadly N-1 secure against emergency ratings, with the tight corridors tight', () => {
    const base = day.points[T]!;
    const pf0 = grid.baseCase();
    const insecure: string[] = [];
    const nosol: string[] = [];
    let total = 0;
    grid.branches.forEach((br, k) => {
      if (br.id.includes('GSU')) return;
      total++;
      const op = operate(grid, base.step, pf0, {
        participation: 'governor',
        branchOutages: new Set([k]),
        warm: base.result,
        shuntSteps: base.shuntSteps,
      });
      if (op.status !== 'converged') {
        nosol.push(br.id);
        return;
      }
      const worst = Math.max(...op.flows.map((f, j) => (f.loading * grid.branches[j]!.rateMVA) / grid.branches[j]!.rateEmergencyMVA));
      if (worst > 1.0) insecure.push(br.id);
    });
    // broadly secure: at least 95 % of single outages are within emergency ratings
    expect((total - insecure.length - nosol.length) / total).toBeGreaterThan(0.95);
    // the deliberately tight corridors: San Diego's imports
    expect(nosol).toContain('PALO_VERDE–IMPERIAL_VALLEY 500 #1');
    expect(insecure.some((id) => id.startsWith('SANTIAGO–SAN_ONOFRE'))).toBe(true);
  }, 120_000);
});
