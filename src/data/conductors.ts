import type { SourceId } from './sources';

/**
 * Overhead conductor data. Units as tabulated in the field's references:
 * resistance in Ω/mile at 50 °C and 60 Hz, geometric mean radius (GMR) in feet,
 * outside diameter in inches, ampacity in A (summer, conductor at its rated
 * temperature, typical wind). Code converts to SI where it needs to.
 *
 * GMR is the radius of a hypothetical thin-walled tube with the same internal
 * flux linkage as the stranded conductor; it is what the inductance formula uses.
 */
export interface Conductor {
  id: string;
  name: string;
  kind: 'ACSR' | 'AA' | 'Cu' | 'Alumoweld';
  size: string;
  r_ohm_per_mi: number;
  gmr_ft: number;
  diameter_in: number;
  ampacity_a: number;
  src: SourceId;
  /** True when a value is a judgement within the class range rather than tabulated. */
  estimate?: boolean;
}

export const CONDUCTORS = {
  // --- distribution conductors used by the IEEE 13-node feeder (tabulated) ---
  ACSR_556_DOVE: {
    id: 'ACSR_556_DOVE',
    name: 'Dove',
    kind: 'ACSR',
    size: '556,500 cmil 26/7',
    r_ohm_per_mi: 0.1859,
    gmr_ft: 0.0313,
    diameter_in: 0.927,
    ampacity_a: 730,
    src: 'kersting',
  },
  ACSR_336_LINNET: {
    id: 'ACSR_336_LINNET',
    name: 'Linnet',
    kind: 'ACSR',
    size: '336,400 cmil 26/7',
    r_ohm_per_mi: 0.306,
    gmr_ft: 0.0244,
    diameter_in: 0.721,
    ampacity_a: 530,
    src: 'kersting',
  },
  ACSR_4_0_PENGUIN: {
    id: 'ACSR_4_0_PENGUIN',
    name: 'Penguin',
    kind: 'ACSR',
    size: '4/0 6/1',
    r_ohm_per_mi: 0.592,
    gmr_ft: 0.00814,
    diameter_in: 0.563,
    ampacity_a: 340,
    src: 'kersting',
  },
  ACSR_1_0_RAVEN: {
    id: 'ACSR_1_0_RAVEN',
    name: 'Raven',
    kind: 'ACSR',
    size: '1/0 6/1',
    r_ohm_per_mi: 1.12,
    gmr_ft: 0.00446,
    diameter_in: 0.398,
    ampacity_a: 230,
    src: 'kersting',
  },
  AA_250: {
    id: 'AA_250',
    name: '250 kcmil AA',
    kind: 'AA',
    size: '250,000 cmil',
    r_ohm_per_mi: 0.41,
    gmr_ft: 0.0171,
    diameter_in: 0.567,
    ampacity_a: 329,
    src: 'kersting',
  },
  AA_1_0: {
    id: 'AA_1_0',
    name: '1/0 AA',
    kind: 'AA',
    size: '1/0',
    r_ohm_per_mi: 0.97,
    gmr_ft: 0.0111,
    diameter_in: 0.368,
    ampacity_a: 202,
    src: 'kersting',
  },
  CU_1_0: {
    id: 'CU_1_0',
    name: '1/0 copper',
    kind: 'Cu',
    size: '1/0',
    r_ohm_per_mi: 0.607,
    gmr_ft: 0.01113,
    diameter_in: 0.368,
    ampacity_a: 310,
    src: 'kersting',
  },
  CU_14: {
    id: 'CU_14',
    name: '#14 copper strand',
    kind: 'Cu',
    size: '#14',
    r_ohm_per_mi: 14.8722,
    gmr_ft: 0.00208,
    diameter_in: 0.0641,
    ampacity_a: 20,
    src: 'kersting',
  },
  // --- transmission conductors (ACSR table values; resistances at 50 °C estimated) ---
  ACSR_1272_BITTERN: {
    id: 'ACSR_1272_BITTERN',
    name: 'Bittern',
    kind: 'ACSR',
    size: '1,272,000 cmil 45/7',
    r_ohm_per_mi: 0.0823,
    gmr_ft: 0.0445,
    diameter_in: 1.345,
    ampacity_a: 1200,
    src: 'glover',
    estimate: true,
  },
  ACSR_795_DRAKE: {
    id: 'ACSR_795_DRAKE',
    name: 'Drake',
    kind: 'ACSR',
    size: '795,000 cmil 26/7',
    r_ohm_per_mi: 0.1284,
    gmr_ft: 0.0375,
    diameter_in: 1.108,
    ampacity_a: 907,
    src: 'glover',
    estimate: true,
  },
  ACSR_477_HAWK: {
    id: 'ACSR_477_HAWK',
    name: 'Hawk',
    kind: 'ACSR',
    size: '477,000 cmil 26/7',
    r_ohm_per_mi: 0.212,
    gmr_ft: 0.029,
    diameter_in: 0.858,
    ampacity_a: 659,
    src: 'glover',
    estimate: true,
  },
  ALUMOWELD_7_8: {
    id: 'ALUMOWELD_7_8',
    name: '7 #8 Alumoweld (shield wire)',
    kind: 'Alumoweld',
    size: '7 #8',
    r_ohm_per_mi: 1.2,
    gmr_ft: 0.0052,
    diameter_in: 0.385,
    ampacity_a: 0,
    src: 'estimate',
    estimate: true,
  },
} as const satisfies Record<string, Conductor>;

