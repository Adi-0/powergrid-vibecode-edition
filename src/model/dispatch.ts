import { DAY } from '../data/ca/profiles';
import { PRICES, type TechId } from '../data/tech';
import type { PlantRecord } from '../data/ca/plants';
import type { Grid, GridGen } from './grid';
import { availability, intervals, type Availability, type Interval } from './resources';
import { computePtdf, sced, type ScedVariable } from './sced';

/**
 * Deciding who runs, interval by interval: a quasi-static day.
 *
 * Each 15-minute interval is an independent steady state, but decisions are tied
 * together the way an operator's are:
 *
 *  1. Must-run and weather-driven output: nuclear at full output, geothermal
 *     near full output, wind and sun at whatever the weather gives.
 *  2. Energy-limited resources: each hydro plant has the day's water and spends it
 *     where demand is highest ("peak shaving"); batteries and pumped storage charge
 *     where the remaining demand is lowest and discharge where it is highest, with
 *     their round-trip losses.
 *  3. Unit commitment by priority list: gas units are started in merit order early
 *     enough (their start-up lead time) to cover the coming demand plus an
 *     operating reserve, and once started stay on for their minimum up time.
 *  4. Economic dispatch: committed units are loaded cheapest first, each within
 *     its limits and within how far it can ramp since the previous interval.
 *     When the must-take output alone exceeds demand, wind and solar are curtailed.
 *
 * The network is not in this decision (no transmission constraints): the power
 * flow that follows shows where the network would be stressed by it.
 */

export const RESERVE_FRACTION = 0.06;
const BATTERY_RTE = 0.86;
const PUMPED_RTE = 0.76;

export interface Unit {
  /** Plant id, or plant id and block number for interties that sell in blocks. */
  key: string;
  plant: PlantRecord;
  tech: TechId;
  gens: GridGen[];
  pmax: number;
  pmin: number;
  /** Variable cost, $/MWh. */
  cost: number;
  rampMWperInterval: number;
  leadIntervals: number;
  minUpIntervals: number;
  mustOn: boolean;
}

export interface IntervalDispatch {
  iv: Interval;
  av: Availability;
  /** Per generator, MW (negative: storage charging). */
  genMW: Float64Array;
  /** Per plant id: committed (online). */
  committed: Map<string, boolean>;
  /** Customer demand seen by the grid: gross − behind-the-meter solar, MW. */
  netLoadMW: number;
  grossLoadMW: number;
  btmMW: number;
  /** Losses assumed when dispatching (the power flow then settles the true value). */
  lossEstimateMW: number;
  windMW: number;
  solarMW: number;
  curtailedMW: number;
  /** Storage state of charge at the end of the interval, MWh, per plant id. */
  soc: Map<string, number>;
  marginal: { plantId: string; unitKey: string; costPerMWh: number } | null;
  /** Online headroom above dispatch among committed dispatchable units, MW. */
  reserveMW: number;
  /** Demand the committed fleet could not meet, MW. */
  shortfallMW: number;
  /** Must-take output that could not be absorbed even after curtailment, MW. */
  overgenerationMW: number;
  /** Locational marginal price per bus, $/MWh (uniform when nothing is congested). */
  lmp: Float64Array;
  /** Energy component of price (system marginal cost), $/MWh. */
  energyPrice: number;
  /** Branch limits that bound the dispatch, with their shadow prices. */
  congestion: Array<{ branch: number; shadow: number; flowMW: number; limitMW: number }>;
  /** Flow the dispatch could not bring within a limit, per branch, MW. */
  residualOverload: Map<number, number>;
}

export interface DaySchedule {
  units: Unit[];
  steps: IntervalDispatch[];
}

export function variableCost(p: PlantRecord, tech: TechId, heatRate: number | null): number {
  if (p.costPerMWh !== undefined) return p.costPerMWh;
  switch (tech) {
    case 'nuclear':
      return ((heatRate ?? 10450) / 1000) * PRICES.uranium_per_mmbtu + 2.5;
    case 'gas_ccgt':
    case 'gas_ct':
    case 'gas_cogen':
    case 'gas_recip': {
      const fuel = PRICES.gas_per_mmbtu + PRICES.co2_per_tonne * PRICES.gas_tco2_per_mmbtu;
      return ((heatRate ?? 7000) / 1000) * fuel + (tech === 'gas_ct' ? 5 : tech === 'gas_ccgt' ? 3 : 4);
    }
    default:
      return 0;
  }
}

