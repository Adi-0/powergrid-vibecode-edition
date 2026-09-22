/**
 * The positive-sequence network as the power-flow solver sees it: everything in
 * per unit on a single system MVA base (S_base), in MATPOWER's conventions, so the
 * IEEE cases and our synthetic network go through the same code.
 *
 * Per-unit: every quantity divided by its base. S_base is one number for the whole
 * system (100 MVA here); each bus has a voltage base (its nominal line-to-line kV);
 * impedance and current bases follow: Z_base = V_base² / S_base,
 * I_base = S_base / (√3 · V_base).
 */

export type BusType = 'PQ' | 'PV' | 'REF';

export interface PFBus {
  /** PQ: load bus (P and Q known). PV: generator bus (P and |V| known). REF: angle reference. */
  type: BusType;
  /** Demand, per unit (3φ MW / S_base, 3φ MVAr / S_base). Load-reference convention. */
  pd: number;
  qd: number;
  /** Shunt conductance and susceptance at 1.0 pu voltage, per unit. Bs > 0 is a capacitor. */
  gs: number;
  bs: number;
  /** Nominal line-to-line voltage, kV (the bus's voltage base). */
  baseKV: number;
  vmax: number;
  vmin: number;
}

export interface PFBranch {
  from: number;
  to: number;
  /** Series resistance and reactance, per unit on S_base and the branch's voltage base. */
  r: number;
  x: number;
  /** Total line-charging susceptance (both ends together), per unit. */
  b: number;
  /** Off-nominal turns ratio at the from end (1 for a line). */
  tap: number;
  /** Phase shift, radians (from-side voltage leads). */
  shift: number;
  inService: boolean;
  /** Continuous rating, MVA (0 = unlimited). */
  rateMVA: number;
}

export interface PFGen {
  bus: number;
  /** Scheduled real output, per unit. Generator-reference convention (output positive). */
  pg: number;
  qg: number;
  qmax: number;
  qmin: number;
  /** Voltage set-point, per unit, for the bus this unit regulates. */
  vg: number;
  pmax: number;
  pmin: number;
  inService: boolean;
  /**
   * Share of any power imbalance this unit picks up (distributed slack), before
   * normalisation. Proportional to governor gain (rating / droop); 0 for units
   * without governor response (nuclear, solar, wind as operated here).
   */
  participation: number;
  /** Does this unit regulate voltage? Inverter plants here run at fixed power factor. */
  regulates: boolean;
}

export interface PFCase {
  baseMVA: number;
  buses: PFBus[];
  branches: PFBranch[];
  gens: PFGen[];
}

export function cloneCase(c: PFCase): PFCase {
  return {
    baseMVA: c.baseMVA,
    buses: c.buses.map((b) => ({ ...b })),
    branches: c.branches.map((b) => ({ ...b })),
    gens: c.gens.map((g) => ({ ...g })),
  };
}

/**
 * Build a PFCase from MATPOWER-format arrays (as in the IEEE fixtures). MATPOWER
 * stores power in MW/MVAr and shift in degrees; the solver works in per unit and
 * radians.
 */
export function fromMatpower(m: {
  baseMVA: number;
  bus: number[][];
  branch: number[][];
  gen: number[][];
}): PFCase {
  const S = m.baseMVA;
  const idx = new Map<number, number>();
  m.bus.forEach((b, i) => idx.set(b[0]!, i));
  const types: Record<number, BusType> = { 1: 'PQ', 2: 'PV', 3: 'REF' };
  const buses: PFBus[] = m.bus.map((b) => ({
    type: types[b[1]!] ?? 'PQ',
    pd: b[2]! / S,
    qd: b[3]! / S,
    gs: b[4]! / S,
    bs: b[5]! / S,
    baseKV: b[9]!,
    vmax: b[11]!,
    vmin: b[12]!,
  }));
  const branches: PFBranch[] = m.branch.map((r) => ({
    from: idx.get(r[0]!)!,
    to: idx.get(r[1]!)!,
    r: r[2]!,
    x: r[3]!,
    b: r[4]!,
    tap: r[8]! === 0 ? 1 : r[8]!,
    shift: (r[9]! * Math.PI) / 180,
    inService: r[10]! > 0,
    rateMVA: r[5]!,
  }));
  const gens: PFGen[] = m.gen.map((g) => ({
    bus: idx.get(g[0]!)!,
    pg: g[1]! / S,
    qg: g[2]! / S,
    qmax: g[3]! / S,
    qmin: g[4]! / S,
    vg: g[5]!,
    pmax: g[8]! / S,
    pmin: g[9]! / S,
    inService: g[7]! > 0,
    participation: 0,
    regulates: true,
  }));
  return { baseMVA: S, buses, branches, gens };
}
