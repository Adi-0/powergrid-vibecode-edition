/**
 * Power-system network model.
 *
 * Everything in this file is in PER-UNIT on a stated system base, except where
 * a field name ends in a physical unit (`MW`, `MVAr`, `kV`, `km`). Per-unit is
 * explained in docs/model.md and in the app's glossary; the short version is
 * that every quantity is divided by a chosen base value of the same kind, so
 * that transformers disappear from the arithmetic and every voltage sits near
 * 1.0 regardless of its class.
 */

/**
 * Bus type, in the standard power-flow sense.
 *  - `slack`  : voltage magnitude AND angle fixed; P and Q are whatever the
 *               network needs. Physically: the machine that absorbs the
 *               imbalance and sets the angle reference. Exactly one per island.
 *  - `PV`     : P and |V| fixed, Q solved. Physically: a generator holding a
 *               voltage setpoint with its excitation.
 *  - `PQ`     : P and Q fixed, |V| and θ solved. Physically: a load, or a bus
 *               with nothing controlling it.
 */
export type BusType = 'slack' | 'PV' | 'PQ';

export interface Bus {
  id: string;
  name: string;
  type: BusType;
  /** Nominal voltage of this bus, kV line-to-line RMS. An ANSI C84.1 class. */
  baseKV: number;
  /** Scheduled voltage magnitude in per-unit — used for slack and PV buses. */
  vSched?: number;
  /** Scheduled angle in radians — used only for the slack bus (normally 0). */
  thetaSched?: number;
  /** Shunt conductance at this bus, per-unit on system base (G in Y = G + jB). */
  gShunt?: number;
  /** Shunt susceptance at this bus, per-unit on system base. Positive = capacitive. */
  bShunt?: number;
  /** Operating voltage limits, per-unit. ANSI C84.1 Range A is 0.95–1.05 for service. */
  vMin?: number;
  vMax?: number;
  /** Free-form grouping used by the atlas, e.g. a region id. */
  area?: string;
}

export type BranchKind = 'line' | 'transformer' | 'cable';

export interface Branch {
  id: string;
  name: string;
  from: string;
  to: string;
  /** Series resistance R, per-unit. Produces real (I²R) loss and heat. */
  r: number;
  /** Series reactance X, per-unit. Stores energy in the magnetic field; no loss. */
  x: number;
  /** TOTAL line charging susceptance B of the pi model, per-unit. Split half at each end. */
  b: number;
  /** Normal thermal rating, MVA. The current the conductor can carry continuously. */
  ratingMVA: number;
  /** Emergency rating, MVA. Short-duration overload the equipment tolerates. */
  ratingEmergencyMVA?: number;
  kind: BranchKind;
  /** Off-nominal turns ratio, applied at the `from` end. 1.0 for a plain line. */
  tap?: number;
  /** Phase shift in degrees, applied at the `from` end. 0 for almost everything. */
  shiftDeg?: number;
  /** In service? A tripped or open branch is `false` and drops out of the Ybus. */
  inService: boolean;
  lengthKm?: number;
  /** Conductor or cable type id, for the physical/teaching layer. */
  conductor?: string;
  /** Transformer vector group, e.g. "YNd1" — only meaningful for transformers. */
  vectorGroup?: string;
}

export type GenKind =
  | 'gas-cc'
  | 'gas-ct'
  | 'solar-pv'
  | 'wind'
  | 'hydro'
  | 'geothermal'
  | 'battery'
  | 'nuclear'
  | 'import';