export function buildUnits(grid: Grid): Unit[] {
  const byPlant = new Map<string, GridGen[]>();
  for (const g of grid.gens) {
    const l = byPlant.get(g.plant.id);
    if (l) l.push(g);
    else byPlant.set(g.plant.id, [g]);
  }
  const dt = DAY.intervalMin;
  const units: Unit[] = [];
  for (const gens of byPlant.values()) {
    const p = gens[0]!.plant;
    const t = gens[0]!.tech;
    const pmax = gens.reduce((s, g) => s + g.pmaxMW, 0);
    const pmin = gens.reduce((s, g) => s + g.pminMW, 0);
    const base = {
      plant: p,
      tech: t.id,
      gens,
      leadIntervals: Math.ceil((t.startLeadH * 60) / dt),
      minUpIntervals: Math.ceil((t.minUpH * 60) / dt),
      mustOn: t.id === 'import_ac' || t.id === 'import_dc' || t.id === 'gas_cogen' || p.mustRun === true,
    };
    if (p.blocks) {
      p.blocks.forEach((b, k) =>
        units.push({
          ...base,
          key: `${p.id}#${k + 1}`,
          pmax: b.mw,
          pmin: k === 0 ? pmin : 0,
          cost: b.cost,
          rampMWperInterval: t.rampPerMin * b.mw * dt,
        }),
      );
    } else {
      units.push({
        ...base,
        key: p.id,
        pmax,
        pmin,
        cost: variableCost(p, t.id, p.heatRate ?? t.heatRate),
        rampMWperInterval: t.rampPerMin * pmax * dt,
      });
    }
  }
  return units;
}

const THERMAL: ReadonlySet<TechId> = new Set(['gas_ccgt', 'gas_ct', 'gas_cogen', 'gas_recip', 'import_ac', 'import_dc']);

export interface DispatchOptions {
  /** Losses to cover, MW, per interval (from a previous power-flow pass). */
  lossMW?: Float64Array;
  /** Plants forced offline. */
  outages?: ReadonlySet<string>;
  /** Branches out of service (dispatch respects the network as it stands). */
  branchOutages?: ReadonlySet<number>;
  /** Ignore the network (pure merit order), to show what congestion costs. */
  unconstrained?: boolean;
}

