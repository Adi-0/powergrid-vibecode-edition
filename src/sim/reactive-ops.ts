/**
 * Reactive switching — what a control room, and the automatic equipment in a
 * substation, actually do over the course of a day.
 *
 * Shunt reactors and capacitor banks are not decorations bolted on once and
 * forgotten. They are switched, because the reactive problem reverses between
 * night and day:
 *
 *  - AT LIGHT LOAD the transmission lines' own charging capacitance dominates.
 *    There is little load current to consume it, so it pushes voltages UP. The
 *    reactors go in to absorb it, and the capacitor banks come out.
 *  - AT HEAVY LOAD the current flowing through the lines' series reactance
 *    consumes far more reactive power than the charging supplies — the loss
 *    goes as I²X, so it grows with the SQUARE of loading. Voltages sag. The
 *    capacitor banks go in, and the reactors come out.
 *
 * Leaving a reactor in at peak is not a small error: it takes reactive power
 * away exactly when the system is shortest of it, and can push a heavily loaded
 * network past the point where a solution exists at all.
 *
 * The control is on LOCAL VOLTAGE, not on system-wide demand, because that is
 * how the real equipment works — a capacitor bank has a voltage relay on it and
 * closes its own breaker. It also happens to be the only rule that works: a
 * corridor carrying imports at four in the morning is heavily loaded even
 * though the system as a whole is not, and a scheme watching total demand gets
 * that case exactly backwards.
 *
 * Both controls have a DEADBAND: the level at which a device switches in is
 * not the level at which it switches out. Without one, a device sits on its own
 * threshold and hunts, closing and opening forever — which is as true of real
 * capacitor controls as it is of this model.
 *
 * TWO DIFFERENT SIGNALS, because a bus with a generator on it is a different
 * problem from a bus without one:
 *
 *  - AT A BUS WITH NO GENERATOR the voltage is free to move, and it is the
 *    thing to watch. If it sags, close a capacitor.
 *  - AT A BUS WITH A GENERATOR the voltage does NOT move: that is the whole
 *    point of a generator, it holds its terminal voltage by adjusting
 *    excitation. So voltage says nothing, and a scheme watching it would never
 *    close a single bank while the machine quietly ran itself to its reactive
 *    limit. What to watch instead is how hard the machine is working: if it is
 *    near the top of its reactive capability, close a bank and relieve it.
 *
 * That second case is not a modelling nicety. A synchronous machine at its
 * reactive limit has lost the ability to hold its voltage, and a system where
 * several of them reach that point together is one disturbance away from a
 * voltage collapse. Keeping reactive reserve on the machines — by making the
 * reactive power somewhere cheaper — is a first-order operating objective.
 */

import { NetworkCase, ShuntDevice } from '../core/network.js';

export interface ReactiveSwitchingOptions {
  /** Per-unit voltage at or above which a shunt reactor switches IN. */
  reactorEngageV: number;
  /** Per-unit voltage at or below which a shunt reactor switches OUT. */
  reactorReleaseV: number;
  /** Per-unit voltage at or below which a capacitor stage switches IN. */
  capacitorEngageV: number;
  /** Per-unit voltage at or above which a capacitor stage switches OUT. */
  capacitorReleaseV: number;
  /**
   * At a voltage-controlled bus, the fraction of the generators' reactive
   * capability in use at or above which a capacitor stage switches IN.
   */
  capacitorEngageQUtil: number;
  /** The utilisation at or below which a capacitor stage switches OUT again. */
  capacitorReleaseQUtil: number;
  /**
   * Utilisation of the generators' reactive ABSORPTION capability at or above
   * which a shunt reactor switches in to help absorb.
   */
  reactorEngageQUtil: number;
  /** The absorption utilisation at or below which a reactor switches out. */
  reactorReleaseQUtil: number;
  /** How many switch-and-resolve rounds to allow before settling. */
  maxRounds: number;
  /**
   * How many times one device's breaker may operate while the scheme settles,
   * before it is held where it is.
   */
  maxOperationsPerDevice: number;
  /** How many rounds the violation-driven correction layer may take. */
  maxCorrectionRounds: number;
}

/**
 * Thresholds sit inside ANSI C84.1 Range A (0.95–1.05 per-unit) with room to
 * spare, so the scheme acts before anything is actually out of range rather
 * than after.
 */
