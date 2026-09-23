import type { PlantRecord } from '../data/ca/plants';

/**
 * A combined-cycle plant's energy, from the fuel burned to the megawatts delivered.
 *
 * Gas turbines (Brayton cycle) burn the fuel and turn part of its heat into shaft
 * work; their hot exhaust passes through a heat-recovery steam generator (HRSG), which
 * boils water for a steam turbine (Rankine cycle); the steam turbine's exhaust is
 * condensed and its heat carried away by cooling water. Every megawatt of fuel ends
 * up in exactly one place:
 *
 *   fuel (HHV) = electricity delivered to the grid
 *              + step-up transformer losses          (from the power flow)
 *              + generator losses                     (1 − η_gen of shaft power)
 *              + heat up the stack                    (exhaust not recovered, sensible)
 *              + latent heat of the water in the exhaust (HHV − LHV)
 *              + heat to the condenser                (steam heat not turned to work)
 *
 * Parameters: the plant's full-load net heat rate (data file) fixes the overall
 * efficiency; the design split between gas and steam turbines (unit shares) fixes how
 * much of it each cycle does. HRSG effectiveness, generator efficiency, the gas
 * turbines' part-load fuel curve and HHV/LHV are canonical for the class (estimates).
 * Station service (auxiliary load, ~2 % of output) is not modelled.
 */
export const CCGT = {
  /** Higher over lower heating value of pipeline natural gas. */
  hhvOverLhv: 1.108,
  /** Generator efficiency (shaft to terminals). */
  etaGen: 0.985,
  /** Share of the gas turbines' exhaust heat the HRSG passes to the steam. */
  etaHrsg: 0.8,
  /** Gas-turbine fuel at no load, as a fraction of full-load fuel (straight-line input–output curve). */
  noLoadFuel: 0.3,
  /** Btu per kWh in one kWh (the heat-rate unit's conversion). */
  btuPerKWh: 3412.14,
} as const;

export interface CcgtDesign {
  /** Net output at full load, MW; net heat rate there, Btu/kWh (HHV). */
  ratedMW: number;
  heatRate: number;
  /** Gas turbines' rated electrical output each, MW, and how many. */
  gtMW: number;
  nGT: number;
  /** Steam turbine's rated electrical output, MW. */
  stMW: number;
  /** Full-load fuel per gas turbine, MW thermal (LHV). */
  gtFuelLhv: number;
  /** Steam-cycle (Rankine) efficiency: steam turbine shaft work over the heat in the steam. */
  etaRankine: number;
}

/** The design point, calibrated so full load reproduces the plant's heat rate and split. */
export function ccgtDesign(p: PlantRecord): CcgtDesign {
  const units = p.units ?? [];
  const gts = units.filter((u) => u.id.startsWith('GT'));
  const st = units.find((u) => u.id === 'ST');
  if (!gts.length || !st || !p.heatRate) throw new Error(`${p.id} is not a unit-by-unit combined cycle`);
  const gtMW = p.mw * gts[0]!.share;
  const stMW = p.mw * st.share;
  const fuelHhv = (p.mw * p.heatRate) / CCGT.btuPerKWh; // MW thermal
  const fuelLhv = fuelHhv / CCGT.hhvOverLhv;
  const gtFuelLhv = fuelLhv / gts.length;
  const gtShaft = gtMW / CCGT.etaGen;
  const exhaust = gtFuelLhv - gtShaft;
  const steamHeat = CCGT.etaHrsg * exhaust * gts.length;
  const etaRankine = stMW / CCGT.etaGen / steamHeat;
  return { ratedMW: p.mw, heatRate: p.heatRate, gtMW, nGT: gts.length, stMW, gtFuelLhv, etaRankine };
}

/** Fuel a gas turbine burns for an electrical output, MW thermal (LHV). */
export function gtFuel(d: CcgtDesign, mw: number): number {
  if (mw <= 0) return 0;
  return d.gtFuelLhv * (CCGT.noLoadFuel + (1 - CCGT.noLoadFuel) * (mw / d.gtMW));
}

/**
 * How a plant output divides between the gas turbines (equally loaded) and the steam
 * turbine, which makes what the exhaust heat allows. P_ST is affine in the gas-turbine
 * load, so the split is closed form.
 */
export function ccgtSplit(d: CcgtDesign, plantMW: number): { gt: number; st: number } {
  if (plantMW <= 0) return { gt: 0, st: 0 };
  // P_ST(x) = η_gen η_R η_HRSG n (F(x) − x P_GT/η_gen),  F(x) = F_r (a + (1 − a) x / P_GT)
  const k = CCGT.etaGen * d.etaRankine * CCGT.etaHrsg * d.nGT;
  const a = CCGT.noLoadFuel;
  const c0 = k * d.gtFuelLhv * a;
  const c1 = k * (d.gtFuelLhv * (1 - a) / d.gtMW - 1 / CCGT.etaGen);
  // plant = n x + c0 + c1 x
  const x = (plantMW - c0) / (d.nGT + c1);
  return { gt: x, st: c0 + c1 * x };
}

