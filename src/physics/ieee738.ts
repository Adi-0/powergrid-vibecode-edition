/**
 * Bare overhead conductor temperature and ampacity, steady state, by the heat balance
 * of IEEE 738 (SI form):
 *
 *     q_c + q_r = q_s + I² R(T_s)
 *
 * — heat carried off by the air (convection) and radiated, against heat from the sun
 * and from the current in the conductor's resistance. Convection is the larger of the
 * two forced-convection correlations and natural convection; air properties at the
 * film temperature; the clear-atmosphere solar flux polynomial; resistance linear in
 * temperature between two tabulated points.
 *
 * Validated against the standard's worked example (a Drake ACSR conductor at 100 °C):
 * see test/ieee738.test.ts.
 */

export interface ThermalConductor {
  /** Outside diameter, m. */
  D: number;
  /** AC resistance at two temperatures, Ω/m, and those temperatures, °C. */
  rLo: number;
  tLo: number;
  rHi: number;
  tHi: number;
  /** Solar absorptivity and emissivity (0 … 1). */
  absorptivity: number;
  emissivity: number;
}

export interface ThermalWeather {
  /** Air temperature, °C. */
  Ta: number;
  /** Wind speed, m/s, and its angle to the conductor's axis, degrees (90: across it). */
  windMs: number;
  windAngleDeg: number;
  /** Elevation above sea level, m. */
  elevationM: number;
  /** Sun's altitude and azimuth (clockwise from north), degrees; the line's azimuth, degrees. */
  sunAltDeg: number;
  sunAzDeg: number;
  lineAzDeg: number;
}

export interface HeatBalance {
  /** Film temperature, °C, and the air's properties there. */
  Tfilm: number;
  mu: number;
  rho: number;
  kf: number;
  /** Reynolds number and the wind direction factor. */
  Re: number;
  Kangle: number;
  /** Convection: forced (low and high wind), natural, and the one that applies (the largest), W/m. */
  qc1: number;
  qc2: number;
  qcn: number;
  qc: number;
  /** Radiated, W/m. */
  qr: number;
  /** Solar: the flux at the sun's altitude, the angle of incidence (°), the heat gained, W/m. */
  Qs: number;
  thetaDeg: number;
  qs: number;
  /** Resistance at the conductor's temperature, Ω/m, and the joule heat of the current, W/m. */
  R: number;
  qj: number;
}

const DEG = Math.PI / 180;

/** Resistance at T, Ω/m: linear through the two tabulated points. */
export function resistanceAt(c: ThermalConductor, T: number): number {
  return c.rLo + ((c.rHi - c.rLo) * (T - c.tLo)) / (c.tHi - c.tLo);
}

/** Total solar heat flux on a surface normal to the sun, clear atmosphere, sea level, W/m²: a polynomial in the sun's altitude (degrees). */
export function solarFluxClear(altDeg: number): number {
  if (altDeg <= 0) return 0;
  const H = altDeg;
  const A = -42.2391;
  const B = 63.8044;
  const C = -1.922;
  const D = 3.46921e-2;
  const E = -3.61118e-4;
  const F = 1.94318e-6;
  const G = -4.07608e-9;
  return Math.max(0, A + B * H + C * H ** 2 + D * H ** 3 + E * H ** 4 + F * H ** 5 + G * H ** 6);
}

