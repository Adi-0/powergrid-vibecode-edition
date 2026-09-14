/**
 * Merit-order dispatch.
 *
 * Every hour, someone has to decide which generators run. The rule, in every
 * electricity market and in every utility control room before there were
 * markets, is: serve demand with the cheapest available resources first, and
 * keep adding more expensive ones until demand is met. The last one you had to
 * turn up is the MARGINAL UNIT, and what it costs to produce one more megawatt-
 * hour is the MARGINAL COST — the number that, in a market, becomes the price
 * everybody is paid.
 *
 * Nothing in this file is scripted. The duck curve, the evening ramp, the price
 * spike at sunset and the midday collapse all fall out of running this
 * procedure across the day against the profiles in ./profiles.ts.
 */

import { NetworkCase, Generator, cloneCase } from '../core/network.js';
import { DayProfile, sampleShape } from './profiles.js';

/** How a resource behaves in the dispatch. */
export type ResourceRole =
  /** Output set by weather; offered at zero cost, so it is always taken first. */
  | 'must-take'
  /** Output set by the merit order between its minimum and maximum. */
  | 'dispatchable'
  /** Shifts energy in time; charges when cheap, discharges when dear. */
  | 'storage'
  /** The bus that absorbs whatever is left over after the power flow solves. */
  | 'slack';

export function resourceRole(g: Generator, slackBus: string): ResourceRole {
  if (g.bus === slackBus) return 'slack';
  if (g.kind === 'solar-pv' || g.kind === 'wind') return 'must-take';
  if (g.kind === 'battery') return 'storage';
  return 'dispatchable';
}

export interface DispatchResult {
  hour: number;
  /** Total demand across the system at this hour, MW. */
  demandMW: number;
  /** Output of weather-driven resources, MW. */
  mustTakeMW: number;
  /** Demand minus must-take output — the "net load" the duck curve plots. */
  netLoadMW: number;
  /** Net storage output, MW. Negative while charging. */
  storageMW: number;
  /** Dispatch target for each generator, MW, by generator id. */
  targets: Map<string, number>;
  /** The generator that set the price, and what it cost. */
  marginalUnit: string | null;
  marginalCostPerMWh: number;
  /** Generation that had to be turned away because nothing could absorb it, MW. */
  curtailedMW: number;
  /** Demand that could not be served, MW. Non-zero means the system is short. */
  unservedMW: number;
  /** Assumed transmission loss used when sizing the dispatch, MW. */
  assumedLossMW: number;
  /** Merit-order stack at this hour, cheapest first, for the UI. */
  stack: StackEntry[];
}

export interface StackEntry {
  generatorId: string;
  name: string;
  kind: Generator['kind'];
  role: ResourceRole;
  costPerMWh: number;
  /** Output at this hour, MW. */
  outputMW: number;
  /** What the resource could have produced at this hour, MW. */
  availableMW: number;
  /** Cumulative output up to and including this entry, MW. */
  cumulativeMW: number;
  /** True for the unit that set the price. */
  isMarginal: boolean;
}

export interface DispatchOptions {
  /**
   * Transmission losses are not known until the power flow has run, but the
   * dispatch has to size generation before then. Real operators use a loss
   * factor from a previous solution; this model does the same, and the
   * difference between the assumption and the truth shows up as the slack
   * bus's correction, which the UI displays rather than hides.
   */
  lossFactor: number;
  /** Storage round-trip efficiency. Losses are charged on the way in. */
  storageEfficiency: number;
  /** Hours of energy each battery holds at full output. */
  storageDurationH: number;
}

export const DEFAULT_DISPATCH: DispatchOptions = {
  lossFactor: 0.025,
  storageEfficiency: 0.87,
  storageDurationH: 4,
};

/** Demand at a given hour, from the profile and each load's peak value. */
export function demandAtHour(net: NetworkCase, profile: DayProfile, hour: number): number {
  const f = sampleShape(profile.demand, hour);
  return net.loads.reduce((s, l) => s + l.pMW, 0) * f;
}

/** Capacity factor available to a weather-driven or hydro resource this hour. */
export function availabilityFactor(g: Generator, profile: DayProfile, hour: number): number {
  switch (g.kind) {
    case 'solar-pv': return Math.max(0, sampleShape(profile.solar, hour));
    case 'wind': return Math.max(0, sampleShape(profile.wind, hour));
    case 'hydro': return Math.max(0, sampleShape(profile.hydro, hour));
    default: return 1;
  }
}

/**
 * Decide storage output for every hour of the day at once.
 *
 * A battery cannot be dispatched hour by hour in isolation: what it should do
 * now depends on what the rest of the day looks like. The rule used here is the
 * simple one that captures the real behaviour — charge during the hours with
 * the lowest net load, discharge during the hours with the highest, subject to
 * how much energy the battery holds.
 */
