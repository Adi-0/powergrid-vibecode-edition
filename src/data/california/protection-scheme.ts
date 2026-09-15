/**
 * The protection on Cherry Lane 1201, from the lateral fuse to the transformer.
 *
 * WHY THE SETTINGS ARE COMPUTED RATHER THAN TYPED. A pickup current is not a
 * free choice. It has to be above everything the circuit legitimately carries —
 * or the device trips on load, which is worse than no protection at all — and
 * below the smallest fault it must detect. So each one here is derived from the
 * feeder's own numbers: the peak load the model carries, the transformer's
 * nameplate, the conductor's ampacity. Change the feeder and the settings
 * follow.
 *
 * The time dials are the other half. Pickup decides WHETHER a device responds;
 * the time dial decides WHEN, and the whole art of coordination is arranging
 * those so that at every current the device nearest the fault is always first
 * by a comfortable margin. `test/faults.test.ts` checks that across the whole
 * range of fault currents the feeder can produce, which is the only way to
 * check it: two curves can be far apart at one current and cross at another.
 */

import { ProtectiveDevice } from '../../core/protection.js';
import { FEEDER_KV, FEEDER_LOADS, MODELLED_SERVICE } from './feeder.js';
import { TRANSFORMER_CLASSES } from './build.js';

/** Full-load current of a three-phase circuit, amperes. */
export const threePhaseAmps = (mw: number, kV: number, pf = 0.97): number =>
  (mw / pf) * 1e6 / (Math.sqrt(3) * kV * 1000);

/**
 * The devices in series between a fault on Cherry Lane and the transmission
 * system, in order outward from the source.
 *
 * Positions are numbered from the fault end, so position 0 is the device
 * closest to the customer and clears first.
 */
export interface FaultLevels {
  /** Three-phase fault current at the substation 12.47 kV bus, amperes. */
  atBusA: number;
  /** At the recloser, a third of the way down the feeder. */
  atRecloserA: number;
  /** At the far end of the feeder, which is the smallest fault to be detected. */
  atFarEndA: number;
  /** On the lateral the modelled service hangs off. */
  atLateralA: number;
}

export function cherryLaneProtection(levels: FaultLevels): ProtectiveDevice[] {
  // Load on the single-phase lateral the modelled service hangs off, which the
  // fuse must carry without melting.
  const lateralKW = FEEDER_LOADS
    .filter((l) => ['L3A', 'L3B'].includes(l.node))
    .reduce((a, l) => a + l.peakKW, 0) + MODELLED_SERVICE.peakKW;
  // A single-phase lateral works at the line-to-neutral voltage.
  const lateralAmps = lateralKW / (FEEDER_KV / Math.sqrt(3)) / 0.97;

  // Everything on the feeder, which the recloser and the feeder breaker carry.
  const feederKW = FEEDER_LOADS.reduce((a, l) => a + l.peakKW, 0) + MODELLED_SERVICE.peakKW;
  const feederAmps = threePhaseAmps(feederKW / 1000, FEEDER_KV);

  // The whole station through one transformer.
  const bankMVA = TRANSFORMER_CLASSES.dist115_12.mvaPerBank;
  const bankAmps = (bankMVA * 1e6) / (Math.sqrt(3) * FEEDER_KV * 1000);

  return [
    {
      id: 'FUSE_L3', name: 'Cherry Lane lateral fuse', kind: 'fuse', device: '—',
      // A fuse is sized at roughly twice the load it carries, because it must
      // survive cold-load pickup — the surge when a circuit is re-energised and
      // every thermostat in the street is calling at once.
      pickupA: round5(lateralAmps * 2.0),
      timeDial: 0.055, curve: 'extremely', mechanismS: 0,
      position: 0,
      maxZoneFaultA: levels.atLateralA,
      note:
        'A tin element in a tube, on the end of a hinged holder. When it melts ' +
        'the holder drops open under its own weight, which is visible from the ' +
        'road — a crew driving the route can see which lateral is out without ' +
        'any instrumentation at all. It is the cheapest protective device ever ' +
        'devised and still the most common one on any distribution system.',
    },
    {
      id: 'REC_R1', name: 'Recloser R1', kind: 'recloser', device: '79',
      pickupA: round5(feederAmps * 1.5),
      timeDial: 1.0, curve: 'very', mechanismS: 0.05,
      position: 1,
      // A fault downstream of the recloser cannot draw more than the fault
      // current available AT the recloser, so that is the top of the range
      // over which it has to coordinate with the breaker behind it.
      maxZoneFaultA: levels.atRecloserA,
      note:
        'A breaker that tries again. Most faults on an overhead line are ' +
        'momentary — a branch blown across the wires, a bird, a flashover in ' +
        'wind-driven rain — and de-energising the line for half a second lets ' +
        'the arc go out. It trips fast on its first shot to give a momentary ' +
        'fault no chance to burn into a permanent one, then slows down on later ' +
        'shots so the fuse downstream has time to clear if the fault is real.',
    },
    {
      id: 'FDR1201_51', name: 'Feeder 1201 breaker, time-overcurrent',
      kind: 'breaker', device: '51',
      pickupA: round5(feederAmps * 1.85),
      timeDial: 2.4, curve: 'very', mechanismS: 0.08,
      // THE INSTANTANEOUS SETTING IS THE INTERESTING ONE. It is placed just
      // above the fault current available at the RECLOSER, so it can only ever
      // respond to a fault between the breaker and the recloser — the one
      // stretch of feeder no other device protects. A fault further out draws
      // less current, because of the impedance of the line in between, and
      // therefore cannot reach this threshold. One number, and it distinguishes
      // near from far without measuring distance at all.
      instantaneousA: round5(levels.atRecloserA * 1.25),
      position: 2,
      maxZoneFaultA: levels.atBusA,
      note:
        'The breaker in the substation, on the outgoing side of the 12.47 kV ' +
        'bus. Everything past it is out in the streets. Its instantaneous ' +
        'element is deliberately set above the fault current available at the ' +
        'far end of the feeder, so it can only operate for a fault close by — ' +
        'which is how one threshold distinguishes near from far.',
    },
    {
      id: 'T1_51', name: 'Bank 1 low-side time-overcurrent',
      kind: 'relay', device: '51',
      pickupA: round5(bankAmps * 1.3),
      timeDial: 3.6, curve: 'very', mechanismS: 0.08,
      position: 3,
      maxZoneFaultA: levels.atBusA,
      note:
        'Backup for every feeder on the bus, and protection for the ' +
        'transformer against a fault it can feed. It is the slowest device in ' +
        'the chain by design: if it operates, the whole station’s ' +
        'low-voltage bus goes dark, so it must be certain that nothing nearer ' +
        'the fault is going to act first.',
    },
  ];
}

/** Settings are quoted in round numbers, because relays are set in them. */
const round5 = (a: number): number => Math.round(a / 5) * 5;

/**
 * Fault currents worth checking the coordination at.
 *
 * Not a convenient handful: the whole range the feeder can actually produce,
 * from a high-impedance fault at the far end to a bolted one at the breaker.
 */
export function coordinationCurrents(maxFaultA: number, minFaultA: number): number[] {
  const out: number[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    out.push(minFaultA * Math.pow(maxFaultA / minFaultA, i / steps));
  }
  return out;
}