export const DEFAULT_REACTIVE_SWITCHING: ReactiveSwitchingOptions = {
  reactorEngageV: 1.030,
  reactorReleaseV: 1.012,
  capacitorEngageV: 1.000,
  capacitorReleaseV: 1.035,
  capacitorEngageQUtil: 0.60,
  capacitorReleaseQUtil: 0.25,
  reactorEngageQUtil: 0.60,
  reactorReleaseQUtil: 0.25,
  maxRounds: 12,
  maxOperationsPerDevice: 2,
  maxCorrectionRounds: 14,
};

export interface SwitchingState {
  reactorsInService: number;
  reactorsOutOfService: number;
  capacitorsInService: number;
  capacitorsOutOfService: number;
  /** Net reactive contribution of all shunts at 1.0 pu, MVAr. */
  netShuntMVAr: number;
  /** Devices that changed state on the last round, for the UI to point at. */
  lastChanged: { id: string; name: string; to: 'in' | 'out'; busV: number }[];
  /** Rounds of switching it took to settle. */
  rounds: number;
  /** How many banks the violation-driven correction layer had to move. */
  correctedBuses: number;
  /** True if the scheme was still changing when it ran out of rounds. */
  hunting: boolean;
  /**
   * True if the normal scheme was not enough and every available bank had to be
   * switched in. Worth surfacing: it means the system was close to the edge.
   */
  emergencySwitching: boolean;
}

export function emptySwitchingState(): SwitchingState {
  return {
    reactorsInService: 0, reactorsOutOfService: 0,
    capacitorsInService: 0, capacitorsOutOfService: 0,
    netShuntMVAr: 0, lastChanged: [], rounds: 0, correctedBuses: 0,
    hunting: false, emergencySwitching: false,
  };
}

/** What the switching scheme can see at one bus. */
export interface BusReactiveSignal {
  vpu: number;
  /**
   * Fraction of the generators' reactive PRODUCTION capability in use at this
   * bus, 0 to 1. Undefined where there is no voltage-controlling generator.
   */
  qUtilUp?: number;
  /** Fraction of their reactive ABSORPTION capability in use, 0 to 1. */
  qUtilDown?: number;
}

/**
 * Decide which switchable shunts should be in service, from what the scheme can
 * see at each bus. Mutates the case in place and reports what changed.
 */
export function switchShunts(
  net: NetworkCase,
  signalByBus: Map<string, BusReactiveSignal>,
  options: Partial<ReactiveSwitchingOptions> = {},
  /**
   * Devices that have already changed state often enough this run and are held
   * where they are. Real capacitor controls have exactly this: a timer or an
   * operations counter that stops a bank cycling its breaker all day. Without
   * one, a bank whose size is large compared with the deadband will close,
   * over-correct, open, under-correct, and close again forever.
   */
  frozen?: ReadonlySet<string>
): { changed: SwitchingState['lastChanged']; state: SwitchingState } {
  const opt = { ...DEFAULT_REACTIVE_SWITCHING, ...options };
  const state = emptySwitchingState();
  const changed: SwitchingState['lastChanged'] = [];

  for (const sh of net.shunts ?? []) {
    const sig = signalByBus.get(sh.bus);
    const v = sig?.vpu;
    const wasIn = sh.inService;

    if (sh.switchThreshold === undefined || sig === undefined) {
      // A fixed bank has no breaker on it. It is always connected.
      sh.inService = true;
    } else if (frozen?.has(sh.id)) {
      // Held where it is; its breaker has cycled enough for one run.
    } else if (sh.kind === 'reactor') {
      if (sig.qUtilDown !== undefined) {
        if (wasIn && sig.qUtilDown <= opt.reactorReleaseQUtil) sh.inService = false;
        else if (!wasIn && sig.qUtilDown >= opt.reactorEngageQUtil) sh.inService = true;
      } else {
        if (wasIn && sig.vpu <= opt.reactorReleaseV) sh.inService = false;
        else if (!wasIn && sig.vpu >= opt.reactorEngageV) sh.inService = true;
      }
    } else {
      if (sig.qUtilUp !== undefined) {
        if (wasIn && sig.qUtilUp <= opt.capacitorReleaseQUtil) sh.inService = false;
        else if (!wasIn && sig.qUtilUp >= opt.capacitorEngageQUtil) sh.inService = true;
      } else {
        if (wasIn && sig.vpu >= opt.capacitorReleaseV) sh.inService = false;
        else if (!wasIn && sig.vpu <= opt.capacitorEngageV) sh.inService = true;
      }
    }

    if (sh.inService !== wasIn) {
      changed.push({ id: sh.id, name: sh.name, to: sh.inService ? 'in' : 'out', busV: v ?? 0 });
    }
    if (sh.kind === 'reactor') {
      if (sh.inService) state.reactorsInService++;
      else state.reactorsOutOfService++;
    } else {
      if (sh.inService) state.capacitorsInService++;
      else state.capacitorsOutOfService++;
    }
    if (sh.inService) state.netShuntMVAr += sh.qMVAr;
  }

  state.lastChanged = changed;
  return { changed, state };
}