export interface CcgtBalance {
  /** Fuel burned, MW thermal, on both heating values. */
  fuelHhv: number;
  fuelLhv: number;
  /** Per gas turbine: electrical output, fuel (LHV), shaft work, exhaust heat. */
  gt: Array<{ mw: number; fuelLhv: number; shaft: number; exhaust: number }>;
  /** Steam: heat taken up in the HRSGs; steam turbine electrical output and shaft work. */
  steamHeat: number;
  stMW: number;
  stShaft: number;
  /** Where the rest goes, MW thermal. */
  stack: number;
  latent: number;
  condenser: number;
  generatorLoss: number;
  gsuLoss: number;
  /** Delivered to the grid at the high-voltage side, MW (from the power flow). */
  netMW: number;
  /** Gross at the generator terminals, MW. */
  grossMW: number;
  /** Net heat rate at this output, Btu/kWh (HHV). */
  heatRate: number;
  /** Steam-cycle efficiency implied by what the steam turbine is making now. */
  etaRankineNow: number;
  /** fuel − everything accounted for (≈ 0). */
  residual: number;
}

/**
 * The balance at an operating point: each unit's electrical output and what reaches
 * the grid come from the power flow; fuel and heat flows from the plant model.
 */
export function ccgtBalance(d: CcgtDesign, gtMW: number[], stMW: number, netMW: number): CcgtBalance {
  const gt = gtMW.map((mw) => {
    const fuelLhv = gtFuel(d, mw);
    const shaft = mw / CCGT.etaGen;
    return { mw, fuelLhv, shaft, exhaust: fuelLhv - shaft };
  });
  const fuelLhv = gt.reduce((a, g) => a + g.fuelLhv, 0);
  const fuelHhv = fuelLhv * CCGT.hhvOverLhv;
  const exhaust = gt.reduce((a, g) => a + g.exhaust, 0);
  const steamHeat = CCGT.etaHrsg * exhaust;
  const stack = exhaust - steamHeat;
  const stShaft = stMW / CCGT.etaGen;
  const condenser = steamHeat - stShaft;
  const grossMW = gtMW.reduce((a, b) => a + b, 0) + stMW;
  const generatorLoss = gt.reduce((a, g) => a + g.shaft, 0) + stShaft - grossMW;
  const gsuLoss = grossMW - netMW;
  const latent = fuelHhv - fuelLhv;
  const residual = fuelHhv - (netMW + gsuLoss + generatorLoss + stack + latent + condenser);
  return {
    fuelHhv,
    fuelLhv,
    gt,
    steamHeat,
    stMW,
    stShaft,
    stack,
    latent,
    condenser,
    generatorLoss,
    gsuLoss,
    netMW,
    grossMW,
    heatRate: netMW > 0 ? (fuelHhv / netMW) * CCGT.btuPerKWh : Infinity,
    etaRankineNow: steamHeat > 0 ? stShaft / steamHeat : 0,
    residual,
  };
}

/** A plant modelled unit by unit, at a solved interval: its units, its GSUs and its energy. */
export interface PlantState {
  design: CcgtDesign;
  /** Generator index per unit id; GSU branch index per unit id. */
  gens: Record<string, number>;
  gsus: Record<string, number>;
  gtMW: number[];
  stMW: number;
  netMW: number;
  running: boolean;
  tripped: boolean;
  balance: CcgtBalance | null;
}

export function plantState(
  grid: { gens: Array<{ index: number; plant: PlantRecord; unitId?: string }>; branches: Array<{ id: string; index: number }> },
  s: { outcome: string; genOnline: Uint8Array; pg: Float64Array; pf: Float64Array; inService: Uint8Array; plantOutages: string[] },
  plantId: string,
): PlantState {
  const gens: Record<string, number> = {};
  const gsus: Record<string, number> = {};
  let rec: PlantRecord | null = null;
  for (const g of grid.gens)
    if (g.plant.id === plantId && g.unitId) {
      gens[g.unitId] = g.index;
      rec = g.plant;
    }
  for (const b of grid.branches) if (b.id.startsWith(`${plantId}-`)) gsus[b.id.slice(plantId.length + 1, b.id.indexOf(' '))] = b.index;
  const design = ccgtDesign(rec!);
  const none = s.outcome === 'none';
  const pg = (u: string) => (!none && s.genOnline[gens[u]!] ? s.pg[gens[u]!]! : 0);
  const gtMW = Object.keys(gens)
    .filter((u) => u !== 'ST')
    .map(pg);
  const stMW = pg('ST');
  let netMW = 0;
  for (const k of Object.values(gsus)) netMW -= !none && s.inService[k] ? s.pf[k]! : 0;
  const running = gtMW.some((v) => v > 1e-6);
  return {
    design,
    gens,
    gsus,
    gtMW,
    stMW,
    netMW,
    running,
    tripped: s.plantOutages.includes(plantId),
    balance: running ? ccgtBalance(design, gtMW, stMW, netMW) : null,
  };
}