export type ConductorId = keyof typeof CONDUCTORS;

/**
 * Conductors' mechanical and thermal constants, for sag and temperature (the Span
 * level). Weights, strengths and areas are typical of the ACSR designations' published
 * tables; the final modulus and expansion coefficient are typical of the stranding.
 * All estimates for the purpose; the Drake resistances at 25 and 75 °C are those of
 * IEEE 738's worked example, and the others are scaled from their 50 °C table value by
 * the same temperature coefficient.
 */
export interface ConductorMech {
  /** Mass per metre, kg/m. */
  massKgPerM: number;
  /** Rated breaking strength, kN. */
  rbsKN: number;
  /** Total cross-section, mm². */
  areaMm2: number;
  /** Final (composite) modulus, GPa, and linear expansion, 1/°C. */
  eGPa: number;
  alphaPerC: number;
  /** Highest temperature it may run at, °C. */
  maxTempC: number;
  src: SourceId;
  estimate: true;
}

export const CONDUCTOR_MECH: Partial<Record<ConductorId, ConductorMech>> = {
  ACSR_1272_BITTERN: { massKgPerM: 2.134, rbsKN: 153, areaMm2: 685, eGPa: 62, alphaPerC: 20.9e-6, maxTempC: 100, src: 'estimate', estimate: true },
  ACSR_795_DRAKE: { massKgPerM: 1.628, rbsKN: 140, areaMm2: 468.5, eGPa: 74, alphaPerC: 18.9e-6, maxTempC: 100, src: 'estimate', estimate: true },
  ACSR_477_HAWK: { massKgPerM: 0.975, rbsKN: 86.7, areaMm2: 280.8, eGPa: 74, alphaPerC: 18.9e-6, maxTempC: 100, src: 'estimate', estimate: true },
  ACSR_556_DOVE: { massKgPerM: 1.137, rbsKN: 102, areaMm2: 327.9, eGPa: 74, alphaPerC: 18.9e-6, maxTempC: 100, src: 'estimate', estimate: true },
};

/**
 * Resistance's temperature coefficient for ACSR, per °C, relative to its 50 °C value:
 * from IEEE 738's example Drake resistances (7.283 × 10⁻⁵ Ω/m at 25 °C, 8.688 × 10⁻⁵
 * at 75 °C, which average to the table's 50 °C value).
 */
export const ACSR_R_COEFF = (8.688e-5 - 7.283e-5) / 50 / ((8.688e-5 + 7.283e-5) / 2);

/**
 * The weather a span's temperature is worked out in, beyond the day's air temperature
 * and sun: the wind (the reader can change it), the surfaces, the site's elevation.
 * IEEE 738's ratings assume a light wind across the line; weathered conductors absorb
 * and emit near 0.8. Estimates.
 */
export const SPAN_WEATHER = {
  windMs: { still: 0, rating: 0.61, breeze: 3 },
  windAngleDeg: 90,
  absorptivity: 0.8,
  emissivity: 0.8,
  elevationM: 0,
  /** Everyday reference: sag-tension state at this temperature and a fifth of breaking strength. */
  refTempC: 15,
  refTensionFrac: 0.2,
  /** Typical span by voltage class, m. */
  spanM: { 500: 380, 230: 300, 115: 220, 60: 120 } as Record<number, number>,
  src: 'estimate' as SourceId,
};
