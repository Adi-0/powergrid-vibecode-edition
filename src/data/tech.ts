import type { SourceId } from './sources';

/**
 * Generating technologies: the canonical per-class parameters every plant of that
 * class inherits unless its record overrides them. Ranges are the textbook ones
 * (Kundur for inertia and droop, EIA for heat rates); the specific numbers chosen
 * inside those ranges are estimates and marked so.
 */
export type TechId =
  | 'nuclear'
  | 'gas_ccgt'
  | 'gas_ct'
  | 'gas_cogen'
  | 'gas_recip'
  | 'hydro'
  | 'pumped_storage'
  | 'geothermal'
  | 'wind'
  | 'solar_pv'
  | 'battery'
  | 'import_ac'
  | 'import_dc'
  | 'syncon';

export interface Technology {
  id: TechId;
  label: string;
  /** Plain-language one-liner. */
  plain: string;
  /** Rotating mass electrically coupled to the grid (contributes inertia and fault current). */
  synchronous: boolean;
  /** Inertia constant H, s, on the machine's MVA base: stored kinetic energy / rating. */
  H_s: number;
  /** Governor droop R, per unit (0.05 = 5 %): a 5 % frequency drop drives the unit to full output. Null: no governor response. */
  droop: number | null;
  /** Full-load heat rate, Btu/kWh (higher heating value), for fuelled units. */
  heatRate: number | null;
  /** Variable operation and maintenance cost, $/MWh. */
  vom: number;
  /** Minimum stable output as a fraction of rating. */
  pminFrac: number;
  /** Ramp rate, fraction of rating per minute. */
  rampPerMin: number;
  /** Minimum up time once started, h; lead time to start, h. */
  minUpH: number;
  startLeadH: number;
  /** Reactive capability as power factor at rated MW (lagging = supplying Q). */
  pfLag: number;
  pfLead: number;
  /** Generator step-up/terminal voltage class, kV (for plant views). */
  terminalKV: number;
  src: SourceId;
  estimate: boolean;
}

