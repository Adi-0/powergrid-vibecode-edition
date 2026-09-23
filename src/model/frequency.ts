import type { Grid, GridGen } from './grid';
import type { Snapshot } from './snapshot';
import { simulateTrip, type GovKind, type SfrParams, type SfrResult, type SfrUnit } from '../physics/dyn/sfr';

/**
 * The frequency response of the interconnection to losing a plant, from a solved
 * interval: who was running and at what output, their inertia and governors, and the
 * rest of the western interconnection behind the AC ties (each tie's equivalent carries
 * that system's governor capacity, `externalMW`, and inertia on the same base).
 */
export const SFR_PARAMS = {
  f0: 60,
  /** Load damping, %/% (Kundur: typically 1–2; estimate). */
  D: 1,
  /** Integration step and run, s. */
  h: 0.01,
  tEnd: 60,
  sample: 0.05,
} as const;

export const GROUPS: Record<string, string> = {
  gas: 'Gas plants',
  hydro: 'Hydro',
  battery: 'Batteries',
  west: 'The rest of the West, over the AC ties',
  other: 'Other',
};

function kindOf(g: GridGen, P0: number): GovKind {
  if (!g.governor) return 'none';
  switch (g.tech.id) {
    case 'gas_ccgt':
      return g.plant.units ? 'gas' : 'ccgt'; // unit by unit: the gas turbine responds; its steam turbine has no governor
    case 'gas_ct':
    case 'gas_cogen':
    case 'gas_recip':
      return 'gas';
    case 'hydro':
      return 'hydro';
    case 'pumped_storage':
      return P0 > 0 ? 'hydro' : 'none'; // pumping: no governor response
    case 'battery':
      return 'battery';
    case 'import_ac':
      return 'steam'; // the West's governor response is mostly steam and hydro; modelled as reheat steam
    default:
      return 'none';
  }
}

function groupOf(g: GridGen): string {
  const t = g.tech.id;
  if (t.startsWith('gas')) return 'gas';
  if (t === 'hydro' || t === 'pumped_storage') return 'hydro';
  if (t === 'battery') return 'battery';
  if (t === 'import_ac') return 'west';
  return 'other';
}

export interface TripResponse extends SfrResult {
  plantId: string;
  lossMW: number;
  /** Units online before the trip, and the load damping's base. */
  units: SfrUnit[];
  loadMW: number;
  params: SfrParams;
  /** Inertia before and after the trip, MW·s. */
  kineticBeforeMWs: number;
}

/** Build the interconnection's machines from a solved (pre-trip) interval. */
export function sfrUnits(grid: Grid, s: Snapshot, exclude?: string): { units: SfrUnit[]; kineticBefore: number } {
  const units: SfrUnit[] = [];
  let kineticBefore = 0;
  for (const g of grid.gens) {
    if (!s.genOnline[g.index] || !s.energized[g.bus.index]) continue;
    const P0 = s.pg[g.index]!;
    const ext = g.plant.externalMW;
    const S = ext ?? g.pmaxMW;
    const H = g.tech.synchronous || ext ? g.tech.H_s : 0;
    kineticBefore += H * S;
    if (g.plant.id === exclude) continue;
    const kind = kindOf(g, P0);
    units.push({
      id: g.id,
      group: groupOf(g),
      H,
      S,
      P0,
      Pmax: g.pmaxMW, // as the power flow limits it (a tie: its rating)
      Pmin: g.pminMW,
      R: kind === 'none' ? null : g.tech.droop,
      gov: kind,
    });
  }
  return { units, kineticBefore };
}

export function tripResponse(grid: Grid, s: Snapshot, plantId: string): TripResponse {
  const lossMW = grid.gens.reduce((a, g) => a + (g.plant.id === plantId && s.genOnline[g.index] ? s.pg[g.index]! : 0), 0);
  const { units, kineticBefore } = sfrUnits(grid, s, plantId);
  // load damping applies to all load in the interconnection: California's, and the
  // rest of the West's (taken as its governor-equivalent capacity)
  const ext = grid.gens.reduce((a, g) => a + (g.plant.externalMW && s.genOnline[g.index] ? g.plant.externalMW : 0), 0);
  let pd = 0;
  s.pd.forEach((v, i) => (pd += s.energized[i] ? Math.max(0, v) : 0));
  const loadMW = pd + ext;
  const params: SfrParams = { ...SFR_PARAMS, PL: loadMW };
  const r = simulateTrip(units, lossMW, params);
  return { ...r, plantId, lossMW, units, loadMW, params, kineticBeforeMWs: kineticBefore };
}