function planStorage(
  batteries: Generator[],
  netLoadByHour: number[],
  opt: DispatchOptions
): Map<string, number[]> {
  const plan = new Map<string, number[]>();
  if (batteries.length === 0) return plan;

  const hours = netLoadByHour.length;
  const order = [...netLoadByHour.keys()].sort((a, b) => netLoadByHour[a] - netLoadByHour[b]);

  for (const b of batteries) {
    const schedule = new Array<number>(hours).fill(0);
    const powerMW = b.pMaxMW;
    const energyMWh = powerMW * opt.storageDurationH;
    // Charge over the cheapest hours until full, accounting for the loss going in.
    let stored = 0;
    for (const h of order) {
      if (stored >= energyMWh) break;
      const take = Math.min(powerMW, (energyMWh - stored) / opt.storageEfficiency);
      schedule[h] = -take;
      stored += take * opt.storageEfficiency;
    }
    // Discharge over the most expensive hours until empty.
    let remaining = stored;
    for (let i = order.length - 1; i >= 0 && remaining > 0; i--) {
      const h = order[i];
      if (schedule[h] < 0) continue; // already charging in this hour
      const give = Math.min(powerMW, remaining);
      schedule[h] = give;
      remaining -= give;
    }
    plan.set(b.id, schedule);
  }
  return plan;
}

/**
 * Dispatch the whole day, hour by hour.
 *
 * Returns 24 results plus a helper to interpolate between them, because the
 * scrubber moves continuously and re-dispatching on every frame would be both
 * slow and wrong — a real market clears on a fixed interval, and the state
 * between intervals is generators ramping toward their next target.
 */
export function dispatchDay(
  net: NetworkCase,
  profile: DayProfile,
  slackBus: string,
  options: Partial<DispatchOptions> = {}
): DispatchResult[] {
  const opt = { ...DEFAULT_DISPATCH, ...options };
  const hours = 24;

  const batteries = net.generators.filter(
    (g) => g.inService && resourceRole(g, slackBus) === 'storage'
  );

  // First pass: net load per hour, needed before storage can be planned.
  const netLoadByHour: number[] = [];
  for (let h = 0; h < hours; h++) {
    const demand = demandAtHour(net, profile, h);
    let mustTake = 0;
    for (const g of net.generators) {
      if (!g.inService || resourceRole(g, slackBus) !== 'must-take') continue;
      mustTake += g.pMaxMW * availabilityFactor(g, profile, h);
    }
    netLoadByHour.push(demand - mustTake);
  }

  const storagePlan = planStorage(batteries, netLoadByHour, opt);

  const results: DispatchResult[] = [];
  for (let h = 0; h < hours; h++) {
    results.push(dispatchHour(net, profile, slackBus, h, storagePlan, opt));
  }
  return results;
}