/** The heat balance's terms at a conductor surface temperature Ts, °C, carrying I, A. */
export function heatBalance(c: ThermalConductor, w: ThermalWeather, Ts: number, I: number): HeatBalance {
  const Tfilm = (Ts + w.Ta) / 2;
  const He = w.elevationM;
  const mu = (1.458e-6 * (Tfilm + 273) ** 1.5) / (Tfilm + 383.4);
  const rho = (1.293 - 1.525e-4 * He + 6.379e-9 * He * He) / (1 + 0.00367 * Tfilm);
  const kf = 2.424e-2 + 7.477e-5 * Tfilm - 4.407e-9 * Tfilm * Tfilm;
  const Re = (c.D * rho * w.windMs) / mu;
  const phi = w.windAngleDeg * DEG;
  const Kangle = 1.194 - Math.cos(phi) + 0.194 * Math.cos(2 * phi) + 0.368 * Math.sin(2 * phi);
  const dT = Math.max(0, Ts - w.Ta);
  const qc1 = Kangle * (1.01 + 1.35 * Re ** 0.52) * kf * dT;
  const qc2 = Kangle * 0.754 * Re ** 0.6 * kf * dT;
  const qcn = 3.645 * rho ** 0.5 * c.D ** 0.75 * dT ** 1.25;
  const qc = Math.max(qc1, qc2, qcn);
  const qr = 17.8 * c.D * c.emissivity * (((Ts + 273) / 100) ** 4 - ((w.Ta + 273) / 100) ** 4);
  // the sun: flux at its altitude, corrected for elevation, on the conductor at the angle of incidence
  const Ksolar = 1 + 1.148e-4 * He - 1.108e-8 * He * He;
  const Qs = solarFluxClear(w.sunAltDeg) * Ksolar;
  const theta = Math.acos(Math.cos(w.sunAltDeg * DEG) * Math.cos((w.sunAzDeg - w.lineAzDeg) * DEG));
  const qs = w.sunAltDeg > 0 ? c.absorptivity * Qs * Math.sin(theta) * c.D : 0;
  const R = resistanceAt(c, Ts);
  return { Tfilm, mu, rho, kf, Re, Kangle, qc1, qc2, qcn, qc, qr, Qs, thetaDeg: theta / DEG, qs, R, qj: I * I * R };
}

/** The current that holds the conductor at Ts, A (its ampacity at that temperature). */
export function ampacity(c: ThermalConductor, w: ThermalWeather, Ts: number): number {
  const b = heatBalance(c, w, Ts, 0);
  return Math.sqrt(Math.max(0, (b.qc + b.qr - b.qs) / b.R));
}

/**
 * The conductor's steady temperature carrying I, °C: where the heat in equals the heat
 * out. The balance rises monotonically with temperature, so it is found by bisection;
 * the result is an iteration, not a closed form (the residual is returned with it).
 */
export function conductorTemperature(c: ThermalConductor, w: ThermalWeather, I: number): { Ts: number; residual: number; balance: HeatBalance } {
  const net = (T: number) => {
    const b = heatBalance(c, w, T, I);
    return b.qc + b.qr - b.qs - b.qj;
  };
  let lo = w.Ta - 5;
  let hi = w.Ta + 400;
  for (let k = 0; k < 80; k++) {
    const m = (lo + hi) / 2;
    if (net(m) > 0) hi = m;
    else lo = m;
  }
  const Ts = (lo + hi) / 2;
  const balance = heatBalance(c, w, Ts, I);
  return { Ts, residual: balance.qc + balance.qr - balance.qs - balance.qj, balance };
}

// ---------------------------------------------------------------------------- sag

export interface SpanMechanics {
  /** Span length, m (level span: both attachments at the same height). */
  S: number;
  /** Weight per metre, N/m; area, m²; modulus, Pa; thermal expansion, 1/°C. */
  w: number;
  A: number;
  E: number;
  alpha: number;
  /** The reference state: temperature, °C, and horizontal tension, N. */
  T0: number;
  H0: number;
}

/**
 * Sag at a conductor temperature, by the change of state from the reference: the
 * conductor's unstressed length grows with temperature, its stretch follows the
 * tension (linear elastic), and the span's geometry ties sag, length and tension
 * together (parabola: L = S + 8D²/(3S), H = wS²/(8D)). Solved by bisection on the sag.
 * No creep, no ice, no wind load: the everyday sag-temperature relation.
 */
export function sagAt(m: SpanMechanics, T: number): { D: number; H: number; L: number } {
  const { S, w, A, E, alpha, T0, H0 } = m;
  const D0 = (w * S * S) / (8 * H0);
  const L0 = S + (8 * D0 * D0) / (3 * S);
  const Lu0 = L0 / (1 + H0 / (E * A)); // unstressed length at T0
  const Lu = Lu0 * (1 + alpha * (T - T0));
  const f = (D: number) => {
    const H = (w * S * S) / (8 * D);
    return S + (8 * D * D) / (3 * S) - Lu * (1 + H / (E * A));
  };
  let lo = 1e-3;
  let hi = S / 2;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  const D = (lo + hi) / 2;
  return { D, H: (w * S * S) / (8 * D), L: S + (8 * D * D) / (3 * S) };
}
