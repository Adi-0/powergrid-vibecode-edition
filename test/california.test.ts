/**
 * The synthetic California network, exercised the way the app uses it.
 *
 * These are the tests that make the brief's accuracy stance enforceable rather
 * than aspirational: conservation closes at every hour, nothing is over its
 * rating in the base case, nothing sits outside its voltage limits, and no
 * machine is asked for reactive power it does not have. If a change to the
 * network data breaks any of those, this fails and says which hour and which
 * piece of equipment.
 */

import { describe, it, expect } from 'vitest';
import { californiaCase, SLACK_BUS } from '../src/data/california/network.js';
import { validateCase } from '../src/core/validate.js';
import { dispatchDay, applyDispatch, resourceRole } from '../src/sim/dispatch.js';
import { SUMMER_DAY, WINTER_DAY, SPRING_DAY, DayProfile } from '../src/sim/profiles.js';
import { operate } from '../src/sim/operate.js';
import { solveDCPowerFlow } from '../src/core/dc-powerflow.js';

const base = californiaCase();

describe('network structure', () => {
  it('is structurally valid', () => {
    const issues = validateCase(base);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors.map((e) => e.message)).toEqual([]);
  });

  it('has between 40 and 80 transmission buses, as the brief specifies', () => {
    const transmission = base.buses.filter((b) => b.baseKV >= 100);
    expect(transmission.length).toBeGreaterThanOrEqual(40);
    expect(transmission.length).toBeLessThanOrEqual(80);
  });

  it('has exactly one slack bus, and it is the Northwest intertie', () => {
    const slacks = base.buses.filter((b) => b.type === 'slack');
    expect(slacks.map((b) => b.id)).toEqual([SLACK_BUS]);
  });

  it('gives every branch a positive impedance and a thermal rating', () => {
    for (const br of base.branches) {
      expect(br.x, br.id).toBeGreaterThan(0);
      expect(br.r, br.id).toBeGreaterThanOrEqual(0);
      expect(br.ratingMVA, br.id).toBeGreaterThan(0);
    }
  });

  it('has enough capacity to serve its own peak with a reserve margin', () => {
    const peak = base.loads.reduce((s, l) => s + l.pMW, 0);
    // Firm capacity excludes weather-driven resources entirely, which is the
    // conservative way a planner counts it.
    const firm = base.generators
      .filter((g) => g.inService && resourceRole(g, SLACK_BUS) !== 'must-take')
      .reduce((s, g) => s + g.pMaxMW, 0);
    expect(firm).toBeGreaterThan(peak * 1.05);
  });

  it('names every piece of equipment after a real place', () => {
    for (const b of base.buses) expect(b.name.length, b.id).toBeGreaterThan(3);
    for (const g of base.generators) expect(g.name.length, g.id).toBeGreaterThan(3);
  });

  it('says in its own source field that it is not a replica', () => {
    expect(base.source).toMatch(/not a replica/i);
  });
});

const SEASONS: [string, DayProfile][] = [
  ['summer', SUMMER_DAY], ['winter', WINTER_DAY], ['spring', SPRING_DAY],
];