export interface Generator {
  id: string;
  name: string;
  bus: string;
  kind: GenKind;
  /** Scheduled real power output, MW. For PV and slack buses this is the setpoint. */
  pMW: number;
  /** Reactive output, MVAr. A solved quantity for PV/slack; a setpoint for PQ gens. */
  qMVAr: number;
  pMaxMW: number;
  pMinMW: number;
  qMaxMVAr: number;
  qMinMVAr: number;
  /** Machine base, MVA — the nameplate the machine's own per-unit values refer to. */
  mBaseMVA: number;
  inService: boolean;
  /** Marginal cost, $/MWh — drives merit-order dispatch. */
  marginalCost?: number;
  /** Inertia constant H, MW·s/MVA. Stored kinetic energy per MVA of rating. */
  inertiaH?: number;
  /** Maximum ramp rate, MW/min. */
  rampMWPerMin?: number;
  /** Synchronous reactance Xd, per-unit on machine base. */
  xd?: number;
  /** Subtransient reactance Xd'', per-unit on machine base — sets fault contribution. */
  xdpp?: number;
  /** Heat rate, BTU/kWh — only for thermal units. */
  heatRateBtuPerKWh?: number;
  /**
   * Committed whatever the merit order says.
   *
   * A real dispatch is SECURITY-constrained, not purely economic: a plant
   * inside a load pocket with little transmission into it is kept running for
   * local voltage support and reliability even when cheaper generation is
   * available elsewhere, because the cheaper generation cannot physically get
   * there. In California these are contracted as RELIABILITY MUST-RUN units,
   * and this flag is that contract.
   *
   * Without it a purely economic stack switches off the only large plant inside
   * the Bay Area on a summer evening — which no operator would ever do, and
   * which is exactly the kind of thing a merit-order model gets wrong.
   */
  mustRun?: boolean;
}

export interface Load {
  id: string;
  name: string;
  bus: string;
  pMW: number;
  qMVAr: number;
  /** ZIP-ish exponent pair for voltage dependence. 0 = constant power (default). */
  pExp?: number;
  qExp?: number;
  /** Free-form class used by the atlas: 'residential' | 'commercial' | ... */
  loadClass?: string;
}

export interface ShuntDevice {
  id: string;
  name: string;
  bus: string;
  /** Rated reactive output at 1.0 pu voltage, MVAr. Positive = capacitor. */
  qMVAr: number;
  /** Switched in? Capacitor banks are switched; this is the control handle. */
  inService: boolean;
  kind: 'capacitor' | 'reactor';
  /**
   * System loading, as a fraction of peak, at or above which this bank is
   * switched in (capacitor) or out (reactor). Undefined means the bank is
   * fixed: permanently connected, with no switch on it at all.
   */
  switchThreshold?: number;
  /** One line explaining why this device is here, for the UI. */
  note?: string;
}

export interface NetworkCase {
  id: string;
  name: string;
  /** System power base, MVA. Every per-unit power in this case refers to it. */
  baseMVA: number;
  buses: Bus[];
  branches: Branch[];
  generators: Generator[];
  loads: Load[];
  shunts?: ShuntDevice[];
  /** Provenance: where this data came from. Required — see docs/model.md. */
  source: string;
}

// ---------------------------------------------------------------------------
// Indexing helpers
// ---------------------------------------------------------------------------

export interface CaseIndex {
  order: string[];
  indexOf: Map<string, number>;
  bus: Map<string, Bus>;
  slackIndex: number;
}

export function indexCase(net: NetworkCase): CaseIndex {
  const order = net.buses.map((b) => b.id);
  const indexOf = new Map<string, number>();
  order.forEach((id, i) => indexOf.set(id, i));
  const bus = new Map<string, Bus>();
  for (const b of net.buses) bus.set(b.id, b);
  const slackIndex = net.buses.findIndex((b) => b.type === 'slack');
  if (slackIndex < 0) throw new Error(`case ${net.id}: no slack bus defined`);
  return { order, indexOf, bus, slackIndex };
}

/** Deep-ish clone so perturbations never mutate the authored data files. */
export function cloneCase(net: NetworkCase): NetworkCase {
  return {
    ...net,
    buses: net.buses.map((b) => ({ ...b })),
    branches: net.branches.map((b) => ({ ...b })),
    generators: net.generators.map((g) => ({ ...g })),
    loads: net.loads.map((l) => ({ ...l })),
    shunts: net.shunts?.map((s) => ({ ...s })),
  };
}

/** Total connected load, MW and MVAr. Used for the balance check and for display. */
export function totalLoad(net: NetworkCase): { pMW: number; qMVAr: number } {
  let pMW = 0;
  let qMVAr = 0;
  for (const l of net.loads) {
    pMW += l.pMW;
    qMVAr += l.qMVAr;
  }
  return { pMW, qMVAr };
}

export function totalGeneration(net: NetworkCase): { pMW: number; qMVAr: number } {
  let pMW = 0;
  let qMVAr = 0;
  for (const g of net.generators) {
    if (!g.inService) continue;
    pMW += g.pMW;
    qMVAr += g.qMVAr;
  }
  return { pMW, qMVAr };
}
