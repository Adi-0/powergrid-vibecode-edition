/**
 * Solve a network the way it would actually be operated.
 *
 * A raw power flow answers "given exactly this equipment configuration, what
 * are the voltages?". That is not the question a user of this model is asking.
 * They are asking "what does the system do at eight in the evening?" — and the
 * answer involves the automatic equipment that switches itself in and out in
 * response to what the system is doing. This function closes that loop:
 *
 *   1. Solve once with reactive limits relaxed, to get a usable picture of
 *      voltages. This solve is reliable because nothing is being pinned.
 *   2. Let the voltage-controlled shunt devices switch on what they see.
 *   3. Re-solve. Repeat until nothing changes.
 *   4. Solve once more with generator reactive limits enforced, which is the
 *      physically honest answer, and report whether that succeeded.
 *
 * If the final limited solve fails, the unlimited one is returned with a flag
 * rather than nothing at all — a failure to converge is itself a finding, and
 * the model-honesty panel says so rather than showing a blank screen.
 */

import { NetworkCase } from '../core/network.js';
import { solvePowerFlow, PowerFlowOptions, PowerFlowResult } from '../core/powerflow.js';
import { analyse, SolvedCase } from '../core/results.js';
import {
  switchShunts, resetSwitching, SwitchingState, emptySwitchingState,
  ReactiveSwitchingOptions, DEFAULT_REACTIVE_SWITCHING, BusReactiveSignal,
} from './reactive-ops.js';

/**
 * What the switching scheme can see at each bus: the voltage, and — where a
 * generator is holding that voltage — how much of its reactive capability the
 * machine is using to do it.
 */
function reactiveSignals(net: NetworkCase, pf: PowerFlowResult): Map<string, BusReactiveSignal> {
  const qMax = new Map<string, number>();
  const qMin = new Map<string, number>();
  const qLoad = new Map<string, number>();
  for (const g of net.generators) {
    if (!g.inService) continue;
    qMax.set(g.bus, (qMax.get(g.bus) ?? 0) + g.qMaxMVAr);
    qMin.set(g.bus, (qMin.get(g.bus) ?? 0) + g.qMinMVAr);
  }
  for (const l of net.loads) qLoad.set(l.bus, (qLoad.get(l.bus) ?? 0) + l.qMVAr);

  const out = new Map<string, BusReactiveSignal>();
  pf.busOrder.forEach((busId, i) => {
    const sig: BusReactiveSignal = { vpu: pf.vm[i] };
    const up = qMax.get(busId);
    const down = qMin.get(busId);
    if (up !== undefined && down !== undefined) {
      // Reactive power the MACHINES are producing: the bus injection plus
      // whatever the load at that bus is drawing.
      const qGen = pf.qInj[i] * net.baseMVA + (qLoad.get(busId) ?? 0);
      if (qGen >= 0 && up > 0) sig.qUtilUp = qGen / up;
      if (qGen < 0 && down < 0) sig.qUtilDown = qGen / down;
      if (sig.qUtilUp === undefined) sig.qUtilUp = 0;
      if (sig.qUtilDown === undefined) sig.qUtilDown = 0;
    }
    out.set(busId, sig);
  });
  return out;
}

export interface OperateResult {
  solved: SolvedCase;
  switching: SwitchingState;
  /** True if the final solve had generator reactive limits enforced. */
  reactiveLimitsEnforced: boolean;
  /** Set when the limit-enforced solve did not converge and was abandoned. */
  warning?: string;
}

export function operate(
  net: NetworkCase,
  options: {
    pf?: Partial<PowerFlowOptions>;
    switching?: Partial<ReactiveSwitchingOptions>;
    /** Skip the switching loop and solve the configuration exactly as given. */
    holdSwitching?: boolean;
  } = {}
): OperateResult {
  const swOpt = { ...DEFAULT_REACTIVE_SWITCHING, ...options.switching };
  const pfBase: Partial<PowerFlowOptions> = { tol: 1e-9, init: 'dc', ...options.pf };

  let state: SwitchingState = emptySwitchingState();
  let pf: PowerFlowResult;

  if (options.holdSwitching) {
    pf = solvePowerFlow(net, { ...pfBase, enforceQLimits: false });
  } else {
    resetSwitching(net);
    pf = solvePowerFlow(net, { ...pfBase, enforceQLimits: false });
    const operations = new Map<string, number>();
    const frozen = new Set<string>();
    for (let round = 1; round <= swOpt.maxRounds; round++) {
      const { changed, state: s } = switchShunts(net, reactiveSignals(net, pf), swOpt, frozen);
      state = s;
      state.rounds = round;
      if (changed.length === 0) break;
      for (const c of changed) {
        const n = (operations.get(c.id) ?? 0) + 1;
        operations.set(c.id, n);
        if (n >= swOpt.maxOperationsPerDevice) frozen.add(c.id);
      }
      pf = solvePowerFlow(net, {
        ...pfBase, enforceQLimits: false, startFrom: { vm: pf.vm, va: pf.va },
      });
      state.hunting = round === swOpt.maxRounds && changed.length > 0;
    }
  }

  // The honest answer enforces generator reactive limits. Start it from the
  // unlimited solution just obtained: it is a few iterations away, and starting
  // from scratch would throw that away.
  let limited = solvePowerFlow(net, {
    ...pfBase,
    enforceQLimits: true,
    startFrom: { vm: pf.vm, va: pf.va },
  });
  if (limited.converged) {
    return { solved: analyse(net, limited), switching: state, reactiveLimitsEnforced: true };
  }

  // It did not converge with the machines held to their real limits. That means
  // the normal switching scheme has left the system reactive-short somewhere.
  //
  // An operator faced with this does not shrug: they close every capacitor bank
  // that will help and leave every reactor open. So does this. The pass below
  // is that emergency action, run once, with the engage thresholds dropped so
  // that banks come in on much less provocation.
  if (!options.holdSwitching) {
    const emergency: Partial<ReactiveSwitchingOptions> = {
      ...swOpt,
      capacitorEngageQUtil: 0.30,
      capacitorEngageV: 1.020,
      reactorEngageQUtil: 0.95,
      reactorEngageV: 1.060,
    };
    for (let round = 0; round < 3; round++) {
      const { changed, state: s } = switchShunts(net, reactiveSignals(net, pf), emergency);
      state = s;
      state.emergencySwitching = true;
      if (changed.length === 0) break;
      pf = solvePowerFlow(net, {
        ...pfBase, enforceQLimits: false, startFrom: { vm: pf.vm, va: pf.va },
      });
    }
    limited = solvePowerFlow(net, {
      ...pfBase, enforceQLimits: true, startFrom: { vm: pf.vm, va: pf.va },
    });
    if (limited.converged) {
      return { solved: analyse(net, limited), switching: state, reactiveLimitsEnforced: true };
    }
  }

  return {
    solved: analyse(net, pf),
    switching: state,
    reactiveLimitsEnforced: false,
    warning:
      'The solution shown ignores generator reactive limits. With them enforced ' +
      'the power flow does not converge, even after every available capacitor ' +
      'bank is switched in — which means the system as configured cannot ' +
      'actually hold these voltages. That is a real reactive shortage, not a ' +
      'numerical artefact.',
  };
}