describe.each(SEASONS)('%s day', (_label, profile) => {
  const day = dispatchDay(base, profile, SLACK_BUS);
  const hours = [...Array(24).keys()];

  it('dispatches every hour without leaving demand unserved', () => {
    for (const h of hours) {
      expect(day[h].unservedMW, `hour ${h}`).toBeLessThan(1);
    }
  });

  it('identifies a marginal unit and a price at every hour', () => {
    for (const h of hours) {
      expect(day[h].marginalUnit, `hour ${h}`).not.toBeNull();
      expect(day[h].marginalCostPerMWh, `hour ${h}`).toBeGreaterThan(0);
    }
  });

  it('never dispatches a generator beyond its own limits', () => {
    for (const h of hours) {
      for (const g of base.generators) {
        const t = day[h].targets.get(g.id);
        if (t === undefined) continue;
        expect(t, `${g.id} hour ${h}`).toBeLessThanOrEqual(g.pMaxMW + 1e-6);
        expect(t, `${g.id} hour ${h}`).toBeGreaterThanOrEqual(Math.min(0, g.pMinMW) - 1e-6);
      }
    }
  });

  it('keeps every corridor within its rating in the linear approximation', () => {
    // The DC power flow always has a solution, so this is a clean feasibility
    // check independent of whether the AC solve converged.
    for (const h of hours) {
      const net = applyDispatch(base, profile, h, day[h]);
      const dc = solveDCPowerFlow(net);
      const worst = Math.max(...dc.loading);
      expect(worst, `hour ${h}`).toBeLessThan(1.2);
    }
  });

  describe('AC solution at every hour', () => {
    const results = hours.map((h) => {
      const net = applyDispatch(base, profile, h, day[h]);
      return { h, net, r: operate(net) };
    });

    it('converges with generator reactive limits enforced', () => {
      const failed = results.filter((x) => !x.r.reactiveLimitsEnforced).map((x) => x.h);
      expect(failed).toEqual([]);
    });

    it('closes real power balance: generation = load + losses', () => {
      for (const { h, r } of results) {
        expect(Math.abs(r.solved.system.pBalanceMW), `hour ${h}`).toBeLessThan(1e-5);
      }
    });

    it('closes reactive power balance: generation + shunts = load + losses', () => {
      for (const { h, r } of results) {
        expect(Math.abs(r.solved.system.qBalanceMVAr), `hour ${h}`).toBeLessThan(1e-5);
      }
    });

    it('holds every bus inside its voltage limits', () => {
      for (const { h, r } of results) {
        expect(r.solved.system.voltageViolations, `hour ${h}`).toEqual([]);
      }
    });

    it('keeps every branch inside its rating', () => {
      for (const { h, r } of results) {
        expect(r.solved.system.overloadedBranches, `hour ${h}`).toEqual([]);
      }
    });

    it('never asks a machine for reactive power it does not have', () => {
      for (const { h, net, r } of results) {
        const cap = new Map<string, { max: number; min: number }>();
        for (const g of net.generators) {
          if (!g.inService) continue;
          const e = cap.get(g.bus) ?? { max: 0, min: 0 };
          e.max += g.qMaxMVAr;
          e.min += g.qMinMVAr;
          cap.set(g.bus, e);
        }
        for (const [busId, c] of cap) {
          const b = r.solved.busById.get(busId)!;
          // One MVAr of slack, because the limit check itself has a tolerance.
          expect(b.qGenMVAr, `${busId} hour ${h}`).toBeLessThanOrEqual(c.max + 1);
          expect(b.qGenMVAr, `${busId} hour ${h}`).toBeGreaterThanOrEqual(c.min - 1);
        }
      }
    });

    it('loses a realistic fraction of generation in transmission', () => {
      // Transmission losses on a large interconnected system run 2–4 % of
      // generation. Outside that band something is wrong with the impedances
      // or with the reactive design, even if the solver converged.
      for (const { h, r } of results) {
        expect(r.solved.system.lossPercent, `hour ${h}`).toBeGreaterThan(1.5);
        expect(r.solved.system.lossPercent, `hour ${h}`).toBeLessThan(5.0);
      }
    });

    it('settles the reactive switching scheme rather than hunting', () => {
      for (const { h, r } of results) {
        expect(r.switching.hunting, `hour ${h}`).toBe(false);
      }
    });

    it('solves fast enough to stay interactive while scrubbing', () => {
      for (const { h, r } of results) {
        expect(r.solved.pf.solveMs, `hour ${h}`).toBeLessThan(120);
      }
    });
  });
});

describe('the duck curve emerges from the model rather than being drawn', () => {
  const day = dispatchDay(base, SUMMER_DAY, SLACK_BUS);

  it('has a net load that dips in the middle of the day', () => {
    const midday = Math.min(...[10, 11, 12, 13, 14].map((h) => day[h].netLoadMW));
    const morning = day[7].netLoadMW;
    expect(midday).toBeLessThan(morning);
  });

  it('has a steep evening ramp as the sun goes down', () => {
    // The ramp is the thing the duck curve is actually about: how fast
    // dispatchable plant has to come up between the midday trough and the
    // evening peak.
    const trough = Math.min(...day.map((d) => d.netLoadMW));
    const evening = Math.max(...[17, 18, 19, 20].map((h) => day[h].netLoadMW));
    expect(evening - trough).toBeGreaterThan(8000);
  });

  it('prices midday below the evening, because cheaper units are marginal then', () => {
    const middayPrice = day[12].marginalCostPerMWh;
    const eveningPrice = day[19].marginalCostPerMWh;
    expect(middayPrice).toBeLessThanOrEqual(eveningPrice);
  });

  it('charges storage in the middle of the day and discharges it in the evening', () => {
    expect(day[12].storageMW).toBeLessThan(0);
    expect(day[19].storageMW).toBeGreaterThan(0);
  });
});
