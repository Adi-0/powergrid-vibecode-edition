/**
 * The synthetic California transmission network.
 *
 * THIS IS NOT A REPLICA. It is a 64-bus reconstruction that captures the real
 * structure of the California grid — the north–south corridors, the Sierra
 * hydro, the Central Valley solar belt, the coastal plants, the wind in the
 * mountain passes, the geothermal in the north, the load centres in the Bay
 * Area and the LA Basin, and the imports from the Northwest and Southwest —
 * using the real place names so the geography is recognisable. Circuit counts,
 * impedances, ratings and dispatch are plausible values for equipment of that
 * class, not the actual values of any utility's system. See docs/model.md.
 *
 * Every impedance here is computed by the builders in ./build.ts from conductor
 * data, tower geometry and route length. Nothing is typed in directly.
 */

import { NetworkCase, Bus, Branch, Generator, Load, ShuntDevice } from '../../core/network.js';
import {
  makeBus, makeBusId, makeLines, makeTransformers, SYSTEM_BASE_MVA,
  TRANSFORMER_CLASSES, LineSpec,
} from './build.js';

// ---------------------------------------------------------------------------
// Buses
// ---------------------------------------------------------------------------

/** Sites that carry a 500 kV bus — the EHV backbone. */
const EHV_SITES = [
  'malin', 'paloverde', 'roundmtn', 'tablemtn', 'vaca', 'tesla', 'metcalf',
  'mosslanding', 'losbanos', 'gates', 'midway', 'diablo', 'whirlwind', 'vincent',
  'sylmar', 'rinaldi', 'lugo', 'miraloma', 'serrano', 'valley', 'devers',
  'sanonofre', 'imperialvalley', 'miguel', 'kern',
];

/** Sites that carry a 230 kV bus — the subtransmission and collection layer. */
const HV230_SITES = [
  'roundmtn', 'geysers', 'tablemtn', 'riooso', 'sacramento', 'vaca', 'tesla', 'altamont',
  'newark', 'sanmateo', 'martin', 'oakland', 'metcalf', 'mosslanding', 'losbanos',
  'panoche', 'gates', 'fresno', 'bigcreek', 'helms', 'kern', 'midway', 'morrobay',
  'diablo', 'whirlwind', 'vincent', 'sylmar', 'rinaldi', 'haynes', 'miraloma',
  'lugo', 'serrano', 'valley', 'devers', 'sangorgonio', 'sanonofre', 'escondido',
  'miguel', 'sandiego', 'imperialvalley',
];

/** Sites that carry a 115 kV bus — the last transmission step before distribution. */
const HV115_SITES = ['metcalf', 'edenvale'];

/**
 * Generator scheduled voltages, per-unit.
 *
 * Generators are operated a little above nominal so that voltage falls to
 * roughly nominal by the time power reaches the load end of a line. The slack
 * is set highest because it is the strongest point in the model.
 */
const V_SCHED = {
  slack: 1.040,
  ehvGen: 1.030,
  hvGen: 1.020,
} as const;

function buildBuses(): Bus[] {
  const buses: Bus[] = [];
  for (const site of EHV_SITES) {
    buses.push(makeBus({ site, kV: 500 }));
  }
  for (const site of HV230_SITES) {
    buses.push(makeBus({ site, kV: 230 }));
  }
  for (const site of HV115_SITES) {
    buses.push(makeBus({ site, kV: 115 }));
  }
  // The distribution substation low-voltage bus: where transmission ends.
  buses.push(makeBus({ site: 'edenvale', kV: 12.47 }));
  return buses;
}

// ---------------------------------------------------------------------------
// Circuits
// ---------------------------------------------------------------------------

/**
 * The EHV backbone. Circuit counts reflect the real corridor capacities: the
 * two great north–south paths are multi-circuit because they are the
 * bottleneck the whole state is organised around.
 */
const EHV_CIRCUITS: LineSpec[] = [
  { fromSite: 'malin', toSite: 'roundmtn', kV: 500, circuits: 3, label: 'California–Oregon Intertie' },
  { fromSite: 'roundmtn', toSite: 'tablemtn', kV: 500, circuits: 3 },
  { fromSite: 'tablemtn', toSite: 'vaca', kV: 500, circuits: 2 },
  { fromSite: 'tablemtn', toSite: 'tesla', kV: 500, circuits: 1 },
  { fromSite: 'vaca', toSite: 'tesla', kV: 500, circuits: 2 },
  { fromSite: 'tesla', toSite: 'metcalf', kV: 500, circuits: 2 },
  { fromSite: 'tesla', toSite: 'losbanos', kV: 500, circuits: 2 },
  { fromSite: 'metcalf', toSite: 'mosslanding', kV: 500, circuits: 1 },
  { fromSite: 'metcalf', toSite: 'losbanos', kV: 500, circuits: 1 },
  { fromSite: 'losbanos', toSite: 'gates', kV: 500, circuits: 3, label: 'Path 15' },
  { fromSite: 'gates', toSite: 'midway', kV: 500, circuits: 2 },
  { fromSite: 'gates', toSite: 'diablo', kV: 500, circuits: 1 },
  { fromSite: 'diablo', toSite: 'midway', kV: 500, circuits: 2 },
  { fromSite: 'midway', toSite: 'vincent', kV: 500, circuits: 3, label: 'Path 26' },
  { fromSite: 'kern', toSite: 'midway', kV: 500, circuits: 2 },
  { fromSite: 'kern', toSite: 'whirlwind', kV: 500, circuits: 1 },
  { fromSite: 'midway', toSite: 'whirlwind', kV: 500, circuits: 1 },
  { fromSite: 'whirlwind', toSite: 'vincent', kV: 500, circuits: 2, label: 'Tehachapi collector' },
  { fromSite: 'vincent', toSite: 'sylmar', kV: 500, circuits: 2 },
  { fromSite: 'sylmar', toSite: 'rinaldi', kV: 500, circuits: 2 },
  { fromSite: 'rinaldi', toSite: 'miraloma', kV: 500, circuits: 2 },
  { fromSite: 'vincent', toSite: 'miraloma', kV: 500, circuits: 2 },
  { fromSite: 'vincent', toSite: 'lugo', kV: 500, circuits: 1 },
  { fromSite: 'lugo', toSite: 'miraloma', kV: 500, circuits: 1 },
  { fromSite: 'lugo', toSite: 'paloverde', kV: 500, circuits: 1, label: 'Southwest intertie' },
  { fromSite: 'paloverde', toSite: 'devers', kV: 500, circuits: 2, label: 'Southwest intertie' },
  { fromSite: 'devers', toSite: 'miraloma', kV: 500, circuits: 1 },
  { fromSite: 'devers', toSite: 'valley', kV: 500, circuits: 1 },
  { fromSite: 'devers', toSite: 'imperialvalley', kV: 500, circuits: 1 },
  { fromSite: 'miraloma', toSite: 'serrano', kV: 500, circuits: 2 },
  { fromSite: 'serrano', toSite: 'valley', kV: 500, circuits: 1 },
  { fromSite: 'serrano', toSite: 'sanonofre', kV: 500, circuits: 2 },
  { fromSite: 'sanonofre', toSite: 'miguel', kV: 500, circuits: 2 },
  { fromSite: 'imperialvalley', toSite: 'miguel', kV: 500, circuits: 1, label: 'Sunrise Powerlink' },
];

