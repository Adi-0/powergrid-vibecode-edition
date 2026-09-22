import { DAY, LOAD_SHAPE, WIND_SHAPE, airTemperature, hourly } from '../data/ca/profiles';
import { clearSky, planeOfArray, pvOutput, sunPosition, PV_DEFAULTS } from '../physics/solar';
import type { Grid } from './grid';

/**
 * What the day brings, interval by interval, before any decision is made:
 * demand at each load bus, rooftop solar behind the meter, and the wind and
 * sunshine available to each plant.
 */
export interface Interval {
  index: number;
  /** Clock hour at the interval's start and middle. */
  startHour: number;
  midHour: number;
}

export function intervals(): Interval[] {
  const n = (24 * 60) / DAY.intervalMin;
  const dt = DAY.intervalMin / 60;
  return Array.from({ length: n }, (_, i) => ({ index: i, startHour: i * dt, midHour: (i + 0.5) * dt }));
}

export interface Availability {
  /** Per load: gross demand (MW, MVAr) and behind-the-meter solar (MW). */
  grossMW: Float64Array;
  grossMVAr: Float64Array;
  btmMW: Float64Array;
  /** Per generator: MW available from wind or sun (NaN for dispatchable units). */
  renewableMW: Float64Array;
}

/**
 * Rooftop arrays: modelled as fixed, 20° tilt, facing south, modest DC/AC ratio,
 * with a diversity factor for the real mix of orientations and shading (estimate).
 */
const ROOFTOP = { ...PV_DEFAULTS, dcacRatio: 1.15, dcLosses: 0.1 };
const ROOFTOP_DIVERSITY = 0.8;

export function availability(grid: Grid, iv: Interval): Availability {
  const h = iv.midHour;
  const shape = hourly(LOAD_SHAPE, h) * DAY.peakScale;
  const nL = grid.loads.length;
  const grossMW = new Float64Array(nL);
  const grossMVAr = new Float64Array(nL);
  const btmMW = new Float64Array(nL);
  grid.loads.forEach((l, i) => {
    const p = l.rec.peakMW * shape;
    grossMW[i] = p;
    grossMVAr[i] = p * Math.tan(Math.acos(l.rec.pf));
    const s = l.bus.site;
    const sun = sunPosition(s.lat, s.lon, DAY.doy, h, DAY.tzHours);
    const sky = clearSky(sun.zenith);
    const poa = planeOfArray(sun, sky, 'fixed', 20).poa;
    btmMW[i] = l.rec.btmMW * ROOFTOP_DIVERSITY * pvOutput(poa, airTemperature(s.region, h), ROOFTOP).pac;
  });
  const renewableMW = new Float64Array(grid.gens.length).fill(NaN);
  grid.gens.forEach((g, i) => {
    const prof = g.plant.profile;
    if (g.tech.id === 'wind' && prof && prof !== 'tracking' && prof !== 'fixed') {
      renewableMW[i] = g.pmaxMW * hourly(WIND_SHAPE[prof], h);
    } else if (g.tech.id === 'solar_pv') {
      const s = g.bus.site;
      const sun = sunPosition(s.lat, s.lon, DAY.doy, h, DAY.tzHours);
      const sky = clearSky(sun.zenith);
      const mount = prof === 'fixed' ? 'fixed' : 'tracking';
      const poa = planeOfArray(sun, sky, mount, 25).poa;
      renewableMW[i] = g.pmaxMW * pvOutput(poa, airTemperature(s.region, h)).pac;
    }
  });
  return { grossMW, grossMVAr, btmMW, renewableMW };
}
