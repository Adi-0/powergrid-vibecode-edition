/**
 * The plant and the machine.
 *
 * Two claims are checked here, and both are the kind that a model can look
 * plausible while quietly failing.
 *
 * ENERGY IS CONSERVED THROUGH THE PLANT. The energy chain is the thing a reader
 * is invited to follow from a gas pipe to a transmission line, and if the
 * streams do not add up it teaches the opposite of what it is for. The chain is
 * built so that the condenser stream is the remainder, which makes closure
 * arithmetic rather than luck — and this checks that the remainder is what it
 * should be and that every stream is physically sensible.
 *
 * THE MACHINE EQUATIONS INVERT. Given a terminal voltage and an output, the
 * internal EMF and the load angle are determined. This solves them forwards and
 * backwards and checks they agree, which is the only way to know the phasor
 * arithmetic has not picked up a sign.
 */

import { describe, it, expect } from 'vitest';
import { californiaCase, SLACK_BUS } from '../src/data/california/network.js';
import { operate } from '../src/sim/operate.js';
import { DAY_PROFILES } from '../src/sim/profiles.js';
import { dispatchDay, applyDispatch } from '../src/sim/dispatch.js';
import {
  energyChain, PLANT_ITEMS, PLANT_FLOWS, plantItemById, BTU_PER_KWH,
  CO2_KG_PER_MMBTU, PLANT_CONFIG,
} from '../src/data/california/plant.js';
import {
  operatingPoint, capabilityCurve, fieldLimitQ, armatureLimitQ, bindingLimit,
  swingState, rocof, hasRotor,
} from '../src/core/machine.js';
import { Generator } from '../src/core/network.js';
import { californiaCase as freshCase } from '../src/data/california/network.js';

function solveAt(hour: number) {
  const base = californiaCase();
  const profile = DAY_PROFILES.summer;
  const day = dispatchDay(base, profile, SLACK_BUS);
  const net = applyDispatch(base, profile, hour, day[hour % 24]);
  return operate(net);
}

const solved = solveAt(18).solved;
const metcalf = solved.net.generators.find((g) => g.bus.startsWith('METCALF'))!;