/** The 230 kV layer: collection from plants, and delivery into load centres. */
const HV230_CIRCUITS: LineSpec[] = [
  // North
  { fromSite: 'geysers', toSite: 'vaca', kV: 230, circuits: 2 },
  { fromSite: 'geysers', toSite: 'martin', kV: 230, circuits: 2 },
  { fromSite: 'tablemtn', toSite: 'riooso', kV: 230, circuits: 3 },
  { fromSite: 'riooso', toSite: 'sacramento', kV: 230, circuits: 2 },
  { fromSite: 'vaca', toSite: 'sacramento', kV: 230, circuits: 2 },
  { fromSite: 'vaca', toSite: 'tesla', kV: 230, circuits: 1 },
  // Bay Area
  { fromSite: 'tesla', toSite: 'altamont', kV: 230, circuits: 2 },
  { fromSite: 'tesla', toSite: 'newark', kV: 230, circuits: 3 },
  { fromSite: 'tesla', toSite: 'oakland', kV: 230, circuits: 3 },
  { fromSite: 'newark', toSite: 'sanmateo', kV: 230, circuits: 3 },
  { fromSite: 'sanmateo', toSite: 'martin', kV: 230, circuits: 3 },
  { fromSite: 'martin', toSite: 'oakland', kV: 230, circuits: 2 },
  { fromSite: 'newark', toSite: 'metcalf', kV: 230, circuits: 3 },
  { fromSite: 'metcalf', toSite: 'mosslanding', kV: 230, circuits: 3 },
  // Central Valley and Sierra
  { fromSite: 'losbanos', toSite: 'panoche', kV: 230, circuits: 2 },
  { fromSite: 'panoche', toSite: 'gates', kV: 230, circuits: 2 },
  { fromSite: 'gates', toSite: 'fresno', kV: 230, circuits: 2 },
  { fromSite: 'fresno', toSite: 'bigcreek', kV: 230, circuits: 2 },
  { fromSite: 'bigcreek', toSite: 'helms', kV: 230, circuits: 2 },
  { fromSite: 'helms', toSite: 'fresno', kV: 230, circuits: 2 },
  { fromSite: 'fresno', toSite: 'kern', kV: 230, circuits: 2 },
  { fromSite: 'kern', toSite: 'midway', kV: 230, circuits: 3 },
  { fromSite: 'midway', toSite: 'morrobay', kV: 230, circuits: 1 },
  { fromSite: 'morrobay', toSite: 'diablo', kV: 230, circuits: 1 },
  { fromSite: 'morrobay', toSite: 'gates', kV: 230, circuits: 1 },
  // Southern California
  { fromSite: 'whirlwind', toSite: 'vincent', kV: 230, circuits: 1 },
  { fromSite: 'vincent', toSite: 'sylmar', kV: 230, circuits: 2 },
  { fromSite: 'sylmar', toSite: 'rinaldi', kV: 230, circuits: 5 },
  { fromSite: 'rinaldi', toSite: 'haynes', kV: 230, circuits: 3 },
  { fromSite: 'haynes', toSite: 'miraloma', kV: 230, circuits: 3 },
  { fromSite: 'lugo', toSite: 'miraloma', kV: 230, circuits: 1 },
  { fromSite: 'miraloma', toSite: 'serrano', kV: 230, circuits: 3 },
  { fromSite: 'serrano', toSite: 'valley', kV: 230, circuits: 2 },
  { fromSite: 'valley', toSite: 'devers', kV: 230, circuits: 2 },
  { fromSite: 'devers', toSite: 'sangorgonio', kV: 230, circuits: 2 },
  // San Diego
  { fromSite: 'serrano', toSite: 'sanonofre', kV: 230, circuits: 3 },
  { fromSite: 'sanonofre', toSite: 'escondido', kV: 230, circuits: 3 },
  { fromSite: 'escondido', toSite: 'miguel', kV: 230, circuits: 3 },
  { fromSite: 'miguel', toSite: 'sandiego', kV: 230, circuits: 4 },
  { fromSite: 'escondido', toSite: 'sandiego', kV: 230, circuits: 2 },
  { fromSite: 'imperialvalley', toSite: 'miguel', kV: 230, circuits: 2 },
];

/** The 115 kV step: Metcalf down to the Eden Vale distribution substation. */
const HV115_CIRCUITS: LineSpec[] = [
  { fromSite: 'metcalf', toSite: 'edenvale', kV: 115, circuits: 2 },
];

/** 500/230 kV autotransformer banks. */
const EHV_TRANSFORMER_SITES: { site: string; banks: number; tap?: number }[] = [
  { site: 'roundmtn', banks: 2 }, { site: 'tablemtn', banks: 3 },
  { site: 'vaca', banks: 2 }, { site: 'tesla', banks: 3 },
  { site: 'metcalf', banks: 3 }, { site: 'mosslanding', banks: 2 },
  { site: 'losbanos', banks: 2 }, { site: 'gates', banks: 3 },
  { site: 'midway', banks: 4 }, { site: 'diablo', banks: 2 },
  { site: 'whirlwind', banks: 3 }, { site: 'kern', banks: 4 },
  { site: 'vincent', banks: 4 },
  { site: 'sylmar', banks: 3 }, { site: 'rinaldi', banks: 4 },
  { site: 'sanonofre', banks: 3 }, { site: 'lugo', banks: 2 },
  { site: 'miraloma', banks: 4 }, { site: 'serrano', banks: 3 },
  { site: 'valley', banks: 3 }, { site: 'devers', banks: 3 },
  { site: 'imperialvalley', banks: 3 }, { site: 'miguel', banks: 4 },
];

