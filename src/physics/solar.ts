/**
 * From the sun's position to a PV plant's AC output, step by step. Each stage is a
 * real relationship a person can follow; the plant view shows the same chain.
 *
 *  1. Sun position (NOAA general solar position equations): day angle γ,
 *     declination δ, equation of time, hour angle h, then zenith z from
 *     cos z = sin φ sin δ + cos φ cos δ cos h.
 *  2. Clear-sky beam irradiance (Meinel): DNI = 1353 · 0.7^(AM^0.678) W/m², with air
 *     mass AM = 1/cos z. Diffuse taken as a fixed fraction of the beam (estimate).
 *  3. Plane-of-array irradiance for the panel orientation (fixed tilt, or a
 *     single-axis north–south tracker that follows the sun east to west).
 *  4. Cell temperature: T_cell = T_amb + (NOCT − 20)/800 · G_POA.
 *  5. DC power: P_dc = P_dc,rated · G_POA/1000 · (1 + γ_T (T_cell − 25)) · (1 − losses).
 *  6. Inverter: P_ac = min(η · P_dc, P_ac,rated) — plants are built with more DC than
 *     AC capacity, so the output "clips" flat around noon.
 */

export interface SunPosition {
  /** Zenith angle, rad (0 = overhead). */
  zenith: number;
  /** Azimuth, rad, clockwise from north. */
  azimuth: number;
  declination: number;
  hourAngle: number;
  equationOfTimeMin: number;
}

/**
 * @param doy day of year (1 = Jan 1)
 * @param clockHour local clock time in hours (e.g. 13.5)
 * @param tzHours UTC offset of that clock (Pacific Daylight Time = −7)
 */
export function sunPosition(latDeg: number, lonDeg: number, doy: number, clockHour: number, tzHours: number): SunPosition {
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (clockHour - 12) / 24);
  const eqt =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const offset = eqt + 4 * lonDeg - 60 * tzHours;
  const tst = clockHour * 60 + offset;
  const ha = ((tst / 4 - 180) * Math.PI) / 180;
  const phi = (latDeg * Math.PI) / 180;
  const cz = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cz)));
  // azimuth clockwise from north
  const sz = Math.sin(zenith);
  let az = 0;
  if (sz > 1e-9) {
    const caz = (Math.sin(decl) - Math.sin(phi) * cz) / (Math.cos(phi) * sz);
    az = Math.acos(Math.max(-1, Math.min(1, caz)));
    if (ha > 0) az = 2 * Math.PI - az;
  }
  return { zenith, azimuth: az, declination: decl, hourAngle: ha, equationOfTimeMin: eqt };
}

export interface ClearSky {
  airMass: number;
  dni: number;
  dhi: number;
  ghi: number;
}

/** Diffuse irradiance as a fraction of beam on a clear day (estimate). */
export const DIFFUSE_FRACTION = 0.12;

export function clearSky(zenith: number): ClearSky {
  const cz = Math.cos(zenith);
  if (cz <= 0.01) return { airMass: Infinity, dni: 0, dhi: 0, ghi: 0 };
  const am = 1 / cz;
  const dni = 1353 * Math.pow(0.7, Math.pow(am, 0.678));
  const dhi = DIFFUSE_FRACTION * dni;
  return { airMass: am, dni, dhi, ghi: dni * cz + dhi };
}

export type Mount = 'tracking' | 'fixed';

/** Plane-of-array irradiance, W/m², and the panel tilt used, rad. */
export function planeOfArray(sun: SunPosition, sky: ClearSky, mount: Mount, fixedTiltDeg = 25): { poa: number; cosIncidence: number; tilt: number } {
  if (sky.dni === 0) return { poa: 0, cosIncidence: 0, tilt: 0 };
  // sun unit vector: x east, y north, z up
  const sx = Math.sin(sun.zenith) * Math.sin(sun.azimuth);
  const sy = Math.sin(sun.zenith) * Math.cos(sun.azimuth);
  const sz = Math.cos(sun.zenith);
  let nx: number;
  let ny: number;
  let nz: number;
  if (mount === 'tracking') {
    // horizontal N–S axis: the panel normal turns in the east–west plane toward the sun
    const rot = Math.atan2(sx, sz);
    const lim = (60 * Math.PI) / 180; // tracker rotation limit ±60°
    const r = Math.max(-lim, Math.min(lim, rot));
    nx = Math.sin(r);
    ny = 0;
    nz = Math.cos(r);
  } else {
    const t = (fixedTiltDeg * Math.PI) / 180;
    nx = 0;
    ny = -Math.sin(t); // facing south
    nz = Math.cos(t);
  }
  const ci = Math.max(0, sx * nx + sy * ny + sz * nz);
  const tilt = Math.acos(nz);
  const poa = sky.dni * ci + sky.dhi * ((1 + Math.cos(tilt)) / 2);
  return { poa, cosIncidence: ci, tilt };
}

export interface PVParams {
  dcacRatio: number;
  noct: number;
  /** Power temperature coefficient, 1/°C (negative). */
  gammaT: number;
  /** Soiling, wiring, mismatch and other DC losses, fraction. */
  dcLosses: number;
  inverterEff: number;
}

export const PV_DEFAULTS: PVParams = { dcacRatio: 1.3, noct: 45, gammaT: -0.0037, dcLosses: 0.07, inverterEff: 0.98 };

export interface PVOutput {
  poa: number;
  tCell: number;
  /** DC power as a fraction of AC rating. */
  pdc: number;
  /** AC power as a fraction of AC rating (after clipping). */
  pac: number;
  clipped: boolean;
}

export function pvOutput(poa: number, tAmb: number, p: PVParams = PV_DEFAULTS): PVOutput {
  const tCell = tAmb + ((p.noct - 20) / 800) * poa;
  const pdc = p.dcacRatio * (poa / 1000) * (1 + p.gammaT * (tCell - 25)) * (1 - p.dcLosses);
  const raw = Math.max(0, pdc * p.inverterEff);
  return { poa, tCell, pdc: Math.max(0, pdc), pac: Math.min(raw, 1), clipped: raw > 1 };
}
