/**
 * Application state.
 *
 * One rule governs this file: the app never holds a displayed number that did
 * not come out of a solve. Change the time of day, trip a circuit, switch a
 * capacitor bank — the state re-dispatches, re-solves the power flow, and
 * everything downstream reads the new `SolvedCase`. There is no cached figure
 * anywhere that could drift out of step with the physics, and
 * `test/no-hardcoded-quantities.test.ts` is what keeps it that way.
 */

import { NetworkCase, cloneCase } from '../core/network.js';
import {
  studyMotorStart, MotorStudy, MotorState, MOTOR_SITES,
} from '../sim/motor-start.js';
import { StartMethod } from '../core/motor.js';
import { factors, FactorSet } from '../sim/factors.js';
import { SolvedCase } from '../core/results.js';
import { californiaCase, SLACK_BUS } from '../data/california/network.js';
import { DayProfile, DAY_PROFILES, Season } from '../sim/profiles.js';
import { dispatchDay, applyDispatch, DispatchResult, demandFactor } from '../sim/dispatch.js';
import { operate, OperateResult } from '../sim/operate.js';
import {
  APPLIANCES, Appliance, solveService, ServiceSolution,
} from '../data/california/service.js';
import { FaultKind } from '../core/fault.js';
import { studyFault, FaultStudy } from '../sim/faults.js';

export interface Selection {
  kind: 'site' | 'circuit' | 'bus' | 'generator' | 'none';
  id: string | null;
}

export interface AppSnapshot {
  /** The case as solved, at this moment of this day. */
  net: NetworkCase;
  solved: SolvedCase;
  operate: OperateResult;
  dispatch: DispatchResult;
  /** Hour of the day, 0–24, continuous. */
  hour: number;
  season: Season;
  profile: DayProfile;
  /** Demand as a fraction of the system peak, at this hour. */
  demandFraction: number;
  /** Circuits the user has taken out of service. */
  tripped: ReadonlySet<string>;
  /** Whether the battery fleet is available to charge and discharge. */
  storageInService: boolean;
  /**
   * A fault the reader has placed, if any.
   *
   * It is a STUDY, not a state of the network: the power flow still shows the
   * system operating normally, because a fault is cleared in a few cycles and
   * the pre-fault condition is what it is calculated from. Drawing the system
   * as though it were permanently faulted would be the wrong picture.
   */
  fault: FaultStudy | null;
  faultAt: { busId: string; kind: FaultKind } | null;
  selection: Selection;
  hovered: string | null;
  /** How long the last full re-solve took, milliseconds. */
  lastSolveMs: number;
  /**
   * The appliance the reader has switched on at 14 Cherry Lane, if any. It is
   * a real load in the real case: switching it on re-dispatches and re-solves
   * the whole state, which is the point.
   */
  appliance: Appliance | null;
  /**
   * The service worked out from the transformer's solved secondary voltage to
   * the socket. Every number in it is either solver output or the arithmetic
   * shown in the math panel.
   */
  service: ServiceSolution;
  /**
   * The motor start, if the reader has one in progress.
   *
   * Unlike the fault, this IS a state of the network — for a few seconds. The
   * solved case in this snapshot is the case WITH the motor's locked-rotor
   * demand in it, so every voltage on screen is the dipped one.
   */
  motor: MotorStudy | null;
  /**
   * The planning factors for the day as dispatched — load, demand, coincidence
   * and capacity. They belong to the whole day rather than to this hour, so
   * they change when the season does and not when the scrubber moves.
   */
  factors: FactorSet;
}

type Listener = (snapshot: AppSnapshot) => void;