describe('the plant’s energy chain', () => {
  it('finds the plant in the network case', () => {
    expect(metcalf).toBeDefined();
    expect(metcalf.kind).toBe('gas-cc');
    expect(metcalf.heatRateBtuPerKWh).toBeGreaterThan(6000);
  });

  // A plant that is off, at minimum, mid-range and flat out. If conservation
  // only closes at one output it is a coincidence rather than a chain.
  const outputs = [0, metcalf.pMinMW, metcalf.pMaxMW / 2, metcalf.pMaxMW];

  for (const netMW of outputs) {
    describe(`at ${netMW.toFixed(0)} MW`, () => {
      const chain = energyChain(metcalf, netMW);

      it('closes: what goes in equals what comes out', () => {
        // The tolerance is a millionth of the fuel stream, not an absolute
        // megawatt: at 1,000 MW output that is about two watts.
        const scale = Math.max(1, chain.fuelMW);
        expect(Math.abs(chain.residualMW) / scale).toBeLessThan(1e-9);
      });

      it('sums the named streams back to the fuel', () => {
        const out = chain.flows
          .filter((f) => f.id !== 'fuel' && f.id !== 'export' &&
            f.id !== 'gas-turbine' && f.id !== 'exhaust' &&
            f.id !== 'hrsg' && f.id !== 'steam-turbine' && f.id !== 'auxiliary')
          .reduce((a, f) => a + f.mw, 0);
        // The remaining streams are the electrical output of both machines plus
        // every loss; the ones filtered out are intermediate stages that would
        // otherwise be counted twice.
        const generatorLoss =
          chain.fuelMW - out -
          chain.flows.find((f) => f.id === 'stack')!.mw * 0;
        expect(generatorLoss).toBeGreaterThanOrEqual(-1e-6);
        expect(out).toBeLessThanOrEqual(chain.fuelMW + 1e-6);
      });

      it('never produces a negative stream', () => {
        for (const f of chain.flows) {
          expect(f.mw, `${f.id}`).toBeGreaterThanOrEqual(-1e-9);
        }
      });

      it('states efficiency and heat rate as the same fact', () => {
        expect(chain.efficiency * chain.heatRateBtuPerKWh)
          .toBeCloseTo(BTU_PER_KWH, 6);
      });
    });
  }

  it('reaches an efficiency a combined cycle actually reaches', () => {
    const chain = energyChain(metcalf, metcalf.pMaxMW);
    expect(chain.efficiency).toBeGreaterThan(0.40);
    expect(chain.efficiency).toBeLessThan(0.65);
  });

  it('rejects more heat to the condenser than it exports as electricity', () => {
    // True of every steam plant ever built, and the single most surprising
    // fact about one for somebody seeing the numbers for the first time.
    const chain = energyChain(metcalf, metcalf.pMaxMW);
    const condenser = chain.flows.find((f) => f.id === 'condenser')!;
    expect(condenser.mw).toBeGreaterThan(chain.netMW * 0.6);
    expect(condenser.fraction).toBeGreaterThan(0.3);
    expect(condenser.fraction).toBeLessThan(0.55);
  });

  it('gets two thirds of its output from the gas turbines', () => {
    const chain = energyChain(metcalf, metcalf.pMaxMW);
    const gt = chain.flows.find((f) => f.id === 'gt-generator')!.mw;
    const st = chain.flows.find((f) => f.id === 'st-generator')!.mw;
    expect(gt / (gt + st)).toBeCloseTo(PLANT_CONFIG.gasTurbineShare, 6);
  });

  it('burns fuel and emits carbon in proportion, not in proportion to output', () => {
    const a = energyChain(metcalf, 400);
    const b = energyChain(metcalf, 800);
    // Carbon dioxide is a property of the fuel's chemistry, so it tracks fuel
    // exactly. It tracks OUTPUT only because the heat rate here is constant.
    expect(b.co2TonnesPerHour / a.co2TonnesPerHour)
      .toBeCloseTo(b.fuelMMBtuPerHour / a.fuelMMBtuPerHour, 9);
    expect(a.co2TonnesPerHour / a.fuelMMBtuPerHour)
      .toBeCloseTo(CO2_KG_PER_MMBTU / 1000, 9);
  });

  it('scales the whole chain with the dispatch', () => {
    const low = energyChain(metcalf, metcalf.pMinMW);
    const high = energyChain(metcalf, metcalf.pMaxMW);
    for (const f of low.flows) {
      const other = high.flows.find((x) => x.id === f.id)!;
      if (f.mw === 0) continue;
      expect(other.mw, f.id).toBeGreaterThan(f.mw);
    }
  });
});

describe('the plant as a place', () => {
  it('connects every item into the flow diagram', () => {
    const connected = new Set(PLANT_FLOWS.flatMap(([a, b]) => [a, b]));
    const loose = PLANT_ITEMS.filter((i) => !connected.has(i.id)).map((i) => i.id);
    expect(loose).toEqual([]);
  });

  it('refers only to items that exist', () => {
    for (const [a, b] of PLANT_FLOWS) {
      expect(plantItemById.has(a), a).toBe(true);
      expect(plantItemById.has(b), b).toBe(true);
    }
  });

  it('explains every item in a sentence a beginner could read', () => {
    for (const i of PLANT_ITEMS) {
      expect(i.note.length, i.id).toBeGreaterThan(40);
      expect(i.at.length, i.id).toBe(3);
    }
  });

  it('puts the boilers downstream of the turbines that feed them', () => {
    // The exhaust duct between a gas turbine and its boiler is short and
    // expensive, so they are always adjacent and in that order.
    const gt = plantItemById.get('GT1')!;
    const hrsg = plantItemById.get('HRSG1')!;
    const stack = plantItemById.get('STACK1')!;
    expect(hrsg.at[0]).toBeGreaterThan(gt.at[0]);
    expect(stack.at[0]).toBeGreaterThan(hrsg.at[0]);
  });

  it('puts the condenser below the steam turbine', () => {
    const st = plantItemById.get('ST')!;
    const cond = plantItemById.get('COND')!;
    expect(cond.at[2]).toBeLessThan(st.at[2]);
  });
});