/**
 * Put every switchable device in the state a system starts the day in: reactors
 * out, switched capacitors out. The scheme then closes whatever is needed. This
 * is a neutral starting point, not a claim about any real operating practice.
 */
export function resetSwitching(net: NetworkCase): void {
  for (const sh of net.shunts ?? []) {
    if (sh.switchThreshold === undefined) sh.inService = true;
    else sh.inService = false;
  }
}

/**
 * Targeted correction at buses that are actually outside their limits.
 *
 * The threshold scheme above is a good general rule and a poor specific one: it
 * acts on what a device can see locally, which is right, but it settles on the
 * first stable state rather than the best one. A real Volt/VAr scheme has a
 * second layer over the top of the local controls that looks at where the
 * voltage actually ended up and moves the nearest bank.
 *
 * This is that layer. For every bus outside its range it switches ONE bank at
 * that bus in the helping direction — in for a sagging bus, out for a rising
 * one — and lets the caller re-solve. One step at a time, because reactive
 * support is strongly coupled between neighbours and moving everything at once
 * overshoots.
 */
export function correctViolations(
  net: NetworkCase,
  violations: readonly { busId: string; direction: 'under' | 'over' }[],
  frozen?: ReadonlySet<string>
): SwitchingState['lastChanged'] {
  const changed: SwitchingState['lastChanged'] = [];
  const byBus = new Map<string, ShuntDevice[]>();
  for (const sh of net.shunts ?? []) {
    const list = byBus.get(sh.bus);
    if (list) list.push(sh);
    else byBus.set(sh.bus, [sh]);
  }

  // Buses one branch away. A 500 kV bus usually has nothing on it but a
  // reactor; what actually holds it up is the capacitance on the 230 kV side
  // of its own transformers. Reaching one step out is not a cheat — it is how
  // the support is really arranged.
  const neighbours = new Map<string, string[]>();
  for (const br of net.branches) {
    if (!br.inService) continue;
    (neighbours.get(br.from) ?? neighbours.set(br.from, []).get(br.from)!).push(br.to);
    (neighbours.get(br.to) ?? neighbours.set(br.to, []).get(br.to)!).push(br.from);
  }

  const moved = new Set<string>();
  for (const v of violations) {
    const candidates: ShuntDevice[] = [
      ...(byBus.get(v.busId) ?? []),
      ...(neighbours.get(v.busId) ?? []).flatMap((n) => byBus.get(n) ?? []),
    ];

    const helps = (sh: ShuntDevice): boolean => {
      const raises = sh.kind === 'capacitor';
      // A sagging bus wants more capacitance in, or a reactor out.
      if (v.direction === 'under') return raises ? !sh.inService : sh.inService;
      return raises ? sh.inService : !sh.inService;
    };

    // Smallest helpful step first, so the correction is gentle: reactive
    // support couples strongly between neighbours and a large step overshoots
    // into the opposite violation.
    const target = candidates
      .filter((sh) => sh.switchThreshold !== undefined && !frozen?.has(sh.id)
        && !moved.has(sh.id) && helps(sh))
      .sort((a, b) => Math.abs(a.qMVAr) - Math.abs(b.qMVAr))[0];
    if (!target) continue;

    target.inService = !target.inService;
    moved.add(target.id);
    changed.push({
      id: target.id, name: target.name,
      to: target.inService ? 'in' : 'out', busV: 0,
    });
  }
  return changed;
}
