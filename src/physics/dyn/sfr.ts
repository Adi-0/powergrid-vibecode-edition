import { RK4 } from './rk4';

/**
 * System frequency response after a sudden loss of generation: one frequency for the
 * whole interconnection (the centre of inertia), every synchronous machine's stored
 * energy slowing its fall, every governor opening its valve or gate in proportion to
 * the frequency drop over its droop, and load that draws a little less as frequency
 * falls.
 *
 *   2 H_sys S_sys dΔω/dt = Σ_i ΔP_m,i − ΔP_trip − D P_L Δω        (MW; Δω in pu of f₀)
 *
 * The same form as Kundur's aggregate model and Anderson & Mirheydar's low-order SFR
 * model, with each unit's own turbine–governor. Governor models (all deviations from
 * the pre-trip point, MW; standard block forms, parameters canonical for the class and
 * marked estimates in the data):
 *   steam, reheat  valve servo T_G → steam chest T_CH → reheater T_RH, a fraction F_HP
 *                  of the power from the high-pressure stage (Kundur's reheat turbine);
 *   gas            fuel valve and combustor, one lag T_G; in a combined cycle, the
 *                  steam turbine's share σ follows the gas turbines' exhaust with the
 *                  lag of the heat-recovery boiler, T_HRSG;
 *   hydro          gate servo T_G with transient-droop compensation (R_T, T_R) and
 *                  the water column's non-minimum-phase response (1 − T_w s)/(1 + ½T_w s);
 *   battery        inverter power control, one short lag.
 * Each unit's output is held within its headroom (and floor). Integrated with
 * fixed-step RK4 (step stated in the result).
 */
export type GovKind = 'steam' | 'gas' | 'ccgt' | 'hydro' | 'battery' | 'none';

export interface SfrUnit {
  id: string;
  group: string;
  /** Inertia constant on the unit's base, s. */
  H: number;
  /** Base (rating), MW. */
  S: number;
  /** Output before the event, MW. */
  P0: number;
  /** Most and least it can make, MW. */
  Pmax: number;
  Pmin: number;
  /** Droop, pu; null for no governor response. */
  R: number | null;
  gov: GovKind;
}

export interface SfrParams {
  f0: number;
  /** Load damping D: % change in load per % change in frequency. */
  D: number;
  /** Total load, MW (what D applies to). */
  PL: number;
  /** Integration step, s; run length, s; output sampling, s. */
  h: number;
  tEnd: number;
  sample: number;
}

/** Turbine–governor constants by kind (Kundur's typical values; estimates). */
export const GOV = {
  steam: { TG: 0.2, TCH: 0.3, TRH: 7.0, FHP: 0.3 },
  gas: { TG: 0.5 },
  ccgt: { TG: 0.5, sigma: 0.3, THRSG: 40 },
  hydro: { TG: 0.2, Tw: 1.0, TR: 5.0 },
  battery: { T: 0.25 },
} as const;

/** Transient droop R_T for a hydro unit (Kundur's rule of thumb): [2.3 − 0.15(T_w − 1)] T_w / T_M, T_M = 2H. */
export function hydroTransientDroop(H: number, Tw = GOV.hydro.Tw): number {
  return ((2.3 - 0.15 * (Tw - 1)) * Tw) / (2 * H);
}

export interface SfrResult {
  t: Float64Array;
  /** Frequency, Hz. */
  f: Float64Array;
  /** Mechanical power change by group, MW, per sample (groups in `groups` order). */
  groups: string[];
  dPm: Float64Array[];
  /** Load's own reduction, MW, per sample. */
  dLoad: Float64Array;
  /** Per unit, its change at the end of the run, MW. */
  unitDP: Float64Array;
  /** Lowest frequency and when. */
  nadirHz: number;
  nadirT: number;
  /** Initial rate of change of frequency, Hz/s (closed form: −ΔP f₀ / 2H_sys S_sys). */
  rocof: number;
  /** Stored kinetic energy after the trip, MW·s. */
  kineticMWs: number;
  /** Frequency where governors and load damping together make up the loss (closed form, limits respected). */
  settledHz: number;
  /** Frequency response characteristic β = ΣS_i/R_i + D P_L, MW per pu of f₀ (before limits). */
  betaMWperPu: number;
  step: number;
  /** Units at their limit by the end of the run. */
  atLimit: number;
}

/** Number of states each governor kind carries. */
const NS: Record<GovKind, number> = { steam: 3, gas: 1, ccgt: 2, hydro: 3, battery: 1, none: 0 };

