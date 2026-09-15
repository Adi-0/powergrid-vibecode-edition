/**
 * The four planning ratios, checked against the model they come from.
 *
 * The point of testing these is not that division works. It is that each one
 * divides by the right thing: a load factor that quietly used the average
 * instead of the peak, or a coincidence factor computed against the connected
 * load instead of the sum of individual peaks, would still produce a plausible
 * number between zero and one and would be teaching something false.
 */

import { describe, it, expect } from 'vitest';
import { californiaCase, SLACK_BUS } from '../src/data/california/network.js';
import { DAY_PROFILES } from '../src/sim/profiles.js';
import { dispatchDay } from '../src/sim/dispatch.js';
import { factors, CUSTOMER_CLASSES } from '../src/sim/factors.js';

const base = californiaCase();
const day = dispatchDay(base, DAY_PROFILES.summer, SLACK_BUS);
const f = factors(base, day);

describe('the shape of the day', () => {
  it('has a load factor below one and well above a half', () => {
    expect(f.loadFactor).toBeLessThan(1);
    expect(f.loadFactor).toBeGreaterThan(0.5);
    expect(f.loadFactor).toBeCloseTo(f.averageDemandGW / f.peakDemandGW, 12);
  });

  it('is flatter in summer than in spring, because air conditioning runs all day', () => {
    const spring = factors(base, dispatchDay(base, DAY_PROFILES.spring, SLACK_BUS));
    expect(f.loadFactor).toBeGreaterThan(spring.loadFactor);
  });
});

describe('the feeder', () => {
  it('counts every customer once, in exactly one class', () => {
    const total = f.byClass.reduce((a, c) => a + c.customers, 0);
    expect(total).toBe(f.customers);
  });

  it('puts the individual peaks between the group peak and the connected load', () => {
    // This ordering IS the lesson, and it is the thing that would break first
    // if any of the three were computed against the wrong quantity.
    expect(f.feederPeakKW).toBeLessThan(f.sumOfIndividualPeaksKW);
    expect(f.sumOfIndividualPeaksKW).toBeLessThan(f.connectedKW);
  });

  it('makes the demand factor the smallest of the ratios', () => {
    expect(f.demandFactor).toBeLessThan(f.coincidenceFactor);
    expect(f.demandFactor).toBeGreaterThan(0);
    expect(f.coincidenceFactor).toBeLessThan(1);
  });

  it('makes diversity the reciprocal of coincidence, exactly', () => {
    expect(f.diversityFactor * f.coincidenceFactor).toBeCloseTo(1, 12);
    expect(f.diversityFactor).toBeGreaterThan(1);
  });

  it('gives a house a service far larger than its own peak', () => {
    const r = CUSTOMER_CLASSES.residential;
    expect(r.connectedKW).toBeGreaterThan(r.nonCoincidentPeakKW * 3);
  });
});

describe('the machines', () => {
  it('never reports a capacity factor above one', () => {
    for (const g of f.capacity) {
      expect(g.capacityFactor, g.name).toBeLessThanOrEqual(1 + 1e-9);
      expect(g.capacityFactor, g.name).toBeGreaterThanOrEqual(0);
    }
  });

  it('runs baseload flat out and peakers hardly at all', () => {
    const nuclear = f.capacity.find((g) => g.kind === 'nuclear');
    expect(nuclear).toBeDefined();
    expect(nuclear!.capacityFactor).toBeGreaterThan(0.9);
    const peakers = f.capacity.filter((g) => g.kind === 'gas-ct');
    expect(peakers.length).toBeGreaterThan(0);
    const worst = Math.min(...peakers.map((g) => g.capacityFactor));
    expect(worst).toBeLessThan(0.2);
  });

  it('adds its units up to the fleet figure', () => {
    const energy = f.capacity.reduce((a, g) => a + g.energyMWh, 0);
    expect(f.fleetEnergyMWh).toBeCloseTo(energy, 6);
    expect(f.fleetCapacityFactor)
      .toBeCloseTo(f.fleetEnergyMWh / (f.fleetCapacityMW * 24), 12);
  });

  it('has a fleet capacity factor well below its load factor', () => {
    // Because there is far more plant than demand: that gap is the reserve
    // margin, and it is why capacity factor and load factor are different
    // questions even though both are "how much was it used".
    expect(f.fleetCapacityFactor).toBeLessThan(f.loadFactor);
  });
});
