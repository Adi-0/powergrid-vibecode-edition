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
import { SolvedCase } from '../core/results.js';
import { californiaCase, SLACK_BUS } from '../data/california/network.js';
import { DayProfile, DAY_PROFILES, Season } from '../sim/profiles.js';
import { dispatchDay, applyDispatch, DispatchResult, demandFactor } from '../sim/dispatch.js';
import { operate, OperateResult } from '../sim/operate.js';

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
  selection: Selection;
  hovered: string | null;
  /** How long the last full re-solve took, milliseconds. */
  lastSolveMs: number;
}

type Listener = (snapshot: AppSnapshot) => void;

export class AppState {
  private readonly base: NetworkCase;
  private day: DispatchResult[];
  private _season: Season = 'summer';
  private _hour = 18;
  private _tripped = new Set<string>();
  private _selection: Selection = { kind: 'none', id: null };
  private _hovered: string | null = null;
  private snapshot: AppSnapshot;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.base = californiaCase();
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
    const net = applyDispatch(this.base, this.profile, this._hour, dispatch);

    // Apply the user's switching: a tripped circuit is simply out of service,
    // and the solver knows nothing about why.
    for (const br of net.branches) {
      if (this._tripped.has(br.id)) br.inService = false;
    }

    const result = operate(net);
    return {
      net,
      solved: result.solved,
      operate: result,
      dispatch,
      hour: this._hour,
      season: this._season,
      profile: this.profile,
      demandFraction: demandFactor(this.profile, this._hour),
      tripped: this._tripped,
      selection: this._selection,
      hovered: this._hovered,
      lastSolveMs: performance.now() - t0,
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
    this.day = dispatchDay(this.base, this.profile, SLACK_BUS);
    this.emit(true);
  }

  /** Take a circuit out of service, or put it back. */
  toggleTrip(branchId: string): void {
    if (this._tripped.has(branchId)) this._tripped.delete(branchId);
    else this._tripped.add(branchId);
    this._tripped = new Set(this._tripped);
    this.emit(true);
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