function buildBranches(): Branch[] {
  const out: Branch[] = [];
  for (const spec of [...EHV_CIRCUITS, ...HV230_CIRCUITS, ...HV115_CIRCUITS]) {
    out.push(...makeLines(spec));
  }
  for (const t of EHV_TRANSFORMER_SITES) {
    out.push(...makeTransformers({
      site: t.site, hvKV: 500, lvKV: 230,
      ...TRANSFORMER_CLASSES.auto500_230, banks: t.banks,
      ...(t.tap ? { tap: t.tap } : {}),
    }));
  }
  // Metcalf 230/115 kV, feeding the subtransmission that reaches Eden Vale.
  out.push(...makeTransformers({
    site: 'metcalf', hvKV: 230, lvKV: 115,
    ...TRANSFORMER_CLASSES.auto230_115, banks: 2,
  }));
  // Eden Vale 115/12.47 kV: the last transformer before the neighbourhood.
  // The tap is set above nominal so the far end of the feeder stays in range.
  out.push(...makeTransformers({
    site: 'edenvale', hvKV: 115, lvKV: 12.47,
    ...TRANSFORMER_CLASSES.dist115_12, banks: 2, tap: 1.0125,
  }));
  return out;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface GenSpec {
  site: string;
  kV: number;
  kind: Generator['kind'];
  name: string;
  capacityMW: number;
  pMinMW: number;
  /** Reactive capability as a fraction of MW rating, each way. */
  qRange: [number, number];
  marginalCost: number;
  inertiaH?: number;
  rampMWPerMin?: number;
  heatRateBtuPerKWh?: number;
  xd?: number;
  xdpp?: number;
  note: string;
}

/**
 * The generation fleet.
 *
 * Capacities are plausible aggregate values for that location and technology.
 * Marginal costs are in $/MWh and set the merit order; they are canonical
 * figures for the technology rather than any real unit's offer. Inertia
 * constants H are in MW·s per MVA of rating and are standard textbook values by
 * machine type — large steam turbines 4–6, gas turbines 4–8, hydro 2–4;
 * inverter-based resources have none at all, which is the single most important
 * fact about what changes as a grid decarbonises.
 */
export const GENERATION: GenSpec[] = [
  // --- imports ---
  { site: 'malin', kV: 500, kind: 'import', name: 'Pacific Northwest intertie',
    capacityMW: 4800, pMinMW: -1500, qRange: [-0.4, 0.5], marginalCost: 22, inertiaH: 5.0,
    note: 'Hydroelectric power from the Columbia River system, arriving over the California–Oregon Intertie. Negative output means California is exporting.' },
  { site: 'paloverde', kV: 500, kind: 'import', name: 'Southwest intertie',
    capacityMW: 3500, pMinMW: 0, qRange: [-0.3, 0.4], marginalCost: 31, inertiaH: 5.5,
    note: 'Nuclear and gas generation in Arizona, plus desert solar, arriving on the 500 kV lines from Palo Verde.' },
  { site: 'sylmar', kV: 230, kind: 'import', name: 'Pacific DC Intertie terminal',
    capacityMW: 3100, pMinMW: 0, qRange: [-0.3, 0.3], marginalCost: 24,
    note: 'The southern end of a direct-current line 1,360 km long. Direct current is used because over that distance it loses less than alternating current would.' },

  // --- must-run and baseload ---
  { site: 'diablo', kV: 230, kind: 'nuclear', name: 'Diablo Canyon',
    capacityMW: 2256, pMinMW: 2000, qRange: [-0.4, 0.5], marginalCost: 9, inertiaH: 5.5,
    rampMWPerMin: 11, heatRateBtuPerKWh: 10400, xd: 1.8, xdpp: 0.20,
    note: 'Two pressurised-water reactors. Nuclear plants run at a steady output because their economics and their physics both favour it.' },
  { site: 'geysers', kV: 230, kind: 'geothermal', name: 'The Geysers',
    capacityMW: 900, pMinMW: 700, qRange: [-0.3, 0.4], marginalCost: 12, inertiaH: 4.0,
    rampMWPerMin: 9, xd: 1.9, xdpp: 0.22,
    note: 'Steam drawn from rock two kilometres down drives conventional turbines. The resource is steady, so the plant runs near flat out.' },
  { site: 'imperialvalley', kV: 230, kind: 'geothermal', name: 'Imperial Valley geothermal',
    capacityMW: 400, pMinMW: 300, qRange: [-0.3, 0.4], marginalCost: 14, inertiaH: 4.0,
    rampMWPerMin: 4, xd: 1.9, xdpp: 0.22, note: 'Geothermal brine fields beside the Salton Sea.' },

  // --- hydro ---
  { site: 'tablemtn', kV: 230, kind: 'hydro', name: 'Northern Sierra hydro',
    capacityMW: 800, pMinMW: 0, qRange: [-0.5, 0.6], marginalCost: 4, inertiaH: 3.0,
    rampMWPerMin: 80, xd: 1.0, xdpp: 0.25,
    note: 'Water stored behind dams. Hydro can change output faster than almost anything else, which makes it the grid’s shock absorber.' },
  { site: 'bigcreek', kV: 230, kind: 'hydro', name: 'Big Creek hydro chain',
    capacityMW: 1000, pMinMW: 0, qRange: [-0.5, 0.6], marginalCost: 4, inertiaH: 3.2,
    rampMWPerMin: 100, xd: 1.05, xdpp: 0.24,
    note: 'A staircase of powerhouses, each using the same water again as it falls down the mountain.' },
  { site: 'helms', kV: 230, kind: 'hydro', name: 'Helms pumped storage',
    capacityMW: 1200, pMinMW: -1200, qRange: [-0.5, 0.6], marginalCost: 46, inertiaH: 3.5,
    rampMWPerMin: 200, xd: 1.0, xdpp: 0.23,
    note: 'A battery made of water and gravity. Negative output means it is pumping water uphill, consuming power instead of producing it.' },

  // --- wind ---
  { site: 'whirlwind', kV: 230, kind: 'wind', name: 'Tehachapi wind',
    capacityMW: 4000, pMinMW: 0, qRange: [-0.33, 0.33], marginalCost: 0,
    note: 'Turbines across the Tehachapi mountains. Their electronics can produce or absorb reactive power on command, but they add no inertia.' },
  { site: 'sangorgonio', kV: 230, kind: 'wind', name: 'San Gorgonio Pass wind',
    capacityMW: 1000, pMinMW: 0, qRange: [-0.33, 0.33], marginalCost: 0,
    note: 'A wind farm in the gap between two ten-thousand-foot mountains.' },
  { site: 'altamont', kV: 230, kind: 'wind', name: 'Altamont Pass wind',
    capacityMW: 500, pMinMW: 0, qRange: [-0.33, 0.33], marginalCost: 0,
    note: 'Afternoon wind pulled through the pass by the hot Central Valley inland.' },

  // --- solar ---
  { site: 'gates', kV: 230, kind: 'solar-pv', name: 'Gates solar cluster',
    capacityMW: 3000, pMinMW: 0, qRange: [-0.33, 0.33], marginalCost: 0,
    note: 'Photovoltaic farms on the west side of the valley. No moving parts, no inertia, and output that tracks the sun exactly.' },
  { site: 'panoche', kV: 230, kind: 'solar-pv', name: 'Panoche solar cluster',
    capacityMW: 2200, pMinMW: 0, qRange: [-0.33, 0.33], marginalCost: 0,
    note: 'Valley floor photovoltaics.' },
  { site: 'kern', kV: 230, kind: 'solar-pv', name: 'Kern County solar cluster',
    capacityMW: 4000, pMinMW: 0, qRange: [-0.33, 0.33], marginalCost: 0,
    note: 'The largest concentration of solar in the state, on former oilfield and farmland.' },
  { site: 'midway', kV: 230, kind: 'solar-pv', name: 'Midway solar',
    capacityMW: 1500, pMinMW: 0, qRange: [-0.33, 0.33], marginalCost: 0,
    note: 'Solar built beside an existing switchyard, which is much cheaper than building new transmission.' },
  { site: 'imperialvalley', kV: 230, kind: 'solar-pv', name: 'Imperial Valley solar',
    capacityMW: 2000, pMinMW: 0, qRange: [-0.33, 0.33], marginalCost: 0,
    note: 'Desert solar, with the best irradiance in the state.' },

  // --- batteries ---
  { site: 'mosslanding', kV: 230, kind: 'battery', name: 'Moss Landing storage',
    capacityMW: 1500, pMinMW: -1500, qRange: [-0.4, 0.4], marginalCost: 48,
    note: 'Lithium-ion batteries in a former turbine hall. Charges on cheap midday solar and discharges into the evening peak.' },
  { site: 'vincent', kV: 230, kind: 'battery', name: 'Vincent storage',
    capacityMW: 800, pMinMW: -800, qRange: [-0.4, 0.4], marginalCost: 50,
    note: 'Battery storage sited at a transmission hub so it can serve the whole basin.' },
  { site: 'kern', kV: 230, kind: 'battery', name: 'Kern storage',
    capacityMW: 600, pMinMW: -600, qRange: [-0.4, 0.4], marginalCost: 50,
    note: 'Storage co-located with solar, which lets the same interconnection be used twice a day.' },
  { site: 'escondido', kV: 230, kind: 'battery', name: 'Escondido storage',
    capacityMW: 400, pMinMW: -400, qRange: [-0.4, 0.4], marginalCost: 52,
    note: 'Storage placed inside San Diego because the circuits reaching it are limited.' },

  // --- gas, combined cycle ---
  { site: 'mosslanding', kV: 230, kind: 'gas-cc', name: 'Moss Landing combined cycle',
    capacityMW: 1500, pMinMW: 450, qRange: [-0.4, 0.5], marginalCost: 42, inertiaH: 5.2,
    rampMWPerMin: 45, heatRateBtuPerKWh: 6900, xd: 1.9, xdpp: 0.18,
    note: 'A gas turbine, a heat recovery boiler and a steam turbine in series, extracting work from the same fuel twice.' },
  { site: 'haynes', kV: 230, kind: 'gas-cc', name: 'Haynes combined cycle',
    capacityMW: 2200, pMinMW: 660, qRange: [-0.4, 0.5], marginalCost: 44, inertiaH: 5.0,
    rampMWPerMin: 60, heatRateBtuPerKWh: 7100, xd: 1.9, xdpp: 0.18,
    note: 'Gas plant on the Long Beach waterfront, close enough to the load that little transmission is needed.' },
  { site: 'kern', kV: 230, kind: 'gas-cc', name: 'Kern River combined cycle',
    capacityMW: 1500, pMinMW: 450, qRange: [-0.4, 0.5], marginalCost: 43, inertiaH: 5.1,
    rampMWPerMin: 45, heatRateBtuPerKWh: 7000, xd: 1.9, xdpp: 0.18,
    note: 'Gas generation in the southern valley, historically paired with oilfield steam.' },
  { site: 'sacramento', kV: 230, kind: 'gas-cc', name: 'Sacramento combined cycle',
    capacityMW: 1400, pMinMW: 420, qRange: [-0.4, 0.5], marginalCost: 45, inertiaH: 5.0,
    rampMWPerMin: 42, heatRateBtuPerKWh: 7200, xd: 1.9, xdpp: 0.18,
    note: 'Combined cycle serving the capital region.' },
  { site: 'metcalf', kV: 230, kind: 'gas-cc', name: 'Metcalf combined cycle',
    capacityMW: 1000, pMinMW: 300, qRange: [-0.4, 0.5], marginalCost: 46, inertiaH: 5.0,
    rampMWPerMin: 30, heatRateBtuPerKWh: 7300, xd: 1.9, xdpp: 0.18,
    note: 'The only large plant inside the Bay Area, which is why the region depends on imports.' },
  { site: 'escondido', kV: 230, kind: 'gas-cc', name: 'Escondido combined cycle',
    capacityMW: 900, pMinMW: 270, qRange: [-0.4, 0.5], marginalCost: 47, inertiaH: 4.9,
    rampMWPerMin: 27, heatRateBtuPerKWh: 7400, xd: 1.9, xdpp: 0.18,
    note: 'Local generation for San Diego, which cannot rely on imports alone.' },
  { site: 'rinaldi', kV: 230, kind: 'gas-cc', name: 'San Fernando combined cycle',
    capacityMW: 1200, pMinMW: 360, qRange: [-0.4, 0.5], marginalCost: 46, inertiaH: 5.0,
    rampMWPerMin: 36, heatRateBtuPerKWh: 7250, xd: 1.9, xdpp: 0.18,
    note: 'In-basin gas generation, required for local voltage support as much as for energy.' },
  { site: 'miraloma', kV: 230, kind: 'gas-cc', name: 'Mira Loma combined cycle',
    capacityMW: 1300, pMinMW: 390, qRange: [-0.4, 0.5], marginalCost: 45, inertiaH: 5.0,
    rampMWPerMin: 39, heatRateBtuPerKWh: 7150, xd: 1.9, xdpp: 0.18,
    note: 'Inland Empire gas generation.' },
  { site: 'serrano', kV: 230, kind: 'gas-cc', name: 'Orange County combined cycle',
    capacityMW: 1000, pMinMW: 300, qRange: [-0.4, 0.5], marginalCost: 47, inertiaH: 5.0,
    rampMWPerMin: 30, heatRateBtuPerKWh: 7350, xd: 1.9, xdpp: 0.18,
    note: 'Gas generation serving Orange County.' },

  // --- gas, simple cycle peakers ---
  { site: 'vincent', kV: 230, kind: 'gas-ct', name: 'Vincent peakers',
    capacityMW: 600, pMinMW: 0, qRange: [-0.4, 0.5], marginalCost: 88, inertiaH: 6.0,
    rampMWPerMin: 60, heatRateBtuPerKWh: 10500, xd: 1.8, xdpp: 0.20,
    note: 'A bare gas turbine with no steam cycle. Inefficient and expensive to run, but it can be at full output within ten minutes.' },
  { site: 'newark', kV: 230, kind: 'gas-ct', name: 'Newark peakers',
    capacityMW: 500, pMinMW: 0, qRange: [-0.4, 0.5], marginalCost: 90, inertiaH: 6.0,
    rampMWPerMin: 50, heatRateBtuPerKWh: 10600, xd: 1.8, xdpp: 0.20,
    note: 'Peaking units in the east bay.' },
  { site: 'valley', kV: 230, kind: 'gas-ct', name: 'Valley peakers',
    capacityMW: 600, pMinMW: 0, qRange: [-0.4, 0.5], marginalCost: 89, inertiaH: 6.0,
    rampMWPerMin: 60, heatRateBtuPerKWh: 10550, xd: 1.8, xdpp: 0.20,
    note: 'Inland peaking capacity for hot evenings.' },
  { site: 'oakland', kV: 230, kind: 'gas-ct', name: 'Oakland peakers',
    capacityMW: 400, pMinMW: 0, qRange: [-0.4, 0.5], marginalCost: 95, inertiaH: 6.0,
    rampMWPerMin: 40, heatRateBtuPerKWh: 10900, xd: 1.8, xdpp: 0.20,
    note: 'Small units kept for local reliability rather than for energy.' },
  { site: 'martin', kV: 230, kind: 'gas-ct', name: 'Peninsula peakers',
    capacityMW: 300, pMinMW: 0, qRange: [-0.4, 0.5], marginalCost: 96, inertiaH: 6.0,
    rampMWPerMin: 30, heatRateBtuPerKWh: 11000, xd: 1.8, xdpp: 0.20,
    note: 'Peaking capacity kept close to San Francisco because the city has almost none of its own.' },
];

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export interface LoadSpec {
  site: string;
  kV: number;
  /** Peak real demand, MW — the value the daily profile scales. */
  peakMW: number;
  /** Displacement power factor at peak, lagging. */
  powerFactor: number;
  loadClass: 'residential' | 'commercial' | 'industrial' | 'agricultural' | 'mixed';
  note: string;
}

/**
 * Demand by location, at system peak.
 *
 * Totals are distributed to match the real shape of California demand: roughly
 * 42 % in the Los Angeles basin, 18 % in the Bay Area, 12 % in the Central
 * Valley, 12 % in the north, and 16 % in San Diego and Imperial.
 *
 * Power factor is the ratio of real to apparent power at the bus. Urban load is
 * well compensated by capacitors on the distribution system and sits near 0.98;
 * agricultural load is dominated by induction motors driving irrigation pumps
 * and is worse, near 0.92.
 */
export const LOADS: LoadSpec[] = [
  // North — 4,000 MW
  { site: 'sacramento', kV: 230, peakMW: 2600, powerFactor: 0.98, loadClass: 'mixed',
    note: 'The capital region: offices, housing, and summer air conditioning.' },
  { site: 'riooso', kV: 230, peakMW: 450, powerFactor: 0.94, loadClass: 'agricultural',
    note: 'Rice and orchard irrigation pumping, which runs hard in summer and stops in winter.' },
  { site: 'vaca', kV: 230, peakMW: 650, powerFactor: 0.97, loadClass: 'mixed',
    note: 'Solano County towns and food processing.' },
  { site: 'roundmtn', kV: 230, peakMW: 300, powerFactor: 0.96, loadClass: 'mixed',
    note: 'Redding and the far north.' },

  // Bay Area — 6,100 MW at transmission, plus the modelled feeder
  { site: 'martin', kV: 230, peakMW: 1150, powerFactor: 0.98, loadClass: 'commercial',
    note: 'San Francisco. Dense commercial load with almost no local generation behind it.' },
  { site: 'sanmateo', kV: 230, peakMW: 950, powerFactor: 0.98, loadClass: 'mixed',
    note: 'Peninsula suburbs and data centres.' },
  { site: 'newark', kV: 230, peakMW: 1250, powerFactor: 0.96, loadClass: 'industrial',
    note: 'East bay manufacturing and warehousing.' },
  { site: 'oakland', kV: 230, peakMW: 1300, powerFactor: 0.97, loadClass: 'mixed',
    note: 'Oakland, Berkeley and the port.' },
  { site: 'metcalf', kV: 230, peakMW: 1450, powerFactor: 0.98, loadClass: 'commercial',
    note: 'Silicon Valley, including a large and growing data centre load that barely varies with the season.' },

  // Central Valley and Sierra — 4,200 MW
  { site: 'fresno', kV: 230, peakMW: 1700, powerFactor: 0.95, loadClass: 'mixed',
    note: 'Fresno and the surrounding farm belt.' },
  { site: 'kern', kV: 230, peakMW: 1900, powerFactor: 0.93, loadClass: 'industrial',
    note: 'Bakersfield, oilfield pumping and agricultural processing — a motor-heavy load with a poor power factor.' },
  { site: 'morrobay', kV: 230, peakMW: 250, powerFactor: 0.97, loadClass: 'mixed',
    note: 'Central coast towns.' },
  { site: 'losbanos', kV: 230, peakMW: 200, powerFactor: 0.94, loadClass: 'agricultural',
    note: 'West-side irrigation districts.' },
  { site: 'gates', kV: 230, peakMW: 150, powerFactor: 0.94, loadClass: 'agricultural',
    note: 'Farm load near the switchyard.' },

  // Los Angeles basin — 14,200 MW
  { site: 'rinaldi', kV: 230, peakMW: 2800, powerFactor: 0.98, loadClass: 'mixed',
    note: 'The San Fernando Valley, which gets very hot and has a sharp evening air-conditioning peak.' },
  { site: 'haynes', kV: 230, peakMW: 1700, powerFactor: 0.97, loadClass: 'mixed',
    note: 'Long Beach, the harbour, and the refineries around it.' },
  { site: 'miraloma', kV: 230, peakMW: 3000, powerFactor: 0.97, loadClass: 'mixed',
    note: 'The Inland Empire: warehousing, logistics and fast-growing housing.' },
  { site: 'serrano', kV: 230, peakMW: 2500, powerFactor: 0.98, loadClass: 'mixed',
    note: 'Orange County.' },
  { site: 'valley', kV: 230, peakMW: 2000, powerFactor: 0.97, loadClass: 'mixed',
    note: 'Riverside and the inland valleys, the hottest large load area in the state.' },
  { site: 'lugo', kV: 230, peakMW: 700, powerFactor: 0.96, loadClass: 'mixed',
    note: 'High desert communities.' },
  { site: 'vincent', kV: 230, peakMW: 600, powerFactor: 0.96, loadClass: 'mixed',
    note: 'Antelope Valley.' },
  { site: 'sylmar', kV: 230, peakMW: 900, powerFactor: 0.98, loadClass: 'mixed',
    note: 'Northern Los Angeles.' },

  // San Diego and Imperial — 5,400 MW
  { site: 'sandiego', kV: 230, peakMW: 3400, powerFactor: 0.98, loadClass: 'mixed',
    note: 'The city itself, with a mild climate and therefore a flatter demand curve than inland.' },
  { site: 'escondido', kV: 230, peakMW: 1000, powerFactor: 0.97, loadClass: 'mixed',
    note: 'North county suburbs, hotter and peakier than the coast.' },
  { site: 'miguel', kV: 230, peakMW: 700, powerFactor: 0.97, loadClass: 'mixed',
    note: 'South bay and border communities.' },
  { site: 'imperialvalley', kV: 230, peakMW: 300, powerFactor: 0.92, loadClass: 'agricultural',
    note: 'Irrigation pumping in the desert — almost entirely induction motors.' },
];

/**
 * Load at the Eden Vale 12.47 kV bus that is NOT on the modelled feeder.
 *
 * The substation has four feeders. One of them, Cherry Lane 1201, is modelled
 * pole by pole in the distribution case. The other three are represented here
 * as a lump, because modelling all four would quadruple the node count without
 * teaching anything the first one does not.
 */
export const EDENVALE_OTHER_FEEDERS: LoadSpec = {
  site: 'edenvale', kV: 12.47, peakMW: 21.0, powerFactor: 0.97, loadClass: 'mixed',
  note: 'Three further distribution feeders out of this substation, shown as a single lumped load. The fourth is modelled in full.',
};

/**
 * How much of a load bus's reactive demand is supplied by capacitors sitting at
 * that bus, rather than carried there over the network.
 *
 * This is the single most important number in the reactive design of a power
 * system, and the reason for it is worth stating plainly.
 *
 * Reactive power is what magnetises every motor and transformer on the system.
 * It does no work, but it is real current, and carrying it over a line costs
 * exactly what carrying real power costs: the line's series reactance consumes
 * reactive power in proportion to the SQUARE of the current through it. Try to
 * ship a load's reactive demand from a generator two hundred kilometres away
 * and most of it is eaten on the way; ship more to make up the difference and
 * more still is eaten. Past a point the equations stop having a solution at
 * all, which is what voltage collapse is.
 *
 * So reactive power is made where it is used. A capacitor bank at the load bus
 * costs almost nothing, has no moving parts, and supplies the load's reactive
 * demand over a few metres of busbar instead of a few hundred kilometres of
 * line. Utilities compensate somewhere between half and nine-tenths of peak
 * reactive demand this way; 85 % is used here.
 */
const LOCAL_REACTIVE_COMPENSATION = 0.85;

/** Capacitor banks are built in discrete steps; 25 MVAr is a typical unit. */
const CAPACITOR_STEP_MVAR = 25;

/**
 * Capacitor banks are switched in STAGES as load rises, not all at once.
 *
 * The reason is that reactive demand swings enormously between night and day,
 * and a bank sized for the evening peak would push the voltage above equipment
 * ratings at four in the morning. So part of the capacitance is bolted on
 * permanently and the rest is put on breakers that close as demand climbs.
 *
 * These are the fractions of each bus's total capacitance in each stage, and
 * the system loading at which each stage closes.
 */
const CAPACITOR_STAGES: { fraction: number; threshold: number | undefined; label: string }[] = [
  { fraction: 0.4, threshold: undefined, label: 'fixed' },
  { fraction: 0.3, threshold: 0.62, label: 'stage 1' },
  { fraction: 0.3, threshold: 0.80, label: 'stage 2' },
];

/** Split a bank of `mvar` at `busId` into its switching stages. */
function stagedCapacitors(
  idPrefix: string,
  busId: string,
  busName: string,
  mvar: number,
  note: string
): ShuntDevice[] {
  const out: ShuntDevice[] = [];
  CAPACITOR_STAGES.forEach((stage, k) => {
    const size = Math.round((mvar * stage.fraction) / CAPACITOR_STEP_MVAR) * CAPACITOR_STEP_MVAR;
    if (size < CAPACITOR_STEP_MVAR) return;
    out.push({
      id: `${idPrefix}_S${k}`,
      name: `${busName} ${size} MVAr capacitor bank (${stage.label})`,
      bus: busId,
      qMVAr: size,
      inService: true,
      kind: 'capacitor',
      ...(stage.threshold !== undefined ? { switchThreshold: stage.threshold } : {}),
      note,
    });
  });
  return out;
}

/**
 * Additional capacitor banks placed for reasons other than the local load —
 * mostly holding up the voltage at the far end of a long, weakly supplied
 * corridor.
 */
export const SHUNT_BANKS: { site: string; kV: number; mvar: number; inService: boolean; note: string }[] = [
  { site: 'roundmtn', kV: 230, mvar: 250, inService: true,
    note: 'Round Mountain sits at the end of a long import corridor with no generation of its own, so its voltage has to be held up locally.' },
  { site: 'tablemtn', kV: 230, mvar: 150, inService: true,
    note: 'Northern corridor reactive support.' },
  { site: 'losbanos', kV: 500, mvar: 300, inService: true,
    note: 'The northern end of Path 15. A heavily loaded corridor consumes reactive power in proportion to the square of the current through it, so the ends of it need support.' },
  { site: 'gates', kV: 500, mvar: 300, inService: true,
    note: 'The southern end of Path 15.' },
  { site: 'vincent', kV: 500, mvar: 400, inService: true,
    note: 'The doorway into the Los Angeles basin, and the southern end of Path 26.' },
  { site: 'miguel', kV: 500, mvar: 300, inService: true,
    note: 'San Diego is at the end of the system, which is the hardest place to hold voltage.' },
  { site: 'sanonofre', kV: 500, mvar: 200, inService: true,
    note: 'The hinge between Los Angeles and San Diego.' },
  // The banks below were sized the way reactive support is sized in practice:
  // by running the power flow across the day, finding the buses where the
  // generators were being asked for more reactive power than they can produce,
  // and installing enough capacitance at each to close the gap. The study that
  // produced them is reproduced by test/california.test.ts, which fails if any
  // bus is driven beyond its reactive capability.
  { site: 'tablemtn', kV: 230, mvar: 800, inService: true,
    note: 'Holding up the northern corridor. The hydro here runs at a fraction of its rating for most of the day, so it cannot supply the reactive power the corridor needs on its own.' },
  { site: 'sanmateo', kV: 230, mvar: 350, inService: true,
    note: 'Peninsula reactive support. There is no generation on this part of the system at all, so every megavar it uses has to be made here or carried in.' },
  { site: 'newark', kV: 230, mvar: 550, inService: true,
    note: 'East bay industrial load, which is motor-heavy and a long way from generation.' },
  { site: 'martin', kV: 230, mvar: 500, inService: true,
    note: 'San Francisco has almost no generation inside it, so its reactive power has to come from capacitors.' },
  { site: 'oakland', kV: 230, mvar: 450, inService: true, note: 'East bay reactive support.' },
  { site: 'escondido', kV: 230, mvar: 350, inService: true,
    note: 'North San Diego County, near the end of a long chain of circuits.' },
  { site: 'miraloma', kV: 230, mvar: 325, inService: true, note: 'Inland Empire reactive support.' },
  { site: 'valley', kV: 230, mvar: 275, inService: true, note: 'Riverside reactive support.' },
  { site: 'serrano', kV: 230, mvar: 200, inService: true, note: 'Orange County reactive support.' },
  { site: 'sacramento', kV: 230, mvar: 175, inService: true, note: 'Capital region reactive support.' },
  { site: 'midway', kV: 230, mvar: 150, inService: true, note: 'Southern valley reactive support.' },
  { site: 'rinaldi', kV: 230, mvar: 100, inService: true, note: 'San Fernando Valley reactive support.' },
  { site: 'sandiego', kV: 230, mvar: 300, inService: true,
    note: 'The city is the furthest point on the system from any large generator.' },
  { site: 'fresno', kV: 230, mvar: 200, inService: true, note: 'Valley reactive support.' },
  { site: 'kern', kV: 230, mvar: 250, inService: true,
    note: 'Oilfield and irrigation motors have a poor power factor, so this bus needs proportionally more.' },
  { site: 'edenvale', kV: 12.47, mvar: 3.6, inService: true,
    note: 'A switched capacitor bank on the substation low-voltage bus, in three 1.2 MVAr steps.' },
];

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function buildGenerators(): Generator[] {
  return GENERATION.map((g, i) => ({
    id: `G_${g.site.toUpperCase()}_${g.kind.toUpperCase().replace(/[^A-Z]/g, '')}_${i}`,
    name: g.name,
    bus: makeBusId(g.site, g.kV),
    kind: g.kind,
    // Real output is set by the dispatch module; this is the starting schedule.
    pMW: 0,
    qMVAr: 0,
    pMaxMW: g.capacityMW,
    pMinMW: g.pMinMW,
    qMaxMVAr: g.capacityMW * g.qRange[1],
    qMinMVAr: g.capacityMW * g.qRange[0],
    // A machine's own base is its nameplate; a 0.90 power-factor rating is
    // the long-standing convention for synchronous generators.
    mBaseMVA: g.capacityMW / 0.9,
    inService: true,
    marginalCost: g.marginalCost,
    ...(g.inertiaH !== undefined ? { inertiaH: g.inertiaH } : {}),
    ...(g.rampMWPerMin !== undefined ? { rampMWPerMin: g.rampMWPerMin } : {}),
    ...(g.heatRateBtuPerKWh !== undefined ? { heatRateBtuPerKWh: g.heatRateBtuPerKWh } : {}),
    ...(g.xd !== undefined ? { xd: g.xd } : {}),
    ...(g.xdpp !== undefined ? { xdpp: g.xdpp } : {}),
  }));
}

/** Q from P and power factor: Q = P · tan(arccos(pf)). */
export const reactiveFromPF = (pMW: number, pf: number): number =>
  pMW * Math.tan(Math.acos(pf));

function buildLoads(): Load[] {
  const all = [...LOADS, EDENVALE_OTHER_FEEDERS];
  return all.map((l, i) => ({
    id: `LD_${l.site.toUpperCase()}_${i}`,
    name: `${l.site} load`,
    bus: makeBusId(l.site, l.kV),
    pMW: l.peakMW,
    qMVAr: reactiveFromPF(l.peakMW, l.powerFactor),
    loadClass: l.loadClass,
  }));
}

/**
 * Fraction of connected line charging that shunt reactors absorb at EHV buses.
 *
 * A long extra-high-voltage line is an enormous capacitor: its conductors and
 * the ground form a capacitance that, at 500 kV, produces over a megavar per
 * kilometre whether anyone wants it or not. Across the 500 kV system in this
 * model that comes to some 6,400 MVAr — more reactive power than the entire
 * state's load consumes. Left uncompensated it drives voltages above the
 * equipment's rating, worst of all at light load when there is no load current
 * to consume it. This is the Ferranti effect at system scale.
 *
 * The remedy, used on every EHV system in the world, is shunt reactors: coils
 * that absorb reactive power. Utilities compensate roughly 60–80 % of the
 * charging of a long line; 70 % is used here.
 */
const EHV_REACTOR_COMPENSATION = 0.70;

/** Reactor banks are built in discrete sizes; 25 MVAr is a reasonable step. */
const REACTOR_STEP_MVAR = 25;

/** System loading above which EHV shunt reactors are switched OUT. */
const EHV_REACTOR_SWITCH_OUT = 0.62;

/**
 * Size a shunt reactor at every 500 kV bus from the charging of the circuits
 * that actually land there, rather than typing in a number. Each line gives
 * half its charging to each end, which is what the pi model says.
 */
function buildEhvReactors(branches: Branch[], buses: Bus[]): ShuntDevice[] {
  const byId = new Map(buses.map((b) => [b.id, b]));
  const chargingAtBus = new Map<string, number>();
  for (const br of branches) {
    if (br.kind !== 'line') continue;
    const fb = byId.get(br.from);
    if (!fb || fb.baseKV < 500) continue;
    const halfMVAr = (br.b * SYSTEM_BASE_MVA) / 2;
    chargingAtBus.set(br.from, (chargingAtBus.get(br.from) ?? 0) + halfMVAr);
    chargingAtBus.set(br.to, (chargingAtBus.get(br.to) ?? 0) + halfMVAr);
  }

  const out: ShuntDevice[] = [];
  for (const [busId, charging] of chargingAtBus) {
    const target = charging * EHV_REACTOR_COMPENSATION;
    const mvar = Math.round(target / REACTOR_STEP_MVAR) * REACTOR_STEP_MVAR;
    if (mvar < REACTOR_STEP_MVAR) continue;
    out.push({
      id: `R_${busId}`,
      name: `${byId.get(busId)!.name} ${mvar} MVAr shunt reactor`,
      bus: busId,
      // Negative reactive output: a reactor absorbs what a capacitor supplies.
      qMVAr: -mvar,
      inService: true,
      kind: 'reactor',
      switchThreshold: EHV_REACTOR_SWITCH_OUT,
      note:
        `Absorbs ${Math.round(EHV_REACTOR_COMPENSATION * 100)} % of the ` +
        `${charging.toFixed(0)} MVAr of charging that the 500 kV lines landing ` +
        `here produce whether anyone wants it or not. Switched out at heavy ` +
        `load, when the system needs that reactive power rather than not.`,
    });
  }
  return out;
}

/**
 * Size a capacitor bank at every load bus from that bus's own peak reactive
 * demand, rather than typing in a number. A bus with a poor power factor —
 * agricultural pumping, oilfield motors — gets proportionally more, which is
 * exactly the right answer and falls straight out of the arithmetic.
 */
function buildLoadCapacitors(loads: Load[], buses: Bus[]): ShuntDevice[] {
  const byId = new Map(buses.map((b) => [b.id, b]));
  const qByBus = new Map<string, number>();
  for (const l of loads) qByBus.set(l.bus, (qByBus.get(l.bus) ?? 0) + l.qMVAr);

  const out: ShuntDevice[] = [];
  for (const [busId, qLoad] of qByBus) {
    const bus = byId.get(busId);
    if (!bus || bus.baseKV < 100) continue; // distribution is handled separately
    const target = qLoad * LOCAL_REACTIVE_COMPENSATION;
    const mvar = Math.round(target / CAPACITOR_STEP_MVAR) * CAPACITOR_STEP_MVAR;
    if (mvar < CAPACITOR_STEP_MVAR) continue;
    out.push(...stagedCapacitors(
      `C_LOAD_${busId}`, busId, bus.name, mvar,
      `Sized at ${Math.round(LOCAL_REACTIVE_COMPENSATION * 100)} % of this bus's ` +
      `peak reactive demand of ${qLoad.toFixed(0)} MVAr, so that reactive power ` +
      `is made here rather than carried here.`
    ));
  }
  return out;
}

function buildShunts(branches: Branch[], buses: Bus[], loads: Load[]): ShuntDevice[] {
  const byId = new Map(buses.map((b) => [b.id, b]));
  const named: ShuntDevice[] = SHUNT_BANKS.flatMap((s, i) => {
    const busId = makeBusId(s.site, s.kV);
    const bus = byId.get(busId);
    if (!bus) throw new Error(`shunt bank ${i} at ${s.site}: no ${s.kV} kV bus there`);
    return stagedCapacitors(`C_${s.site.toUpperCase()}_${i}`, busId, bus.name, s.mvar, s.note);
  });
  return [
    ...named,
    ...buildLoadCapacitors(loads, buses),
    ...buildEhvReactors(branches, buses),
  ];
}

/**
 * Which bus is the slack, and why.
 *
 * The slack is the Pacific Northwest intertie at Malin. That is the physically
 * honest choice: California is not an island, and when demand inside the state
 * does not exactly match what its own generators are producing, the rest of the
 * Western Interconnection makes up the difference through exactly these wires.
 * The alternative — declaring some in-state plant to be the slack — would be a
 * modelling convenience that teaches a beginner something false about how the
 * system holds together.
 */
export const SLACK_BUS = makeBusId('malin', 500);

/** Buses whose voltage a generator holds — the PV buses. */
function assignBusTypes(buses: Bus[], generators: Generator[]): void {
  const genBuses = new Set(generators.filter((g) => g.inService).map((g) => g.bus));
  for (const b of buses) {
    if (b.id === SLACK_BUS) {
      b.type = 'slack';
      b.vSched = V_SCHED.slack;
      b.thetaSched = 0;
    } else if (genBuses.has(b.id)) {
      b.type = 'PV';
      b.vSched = b.baseKV >= 500 ? V_SCHED.ehvGen : V_SCHED.hvGen;
    } else {
      b.type = 'PQ';
    }
  }
}

/** The base California case, at system peak, before any dispatch is applied. */
export function californiaCase(): NetworkCase {
  const buses = buildBuses();
  const generators = buildGenerators();
  const branches = buildBranches();
  const loads = buildLoads();
  assignBusTypes(buses, generators);
  return {
    id: 'california',
    name: 'California (synthetic)',
    baseMVA: SYSTEM_BASE_MVA,
    buses,
    branches,
    generators,
    loads,
    shunts: buildShunts(branches, buses, loads),
    source:
      'Synthetic. Structure, place names and geography follow the real California ' +
      'grid; circuit counts, impedances, ratings and dispatch are plausible values ' +
      'for equipment of that class. See docs/model.md. Not a replica of any ' +
      'utility system.',
  };
}