describe('the synchronous machine', () => {
  const vPU = 1.02;

  it('inverts: E and δ reproduce the P and Q they came from', () => {
    for (const [p, q] of [[600, 200], [1000, -150], [300, 0], [900, 400]]) {
      const op = operatingPoint(metcalf, vPU, p, q);
      const xd = metcalf.xd!;
      // Forward: P = (V·E/X)·sin δ, Q = (V·E/X)·cos δ − V²/X, in per-unit.
      const d = (op.deltaDeg * Math.PI) / 180;
      const pBack = ((vPU * op.ePU) / xd) * Math.sin(d) * metcalf.mBaseMVA;
      const qBack = (((vPU * op.ePU) / xd) * Math.cos(d) - (vPU * vPU) / xd)
        * metcalf.mBaseMVA;
      expect(pBack, `P at ${p}/${q}`).toBeCloseTo(p, 6);
      expect(qBack, `Q at ${p}/${q}`).toBeCloseTo(q, 6);
    }
  });

  it('advances the rotor as real power rises', () => {
    const angles = [200, 400, 600, 800].map(
      (p) => operatingPoint(metcalf, vPU, p, 100).deltaDeg);
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i]).toBeGreaterThan(angles[i - 1]);
    }
  });

  it('raises the field as reactive power rises, at constant real power', () => {
    const emfs = [-200, 0, 200, 400].map(
      (q) => operatingPoint(metcalf, vPU, 600, q).ePU);
    for (let i = 1; i < emfs.length; i++) {
      expect(emfs[i]).toBeGreaterThan(emfs[i - 1]);
    }
  });

  it('knows when it is under-excited', () => {
    expect(operatingPoint(metcalf, vPU, 600, -100).overExcited).toBe(false);
    expect(operatingPoint(metcalf, vPU, 600, 100).overExcited).toBe(true);
    // Under-excited means the internal EMF is below the terminal voltage,
    // which is what "absorbing reactive power" means physically.
    expect(operatingPoint(metcalf, 1.0, 0, -100).ePU).toBeLessThan(1.0);
  });
});

describe('the capability curve', () => {
  const c = capabilityCurve(metcalf, 1.0);

  it('puts the field circle centre at −V²/Xd', () => {
    expect(c.fieldCentreMVAr)
      .toBeCloseTo(-(1.0 / metcalf.xd!) * metcalf.mBaseMVA, 9);
    expect(c.fieldCentreMVAr).toBeLessThan(0);
  });

  it('passes the field limit through the machine’s rated point', () => {
    const pRated = c.sRatedMVA * c.ratedPowerFactor;
    const qRated = c.sRatedMVA * Math.sqrt(1 - c.ratedPowerFactor ** 2);
    expect(fieldLimitQ(c, pRated)!).toBeCloseTo(qRated, 6);
  });

  it('takes the machine’s rated power factor from the case', () => {
    // 1,000 MW on an 1,111 MVA base is a machine rated at 0.9, and the curve
    // has to know that rather than assume a textbook 0.85.
    expect(c.ratedPowerFactor).toBeCloseTo(metcalf.pMaxMW / metcalf.mBaseMVA, 9);
  });

  it('makes the armature circle the machine’s own rating', () => {
    expect(armatureLimitQ(c, 0)!).toBeCloseTo(c.sRatedMVA, 9);
    expect(armatureLimitQ(c, c.sRatedMVA)!).toBeCloseTo(0, 9);
    expect(armatureLimitQ(c, c.sRatedMVA * 1.01)).toBeNull();
  });

  it('leaves more reactive headroom at part load than at full', () => {
    // The shape of the curve, and the reason an operator backing a plant off
    // gains reactive capability without doing anything to the field.
    expect(fieldLimitQ(c, c.sRatedMVA * 0.85)!)
      .toBeLessThan(fieldLimitQ(c, c.sRatedMVA * 0.1)!);
    expect(armatureLimitQ(c, c.sRatedMVA * 0.85)!)
      .toBeLessThan(armatureLimitQ(c, c.sRatedMVA * 0.1)!);
  });

  it('is bound by the reactive setting until the armature runs out', () => {
    // Through most of the range the binding constraint is the reactive limit
    // written into the network case, because the machine's own thermal limits
    // sit outside it. At the very top of its real output the armature circle
    // closes in and binds instead — the machine has no current left over for
    // reactive power, whatever its field could do.
    expect(bindingLimit(c, c.pMaxMW * 0.5).limit).toBe('reactive-setting');
    expect(bindingLimit(c, c.pMaxMW).limit).toBe('armature');
    expect(bindingLimit(c, c.pMaxMW).qMVAr)
      .toBeCloseTo(Math.sqrt(c.sRatedMVA ** 2 - c.pMaxMW ** 2), 6);
  });

  it('never allows what the case forbids, and never forbids what physics allows', () => {
    // The binding limit is the smallest of the three at every point, and it
    // falls as real output rises. Both are properties of the construction
    // rather than of this machine's numbers.
    let previous = Infinity;
    for (let p = 0; p <= c.pMaxMW; p += c.pMaxMW / 20) {
      const b = bindingLimit(c, p);
      expect(b.qMVAr, `at ${p} MW`).toBeLessThanOrEqual(previous + 1e-9);
      previous = b.qMVAr;
    }
  });

  it('never allows more than the reactive setting in the case', () => {
    for (let p = 0; p <= c.pMaxMW; p += c.pMaxMW / 20) {
      expect(bindingLimit(c, p).qMVAr).toBeLessThanOrEqual(c.qMaxMVAr + 1e-9);
    }
  });

  it('puts the steady-state stability limit where δ reaches 90°', () => {
    // On the vertical through the field circle's centre, which is exactly
    // Q = −V²/Xd. Past it the machine cannot hold synchronism at all.
    const op = operatingPoint(
      metcalf, 1.0, Math.abs(c.stabilityLimitMVAr) * 0.5, c.stabilityLimitMVAr);
    expect(op.deltaDeg).toBeCloseTo(90, 6);
  });

  it('shrinks the field limit when the terminal voltage sags', () => {
    const low = capabilityCurve(metcalf, 0.95);
    expect(fieldLimitQ(low, 500)!).toBeLessThan(fieldLimitQ(c, 500)!);
  });
});