export function dispatchDay(grid: Grid, opts: DispatchOptions = {}): DaySchedule {
  const ivs = intervals();
  const nT = ivs.length;
  const dtH = DAY.intervalMin / 60;
  const units = buildUnits(grid);
  const out = opts.outages ?? new Set<string>();
  const avs = ivs.map((iv) => availability(grid, iv));
  const ptdf = opts.unconstrained ? null : computePtdf(grid, opts.branchOutages ?? new Set());
  const busShares = (u: Unit) => {
    const tot = u.gens.reduce((a, g) => a + g.pmaxMW, 0) || 1;
    return u.gens.map((g) => ({ bus: g.bus.index, share: (g.pmaxMW || 1) / (tot || u.gens.length) }));
  };

  // ---- 1. must-take output and the residual demand
  const netLoad = avs.map((a) => sum(a.grossMW) - sum(a.btmMW));
  const loss = ivs.map((_, t) => opts.lossMW?.[t] ?? 0.022 * netLoad[t]!);
  const tbcLoss = grid.hvdc.reduce((s, h) => s + h.rec.scheduleMW * h.rec.lossFrac, 0);
  const demand = netLoad.map((d, t) => d + loss[t]! + tbcLoss);
  const genMW = ivs.map(() => new Float64Array(grid.gens.length));
  const setUnit = (u: Unit, t: number, mw: number) => {
    const share = u.gens.reduce((s, g) => s + g.pmaxMW, 0);
    for (const g of u.gens) genMW[t]![g.index] = (mw * g.pmaxMW) / share;
  };
  const addUnit = (u: Unit, t: number, mw: number) => {
    const share = u.gens.reduce((s, g) => s + g.pmaxMW, 0);
    for (const g of u.gens) genMW[t]![g.index] = genMW[t]![g.index]! + (mw * g.pmaxMW) / share;
  };
  const residual = demand.slice();
  const renewAvail = new Float64Array(nT);
  for (const u of units) {
    if (out.has(u.plant.id)) continue;
    for (let t = 0; t < nT; t++) {
      if (u.tech === 'nuclear') {
        setUnit(u, t, u.pmax);
        residual[t] = residual[t]! - u.pmax;
      } else if (u.tech === 'geothermal') {
        const mw = 0.95 * u.pmax;
        setUnit(u, t, mw);
        residual[t] = residual[t]! - mw;
      } else if (u.tech === 'wind' || u.tech === 'solar_pv') {
        const mw = u.gens.reduce((s, g) => s + avs[t]!.renewableMW[g.index]!, 0);
        setUnit(u, t, mw);
        residual[t] = residual[t]! - mw;
        renewAvail[t] = renewAvail[t]! + mw;
      }
    }
  }

  // ---- 2. energy-limited resources: hydro peak-shaving, then storage
  const soc = new Map<string, Float64Array>();
  for (const u of units.filter((u) => u.tech === 'hydro' && !out.has(u.plant.id)).sort((a, b) => b.pmax - a.pmax)) {
    const E = (u.plant.dailyCF ?? 0.4) * u.pmax * 24;
    const sched = waterFill(residual, u.pmin, u.pmax, E, dtH);
    for (let t = 0; t < nT; t++) {
      setUnit(u, t, sched[t]!);
      residual[t] = residual[t]! - sched[t]!;
    }
  }
  const batteries = units.filter((u) => u.tech === 'battery' && !out.has(u.plant.id));
  if (batteries.length) {
    const P = batteries.reduce((s, u) => s + u.pmax, 0);
    const E = batteries.reduce((s, u) => s + u.pmax * (u.plant.hours ?? 4), 0);
    const st = storageSchedule(residual, P, P, E, BATTERY_RTE, dtH);
    for (const u of batteries) {
      const f = u.pmax / P;
      const s = new Float64Array(nT);
      for (let t = 0; t < nT; t++) {
        setUnit(u, t, st.mw[t]! * f);
        s[t] = st.soc[t]! * f;
      }
      soc.set(u.plant.id, s);
    }
    for (let t = 0; t < nT; t++) residual[t] = residual[t]! - st.mw[t]!;
  }
  for (const u of units.filter((u) => u.tech === 'pumped_storage' && !out.has(u.plant.id))) {
    const st = storageSchedule(residual, u.pmax, -u.pmin, u.pmax * (u.plant.hours ?? 8), PUMPED_RTE, dtH);
    for (let t = 0; t < nT; t++) {
      setUnit(u, t, st.mw[t]!);
      residual[t] = residual[t]! - st.mw[t]!;
    }
    soc.set(u.plant.id, st.soc);
  }

  // ---- 3 & 4. commitment and economic dispatch of gas and imports, in merit order
  const disp = units.filter((u) => THERMAL.has(u.tech) && !out.has(u.plant.id)).sort((a, b) => a.cost - b.cost);
  const committed = new Map<string, boolean>();
  const upFor = new Map<string, number>();
  const prev = new Map<string, number>();
  for (const u of disp) {
    committed.set(u.key, u.mustOn);
    upFor.set(u.key, u.mustOn ? 1e9 : 0);
    prev.set(u.key, 0);
  }
  const steps: IntervalDispatch[] = [];
  // Two passes over the day: the second starts from where the first ended, so
  // midnight's ramp and commitment are consistent (the day is treated as cyclic).
  for (let pass = 0; pass < 2; pass++) {
    for (let t = 0; t < nT; t++) {
      const R = residual[t]!;
      // commitment
      const needOver = (lead: number) => {
        let m = -Infinity;
        for (let k = 0; k <= lead; k++) m = Math.max(m, residual[(t + k) % nT]! * (1 + RESERVE_FRACTION) + RESERVE_FRACTION * 0);
        return m;
      };
      let capOn = 0;
      for (const u of disp) if (committed.get(u.key)) capOn += u.pmax;
      for (const u of disp) {
        if (committed.get(u.key)) continue;
        if (capOn < needOver(Math.max(1, u.leadIntervals))) {
          committed.set(u.key, true);
          upFor.set(u.key, 0);
          capOn += u.pmax;
        }
      }
      for (const u of [...disp].reverse()) {
        if (!committed.get(u.key) || u.mustOn) continue;
        if ((upFor.get(u.key) ?? 0) < u.minUpIntervals) continue;
        if (capOn - u.pmax >= needOver(Math.max(1, u.leadIntervals)) && (prev.get(u.key) ?? 0) <= u.pmin + 1e-6) {
          committed.set(u.key, false);
          capOn -= u.pmax;
        }
      }
      // dispatch bounds
      const lb = new Map<string, number>();
      const ub = new Map<string, number>();
      for (const u of disp) {
        if (!committed.get(u.key)) {
          lb.set(u.key, 0);
          ub.set(u.key, 0);
          continue;
        }
        const p0 = prev.get(u.key) ?? 0;
        const started = p0 < u.pmin - 1e-6;
        const lo = started ? u.pmin : Math.max(u.pmin, p0 - u.rampMWperInterval);
        const hi = started ? Math.min(u.pmax, u.pmin + u.rampMWperInterval) : Math.min(u.pmax, p0 + u.rampMWperInterval);
        lb.set(u.key, lo);
        ub.set(u.key, Math.max(lo, hi));
      }
      let base = 0;
      for (const u of disp) base += lb.get(u.key)!;
      let curtailed = 0;
      let overgen = 0;
      let shortfall = 0;
      const mw = new Map<string, number>();
      for (const u of disp) mw.set(u.key, lb.get(u.key)!);
      let marginal: IntervalDispatch['marginal'] = null;
      if (base > R) {
        curtailed = Math.min(base - R, renewAvail[t]!);
        overgen = base - R - curtailed;
        marginal = null;
      } else {
        let need = R - base;
        for (const u of disp) {
          const room = ub.get(u.key)! - lb.get(u.key)!;
          const add = Math.min(room, need);
          if (add > 0) {
            mw.set(u.key, lb.get(u.key)! + add);
            need -= add;
            marginal = { plantId: u.plant.id, unitKey: u.key, costPerMWh: u.cost };
          }
          if (need <= 1e-9) break;
        }
        if (need > 1e-6) {
          // Emergency: start fast units not yet on (peakers start within minutes).
          for (const u of disp) {
            if (committed.get(u.key) || u.leadIntervals > 1) continue;
            committed.set(u.key, true);
            upFor.set(u.key, 0);
            const add = Math.min(u.pmax, need);
            mw.set(u.key, add);
            need -= add;
            marginal = { plantId: u.plant.id, unitKey: u.key, costPerMWh: u.cost };
            if (need <= 1e-9) break;
          }
        }
        shortfall = Math.max(0, need);
      }
      // ---- network security: redispatch around branch limits (DC, via PTDFs)
      let lmp: Float64Array = new Float64Array(grid.buses.length).fill(marginal?.costPerMWh ?? 0);
      let energyPrice = marginal?.costPerMWh ?? 0;
      let congestion: IntervalDispatch['congestion'] = [];
      let residualOverload = new Map<number, number>();
      const renewUnits = units.filter((u) => (u.tech === 'wind' || u.tech === 'solar_pv') && !out.has(u.plant.id));
      if (ptdf) {
        const cf = renewAvail[t]! > 0 ? curtailed / renewAvail[t]! : 0;
        const vars: ScedVariable[] = [];
        const inVars = new Set<string>();
        for (const u of disp) {
          if (!committed.get(u.key)) continue;
          const lo = lb.get(u.key)!;
          const hi = ub.get(u.key)!;
          if (hi - lo < 1e-6) continue;
          vars.push({ key: u.key, buses: busShares(u), lb: lo, ub: hi, cost: u.cost, mw: mw.get(u.key)! });
          inVars.add(u.key);
        }
        for (const u of renewUnits) {
          const avail = u.gens.reduce((a, g) => a + avs[t]!.renewableMW[g.index]!, 0);
          if (avail <= 1e-6) continue;
          vars.push({ key: `R:${u.key}`, buses: busShares(u), lb: 0, ub: avail, cost: -1, mw: avail * (1 - cf) });
        }
        const inj = new Float64Array(grid.buses.length);
        const a = avs[t]!;
        grid.loads.forEach((l, i) => {
          const net = a.grossMW[i]! - a.btmMW[i]!;
          inj[l.bus.index] = inj[l.bus.index]! - net * (1 + loss[t]! / netLoad[t]!);
        });
        for (const h of grid.hvdc) {
          inj[h.from.index] = inj[h.from.index]! - h.rec.scheduleMW;
          inj[h.to.index] = inj[h.to.index]! + h.rec.scheduleMW * (1 - h.rec.lossFrac);
        }
        for (const u of units) {
          if (out.has(u.plant.id) || u.tech === 'wind' || u.tech === 'solar_pv') continue;
          if (THERMAL.has(u.tech)) {
            if (inVars.has(u.key)) continue;
            for (const b of busShares(u)) inj[b.bus] = inj[b.bus]! + (mw.get(u.key) ?? 0) * b.share;
          } else {
            for (const g of u.gens) inj[g.bus.index] = inj[g.bus.index]! + genMW[t]![g.index]!;
          }
        }
        const r = sced(grid, ptdf, vars, inj, opts.branchOutages);
        if (r.redispatched) {
          for (const v of vars) {
            if (v.key.startsWith('R:')) continue;
            mw.set(v.key, r.mw.get(v.key)!);
          }
          let used = 0;
          for (const u of renewUnits) {
            const v = vars.find((x) => x.key === `R:${u.key}`);
            const x = v ? r.mw.get(v.key)! : 0;
            used += x;
            const avail = u.gens.reduce((q, g) => q + a.renewableMW[g.index]!, 0);
            for (const g of u.gens) genMW[t]![g.index] = avail > 0 ? (a.renewableMW[g.index]! / avail) * x : 0;
          }
          curtailed = Math.max(0, renewAvail[t]! - used);
          lmp = r.lmp;
          energyPrice = r.energyPrice;
          congestion = r.binding;
          residualOverload = r.residualOverload;
          // the marginal unit: a unit between its bounds, priced at the energy price
          let best: Unit | null = null;
          for (const u of disp) {
            const x = mw.get(u.key)!;
            if (!committed.get(u.key) || x <= lb.get(u.key)! + 1e-3 || x >= ub.get(u.key)! - 1e-3) continue;
            if (!best || Math.abs(u.cost - energyPrice) < Math.abs(best.cost - energyPrice)) best = u;
          }
          if (best) marginal = { plantId: best.plant.id, unitKey: best.key, costPerMWh: best.cost };
        }
      }
      for (const u of disp) for (const g of u.gens) genMW[t]![g.index] = 0;
      for (const u of disp) {
        addUnit(u, t, mw.get(u.key)!);
        prev.set(u.key, mw.get(u.key)!);
        if (committed.get(u.key)) upFor.set(u.key, (upFor.get(u.key) ?? 0) + 1);
      }
      if (curtailed > 0 && congestion.length === 0 && residualOverload.size === 0) {
        // curtail wind and solar pro rata
        const f = 1 - curtailed / renewAvail[t]!;
        for (const u of units) {
          if (u.tech !== 'wind' && u.tech !== 'solar_pv') continue;
          for (const g of u.gens) genMW[t]![g.index] = genMW[t]![g.index]! * f;
        }
      }
      if (pass === 1) {
        let reserve = 0;
        for (const u of disp) if (committed.get(u.key)) reserve += Math.min(u.pmax, mw.get(u.key)! + 2 * u.rampMWperInterval) - mw.get(u.key)!;
        const a = avs[t]!;
        let wind = 0;
        let solar = 0;
        for (const u of units) {
          const v = u.gens.reduce((s, g) => s + genMW[t]![g.index]!, 0);
          if (u.tech === 'wind') wind += v;
          if (u.tech === 'solar_pv') solar += v;
        }
        const socNow = new Map<string, number>();
        for (const [k, s] of soc) socNow.set(k, s[t]!);
        steps.push({
          iv: ivs[t]!,
          av: a,
          genMW: genMW[t]!.slice(),
          committed: plantCommitment(disp, committed),
          netLoadMW: netLoad[t]!,
          grossLoadMW: sum(a.grossMW),
          btmMW: sum(a.btmMW),
          lossEstimateMW: loss[t]!,
          windMW: wind,
          solarMW: solar,
          curtailedMW: curtailed,
          soc: socNow,
          marginal,
          reserveMW: reserve,
          shortfallMW: shortfall,
          overgenerationMW: overgen,
          lmp,
          energyPrice,
          congestion,
          residualOverload,
        });
      } else if (curtailed > 0) {
        // restore availability for the second pass
        const a = avs[t]!;
        for (const u of units) {
          if (u.tech !== 'wind' && u.tech !== 'solar_pv') continue;
          for (const g of u.gens) genMW[t]![g.index] = a.renewableMW[g.index]!;
        }
      }
    }
  }
  return { units, steps };
}

