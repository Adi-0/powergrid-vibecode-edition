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
