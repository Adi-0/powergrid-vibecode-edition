import type { TechId } from '../tech';
import type { SourceId } from '../sources';

/**
 * Generating plants and interties, aggregated by technology at each site. Names
 * point at the real plants in each area so the map is recognisable; capacities are
 * of the right class, not the real nameplates.
 */
export interface PlantRecord {
  id: string;
  name: string;
  bus: string; // SITE-kV
  tech: TechId;
  /** Net rating, MW (for storage: discharge rating). */
  mw: number;
  /** Heat rate override, Btu/kWh. */
  heatRate?: number;
  /** Minimum output override, MW (imports may be negative: exports). */
  pminMW?: number;
  /** Wind/solar resource profile. */
  profile?: 'tehachapi' | 'solano' | 'altamont' | 'gorgonio' | 'tracking' | 'fixed';
  /** Storage duration, hours (battery, pumped storage). */
  hours?: number;
  /** Hydro: the day's water, as a capacity factor over 24 h. */
  dailyCF?: number;
  /** Interties: equivalent governor capacity of the neighbouring system behind the tie, MW. */
  externalMW?: number;
  /**
   * Reliability must-run: kept online whatever the merit order says, because the
   * local network cannot hold its voltage without it (a real contract type).
   */
  mustRun?: boolean;
  /** Variable cost override, $/MWh (interties: the neighbouring market's price). */
  costPerMWh?: number;
  /**
   * Interties sell in blocks at rising prices (the neighbours' own supply curve):
   * each block's size, MW, and price, $/MWh. Blocks sum to the rating.
   */
  blocks?: Array<{ mw: number; cost: number }>;
  /** Synchronous condensers: reactive rating, MVAr (they make no real power). */
  mvar?: number;
  /** Units modelled individually down to their own terminal buses (the plant view). */
  units?: Array<{
    id: string;
    name: string;
    share: number;
    terminalKV: number;
    gsuMVA: number;
    gsuXPct: number;
    /** A unit with no governor of its own (a combined cycle's steam turbine follows its gas turbines' exhaust). */
    noGovernor?: boolean;
  }>;
  plain?: string;
  src: SourceId;
}

