/**
 * Faults on the modelled network, and what the protection does about them.
 *
 * This ties the three pieces together: the sequence networks from
 * `core/fault.ts`, the inverse-time curves from `core/protection.ts`, and the
 * solved case that says what the system was doing when the fault arrived.
 *
 * One thing worth stating plainly. The fault calculation is a SNAPSHOT of the
 * first cycles: a linear circuit problem solved about the pre-fault operating
 * point, with every machine represented as a voltage behind its subtransient
 * reactance. It does not simulate what happens next — the protection operating,
 * the breakers clearing, the voltage recovering, the machines swinging against
 * each other. Those need a time-domain simulation, and this model has no time
 * axis. What it gives is the number every one of those later questions starts
 * from: how much current flows, and where.
 */

import { SolvedCase } from '../core/results.js';
import { indexCase } from '../core/network.js';
import { polar, abs } from '../core/complex.js';
import {
  buildFaultModel, solveFault, FaultKind, FaultResult, theveninImpedance,
} from '../core/fault.js';
import {
  ProtectiveDevice, operatingTime, checkChain, firstToOperate, CoordinationCheck,
} from '../core/protection.js';
import {
  cherryLaneProtection, coordinationCurrents, FaultLevels,
} from '../data/california/protection-scheme.js';
import { feederBusId, FEEDER_SECTIONS, MODELLED_SERVICE } from '../data/california/feeder.js';

export interface FaultStudy {
  /** The fault itself. */
  result: FaultResult;
  /** The protection chain between the fault and the source. */
  chain: ProtectiveDevice[];
  /** How each device responds to this fault current. */
  responses: {
    device: ProtectiveDevice;
    seconds: number | null;
    /** Which element decided: the curve, or the instantaneous. */
    element: 'time-overcurrent' | 'instantaneous' | 'does not see it';
  }[];
  /** Which device clears it, and how long the customer is in the dark. */
  clearedBy: { device: ProtectiveDevice; seconds: number } | null;
  /** Coordination across the whole range of currents this feeder can produce. */
  coordination: CoordinationCheck[];
  /** Any pair that fails to coordinate. Empty is what it should be. */
  miscoordinations: CoordinationCheck[];
  levels: FaultLevels;
  /**
   * Protection faster than anything in the overcurrent chain, where the faulted
   * point is inside a differential zone.
   *
   * An overcurrent relay is a BACKUP for a busbar or a transformer, not its
   * primary protection, and quoting its operating time as the clearing time
   * would be badly misleading — it is two seconds where the real answer is
   * three cycles. Differential protection has no coordination delay at all,
   * because it defines a zone and anything inside it is unambiguous.
   */
  primary?: { device: string; name: string; seconds: number; why: string };
}

/** Fault levels on the feeder, from the network's own sequence impedances. */
export function feederFaultLevels(solved: SolvedCase): FaultLevels {
  const idx = indexCase(solved.net);
  const model = buildFaultModel(solved.net, idx);
  const three = (busId: string): number => {
    const bus = solved.net.buses.find((b) => b.id === busId);
    const r = solved.busById.get(busId);
    if (!bus || !r) return 0;
    return solveFault(model, busId, 'three-phase', {
      prefaultV: polar(r.vpu, (r.angleDeg * Math.PI) / 180),
      baseKV: bus.baseKV,
      baseMVA: solved.net.baseMVA,
    }).maxAmps;
  };
  return {
    atBusA: three('EDENVALE_12'),
    atRecloserA: three(feederBusId('F03')),
    atFarEndA: three(feederBusId('F11')),
    // A single-phase lateral: the fault current there is what the line-to-line
    // fault at the tap point gives, which is what its fuse has to interrupt.
    atLateralA: three(feederBusId('L3B')),
  };
}

/**
 * Put a fault somewhere and work out what happens.
 *
 * `busId` is any bus in the case. The protection chain shown is the Cherry Lane
 * one, which is the only feeder modelled pole by pole; for a fault elsewhere
 * the currents are still real but the chain is not the one that would clear it,
 * and the honesty register says so.
 */
export function studyFault(
  solved: SolvedCase, busId: string, kind: FaultKind
): FaultStudy | null {
  const bus = solved.net.buses.find((b) => b.id === busId);
  const r = solved.busById.get(busId);
  if (!bus || !r) return null;

  const idx = indexCase(solved.net);
  const model = buildFaultModel(solved.net, idx);
  const result = solveFault(model, busId, kind, {
    prefaultV: polar(r.vpu, (r.angleDeg * Math.PI) / 180),
    baseKV: bus.baseKV,
    baseMVA: solved.net.baseMVA,
  });

  const levels = feederFaultLevels(solved);
  const chain = chainFor(busId, cherryLaneProtection(levels));

  // What each device sees. A ground fault is seen by the ground elements as
  // the residual current, which is far larger relative to their pickup — but
  // the phase elements see the phase current, and that is what these are.
  const seen = result.maxAmps;
  const responses = chain.map((device) => {
    const seconds = operatingTime(device, seen);
    const element: 'time-overcurrent' | 'instantaneous' | 'does not see it' =
      seconds === null ? 'does not see it'
        : device.instantaneousA !== undefined && seen >= device.instantaneousA
          ? 'instantaneous'
          : 'time-overcurrent';
    return { device, seconds, element };
  });

  // Coordination is a property of the WHOLE chain, not of whichever part of it
  // happens to see this fault, so it is always checked on all four devices.
  const currents = coordinationCurrents(
    Math.max(levels.atBusA, 1), Math.max(levels.atFarEndA * 0.5, 1));
  const coordination = checkChain(cherryLaneProtection(levels), currents);

  const primary = differentialFor(busId);
  return {
    result,
    chain,
    responses,
    primary,
    clearedBy: firstToOperate(chain, seen),
    coordination,
    miscoordinations: coordination.filter((c) => !c.ok),
    levels,
  };
}