function dispatchHour(
  net: NetworkCase,
  profile: DayProfile,
  slackBus: string,
  hour: number,
  storagePlan: Map<string, number[]>,
  opt: DispatchOptions
): DispatchResult {
  const demandMW = demandAtHour(net, profile, hour);
  const targets = new Map<string, number>();
  const stack: StackEntry[] = [];

  let mustTakeMW = 0;
  let curtailedMW = 0;
  let storageMW = 0;

  // 1. Weather-driven resources produce whatever the weather allows.
  for (const g of net.generators) {
    if (!g.inService) continue;
    if (resourceRole(g, slackBus) !== 'must-take') continue;
    const available = g.pMaxMW * availabilityFactor(g, profile, hour);
    mustTakeMW += available;
    targets.set(g.id, available);
  }

  // 2. Storage follows the plan made across the whole day.
  for (const g of net.generators) {
    if (!g.inService) continue;
    if (resourceRole(g, slackBus) !== 'storage') continue;
    const p = storagePlan.get(g.id)?.[hour] ?? 0;
    storageMW += p;
    targets.set(g.id, p);
  }

  // 3. Everything else is stacked cheapest first against what is left.
  const assumedLossMW = demandMW * opt.lossFactor;
  let toServe = demandMW + assumedLossMW - mustTakeMW - storageMW;

  const dispatchable = net.generators
    .filter((g) => g.inService && resourceRole(g, slackBus) !== 'must-take'
      && resourceRole(g, slackBus) !== 'storage')
    .sort((a, b) => (a.marginalCost ?? 0) - (b.marginalCost ?? 0));

  let marginalUnit: string | null = null;
  let marginalCost = 0;

  // COMMITMENT. A unit that the stack never reaches is not started at all — it
  // sits at zero, not at its minimum. That distinction is the whole of unit
  // commitment, and getting it wrong makes every plant in the fleet idle at
  // minimum output simultaneously.
  //
  // A unit that IS reached must then run at least its minimum. When the
  // remaining demand is smaller than that minimum, the unit overshoots and the
  // surplus has to go somewhere: that is the "minimum generation" condition,
  // and it is one of the two things that force renewable curtailment.
  for (const g of dispatchable) {
    const maxAvail = g.pMaxMW * availabilityFactor(g, profile, hour);
    const minRun = Math.max(0, Math.min(g.pMinMW, maxAvail));
    let out: number;
    if (toServe <= 1e-6) {
      out = 0; // never started
    } else if (toServe >= maxAvail) {
      out = maxAvail; // fully loaded; some more expensive unit will be marginal
    } else {
      out = Math.max(minRun, toServe);
      if (marginalUnit === null) {
        marginalUnit = g.id;
        marginalCost = g.marginalCost ?? 0;
      }
    }
    targets.set(g.id, out);
    toServe -= out;
  }
  // If the stack ran out before demand was met, the most expensive committed
  // unit is marginal — the price is set by scarcity, not by that unit's cost.
  if (marginalUnit === null && dispatchable.length > 0) {
    const last = dispatchable[dispatchable.length - 1];
    marginalUnit = last.id;
    marginalCost = last.marginalCost ?? 0;
  }

  // Anything still unserved means the system is short of capacity.
  const unservedMW = Math.max(0, toServe);
  // A negative remainder means more must-run output than demand: curtailment.
  if (toServe < 0) {
    curtailedMW = -toServe;
    // Curtailment falls on zero-cost resources first — that is what happens in
    // practice, because they are the ones with no fuel bill to avoid.
    let toCut = curtailedMW;
    for (const g of net.generators) {
      if (toCut <= 0) break;
      if (!g.inService || resourceRole(g, slackBus) !== 'must-take') continue;
      const cur = targets.get(g.id) ?? 0;
      const cut = Math.min(cur, toCut);
      targets.set(g.id, cur - cut);
      toCut -= cut;
    }
    mustTakeMW -= curtailedMW - Math.max(0, toCut);
    if (marginalUnit === null) marginalCost = 0;
  }

  // Build the stack for display, cheapest first.
  const ordered = [...net.generators]
    .filter((g) => g.inService)
    .sort((a, b) => (a.marginalCost ?? 0) - (b.marginalCost ?? 0));
  let cumulative = 0;
  for (const g of ordered) {
    const out = targets.get(g.id) ?? 0;
    cumulative += out;
    stack.push({
      generatorId: g.id,
      name: g.name,
      kind: g.kind,
      role: resourceRole(g, slackBus),
      costPerMWh: g.marginalCost ?? 0,
      outputMW: out,
      availableMW: g.pMaxMW * availabilityFactor(g, profile, hour),
      cumulativeMW: cumulative,
      isMarginal: g.id === marginalUnit,
    });
  }

  return {
    hour,
    demandMW,
    mustTakeMW,
    netLoadMW: demandMW - mustTakeMW,
    storageMW,
    targets,
    marginalUnit,
    marginalCostPerMWh: marginalCost,
    curtailedMW,
    unservedMW,
    assumedLossMW,
    stack,
  };
}

/**
 * Apply a dispatch to a case, producing the network as it stands at that hour.
 *
 * Loads are scaled by the demand shape; generators are set to their targets.
 * The result is an ordinary NetworkCase that the power flow solves with no
 * knowledge that a dispatch ever happened.
 */
export function applyDispatch(
  base: NetworkCase,
  profile: DayProfile,
  hour: number,
  dispatch: DispatchResult
): NetworkCase {
  const net = cloneCase(base);
  const f = sampleShape(profile.demand, hour);
  for (const l of net.loads) {
    l.pMW = l.pMW * f;
    l.qMVAr = l.qMVAr * f;
  }
  for (const g of net.generators) {
    const t = dispatch.targets.get(g.id);
    if (t !== undefined) g.pMW = t;
  }
  return net;
}

/** Interpolate a dispatch between whole hours, for smooth scrubbing. */
export function dispatchAt(day: DispatchResult[], hour: number): DispatchResult {
  const n = day.length;
  const h = ((hour % n) + n) % n;
  const i = Math.floor(h);
  const t = h - i;
  if (t < 1e-9) return day[i];
  const a = day[i];
  const b = day[(i + 1) % n];
  const targets = new Map<string, number>();
  for (const [id, va] of a.targets) {
    const vb = b.targets.get(id) ?? 0;
    targets.set(id, va + (vb - va) * t);
  }
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    hour: h,
    demandMW: lerp(a.demandMW, b.demandMW),
    mustTakeMW: lerp(a.mustTakeMW, b.mustTakeMW),
    netLoadMW: lerp(a.netLoadMW, b.netLoadMW),
    storageMW: lerp(a.storageMW, b.storageMW),
    targets,
    // Price and the marginal unit are step functions: a market clears on an
    // interval and the price holds until the next one. Interpolating them
    // would invent prices that were never set.
    marginalUnit: a.marginalUnit,
    marginalCostPerMWh: a.marginalCostPerMWh,
    curtailedMW: lerp(a.curtailedMW, b.curtailedMW),
    unservedMW: lerp(a.unservedMW, b.unservedMW),
    assumedLossMW: lerp(a.assumedLossMW, b.assumedLossMW),
    stack: a.stack,
  };
}