export const TECH: Record<TechId, Technology> = {
  nuclear: {
    id: 'nuclear',
    label: 'Nuclear (PWR)',
    plain: 'Fission heats water to steam that spins a turbine; runs flat out around the clock.',
    synchronous: true,
    H_s: 4.0,
    droop: null,
    heatRate: 10450,
    vom: 2.5,
    pminFrac: 1,
    rampPerMin: 0,
    minUpH: 24,
    startLeadH: 48,
    pfLag: 0.9,
    pfLead: 0.95,
    terminalKV: 25,
    src: 'kundur',
    estimate: true,
  },
  gas_ccgt: {
    id: 'gas_ccgt',
    label: 'Gas combined cycle',
    plain: 'A jet-engine-like gas turbine makes power, and its hot exhaust boils water for a second, steam turbine.',
    synchronous: true,
    H_s: 5.5,
    droop: 0.05,
    heatRate: 7000,
    vom: 3.0,
    pminFrac: 0.4,
    rampPerMin: 0.05,
    minUpH: 4,
    startLeadH: 3,
    pfLag: 0.85,
    pfLead: 0.95,
    terminalKV: 18,
    src: 'eia',
    estimate: true,
  },
  gas_ct: {
    id: 'gas_ct',
    label: 'Gas combustion turbine (peaker)',
    plain: 'A gas turbine on its own: less efficient, but starts in minutes, so it runs when demand peaks.',
    synchronous: true,
    H_s: 4.0,
    droop: 0.05,
    heatRate: 10000,
    vom: 5.0,
    pminFrac: 0.3,
    rampPerMin: 0.2,
    minUpH: 1,
    startLeadH: 0.25,
    pfLag: 0.85,
    pfLead: 0.95,
    terminalKV: 13.8,
    src: 'eia',
    estimate: true,
  },
  gas_cogen: {
    id: 'gas_cogen',
    label: 'Gas cogeneration',
    plain: 'Makes electricity and useful heat (here, steam for oil fields), so it runs whenever its host needs the heat.',
    synchronous: true,
    H_s: 4.0,
    droop: 0.05,
    heatRate: 8500,
    vom: 4.0,
    pminFrac: 0.6,
    rampPerMin: 0.03,
    minUpH: 24,
    startLeadH: 12,
    pfLag: 0.85,
    pfLead: 0.95,
    terminalKV: 13.8,
    src: 'eia',
    estimate: true,
  },
  gas_recip: {
    id: 'gas_recip',
    label: 'Gas reciprocating engines',
    plain: 'Large piston engines, like a ship’s, turning generators; flexible and quick.',
    synchronous: true,
    H_s: 1.5,
    droop: 0.05,
    heatRate: 8300,
    vom: 6.0,
    pminFrac: 0.2,
    rampPerMin: 1,
    minUpH: 1,
    startLeadH: 0.1,
    pfLag: 0.85,
    pfLead: 0.95,
    terminalKV: 13.8,
    src: 'estimate',
    estimate: true,
  },
  hydro: {
    id: 'hydro',
    label: 'Hydroelectric',
    plain: 'Water falling from a reservoir spins a turbine; the amount of water, not the machine, limits the day’s energy.',
    synchronous: true,
    H_s: 3.0,
    droop: 0.05,
    heatRate: null,
    vom: 1.0,
    pminFrac: 0.2,
    rampPerMin: 0.5,
    minUpH: 0,
    startLeadH: 0,
    pfLag: 0.9,
    pfLead: 0.95,
    terminalKV: 13.8,
    src: 'kundur',
    estimate: true,
  },
  pumped_storage: {
    id: 'pumped_storage',
    label: 'Pumped-storage hydro',
    plain: 'Pumps water uphill when power is cheap and lets it fall back through the turbines when power is needed.',
    synchronous: true,
    H_s: 3.5,
    droop: 0.05,
    heatRate: null,
    vom: 1.0,
    pminFrac: 0,
    rampPerMin: 0.5,
    minUpH: 0,
    startLeadH: 0,
    pfLag: 0.9,
    pfLead: 0.95,
    terminalKV: 18,
    src: 'kundur',
    estimate: true,
  },
  geothermal: {
    id: 'geothermal',
    label: 'Geothermal',
    plain: 'Steam from hot rock deep underground spins a turbine; steady output day and night.',
    synchronous: true,
    H_s: 3.0,
    droop: null,
    heatRate: null,
    vom: 5.0,
    pminFrac: 0.9,
    rampPerMin: 0.01,
    minUpH: 24,
    startLeadH: 24,
    pfLag: 0.9,
    pfLead: 0.95,
    terminalKV: 13.8,
    src: 'estimate',
    estimate: true,
  },
  wind: {
    id: 'wind',
    label: 'Wind',
    plain: 'Wind turns blades; power electronics connect the turbines to the grid, so they add no spinning inertia.',
    synchronous: false,
    H_s: 0,
    droop: null,
    heatRate: null,
    vom: 0,
    pminFrac: 0,
    rampPerMin: 1,
    minUpH: 0,
    startLeadH: 0,
    pfLag: 0.95,
    pfLead: 0.95,
    terminalKV: 0.69,
    src: 'estimate',
    estimate: true,
  },
  solar_pv: {
    id: 'solar_pv',
    label: 'Solar photovoltaic',
    plain: 'Panels turn sunlight directly into direct current; inverters turn it into grid alternating current.',
    synchronous: false,
    H_s: 0,
    droop: null,
    heatRate: null,
    vom: 0,
    pminFrac: 0,
    rampPerMin: 1,
    minUpH: 0,
    startLeadH: 0,
    pfLag: 0.95,
    pfLead: 0.95,
    terminalKV: 0.66,
    src: 'estimate',
    estimate: true,
  },
  battery: {
    id: 'battery',
    label: 'Battery storage (4\u00a0h)',
    plain: 'Lithium-ion batteries charge when power is plentiful and discharge when it is scarce; inverter-connected.',
    synchronous: false,
    H_s: 0,
    droop: 0.05,
    heatRate: null,
    vom: 1.0,
    pminFrac: -1,
    rampPerMin: 1,
    minUpH: 0,
    startLeadH: 0,
    pfLag: 0.95,
    pfLead: 0.95,
    terminalKV: 0.66,
    src: 'estimate',
    estimate: true,
  },
  import_ac: {
    id: 'import_ac',
    label: 'Import over AC ties',
    plain: 'Power from neighbouring states arriving over AC lines; the rest of the western grid spins in step with California.',
    synchronous: true,
    H_s: 4.0,
    droop: 0.05,
    heatRate: null,
    vom: 0,
    pminFrac: 0,
    rampPerMin: 0.02,
    minUpH: 0,
    startLeadH: 0,
    pfLag: 0.9,
    pfLead: 0.9,
    terminalKV: 500,
    src: 'wecc',
    estimate: true,
  },
  import_dc: {
    id: 'import_dc',
    label: 'Import over a DC link',
    plain: 'Power from the Pacific Northwest over a direct-current line; its flow is set by converter controls, not by the network.',
    synchronous: false,
    H_s: 0,
    droop: null,
    heatRate: null,
    vom: 0,
    pminFrac: 0,
    rampPerMin: 0.05,
    minUpH: 0,
    startLeadH: 0,
    pfLag: 0.95,
    pfLead: 0.95,
    terminalKV: 500,
    src: 'wecc',
    estimate: true,
  },
  syncon: {
    id: 'syncon',
    label: 'Synchronous condenser',
    plain: 'A generator with no engine: it spins in step with the grid and makes or absorbs reactive power to hold voltage up. It makes no real power.',
    synchronous: true,
    H_s: 1.5,
    droop: null,
    heatRate: null,
    vom: 0,
    pminFrac: 0,
    rampPerMin: 0,
    minUpH: 0,
    startLeadH: 0,
    pfLag: 0,
    pfLead: 0,
    terminalKV: 13.8,
    src: 'kundur',
    estimate: true,
  },
};

/** Fuel and emission prices used to build variable cost. */
export const PRICES = {
  gas_per_mmbtu: 4.5,
  uranium_per_mmbtu: 0.7,
  co2_per_tonne: 30,
  /** Natural gas combustion, tonnes CO2 per MMBtu. */
  gas_tco2_per_mmbtu: 0.0531,
  src: 'estimate' as SourceId,
};