export function simulateTrip(units: SfrUnit[], lossMW: number, p: SfrParams): SfrResult {
  const f0 = p.f0;
  const n = units.length;
  const off = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i]! + NS[units[i]!.R === null ? 'none' : units[i]!.gov];
  const N = 1 + off[n]!;
  const M = units.reduce((a, u) => a + 2 * u.H * u.S, 0); // MW·s per pu frequency
  const DPL = (p.D * p.PL) / 1; // MW per pu
  const hi = units.map((u) => u.Pmax - u.P0);
  const lo = units.map((u) => u.Pmin - u.P0);
  const rT = units.map((u) => (u.gov === 'hydro' && u.R ? hydroTransientDroop(u.H) : 0));
  const out = new Float64Array(n);

  const outputs = (x: Float64Array) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const u = units[i]!;
      const o = 1 + off[i]!;
      let y = 0;
      if (u.R !== null)
        switch (u.gov) {
          case 'steam':
            y = GOV.steam.FHP * x[o + 1]! + (1 - GOV.steam.FHP) * x[o + 2]!;
            break;
          case 'gas':
          case 'battery':
            y = x[o]!;
            break;
          case 'ccgt':
            y = (1 - GOV.ccgt.sigma) * x[o]! + GOV.ccgt.sigma * x[o + 1]!;
            break;
          case 'hydro': {
            // water column: −2 g + z (gate g, lag state z)
            y = -2 * x[o + 1]! + x[o + 2]!;
            break;
          }
          default:
            y = 0;
        }
      y = Math.min(hi[i]!, Math.max(lo[i]!, y));
      out[i] = y;
      sum += y;
    }
    return sum;
  };

  const deriv = (_t: number, x: Float64Array, dx: Float64Array) => {
    const dw = x[0]!;
    const pm = outputs(x);
    dx[0] = (pm - lossMW - DPL * dw) / M;
    for (let i = 0; i < n; i++) {
      const u = units[i]!;
      if (u.R === null) continue;
      const o = 1 + off[i]!;
      const cmd = (-dw * u.S) / u.R; // MW asked for at steady state
      switch (u.gov) {
        case 'steam':
          dx[o] = (cmd - x[o]!) / GOV.steam.TG;
          dx[o + 1] = (x[o]! - x[o + 1]!) / GOV.steam.TCH;
          dx[o + 2] = (x[o + 1]! - x[o + 2]!) / GOV.steam.TRH;
          break;
        case 'gas':
          dx[o] = (cmd - x[o]!) / GOV.gas.TG;
          break;
        case 'ccgt':
          dx[o] = (cmd - x[o]!) / GOV.ccgt.TG;
          dx[o + 1] = (x[o]! - x[o + 1]!) / GOV.ccgt.THRSG;
          break;
        case 'battery':
          dx[o] = (cmd - x[o]!) / GOV.battery.T;
          break;
        case 'hydro': {
          // transient droop: c = v (1 + sT_R)/(1 + sT_A), T_A = T_R R_T / R_P; state w
          const TA = (GOV.hydro.TR * rT[i]!) / u.R;
          const w = x[o]!;
          const c = w + (GOV.hydro.TR / TA) * (cmd - w);
          dx[o] = (cmd - w) / TA;
          // gate servo
          dx[o + 1] = (c - x[o + 1]!) / GOV.hydro.TG;
          // water column, (1 − T_w s)/(1 + ½T_w s) = −2 + 3/(1 + ½T_w s): lag state z
          dx[o + 2] = (3 * x[o + 1]! - x[o + 2]!) / (0.5 * GOV.hydro.Tw);
          break;
        }
        default:
          break;
      }
    }
  };

  const rk = new RK4(N, p.h, deriv);
  const x = new Float64Array(N);
  const steps = Math.round(p.tEnd / p.h);
  const every = Math.max(1, Math.round(p.sample / p.h));
  const groups = [...new Set(units.map((u) => u.group))];
  const gi = units.map((u) => groups.indexOf(u.group));
  const T: number[] = [];
  const F: number[] = [];
  const G: number[][] = groups.map(() => []);
  const L: number[] = [];
  const record = (t: number) => {
    outputs(x);
    T.push(t);
    F.push(f0 * (1 + x[0]!));
    const sums = new Float64Array(groups.length);
    for (let i = 0; i < n; i++) sums[gi[i]!] = sums[gi[i]!]! + out[i]!;
    groups.forEach((_, k) => G[k]!.push(sums[k]!));
    L.push(-DPL * x[0]!);
  };
  record(0);
  let nadir = f0;
  let nadirT = 0;
  for (let k = 0; k < steps; k++) {
    rk.step(k * p.h, x);
    const fk = f0 * (1 + x[0]!);
    if (fk < nadir) {
      nadir = fk;
      nadirT = (k + 1) * p.h;
    }
    if ((k + 1) % every === 0) record((k + 1) * p.h);
  }
  outputs(x);
  const unitDP = Float64Array.from(out);
  let atLimit = 0;
  for (let i = 0; i < n; i++) if (units[i]!.R !== null && (unitDP[i]! >= hi[i]! - 1e-6 || unitDP[i]! <= lo[i]! + 1e-6) && hi[i]! - lo[i]! > 0) atLimit++;

  // Settled: Σ clamp(−Δω S/R) + ... = ΔP + D P_L Δω, solved by bisection on Δω (monotone).
  const beta = units.reduce((a, u) => a + (u.R === null ? 0 : u.S / u.R), 0) + DPL;
  const resid = (dw: number) => {
    let s = -DPL * dw;
    units.forEach((u, i) => {
      if (u.R !== null) s += Math.min(hi[i]!, Math.max(lo[i]!, (-dw * u.S) / u.R));
    });
    return s - lossMW;
  };
  let a = -0.5;
  let b = 0.5;
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (resid(m) > 0) a = m;
    else b = m;
  }
  return {
    t: Float64Array.from(T),
    f: Float64Array.from(F),
    groups,
    dPm: G.map((g) => Float64Array.from(g)),
    dLoad: Float64Array.from(L),
    unitDP,
    nadirHz: nadir,
    nadirT,
    rocof: (-lossMW * f0) / M,
    kineticMWs: M / 2,
    settledHz: f0 * (1 + (a + b) / 2),
    betaMWperPu: beta,
    step: p.h,
    atLimit,
  };
}