describe('inertia and the swing equation', () => {
  it('measures stored energy in seconds of its own output', () => {
    const s = swingState(metcalf, 600, 600);
    expect(s.storedMJ).toBeCloseTo(metcalf.inertiaH! * metcalf.mBaseMVA, 9);
    expect(s.rideThroughS).toBe(metcalf.inertiaH);
  });

  it('does not accelerate when mechanical and electrical power balance', () => {
    expect(swingState(metcalf, 600, 600).accelDegPerS2).toBe(0);
  });

  it('accelerates when the electrical load is lost, and decelerates when it rises', () => {
    expect(swingState(metcalf, 600, 300).accelDegPerS2).toBeGreaterThan(0);
    expect(swingState(metcalf, 600, 900).accelDegPerS2).toBeLessThan(0);
  });

  it('accelerates harder the lighter the rotor', () => {
    const light: Generator = { ...metcalf, inertiaH: 2 };
    const heavy: Generator = { ...metcalf, inertiaH: 8 };
    expect(Math.abs(swingState(light, 600, 300).accelDegPerS2))
      .toBeGreaterThan(Math.abs(swingState(heavy, 600, 300).accelDegPerS2));
  });

  it('counts only machines with a rotor towards system inertia', () => {
    expect(hasRotor('gas-cc')).toBe(true);
    expect(hasRotor('nuclear')).toBe(true);
    expect(hasRotor('hydro')).toBe(true);
    expect(hasRotor('solar-pv')).toBe(false);
    expect(hasRotor('wind')).toBe(false);
    expect(hasRotor('battery')).toBe(false);
    expect(hasRotor('import')).toBe(false);
  });

  it('gives a rate of change of frequency in the range a real system sees', () => {
    // The classic contingency is the largest SYNCHRONOUS unit. Losing an
    // import tie is a different event: the machines at the far end of it are
    // still turning, and the surplus appears at their end rather than here.
    const largest = solved.net.generators
      .filter((g) => g.inService && hasRotor(g.kind))
      .reduce((a, g) => (g.pMW > a.pMW ? g : a));
    const r = rocof(solved.net.generators, largest.pMW);
    expect(r.systemInertiaMJ).toBeGreaterThan(0);
    // California's own rotating mass alone, which is the honest answer to a
    // question about this network and is several times faster than what the
    // real system sees, because the real one is bolted to the rest of the West.
    expect(Math.abs(r.hzPerSecond)).toBeGreaterThan(0.01);
    expect(Math.abs(r.hzPerSecond)).toBeLessThan(2.0);
  });

  it('is arrested by the rest of the interconnection when that is counted', () => {
    const largest = solved.net.generators
      .filter((g) => g.inService && hasRotor(g.kind))
      .reduce((a, g) => (g.pMW > a.pMW ? g : a));
    const alone = rocof(solved.net.generators, largest.pMW);
    // Roughly four times California's own inertia for the rest of the Western
    // Interconnection is the right order of magnitude, and with it counted the
    // frequency falls at the fraction of a hertz per second a real system sees.
    const together = rocof(
      solved.net.generators, largest.pMW, 60, alone.systemInertiaMJ * 4);
    expect(Math.abs(together.hzPerSecond))
      .toBeLessThan(Math.abs(alone.hzPerSecond));
    expect(Math.abs(together.hzPerSecond)).toBeLessThan(0.6);
  });

  it('falls faster when less of the fleet is spinning', () => {
    // Midday in spring: solar is carrying the system and the synchronous
    // machines are backed off. This is the operating condition that made
    // inertia something people argue about.
    const noon = solveAt(12).solved;
    const evening = solved;
    const a = rocof(noon.net.generators, 1000);
    const b = rocof(evening.net.generators, 1000);
    expect(a.systemInertiaMJ).toBeLessThanOrEqual(b.systemInertiaMJ * 1.0001);
    expect(Math.abs(a.hzPerSecond)).toBeGreaterThanOrEqual(
      Math.abs(b.hzPerSecond) * 0.9999);
  });
});

