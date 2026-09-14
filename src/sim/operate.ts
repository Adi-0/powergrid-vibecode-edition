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
  switchShunts, resetSwitching, correctViolations, SwitchingState,
  emptySwitchingState, ReactiveSwitchingOptions, DEFAULT_REACTIVE_SWITCHING,
  BusReactiveSignal,
} from './reactive-ops.js';
import {
  TapChanger, TapAdjustment, stepTaps, applyTaps, californiaTapChangers,
} from './tap-control.js';

/**
 * What the switching scheme can see at each bus: the voltage, and — where a
 * generator is holding that voltage — how much of its reactive capability the
 * machine is using to do it.
 */
/**
 * Buses whose machines are working hardest to hold their voltage, worst first.
 * Used when the limited solve fails outright and there is no violation list —
 * relieving these is the best guess at where the shortage actually is.
 */
function reactiveStress(
  net: NetworkCase, pf: PowerFlowResult
): { busId: string; direction: 'under' | 'over' }[] {
  const out: { busId: string; direction: 'under' | 'over'; stress: number }[] = [];
  for (const [busId, sig] of reactiveSignals(net, pf)) {
    const up = sig.qUtilUp ?? 0;
    const down = sig.qUtilDown ?? 0;
    if (up > down) out.push({ busId, direction: 'under', stress: up });
    else if (down > 0) out.push({ busId, direction: 'over', stress: down });
  }
  out.sort((a, b) => b.stress - a.stress);
  return out.map(({ busId, direction }) => ({ busId, direction }));
}

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
  /** Where every tap changer settled, and how it got there. */
  taps: TapChanger[];
  /** Tap moves made while settling, for the UI to narrate. */
  tapMoves: TapAdjustment[];
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
    /** Tap changers to let settle. Defaults to the California ones. */
    taps?: TapChanger[];
    /** Hold every tap where it is, for showing what a fixed ratio would do. */
    holdTaps?: boolean;
  } = {}
): OperateResult {
  const swOpt = { ...DEFAULT_REACTIVE_SWITCHING, ...options.switching };
  const pfBase: Partial<PowerFlowOptions> = { tol: 1e-9, init: 'dc', ...options.pf };
  const taps = options.taps ?? californiaTapChangers();
  const tapMoves: TapAdjustment[] = [];
  applyTaps(net, taps);

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

  // Let the tap changers settle. They are slow mechanical devices watching a
  // voltage, so this is a loop rather than a formula: move one step, re-solve,
  // look again. It terminates because each changer only moves while it is
  // outside its bandwidth and can only move a bounded number of steps.
  if (!options.holdTaps) {
    for (let round = 0; round < 40; round++) {
      const moves = stepTaps(net, pf, taps);
      const real = moves.filter((m) => m.reason !== 'at-limit');
      if (real.length === 0) break;
      tapMoves.push(...real);
      pf = solvePowerFlow(net, {
        ...pfBase, enforceQLimits: false, startFrom: { vm: pf.vm, va: pf.va },
      });
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
  // A converged solve is not automatically a good one: it can converge with
  // buses well outside their range. Only a converged solve with nothing in
  // violation is finished here; anything else goes to the correction layer.
  if (limited.converged && analyse(net, limited).system.voltageViolations.length === 0) {
    return {
      solved: analyse(net, limited), switching: state,
      reactiveLimitsEnforced: true, taps, tapMoves,
    };
  }

  // Either the limited solve failed, or it succeeded with buses outside their
  // range. Both mean the local threshold controls have settled somewhere the
  // system should not be left, so a second layer goes to work: look at where
  // the voltage actually ended up, and move the nearest bank at each offending
  // bus. One step per bus per round, because reactive support is strongly
  // coupled between neighbours and moving everything at once overshoots.
  if (!options.holdSwitching) {
    const frozen = new Set<string>();
    const ops = new Map<string, number>();

    for (let round = 0; round < swOpt.maxCorrectionRounds; round++) {
      const view = analyse(net, limited.converged ? limited : pf);
      const violations = view.buses
        .filter((b) => b.voltageViolation !== null)
        .map((b) => ({ busId: b.busId, direction: b.voltageViolation as 'under' | 'over' }));
      if (violations.length === 0 && limited.converged) break;

      // When the limited solve failed outright there is no violation list to
      // work from, so fall back to relieving every bus whose machines are
      // furthest into their reactive capability.
      const targets = violations.length > 0 ? violations
        : reactiveStress(net, pf).slice(0, 6);
      const changed = correctViolations(net, targets, frozen);
      if (changed.length === 0) break;
      for (const c of changed) {
        const n = (ops.get(c.id) ?? 0) + 1;
        ops.set(c.id, n);
        if (n >= swOpt.maxOperationsPerDevice) frozen.add(c.id);
      }
      state.rounds += 1;
      state.correctedBuses += changed.length;

      pf = solvePowerFlow(net, {
        ...pfBase, enforceQLimits: false, startFrom: { vm: pf.vm, va: pf.va },
      });
      limited = solvePowerFlow(net, {
        ...pfBase, enforceQLimits: true, startFrom: { vm: pf.vm, va: pf.va },
      });
    }

    if (limited.converged) {
      return {
        solved: analyse(net, limited), switching: state,
        reactiveLimitsEnforced: true, taps, tapMoves,
      };
    }
  }

  return {
    solved: analyse(net, pf),
    switching: state,
    reactiveLimitsEnforced: false,
    taps,
    tapMoves,
    warning:
      'The solution shown ignores generator reactive limits. With them enforced ' +
      'the power flow does not converge, even after every available capacitor ' +
      'bank is switched in — which means the system as configured cannot ' +
      'actually hold these voltages. That is a real reactive shortage, not a ' +
      'numerical artefact.',
  };
}
