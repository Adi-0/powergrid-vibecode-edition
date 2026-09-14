/**
 * Transmission and distribution line parameters, computed from conductor
 * geometry rather than asserted.
 *
 * This matters for the project's second rule: a person must be able to
 * reproduce every number by hand. An impedance typed into a data file cannot
 * be reproduced; an impedance computed from a published conductor table and a
 * stated tower geometry can be, and the math panel shows that computation.
 *
 * SERIES INDUCTIVE REACTANCE (positive sequence, per phase)
 *   X_L = 2π f · 2×10⁻⁷ · ln(D_eq / D_s)   Ω/m
 * where D_eq is the geometric mean distance between the three phase positions
 * and D_s is the conductor's geometric mean radius (GMR), adjusted for
 * bundling. The factor 2×10⁻⁷ is μ₀/2π.
 *
 * SHUNT CAPACITIVE SUSCEPTANCE (positive sequence, per phase)
 *   C = 2π ε₀ / ln(D_eq / r_eq)   F/m,      B = 2π f C   S/m
 * where r_eq is the conductor's outside radius, bundle-adjusted. ε₀ is the
 * permittivity of free space.
 *
 * BUNDLING. Two or more conductors per phase, spaced d apart, behave like one
 * conductor with an enlarged effective radius:
 *   2 conductors: D_s^b = √(D_s · d)
 *   3 conductors: D_s^b = ∛(D_s · d²)
 *   4 conductors: D_s^b = 1.09 · ⁴√(D_s · d³)
 * The same expressions apply to r_eq with r substituted for D_s. Bundling is
 * why EHV lines carry several conductors per phase: it lowers reactance and
 * raises the corona-onset voltage at the same time.
 *
 * Sources for conductor data: standard ACSR tables (Aluminum Association /
 * Southwire), reproduced in Glover & Sarma, *Power System Analysis and
 * Design*, Appendix Table A.4. Values are at 60 Hz and 75 °C conductor
 * temperature, the usual assumption for a loaded line.
 */

export interface Conductor {
  id: string;
  /** Trade name — ACSR conductors are named after birds, by convention. */
  name: string;
  /** Aluminium cross-section, thousands of circular mils. */
  kcmil: number;
  /** Stranding, e.g. "26/7" = 26 aluminium strands over 7 steel. */
  stranding: string;
  /** Overall diameter, inches (conductor tables are imperial). */
  diameterIn: number;
  /** Geometric mean radius, feet. Accounts for internal flux linkage. */
  gmrFt: number;
  /** AC resistance at 75 °C, ohms per mile. */
  rOhmPerMile75C: number;
  /** Continuous current rating at 75 °C conductor, 25 °C ambient, amperes. */
  ampacityA: number;
  source: string;
}

/** Standard ACSR conductors used in this model. */
export const CONDUCTORS: Record<string, Conductor> = {
  bluebird: {
    id: 'bluebird', name: 'Bluebird', kcmil: 2156, stranding: '84/19',
    diameterIn: 1.762, gmrFt: 0.0588, rOhmPerMile75C: 0.0536, ampacityA: 1700,
    source: 'ACSR table (Aluminum Association); Glover & Sarma Table A.4',
  },
  finch: {
    id: 'finch', name: 'Finch', kcmil: 1113, stranding: '54/19',
    diameterIn: 1.293, gmrFt: 0.0435, rOhmPerMile75C: 0.0994, ampacityA: 1110,
    source: 'ACSR table (Aluminum Association); Glover & Sarma Table A.4',
  },
  drake: {
    id: 'drake', name: 'Drake', kcmil: 795, stranding: '26/7',
    diameterIn: 1.108, gmrFt: 0.0375, rOhmPerMile75C: 0.1385, ampacityA: 907,
    source: 'ACSR table (Aluminum Association); Glover & Sarma Table A.4',
  },
  ibis: {
    id: 'ibis', name: 'Ibis', kcmil: 397.5, stranding: '26/7',
    diameterIn: 0.783, gmrFt: 0.0265, rOhmPerMile75C: 0.2590, ampacityA: 587,
    source: 'ACSR table (Aluminum Association); Glover & Sarma Table A.4',
  },
  linnet: {
    id: 'linnet', name: 'Linnet', kcmil: 336.4, stranding: '26/7',
    diameterIn: 0.720, gmrFt: 0.0243, rOhmPerMile75C: 0.3060, ampacityA: 530,
    source: 'ACSR table (Aluminum Association); Glover & Sarma Table A.4',
  },
  raven: {
    id: 'raven', name: 'Raven', kcmil: 105.5, stranding: '6/1',
    diameterIn: 0.398, gmrFt: 0.00446, rOhmPerMile75C: 1.120, ampacityA: 230,
    source: 'ACSR table (Aluminum Association); Glover & Sarma Table A.4',
  },
  sparrow: {
    id: 'sparrow', name: 'Sparrow', kcmil: 66.4, stranding: '6/1',
    diameterIn: 0.316, gmrFt: 0.00418, rOhmPerMile75C: 1.690, ampacityA: 180,
    source: 'ACSR table (Aluminum Association); Glover & Sarma Table A.4',
  },
};