export const PLANTS: PlantRecord[] = [
  // ---------------------------------------------------------------- interties
  {
    id: 'COI',
    name: 'Pacific Northwest (California–Oregon Intertie)',
    bus: 'MALIN-500',
    tech: 'import_ac',
    mw: 3600,
    pminMW: 800,
    externalMW: 12000,
    blocks: [
      { mw: 1400, cost: 29 },
      { mw: 1200, cost: 42 },
      { mw: 1000, cost: 58 },
    ],
    plain: 'Hydro-rich Northwest utilities selling into California over two 500 kV AC lines.',
    src: 'wecc',
  },
  {
    id: 'PDCI',
    name: 'Pacific DC Intertie (from Celilo, Oregon)',
    bus: 'SYLMAR-230',
    tech: 'import_dc',
    mw: 3100,
    pminMW: 1000,
    blocks: [
      { mw: 1800, cost: 31 },
      { mw: 1300, cost: 44 },
    ],
    plain: '±500 kV direct current from the Columbia River to Los Angeles, 1,360 km.',
    src: 'wecc',
  },
  {
    id: 'SW_AZ',
    name: 'Desert Southwest (Palo Verde hub)',
    bus: 'PALO_VERDE-500',
    tech: 'import_ac',
    mw: 3200,
    pminMW: 1000,
    externalMW: 12000,
    blocks: [
      { mw: 1200, cost: 33 },
      { mw: 1000, cost: 45 },
      { mw: 1000, cost: 60 },
    ],
    src: 'wecc',
  },
  {
    id: 'SW_NV',
    name: 'Nevada (Eldorado / Hoover)',
    bus: 'ELDORADO-500',
    tech: 'import_ac',
    mw: 2200,
    pminMW: 300,
    externalMW: 6000,
    blocks: [
      { mw: 800, cost: 36 },
      { mw: 700, cost: 47 },
      { mw: 700, cost: 62 },
    ],
    src: 'wecc',
  },
  // ---------------------------------------------------------------- nuclear
  { id: 'DIABLO', name: 'Diablo Canyon', bus: 'DIABLO-500', tech: 'nuclear', mw: 2240, src: 'estimate' },
  // ---------------------------------------------------------------- hydro
  { id: 'PIT', name: 'Pit River hydro', bus: 'PIT_RIVER-230', tech: 'hydro', mw: 750, dailyCF: 0.45, src: 'estimate' },
  { id: 'OROVILLE', name: 'Oroville (Hyatt) hydro', bus: 'TABLE_MTN-230', tech: 'hydro', mw: 850, dailyCF: 0.4, src: 'estimate' },
  { id: 'STANISLAUS', name: 'Stanislaus & Mokelumne hydro', bus: 'BELLOTA-230', tech: 'hydro', mw: 500, dailyCF: 0.4, src: 'estimate' },
  { id: 'BIGCREEK', name: 'Big Creek hydro', bus: 'BIG_CREEK-230', tech: 'hydro', mw: 1000, dailyCF: 0.38, src: 'estimate' },
  {
    id: 'HELMS',
    name: 'Helms pumped storage',
    bus: 'HELMS-230',
    tech: 'pumped_storage',
    mw: 1200,
    hours: 8,
    pminMW: -900,
    src: 'estimate',
  },
  // ---------------------------------------------------------------- geothermal
  { id: 'GEYSERS', name: 'The Geysers', bus: 'GEYSERS-230', tech: 'geothermal', mw: 725, src: 'estimate' },
  { id: 'SALTON', name: 'Salton Sea geothermal', bus: 'IMPERIAL_VALLEY-230', tech: 'geothermal', mw: 450, src: 'estimate' },
  // ---------------------------------------------------------------- gas: combined cycle
  { id: 'COSUMNES', name: 'Cosumnes', bus: 'RANCHO_SECO-230', tech: 'gas_ccgt', mw: 600, heatRate: 6900, src: 'estimate' },
  { id: 'DELTA', name: 'Delta / Los Medanos / Gateway', bus: 'CONTRA_COSTA-230', tech: 'gas_ccgt', mw: 1500, heatRate: 7100, mustRun: true, src: 'estimate' },
  { id: 'METCALF_EC', name: 'Metcalf Energy Center', bus: 'METCALF-230', tech: 'gas_ccgt', mw: 600, heatRate: 7000, mustRun: true, src: 'estimate' },
  {
    id: 'ML1',
    name: 'Moss Landing Unit 1',
    bus: 'MOSS_LANDING-230',
    tech: 'gas_ccgt',
    mw: 510,
    heatRate: 6950,
    units: [
      // design split: the steam turbine makes what the two gas turbines' exhaust allows,
      // about 30 % of a 2-on-1 plant's output at full load (estimate)
      { id: 'GT1', name: 'Gas turbine 1', share: 0.35, terminalKV: 18, gsuMVA: 220, gsuXPct: 12 },
      { id: 'GT2', name: 'Gas turbine 2', share: 0.35, terminalKV: 18, gsuMVA: 220, gsuXPct: 12 },
      { id: 'ST', name: 'Steam turbine', share: 0.3, terminalKV: 18, gsuMVA: 220, gsuXPct: 12, noGovernor: true },
    ],
    plain: 'A 2-on-1 combined cycle: two gas turbines, each with a heat-recovery steam generator, feeding one steam turbine.',
    src: 'estimate',
  },
  { id: 'ML2', name: 'Moss Landing Unit 2', bus: 'MOSS_LANDING-230', tech: 'gas_ccgt', mw: 510, heatRate: 6950, src: 'estimate' },
  { id: 'LA_PALOMA', name: 'La Paloma / Sunrise', bus: 'MIDWAY-230', tech: 'gas_ccgt', mw: 1600, heatRate: 7200, src: 'estimate' },
  { id: 'VALLEY_GEN', name: 'Valley Generating Station', bus: 'SYLMAR-230', tech: 'gas_ccgt', mw: 580, heatRate: 7300, mustRun: true, src: 'estimate' },
  { id: 'SCATTERGOOD', name: 'Scattergood', bus: 'SCATTERGOOD-230', tech: 'gas_ccgt', mw: 800, heatRate: 7250, mustRun: true, src: 'estimate' },
  { id: 'HAYNES', name: 'Haynes / Alamitos', bus: 'HAYNES-230', tech: 'gas_ccgt', mw: 1600, heatRate: 7150, mustRun: true, src: 'estimate' },
  { id: 'INLAND', name: 'Inland Empire Energy Center', bus: 'MIRA_LOMA-230', tech: 'gas_ccgt', mw: 800, heatRate: 7050, src: 'estimate' },
  { id: 'MOUNTAINVIEW', name: 'Mountainview', bus: 'VISTA-230', tech: 'gas_ccgt', mw: 1050, heatRate: 6950, src: 'estimate' },
  { id: 'HUNTINGTON', name: 'Huntington Beach', bus: 'BARRE-230', tech: 'gas_ccgt', mw: 640, heatRate: 7000, src: 'estimate' },
  { id: 'BLYTHE', name: 'Blythe', bus: 'COLORADO_RIVER-500', tech: 'gas_ccgt', mw: 500, heatRate: 7300, src: 'estimate' },
  { id: 'PALOMAR', name: 'Palomar', bus: 'SYCAMORE-230', tech: 'gas_ccgt', mw: 565, heatRate: 7050, mustRun: true, src: 'estimate' },
  { id: 'OTAY', name: 'Otay Mesa', bus: 'OTAY_MESA-230', tech: 'gas_ccgt', mw: 600, heatRate: 7100, mustRun: true, src: 'estimate' },
  { id: 'SMUD_GAS', name: 'Sacramento local gas (SMUD)', bus: 'ELVERTA-230', tech: 'gas_ccgt', mw: 500, heatRate: 7400, mustRun: true, src: 'estimate' },
  // ---------------------------------------------------------------- gas: peakers, cogen, engines
  { id: 'MARSH', name: 'Marsh Landing peakers', bus: 'CONTRA_COSTA-230', tech: 'gas_ct', mw: 500, heatRate: 9800, src: 'estimate' },
  { id: 'FRESNO_CT', name: 'Fresno peakers', bus: 'HERNDON-230', tech: 'gas_ct', mw: 300, heatRate: 10200, src: 'estimate' },
  { id: 'PANOCHE', name: 'Panoche peakers', bus: 'GATES-230', tech: 'gas_ct', mw: 400, heatRate: 9900, src: 'estimate' },
  { id: 'ORMOND', name: 'Ormond / Mandalay peakers', bus: 'MOORPARK-230', tech: 'gas_ct', mw: 1500, heatRate: 10400, src: 'estimate' },
  { id: 'EL_SEGUNDO', name: 'El Segundo peakers', bus: 'SCATTERGOOD-230', tech: 'gas_ct', mw: 500, heatRate: 9700, src: 'estimate' },
  { id: 'ALAMITOS_CT', name: 'Alamitos peakers', bus: 'HAYNES-230', tech: 'gas_ct', mw: 1000, heatRate: 10100, src: 'estimate' },
  { id: 'WALNUT', name: 'Walnut Creek peakers', bus: 'MIRA_LOMA-230', tech: 'gas_ct', mw: 500, heatRate: 9600, src: 'estimate' },
  { id: 'SB_CT', name: 'San Bernardino peakers', bus: 'VISTA-230', tech: 'gas_ct', mw: 400, heatRate: 10300, src: 'estimate' },
  { id: 'SENTINEL', name: 'Sentinel peakers', bus: 'DEVERS-230', tech: 'gas_ct', mw: 850, heatRate: 9500, src: 'estimate' },
  { id: 'CARLSBAD', name: 'Carlsbad peakers', bus: 'ENCINA-230', tech: 'gas_ct', mw: 500, heatRate: 9400, src: 'estimate' },
  { id: 'ELK_HILLS', name: 'Kern oil-field cogeneration', bus: 'MIDWAY-230', tech: 'gas_cogen', mw: 800, src: 'estimate' },
  { id: 'KERN_COGEN', name: 'Kern River cogeneration', bus: 'MAGUNDEN-230', tech: 'gas_cogen', mw: 300, src: 'estimate' },
  {
    id: 'HUMBOLDT_BAY',
    name: 'Humboldt Bay',
    bus: 'HUMBOLDT-115',
    tech: 'gas_recip',
    mw: 163,
    pminMW: 60,
    mustRun: true,
    plain: 'Engines on Humboldt Bay that must run: the long lines over the Coast Range cannot hold the North Coast’s voltage alone.',
    src: 'estimate',
  },
  // ---------------------------------------------------------------- wind
  { id: 'SOLANO_W', name: 'Solano wind (Montezuma Hills)', bus: 'VACA_DIXON-230', tech: 'wind', mw: 900, profile: 'solano', src: 'estimate' },
  { id: 'ALTAMONT_W', name: 'Altamont Pass wind', bus: 'TESLA-230', tech: 'wind', mw: 400, profile: 'altamont', src: 'estimate' },
  { id: 'TEHACHAPI_W', name: 'Tehachapi Pass wind', bus: 'WINDHUB-500', tech: 'wind', mw: 3200, profile: 'tehachapi', src: 'estimate' },
  { id: 'GORGONIO_W', name: 'San Gorgonio Pass wind', bus: 'DEVERS-230', tech: 'wind', mw: 600, profile: 'gorgonio', src: 'estimate' },
  // ---------------------------------------------------------------- utility solar
  { id: 'SMUD_PV', name: 'Sacramento solar', bus: 'RANCHO_SECO-230', tech: 'solar_pv', mw: 160, profile: 'tracking', src: 'estimate' },
  { id: 'FRESNO_PV', name: 'Fresno County solar', bus: 'HERNDON-230', tech: 'solar_pv', mw: 300, profile: 'tracking', src: 'estimate' },
  { id: 'WESTLANDS_PV', name: 'Westlands solar', bus: 'WESTLANDS-230', tech: 'solar_pv', mw: 3000, profile: 'tracking', src: 'estimate' },
  { id: 'KINGS_PV', name: 'Kings & Tulare solar', bus: 'GATES-230', tech: 'solar_pv', mw: 1200, profile: 'tracking', src: 'estimate' },
  { id: 'TOPAZ_PV', name: 'Topaz / California Flats solar', bus: 'CARRIZO-230', tech: 'solar_pv', mw: 850, profile: 'fixed', src: 'estimate' },
  { id: 'KERN_PV', name: 'Kern solar', bus: 'MAGUNDEN-230', tech: 'solar_pv', mw: 1800, profile: 'tracking', src: 'estimate' },
  { id: 'ANTELOPE_PV', name: 'Antelope Valley solar', bus: 'ANTELOPE-230', tech: 'solar_pv', mw: 3000, profile: 'tracking', src: 'estimate' },
  { id: 'DESERT_PV', name: 'Desert Sunlight / Blythe solar', bus: 'COLORADO_RIVER-500', tech: 'solar_pv', mw: 2500, profile: 'tracking', src: 'estimate' },
  { id: 'IMPERIAL_PV', name: 'Imperial Valley solar', bus: 'IMPERIAL_VALLEY-230', tech: 'solar_pv', mw: 1300, profile: 'tracking', src: 'estimate' },
  // ---------------------------------------------------------------- batteries (4 h)
  { id: 'ML_BESS', name: 'Moss Landing battery', bus: 'MOSS_LANDING-230', tech: 'battery', mw: 750, hours: 4, src: 'estimate' },
  { id: 'TESLA_BESS', name: 'Tracy battery', bus: 'TESLA-230', tech: 'battery', mw: 300, hours: 4, src: 'estimate' },
  { id: 'METCALF_BESS', name: 'San José battery', bus: 'METCALF-230', tech: 'battery', mw: 200, hours: 4, src: 'estimate' },
  { id: 'WESTLANDS_BESS', name: 'Westlands battery', bus: 'WESTLANDS-230', tech: 'battery', mw: 500, hours: 4, src: 'estimate' },
  { id: 'KERN_BESS', name: 'Kern battery', bus: 'MAGUNDEN-230', tech: 'battery', mw: 800, hours: 4, src: 'estimate' },
  { id: 'ANTELOPE_BESS', name: 'Antelope Valley battery', bus: 'ANTELOPE-230', tech: 'battery', mw: 600, hours: 4, src: 'estimate' },
  { id: 'ALAMITOS_BESS', name: 'Alamitos battery', bus: 'HAYNES-230', tech: 'battery', mw: 400, hours: 4, src: 'estimate' },
  { id: 'INLAND_BESS', name: 'Inland Empire battery', bus: 'MIRA_LOMA-230', tech: 'battery', mw: 600, hours: 4, src: 'estimate' },
  { id: 'VISTA_BESS', name: 'Redlands battery', bus: 'VISTA-230', tech: 'battery', mw: 400, hours: 4, src: 'estimate' },
  { id: 'DEVERS_BESS', name: 'Coachella battery', bus: 'DEVERS-230', tech: 'battery', mw: 300, hours: 4, src: 'estimate' },
  { id: 'DESERT_BESS', name: 'Desert battery', bus: 'COLORADO_RIVER-500', tech: 'battery', mw: 1000, hours: 4, src: 'estimate' },
  { id: 'OTAY_BESS', name: 'Otay battery', bus: 'OTAY_MESA-230', tech: 'battery', mw: 400, hours: 4, src: 'estimate' },
  // ---------------------------------------------------------------- synchronous condensers (reactive power only)
  { id: 'POTRERO_SC', name: 'Potrero converter reactive support (Trans Bay Cable)', bus: 'MARTIN-230', tech: 'syncon', mw: 0, mvar: 250, src: 'estimate' },
  { id: 'METCALF_SVC', name: 'Metcalf static var compensator', bus: 'METCALF-230', tech: 'syncon', mw: 0, mvar: 400, src: 'estimate' },
  { id: 'ELVERTA_SVC', name: 'Sacramento static var compensator', bus: 'ELVERTA-230', tech: 'syncon', mw: 0, mvar: 400, src: 'estimate' },
  { id: 'TALEGA_SC', name: 'Talega synchronous condensers', bus: 'SAN_ONOFRE-230', tech: 'syncon', mw: 0, mvar: 450, src: 'estimate' },
  { id: 'MIGUEL_SC', name: 'Miguel synchronous condensers', bus: 'MIGUEL-230', tech: 'syncon', mw: 0, mvar: 450, src: 'estimate' },
  { id: 'SANTIAGO_SC', name: 'Santiago synchronous condensers', bus: 'SANTIAGO-230', tech: 'syncon', mw: 0, mvar: 400, src: 'estimate' },
  { id: 'LAGUNA_SC', name: 'Laguna Bell static var compensator', bus: 'LAGUNA_BELL-230', tech: 'syncon', mw: 0, mvar: 400, src: 'estimate' },
  { id: 'GOLETA_SC', name: 'Goleta synchronous condenser', bus: 'GOLETA-230', tech: 'syncon', mw: 0, mvar: 150, src: 'estimate' },
];