export class AppState {
  private readonly base: NetworkCase;
  /** The case the dispatch runs against — the base, minus anything switched out. */
  private dispatchBase: NetworkCase;
  private day: DispatchResult[];
  private _season: Season = 'summer';
  private _hour = 18;
  private _tripped = new Set<string>();
  private _selection: Selection = { kind: 'none', id: null };
  private _hovered: string | null = null;
  private _appliance: Appliance | null = null;
  private _storageInService = true;
  private _faultAt: { busId: string; kind: FaultKind } | null = null;
  private _motorState: MotorState = 'off';
  private _motorMethod: StartMethod = 'across-the-line';
  private _motorSite = MOTOR_SITES[0].id;
  private snapshot: AppSnapshot;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.base = californiaCase();
    this.dispatchBase = this.base;
    this.day = dispatchDay(this.base, this.profile, SLACK_BUS);
    this.snapshot = this.recompute();
  }

  get profile(): DayProfile {
    return DAY_PROFILES[this._season];
  }

  get current(): AppSnapshot {
    return this.snapshot;
  }

  get baseCase(): NetworkCase {
    return this.base;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot);
    return () => this.listeners.delete(fn);
  }

  /** Re-dispatch and re-solve for the present settings. */
  private recompute(): AppSnapshot {
    const t0 = performance.now();
    const hourIndex = Math.round(this._hour) % 24;
    const dispatch = this.day[hourIndex];
    const net = applyDispatch(this.dispatchBase, this.profile, this._hour, dispatch);

    // Apply the user's switching: a tripped circuit is simply out of service,
    // and the solver knows nothing about why.
    for (const br of net.branches) {
      if (this._tripped.has(br.id)) br.inService = false;
    }

    // The one load in the model a reader can switch on by hand. It goes into
    // the case before the solve, so its effect — however small — is real.
    if (this._appliance) {
      const svc = net.loads.find((l) => l.id === 'SVC_LOAD');
      if (svc) {
        const a = this._appliance;
        const pMW = a.watts / 1e6;
        svc.pMW += pMW;
        svc.qMVAr += pMW * Math.tan(Math.acos(a.powerFactor));
      }
    }

    const result = operate(net);

    // The motor is the one perturbation that changes the network AFTER the
    // ordinary solve, because what it does is defined by the difference: the
    // case is solved without it to get the voltage the street was at, then
    // again with its locked-rotor demand in place to get the voltage it fell
    // to. Both solves are real; the dip is not estimated anywhere.
    const motor = this._motorState === 'off' ? null
      : studyMotorStart(net, result, this._motorState, this._motorMethod, this._motorSite);
    const final = motor ? motor.result : result;

    return {
      net,
      solved: final.solved,
      operate: final,
      dispatch,
      hour: this._hour,
      season: this._season,
      profile: this.profile,
      demandFraction: demandFactor(this.profile, this._hour),
      tripped: this._tripped,
      storageInService: this._storageInService,
      selection: this._selection,
      hovered: this._hovered,
      lastSolveMs: performance.now() - t0,
      appliance: this._appliance,
      service: serviceFrom(final.solved, this._appliance),
      faultAt: this._faultAt,
      fault: this._faultAt
        ? studyFault(final.solved, this._faultAt.busId, this._faultAt.kind)
        : null,
      motor,
      factors: factors(this.base, this.day),
    };
  }

  private emit(resolve: boolean): void {
    this.snapshot = resolve
      ? this.recompute()
      : {
          ...this.snapshot,
          selection: this._selection,
          hovered: this._hovered,
        };
    for (const fn of this.listeners) fn(this.snapshot);
  }

  setHour(hour: number): void {
    const h = ((hour % 24) + 24) % 24;
    if (Math.abs(h - this._hour) < 1e-6) return;
    this._hour = h;
    this.emit(true);
  }

  setSeason(season: Season): void {
    if (season === this._season) return;
    this._season = season;
    this.redispatch();
    this.emit(true);
  }

  /**
   * Take the battery fleet out of service, or put it back.
   *
   * This is the system-level perturbation, and it is the one that explains why
   * several gigawatts of batteries were built. With them in service the midday
   * surplus is absorbed by charging; without them there is nowhere for it to go
   * once every fuel-burning unit is at its minimum and the export ties are
   * full, and the only remaining option is to curtail free energy.
   */
  setStorageInService(on: boolean): void {
    if (on === this._storageInService) return;
    this._storageInService = on;
    this.redispatch();
    this.emit(true);
  }

  get storageInService(): boolean {
    return this._storageInService;
  }

  /** Re-run the whole day's dispatch for the present season and fleet. */
  private redispatch(): void {
    const base = cloneCase(this.base);
    if (!this._storageInService) {
      for (const g of base.generators) {
        if (g.kind === 'battery') g.inService = false;
      }
    }
    this.dispatchBase = base;
    this.day = dispatchDay(base, this.profile, SLACK_BUS);
  }

  /** Take a circuit out of service, or put it back. */
  toggleTrip(branchId: string): void {
    if (this._tripped.has(branchId)) this._tripped.delete(branchId);
    else this._tripped.add(branchId);
    this._tripped = new Set(this._tripped);
    this.emit(true);
  }

  /**
   * Put a fault somewhere, or take it away.
   *
   * The fault is calculated from the present solved case and does not change
   * it: a fault lasts a few cycles and the system it is calculated from is the
   * one that existed just before. Redrawing the whole network as permanently
   * short-circuited would be a different and much less useful picture.
   */
  setFault(busId: string | null, kind: FaultKind = 'single-line-to-ground'): void {
    const next = busId ? { busId, kind } : null;
    if (next?.busId === this._faultAt?.busId && next?.kind === this._faultAt?.kind) return;
    this._faultAt = next;
    this.emit(true);
  }

  get faultAt(): { busId: string; kind: FaultKind } | null {
    return this._faultAt;
  }

  /**
   * Start, run or stop the motor at the industrial unit.
   *
   * Every argument is optional so that the three controls — whether it is
   * running, how it is started, and where it is — can be moved one at a time
   * without the caller having to restate the other two.
   */
  setMotor(
    state: MotorState,
    method: StartMethod = this._motorMethod,
    site: string = this._motorSite
  ): void {
    if (state === this._motorState && method === this._motorMethod &&
        site === this._motorSite) return;
    this._motorState = state;
    this._motorMethod = method;
    this._motorSite = site;
    this.emit(true);
  }

  get motorState(): MotorState { return this._motorState; }
  get motorMethod(): StartMethod { return this._motorMethod; }
  get motorSite(): string { return this._motorSite; }

  /** Switch an appliance on at the modelled house, or switch everything off. */
  setAppliance(id: string | null): void {
    const next = id ? APPLIANCES.find((a) => a.id === id) ?? null : null;
    if ((next?.id ?? null) === (this._appliance?.id ?? null)) return;
    this._appliance = next;
    this.emit(true);
  }

  get appliance(): Appliance | null {
    return this._appliance;
  }

  restoreAll(): void {
    if (this._tripped.size === 0) return;
    this._tripped = new Set();
    this.emit(true);
  }

  select(kind: Selection['kind'], id: string | null): void {
    if (this._selection.kind === kind && this._selection.id === id) return;
    this._selection = { kind, id };
    this.emit(false);
  }

  hover(id: string | null): void {
    if (this._hovered === id) return;
    this._hovered = id;
    this.emit(false);
  }

  /** Solve one hypothetical without disturbing the app's own state. */
  probe(mutate: (net: NetworkCase) => void): OperateResult {
    const net = cloneCase(this.snapshot.net);
    mutate(net);
    return operate(net);
  }

  /** The whole day's dispatch, for the scrubber's background plot. */
  get dispatchDayResults(): readonly DispatchResult[] {
    return this.day;
  }
}

/**
 * The service, worked from the solved case.
 *
 * `secondaryV`, the load and the power factor all come out of the power flow;
 * everything past the transformer terminals is the arithmetic in
 * `src/data/california/service.ts`, which the math panel shows in full.
 */
function serviceFrom(solved: SolvedCase, appliance: Appliance | null): ServiceSolution {
  const bus = solved.busById.get('SVC_LV');
  // 240 V is the base, and the bus is the transformer's secondary terminals.
  const secondaryV = (bus?.vpu ?? 1) * 240;
  const pW = (bus?.pLoadMW ?? 0) * 1e6;
  const qVAr = (bus?.qLoadMVAr ?? 0) * 1e6;
  return solveService(secondaryV, pW, qVAr, appliance);
}