/** A tower or pole configuration: how far apart the three phases are hung. */
export interface TowerGeometry {
  id: string;
  name: string;
  /** Spacing between phase positions A–B, B–C, C–A, in metres. */
  spacingM: [number, number, number];
  /** Conductors per phase. */
  bundleN: number;
  /** Spacing between conductors within a bundle, metres. 0 if bundleN is 1. */
  bundleSpacingM: number;
  /** Whether the line is transposed — assumed true, which is why D_eq is used. */
  transposed: boolean;
  description: string;
}

export const TOWERS: Record<string, TowerGeometry> = {
  'ehv-500-horizontal': {
    id: 'ehv-500-horizontal', name: '500 kV horizontal, 3-conductor bundle',
    spacingM: [10.7, 10.7, 21.4], bundleN: 3, bundleSpacingM: 0.457, transposed: true,
    description:
      'Single-circuit 500 kV lattice tower, three phases in a horizontal line ' +
      '10.7 m (35 ft) apart, three subconductors per phase on an 18-inch bundle.',
  },
  'hv-230-vertical': {
    id: 'hv-230-vertical', name: '230 kV vertical, 2-conductor bundle',
    spacingM: [7.0, 7.0, 14.0], bundleN: 2, bundleSpacingM: 0.457, transposed: true,
    description:
      'Single-circuit 230 kV steel pole, phases stacked vertically 7 m apart, ' +
      'two subconductors per phase on an 18-inch bundle.',
  },
  'hv-115-vertical': {
    id: 'hv-115-vertical', name: '115 kV vertical, single conductor',
    spacingM: [4.3, 4.3, 8.6], bundleN: 1, bundleSpacingM: 0, transposed: true,
    description: 'Single-circuit 115 kV wood H-frame or steel pole, phases 4.3 m apart.',
  },
  'dist-12-crossarm': {
    id: 'dist-12-crossarm', name: '12.47 kV crossarm',
    spacingM: [0.91, 0.91, 1.83], bundleN: 1, bundleSpacingM: 0, transposed: false,
    description:
      'Distribution crossarm, three phases across the top 3 ft apart. Not ' +
      'transposed — distribution feeders are short enough that the resulting ' +
      'unbalance is small, and it is one of the simplifications this model makes.',
  },
};

const FT_PER_M = 3.280839895;
const MILES_PER_KM = 0.621371192;
const EPSILON_0 = 8.8541878128e-12; // F/m
const MU_0_OVER_2PI = 2e-7; // H/m

/** Geometric mean distance of three phase positions: D_eq = ∛(D_ab·D_bc·D_ca). */
export const geometricMeanDistance = (s: [number, number, number]): number =>
  Math.cbrt(s[0] * s[1] * s[2]);

/** Effective radius of a bundle of n conductors of radius r spaced d apart. */
export function bundleRadius(r: number, n: number, d: number): number {
  switch (n) {
    case 1: return r;
    case 2: return Math.sqrt(r * d);
    case 3: return Math.cbrt(r * d * d);
    case 4: return 1.09 * Math.pow(r * d * d * d, 0.25);
    default: throw new Error(`bundle of ${n} conductors is not supported`);
  }
}

/** Per-kilometre line parameters, with every intermediate exposed. */
export interface LineParameters {
  conductor: Conductor;
  tower: TowerGeometry;
  frequencyHz: number;
  /** Geometric mean distance between phases, metres. */
  dEqM: number;
  /** Conductor GMR, metres, before bundling. */
  gmrM: number;
  /** Conductor outside radius, metres, before bundling. */
  radiusM: number;
  /** Bundle-adjusted GMR, metres — the D_s that goes into the reactance formula. */
  dsBundleM: number;
  /** Bundle-adjusted radius, metres — the r that goes into the capacitance formula. */
  rBundleM: number;
  /** Series resistance per phase, ohms per km (bundle divides it by n). */
  rOhmPerKm: number;
  /** Series inductive reactance per phase, ohms per km. */
  xOhmPerKm: number;
  /** Shunt capacitance per phase, farads per km. */
  cFPerKm: number;
  /** Shunt capacitive susceptance per phase, siemens per km. */
  bSPerKm: number;
  /** Current rating of the whole phase (bundle multiplies it), amperes. */
  ampacityA: number;
}