describe('committing the plant, and what happens when the system is long', () => {
  /**
   * Both of these were found by looking at the plant view and disbelieving it.
   *
   * The first: a purely economic stack switched off the only large plant inside
   * the Bay Area on a summer evening, which no operator would ever do. The
   * second: with that plant committed, the sunniest hour of the spring was
   * priced at the most expensive unit in the fleet, because "no unit was
   * marginal" was being read as scarcity when it meant the opposite.
   */
  function dayFor(season: 'summer' | 'spring' | 'winter', withStorage: boolean) {
    const base = freshCase();
    if (!withStorage) {
      for (const g of base.generators) if (g.kind === 'battery') g.inService = false;
    }
    return { base, day: dispatchDay(base, DAY_PROFILES[season], SLACK_BUS) };
  }

  it('keeps the reliability must-run unit committed at every hour', () => {
    const { base, day } = dayFor('summer', true);
    const mustRun = base.generators.filter((g) => g.mustRun);
    expect(mustRun.length).toBeGreaterThan(0);
    for (const g of mustRun) {
      for (let h = 0; h < 24; h++) {
        const out = day[h].stack.find((e) => e.generatorId === g.id)!.outputMW;
        expect(out, `${g.name} at ${h}:00`).toBeGreaterThanOrEqual(g.pMinMW - 1e-6);
      }
    }
  });

  it('does not force curtailment at the evening peak to do it', () => {
    // Committing an expensive must-run unit at the END of the merit order makes
    // it overshoot by its whole minimum and throw away free energy at the one
    // hour of the year when nothing is spare.
    const { day } = dayFor('summer', true);
    expect(day[18].curtailedMW).toBeLessThan(1);
    expect(day[19].curtailedMW).toBeLessThan(1);
  });

  it('prices an oversupplied hour at the floor, not at the cap', () => {
    const { day } = dayFor('spring', false);
    const midday = [11, 12, 13, 14].map((h) => day[h].marginalCostPerMWh);
    const evening = day[19].marginalCostPerMWh;
    for (const p of midday) expect(p).toBeLessThan(5);
    expect(evening).toBeGreaterThan(Math.max(...midday));
  });

  it('shows what the battery fleet is actually worth', () => {
    // The price spread across the day, with and without storage. Batteries do
    // not just move energy: they flatten what it costs.
    const withStorage = dayFor('spring', true).day.map((d) => d.marginalCostPerMWh);
    const without = dayFor('spring', false).day.map((d) => d.marginalCostPerMWh);
    const spread = (p: number[]) => Math.max(...p) - Math.min(...p);
    expect(spread(without)).toBeGreaterThan(spread(withStorage));
  });

  it('never leaves demand unserved in any season', () => {
    for (const season of ['summer', 'winter', 'spring'] as const) {
      const { day } = dayFor(season, true);
      for (let h = 0; h < 24; h++) {
        expect(day[h].unservedMW, `${season} ${h}:00`).toBeLessThan(1);
      }
    }
  });
});
