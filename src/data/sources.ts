/**
 * Source registry. Every data record carries `src`, a key into this table, naming
 * the family its values are anchored to. No page or table numbers are cited (they
 * would be fabricated); `estimate` marks values that are typical-of-class judgement
 * rather than a canonical tabulated number.
 */
export interface Source {
  id: string;
  family: string;
  note: string;
}

export const SOURCES = {
  glover: {
    id: 'glover',
    family: 'Glover, Overbye & Sarma — Power System Analysis and Design',
    note: 'Line constants, conductor tables (ACSR), per-unit, power flow, faults.',
  },
  grainger: {
    id: 'grainger',
    family: 'Grainger & Stevenson — Power System Analysis',
    note: 'Symmetrical components, sequence networks, fault examples, transformer connections.',
  },
  kersting: {
    id: 'kersting',
    family: 'Kersting — Distribution System Modeling and Analysis',
    note: "Modified Carson's equations, Kron reduction, conductor data, IEEE 13-node feeder, regulators, center-tapped transformers.",
  },
  kundur: {
    id: 'kundur',
    family: 'Kundur — Power System Stability and Control',
    note: 'Inertia constants by unit type, governor droop, swing equation, equal-area criterion, machine reactances.',
  },
  blackburn: {
    id: 'blackburn',
    family: 'Blackburn & Domin — Protective Relaying: Principles and Applications',
    note: 'Relay application, coordination time intervals, CT/PT practice.',
  },
  c84: { id: 'c84', family: 'ANSI C84.1', note: 'Service and utilization voltage ranges (Range A / Range B).' },
  c372: { id: 'c372', family: 'IEEE C37.2', note: 'Device function numbers.' },
  c37112: { id: 'c37112', family: 'IEEE C37.112', note: 'Inverse-time overcurrent characteristic equations.' },
  ieee738: { id: 'ieee738', family: 'IEEE 738', note: 'Conductor temperature and ampacity.' },
  ieee80: { id: 'ieee80', family: 'IEEE 80', note: 'Substation grounding, step and touch potential.' },
  ieee1366: { id: 'ieee1366', family: 'IEEE 1366', note: 'Distribution reliability indices (SAIFI, SAIDI, CAIDI, MAIFI).' },
  c57: { id: 'c57', family: 'IEEE C57.12.00', note: 'Transformer terminal markings, angular displacement, impedance.' },
  ieee13: { id: 'ieee13', family: 'IEEE PES Distribution Test Feeders — 13-node feeder', note: 'Published data and results.' },
  stclair: {
    id: 'stclair',
    family: 'St. Clair loadability curve (Dunlop, Gutman & Marchenko extension)',
    note: 'Practical line loadability as a multiple of SIL versus length.',
  },
  haurwitz: { id: 'haurwitz', family: 'Haurwitz clear-sky model', note: 'Global horizontal irradiance from solar zenith angle.' },
  noaa: { id: 'noaa', family: 'NOAA solar position algorithm (simplified)', note: 'Declination, equation of time, hour angle.' },
  eia: {
    id: 'eia',
    family: 'US EIA — generator heat rates and capacity by technology',
    note: 'Typical heat rates, capacity factors.',
  },
  caiso: {
    id: 'caiso',
    family: 'CAISO public operating data (shape of daily load, solar, wind; the duck curve)',
    note: 'Used only for the shape and magnitude class of profiles.',
  },
  wecc: {
    id: 'wecc',
    family: 'WECC path ratings and frequency-response practice',
    note: 'Order of magnitude for path limits (e.g. Path 26, COI) and frequency response.',
  },
  naturalEarth: { id: 'naturalEarth', family: 'Natural Earth (public domain)', note: 'State outline, 1:10m admin-1.' },
  estimate: {
    id: 'estimate',
    family: 'Estimate — typical of class',
    note: 'A judgement value within the typical range for this class of equipment; not a tabulated canonical number.',
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;