function sum(a: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]!;
  return s;
}

/**
 * Spend energy E (MWh) against a demand curve so the output tops off the highest
 * demand: output(t) = clamp(R(t) − λ, pmin, pmax), with the level λ found by
 * bisection so that Σ output·Δt = E.
 */
export function waterFill(R: ArrayLike<number>, pmin: number, pmax: number, E: number, dtH: number): Float64Array {
  const n = R.length;
  const out = new Float64Array(n);
  const total = (lam: number) => {
    let s = 0;
    for (let t = 0; t < n; t++) s += Math.min(pmax, Math.max(pmin, R[t]! - lam)) * dtH;
    return s;
  };
  if (E <= pmin * n * dtH) return out.fill(pmin);
  if (E >= pmax * n * dtH) return out.fill(pmax);
  let lo = Math.min(...Array.from(R)) - pmax - 1;
  let hi = Math.max(...Array.from(R)) - pmin + 1;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (total(mid) > E) lo = mid;
    else hi = mid;
  }
  const lam = (lo + hi) / 2;
  for (let t = 0; t < n; t++) out[t] = Math.min(pmax, Math.max(pmin, R[t]! - lam));
  return out;
}

/**
 * Storage against a demand curve: discharge where demand is highest (above level
 * D), charge where it is lowest (below level C), with the energy charged equal to
 * the energy discharged divided by the round-trip efficiency. The state of charge
 * is kept within the reservoir over a cyclic day (it ends where it began).
 */
