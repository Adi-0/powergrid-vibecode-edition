import type { Grid } from './grid';
import type { Snapshot } from './snapshot';
import { breakerState } from './breakerState';
import { CONDUCTORS, CONDUCTOR_MECH, ACSR_R_COEFF, SPAN_WEATHER, type ConductorId } from '../data/conductors';
import { CONSTRUCTIONS } from '../data/towers';
import { DAY, airTemperature } from '../data/ca/profiles';
import { sunPosition } from '../physics/solar';
import { ampacity, conductorTemperature, sagAt, type HeatBalance, type SpanMechanics, type ThermalConductor, type ThermalWeather } from '../physics/ieee738';

/**
 * A span of a circuit, as physics: the current it carries in a solved interval (from
 * the power flow), the weather it hangs in (the hour's air temperature and sun at its
 * station, the wind the reader chooses), the conductor temperature that balances the
 * two (IEEE 738), and the sag that temperature gives (change of state from an everyday
 * reference). The power flow itself uses the circuit's fixed rating; this is what that
 * rating stands for.
 */
export type Wind = keyof typeof SPAN_WEATHER.windMs;

export interface SpanCircuit {
  branch: number;
  /** Conductor, sub-conductors per phase. */
  conductor: ConductorId;
  bundle: number;
  /** Current per phase and per sub-conductor, A. */
  amps: number;
  perSub: number;
  /** Real power onto the circuit here, MW (3φ). */
  p: number;
  /** The heat balance at the conductor's temperature; the temperature; the iteration's residual, W/m. */
  Ts: number;
  residual: number;
  balance: HeatBalance;
  /** Sag now and at its temperature limit, m; the tension now, N (per sub-conductor). */
  sag: number;
  sagMax: number;
  tension: number;
  maxTempC: number;
  /** The current, per phase, that would hold it at its limit in this weather, A. */
  ampacity: number;
  /** The fixed rating the power flow uses, as a current per phase, A. */
  ratingAmps: number;
}

export interface SpanState {
  t: number;
  hour: number;
  wind: Wind;
  weather: ThermalWeather;
  conductor: ThermalConductor;
  mech: SpanMechanics;
  circuits: SpanCircuit[];
  prov: { amps: string[]; air: string; sun: string };
}

export function spanThermal(id: ConductorId): { c: ThermalConductor; m: Omit<SpanMechanics, 'S'> } {
  const cd = CONDUCTORS[id];
  const mech = CONDUCTOR_MECH[id]!;
  const r50 = cd.r_ohm_per_mi / 1609.344;
  const c: ThermalConductor = {
    D: cd.diameter_in * 0.0254,
    rLo: r50 * (1 - 25 * ACSR_R_COEFF),
    tLo: 25,
    rHi: r50 * (1 + 25 * ACSR_R_COEFF),
    tHi: 75,
    absorptivity: SPAN_WEATHER.absorptivity,
    emissivity: SPAN_WEATHER.emissivity,
  };
  return {
    c,
    m: { w: mech.massKgPerM * 9.80665, A: mech.areaMm2 * 1e-6, E: mech.eGPa * 1e9, alpha: mech.alphaPerC, T0: SPAN_WEATHER.refTempC, H0: SPAN_WEATHER.refTensionFrac * mech.rbsKN * 1000 },
  };
}

/** A span's state: every circuit in its corridor, at the station `siteId`, `S` metres long, heading `lineAzDeg`. */
export function spanState(grid: Grid, s: Snapshot, siteId: string, branches: number[], S: number, lineAzDeg: number, wind: Wind): SpanState | null {
  if (s.outcome === 'none' || !branches.length) return null;
  const site = grid.sites.find((x) => x.id === siteId)!;
  const hour = s.startHour + DAY.intervalMin / 120;
  const region = site.region;
  const Ta = airTemperature(region, hour);
  const sun = sunPosition(site.lat, site.lon, DAY.doy, hour, DAY.tzHours);
  const weather: ThermalWeather = {
    Ta,
    windMs: SPAN_WEATHER.windMs[wind],
    windAngleDeg: SPAN_WEATHER.windAngleDeg,
    elevationM: SPAN_WEATHER.elevationM,
    sunAltDeg: 90 - (sun.zenith * 180) / Math.PI,
    sunAzDeg: (sun.azimuth * 180) / Math.PI,
    lineAzDeg,
  };
  const br0 = grid.branches[branches[0]!]!;
  const wire = CONSTRUCTIONS[br0.line!.construction].wires.find((w) => w.role === 'phase')!;
  const id = wire.conductor as ConductorId;
  const bundle = (wire as { bundle?: { n: number } }).bundle?.n ?? 1;
  const { c, m: m0 } = spanThermal(id);
  const mech: SpanMechanics = { ...m0, S };
  const maxT = CONDUCTOR_MECH[id]!.maxTempC;
  const sagMax = sagAt(mech, maxT).D;
  const circuits: SpanCircuit[] = branches.map((k) => {
    const br = grid.branches[k]!;
    const st = breakerState(grid, s, k, siteId);
    const amps = st && st.closed && st.energized ? st.amps : 0;
    const perSub = amps / bundle;
    const th = conductorTemperature(c, weather, perSub);
    const sg = sagAt(mech, th.Ts);
    return {
      branch: k,
      conductor: id,
      bundle,
      amps,
      perSub,
      p: st?.p ?? 0,
      Ts: th.Ts,
      residual: th.residual,
      balance: th.balance,
      sag: sg.D,
      sagMax,
      tension: sg.H,
      maxTempC: maxT,
      ampacity: ampacity(c, weather, maxT) * bundle,
      ratingAmps: (br.rateMVA / (Math.sqrt(3) * br.kv)) * 1000,
    };
  });
  return {
    t: s.t,
    hour,
    wind,
    weather,
    conductor: c,
    mech,
    circuits,
    prov: { amps: branches.map((k) => `derived:t${s.t}.cb:${siteId}:${grid.branches[k]!.id}.I`), air: `data:profiles.TEMPERATURE.${region}`, sun: `derived:solar.position.${siteId}` },
  };
}