export function lineParameters(
  conductorId: string,
  towerId: string,
  frequencyHz = 60
): LineParameters {
  const conductor = CONDUCTORS[conductorId];
  if (!conductor) throw new Error(`unknown conductor "${conductorId}"`);
  const tower = TOWERS[towerId];
  if (!tower) throw new Error(`unknown tower geometry "${towerId}"`);

  const dEqM = geometricMeanDistance(tower.spacingM);
  const gmrM = conductor.gmrFt / FT_PER_M;
  const radiusM = conductor.diameterIn * 0.0254 / 2;
  const dsBundleM = bundleRadius(gmrM, tower.bundleN, tower.bundleSpacingM);
  const rBundleM = bundleRadius(radiusM, tower.bundleN, tower.bundleSpacingM);

  const omega = 2 * Math.PI * frequencyHz;
  // R: bundle conductors are in parallel, so phase resistance is r/n.
  const rOhmPerKm =
    (conductor.rOhmPerMile75C * MILES_PER_KM) / tower.bundleN;
  // X_L = ω · 2×10⁻⁷ · ln(D_eq/D_s)  Ω/m  →  ×1000 for Ω/km
  const xOhmPerKm = omega * MU_0_OVER_2PI * Math.log(dEqM / dsBundleM) * 1000;
  // C = 2πε₀ / ln(D_eq/r)  F/m  →  ×1000 for F/km
  const cFPerKm = ((2 * Math.PI * EPSILON_0) / Math.log(dEqM / rBundleM)) * 1000;
  const bSPerKm = omega * cFPerKm;

  return {
    conductor, tower, frequencyHz, dEqM, gmrM, radiusM, dsBundleM, rBundleM,
    rOhmPerKm, xOhmPerKm, cFPerKm, bSPerKm,
    ampacityA: conductor.ampacityA * tower.bundleN,
  };
}

/**
 * Convert a line of given length to per-unit on a system base.
 *
 * Z_base = V_base² / S_base   (V_base line-to-line kV, S_base MVA → ohms)
 * and the per-unit values are the ohmic values divided by it. The shunt is the
 * TOTAL charging susceptance of the pi model, i.e. B per km × length, which the
 * Ybus then splits half at each end.
 */
export function lineToPerUnit(
  p: LineParameters,
  lengthKm: number,
  baseKV: number,
  baseMVA: number
): { r: number; x: number; b: number; zBaseOhm: number; ratingMVA: number } {
  const zBaseOhm = (baseKV * baseKV) / baseMVA;
  return {
    r: (p.rOhmPerKm * lengthKm) / zBaseOhm,
    x: (p.xOhmPerKm * lengthKm) / zBaseOhm,
    b: p.bSPerKm * lengthKm * zBaseOhm,
    zBaseOhm,
    // S = √3 · V_LL · I, with V in kV and I in A, gives MVA when divided by 1000.
    ratingMVA: (Math.sqrt(3) * baseKV * p.ampacityA) / 1000,
  };
}

/**
 * Surge impedance and surge impedance loading (SIL).
 *
 *   Z_s = √(L/C) = √(X_L / B) · (per unit length cancels)
 *   SIL = V_LL² / Z_s
 *
 * SIL is the loading at which a line's own charging exactly supplies its own
 * reactive consumption, so it neither absorbs nor produces reactive power. It
 * is the natural yardstick for how heavily a line is loaded.
 */
export function surgeImpedance(p: LineParameters, baseKV: number): {
  zSurgeOhm: number;
  silMW: number;
} {
  const zSurgeOhm = Math.sqrt(p.xOhmPerKm / p.bSPerKm);
  return { zSurgeOhm, silMW: (baseKV * baseKV) / zSurgeOhm };
}

/**
 * Practical line loadability, after St. Clair.
 *
 * A line's thermal rating is what the metal can carry before it anneals or sags
 * into something. On a long line that is almost never the real limit. Two other
 * things bind first:
 *
 *  - VOLTAGE DROP. Power flowing through the series reactance drops the voltage
 *    at the far end. Past some loading the far end falls out of range.
 *  - STEADY-STATE STABILITY. Real power transfer across a reactance goes as
 *    P = (V₁V₂/X)·sin δ, which has a maximum at δ = 90°. Operating anywhere
 *    near that maximum is unsafe, because a small disturbance pushes the
 *    machines out of step. Planners keep δ well below it.
 *
 * Both limits get worse as the line gets longer, because X grows with length.
 * The standard empirical result, from H. P. St. Clair (1953) and the analytical
 * reconstruction by Dunlop, Gutman and Marchenko (1979), is that loadability in
 * multiples of the surge impedance loading falls roughly as
 *
 *   P_limit / SIL ≈ 43 / L^0.6     (L in miles, valid beyond about 50 miles)
 *
 * Below that length the thermal rating governs and this returns Infinity.
 */
export function loadabilityLimitMW(
  lengthKm: number,
  silMW: number
): { limitMW: number; multipleOfSIL: number; governedBy: 'thermal' | 'loadability' } {
  const miles = lengthKm * 0.621371192;
  if (miles < 50) return { limitMW: Infinity, multipleOfSIL: Infinity, governedBy: 'thermal' };
  const multiple = 43 / Math.pow(miles, 0.6);
  return { limitMW: multiple * silMW, multipleOfSIL: multiple, governedBy: 'loadability' };
}