export function storageSchedule(
  R: ArrayLike<number>,
  pDis: number,
  pChg: number,
  energyMWh: number,
  rte: number,
  dtH: number,
): { mw: Float64Array; soc: Float64Array } {
  const n = R.length;
  let Ed = 0.95 * energyMWh;
  const arr = Array.from(R);
  for (let attempt = 0; attempt < 40; attempt++) {
    const dis = waterFill(arr, 0, pDis, Ed, dtH);
    // charging: fill the valleys, c(t) = clamp(C − R(t), 0, pChg), Σc·Δt = Ed / rte
    const neg = arr.map((v) => -v);
    const chg = waterFill(neg, 0, pChg, Ed / rte, dtH);
    const mw = new Float64Array(n);
    for (let t = 0; t < n; t++) mw[t] = dis[t]! - chg[t]!;
    // state of charge with √rte on each side
    const e = Math.sqrt(rte);
    const s = new Float64Array(n);
    let acc = 0;
    let mn = 0;
    let mx = 0;
    for (let t = 0; t < n; t++) {
      acc += (chg[t]! * e - dis[t]! / e) * dtH;
      s[t] = acc;
      mn = Math.min(mn, acc);
      mx = Math.max(mx, acc);
    }
    const overlap = mw.some((_, t) => dis[t]! > 1e-6 && chg[t]! > 1e-6);
    if (mx - mn <= energyMWh + 1e-6 && !overlap) {
      for (let t = 0; t < n; t++) s[t] = s[t]! - mn;
      return { mw, soc: s };
    }
    Ed *= 0.9;
  }
  return { mw: new Float64Array(n), soc: new Float64Array(n) };
}

/** A plant is online when any of its units (or intertie blocks) is committed. */
function plantCommitment(disp: Unit[], committed: Map<string, boolean>): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const u of disp) m.set(u.plant.id, (m.get(u.plant.id) ?? false) || committed.get(u.key) === true);
  return m;
}