/** The buses a fault can usefully be placed on, for the interface to offer. */
export function faultableBuses(solved: SolvedCase): {
  id: string; name: string; kV: number; sourceStrength: number;
}[] {
  const idx = indexCase(solved.net);
  const model = buildFaultModel(solved.net, idx);
  return solved.net.buses.map((b) => {
    const z = theveninImpedance(model.positive, b.id);
    return {
      id: b.id,
      name: b.name,
      kV: b.baseKV,
      sourceStrength: Number.isFinite(abs(z)) ? 1 / Math.max(1e-9, abs(z)) : 0,
    };
  });
}

/**
 * Which devices are actually in series with a fault at a given bus.
 *
 * SELECTIVITY IS GEOMETRY BEFORE IT IS TIMING. A fuse on Cherry Lane carries
 * the current to Cherry Lane and nothing else: a fault on the substation busbar
 * does not pass through it, so it cannot clear one however fast its curve is.
 * Working out which devices a fault current actually flows through is therefore
 * the first step, and getting it wrong makes a protection study produce
 * confident nonsense — a fuse "clearing" a fault two levels above it.
 *
 * The chain here is the path back to the source, worked out from the feeder's
 * own topology.
 */
export function chainFor(
  busId: string, all: readonly ProtectiveDevice[]
): ProtectiveDevice[] {
  const byId = new Map(all.map((d) => [d.id, d]));
  const pick = (...ids: string[]): ProtectiveDevice[] =>
    ids.map((i) => byId.get(i)).filter((d): d is ProtectiveDevice => d !== undefined);

  // Everything on or beyond the lateral the modelled service hangs off.
  const onModelledLateral = new Set(
    ['L3A', 'L3B', MODELLED_SERVICE.toNode].map(feederBusId));
  if (onModelledLateral.has(busId)) {
    return pick('FUSE_L3', 'REC_R1', 'FDR1201_51', 'T1_51');
  }

  // The feeder main, split at the recloser. Which side a pole is on is worked
  // out by walking the sections rather than by listing nodes, so it follows the
  // feeder if the feeder changes.
  const downstreamOfRecloser = feederNodesBeyond('F03');
  const main = new Set([...downstreamOfRecloser].map(feederBusId));
  if (main.has(busId)) return pick('REC_R1', 'FDR1201_51', 'T1_51');

  const upstream = new Set(['F00', 'F01', 'F02', 'F03'].map(feederBusId));
  if (upstream.has(busId)) return pick('FDR1201_51', 'T1_51');

  if (busId === 'EDENVALE_12') return pick('T1_51');

  // Anywhere else on the system: none of this feeder's protection is in
  // series with it, and saying so is more useful than showing a chain that
  // would not operate.
  return [];
}

/** Every feeder node reachable from a node without going back through it. */
function feederNodesBeyond(fromId: string): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const s of FEEDER_SECTIONS) {
    (adjacency.get(s.from) ?? adjacency.set(s.from, []).get(s.from)!).push(s.to);
    (adjacency.get(s.to) ?? adjacency.set(s.to, []).get(s.to)!).push(s.from);
  }
  const seen = new Set<string>([fromId, 'F02', 'F01', 'F00']);
  const out = new Set<string>();
  const stack = [fromId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const next of adjacency.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      out.add(next);
      stack.push(next);
    }
  }
  return out;
}

/**
 * Whether the faulted point sits inside a differential zone.
 *
 * Differential protection compares everything entering a zone with everything
 * leaving it. In normal operation they match; a difference means current is
 * going somewhere inside the zone that it should not, and there is nothing to
 * wait for. That is why it has no coordination delay and why an overcurrent
 * relay covering the same equipment is backup rather than primary.
 */
function differentialFor(busId: string):
  { device: string; name: string; seconds: number; why: string } | undefined {
  if (busId === 'EDENVALE_12' || busId === 'EDENVALE_115') {
    return {
      device: '87B', name: 'Bus differential',
      // Under a cycle to decide, two or three more for the breakers to open.
      seconds: 0.05,
      why:
        'A bus fault is the most severe fault a station can have, because every ' +
        'source feeds it at once. The differential compares everything flowing ' +
        'into the bus with everything flowing out, and a difference can only ' +
        'mean a fault inside — so it operates with no intentional delay at all. ' +
        'The overcurrent relay below is its backup, and its two seconds is what ' +
        'happens only if the differential fails.',
    };
  }
  return undefined;
}
