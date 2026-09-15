/**
 * The factors — the four ratios a utility plans with.
 *
 * They are all ratios of the same two kinds of quantity, and they are all
 * confused with each other constantly, so they are computed here in one place
 * from the model rather than quoted:
 *
 *   LOAD FACTOR        average demand / peak demand, over a period
 *   CAPACITY FACTOR    energy produced / energy if run flat out
 *   DEMAND FACTOR      maximum demand / connected load
 *   COINCIDENCE FACTOR group peak / sum of individual peaks
 *
 * WHAT THEY ARE FOR. A power system is sized for its peak and paid for by its
 * energy, and every one of these numbers is a way of saying how far apart those
 * two are. A load factor of 0.6 means the system is idle, in effect, forty per
 * cent of the time it is paid for. A coincidence factor of 0.65 means a
 * transformer serving a thousand houses does not need to be a thousand times
 * the size of one house's peak — which is the single most valuable fact in
 * distribution planning, and the reason a 50 kVA transformer can serve twelve
 * homes each capable of drawing 24 kW.
 *
 * DIVERSITY is the same fact stated upside down: the diversity factor is the
 * reciprocal of the coincidence factor, and the two names are used
 * interchangeably by people who mean different things. Both are given here.
 */

import { DispatchResult } from './dispatch.js';
import { NetworkCase } from '../core/network.js';
import { FEEDER_LOADS, MODELLED_SERVICE } from '../data/california/feeder.js';

/**
 * What a customer of each class could draw if everything were on at once, and
 * what one of them alone actually peaks at.
 *
 * CONNECTED LOAD is the nameplate sum: for a house it is what the service
 * itself can deliver, 100 amperes at 240 volts. NON-COINCIDENT PEAK is what one
 * customer of that class actually reaches at its own worst moment, which is
 * nowhere near the connected load and is still well above its share of the
 * group peak. These are planning figures, recorded in docs/model.md.
 */
export const CUSTOMER_CLASSES = {
  residential: { connectedKW: 24, nonCoincidentPeakKW: 5.5 },
  commercial: { connectedKW: 60, nonCoincidentPeakKW: 18 },
  industrial: { connectedKW: 400, nonCoincidentPeakKW: 90 },
} as const;

export interface FactorSet {
  /** Over the whole modelled day. */
  loadFactor: number;
  averageDemandGW: number;
  peakDemandGW: number;
  /** Feeder-level, from the spot loads and their customer counts. */
  connectedKW: number;
  sumOfIndividualPeaksKW: number;
  feederPeakKW: number;
  demandFactor: number;
  coincidenceFactor: number;
  diversityFactor: number;
  customers: number;
  /** The same, split by customer class, so the sums can be shown as sums. */
  byClass: {
    id: keyof typeof CUSTOMER_CLASSES;
    customers: number; connectedKW: number; peaksKW: number;
  }[];
  /** Per generating unit, over the modelled day. */
  capacity: {
    id: string; name: string; kind: string;
    capacityMW: number; energyMWh: number; capacityFactor: number;
  }[];
  /** The fleet as a whole. */
  fleetCapacityMW: number;
  fleetEnergyMWh: number;
  fleetCapacityFactor: number;
}

/**
 * Every factor, from the dispatched day and the feeder's own load data.
 *
 * `day` is the twenty-four hourly dispatch results the scrubber plays through,
 * so the energy figures are the integral of what was actually dispatched — not
 * a capacity factor looked up in a table.
 */
export function factors(net: NetworkCase, day: DispatchResult[]): FactorSet {
  // --- the shape of the day ------------------------------------------------
  const demands = day.map((d) => d.demandMW);
  const peakDemandMW = Math.max(...demands);
  const averageDemandMW = demands.reduce((a, b) => a + b, 0) / demands.length;

  // --- the feeder ----------------------------------------------------------
  const counts = new Map<keyof typeof CUSTOMER_CLASSES, number>();
  let feederPeakKW = 0;
  for (const l of FEEDER_LOADS) {
    counts.set(l.loadClass, (counts.get(l.loadClass) ?? 0) + l.customers);
    feederPeakKW += l.peakKW;
  }
  counts.set('residential',
    (counts.get('residential') ?? 0) + MODELLED_SERVICE.housesServed);
  feederPeakKW += MODELLED_SERVICE.peakKW;

  const byClass = (['residential', 'commercial', 'industrial'] as const)
    .map((id) => {
      const n = counts.get(id) ?? 0;
      return {
        id,
        customers: n,
        connectedKW: n * CUSTOMER_CLASSES[id].connectedKW,
        peaksKW: n * CUSTOMER_CLASSES[id].nonCoincidentPeakKW,
      };
    })
    .filter((c) => c.customers > 0);

  const connectedKW = byClass.reduce((a, c) => a + c.connectedKW, 0);
  const sumPeaksKW = byClass.reduce((a, c) => a + c.peaksKW, 0);
  const customers = byClass.reduce((a, c) => a + c.customers, 0);

  // --- the machines --------------------------------------------------------
  // Each hour's target is one hour of output, so summing them over the day is
  // the integral: megawatts held for an hour are megawatt-hours.
  const energyByUnit = new Map<string, number>();
  for (const d of day) {
    for (const [id, mw] of d.targets) {
      energyByUnit.set(id, (energyByUnit.get(id) ?? 0) + Math.max(0, mw));
    }
  }
  const capacity = net.generators
    .filter((g) => (g.pMaxMW ?? 0) > 0)
    .map((g) => {
      const energyMWh = energyByUnit.get(g.id) ?? 0;
      return {
        id: g.id,
        name: g.name,
        kind: g.kind,
        capacityMW: g.pMaxMW,
        energyMWh,
        capacityFactor: energyMWh / (g.pMaxMW * day.length),
      };
    })
    .sort((a, b) => b.capacityFactor - a.capacityFactor);

  const fleetCapacityMW = capacity.reduce((a, g) => a + g.capacityMW, 0);
  const fleetEnergyMWh = capacity.reduce((a, g) => a + g.energyMWh, 0);

  return {
    loadFactor: averageDemandMW / peakDemandMW,
    averageDemandGW: averageDemandMW / 1000,
    peakDemandGW: peakDemandMW / 1000,
    connectedKW,
    sumOfIndividualPeaksKW: sumPeaksKW,
    feederPeakKW,
    demandFactor: feederPeakKW / connectedKW,
    coincidenceFactor: feederPeakKW / sumPeaksKW,
    diversityFactor: sumPeaksKW / feederPeakKW,
    customers,
    byClass,
    capacity,
    fleetCapacityMW,
    fleetEnergyMWh,
    fleetCapacityFactor: fleetEnergyMWh / (fleetCapacityMW * day.length),
  };
}
