/**
 * Builders that turn a declarative circuit description into network elements
 * with per-unit impedances computed from physical data.
 *
 * Nothing here types an impedance in directly. A line's impedance comes from
 * its conductor, its tower geometry and its route length; a transformer's comes
 * from its percentage impedance and X/R ratio on its own nameplate rating. That
 * is what makes every number in the app reproducible on paper.
 */

import { Branch, Bus, BusType } from '../../core/network.js';
import { lineParameters, lineToPerUnit, surgeImpedance, loadabilityLimitMW } from '../../core/lines.js';
import { SITES, RegionId } from './sites.js';
import { routeLengthKm } from './geography.js';

export const SYSTEM_BASE_MVA = 100;

/** Voltage classes used in the model, all ANSI C84.1 nominal system voltages. */
export const VOLTAGE_CLASS = {
  ehv500: 500,
  hv230: 230,
  hv115: 115,
  primary12: 12.47,
  secondary240: 0.24,
} as const;

export interface BusSpec {
  site: string;
  kV: number;
  type?: BusType;
  vSched?: number;
  /** Per-unit voltage limits. Defaults follow the class. */
  vMin?: number;
  vMax?: number;
}

export function makeBusId(site: string, kV: number): string {
  const tag =
    kV >= 500 ? '500' : kV >= 230 ? '230' : kV >= 115 ? '115' : kV >= 10 ? '12' : 'LV';
  return `${site.toUpperCase()}_${tag}`;
}

export function makeBus(spec: BusSpec): Bus {
  const site = SITES[spec.site];
  if (!site) throw new Error(`unknown site "${spec.site}"`);
  return {
    id: makeBusId(spec.site, spec.kV),
    name: `${site.name} ${spec.kV} kV`,
    type: spec.type ?? 'PQ',
    baseKV: spec.kV,
    ...(spec.vSched !== undefined ? { vSched: spec.vSched } : {}),
    // ANSI C84.1 Range A for transmission systems is ±5 %; distribution
    // service voltage is held to 114–126 V on a 120 V base, i.e. 0.95–1.05.
    vMin: spec.vMin ?? 0.95,
    vMax: spec.vMax ?? 1.05,
    area: site.region,
  };
}

/** Which conductor and tower a circuit of a given class uses in this model. */
export const CLASS_CONSTRUCTION: Record<number, { conductor: string; tower: string }> = {
  500: { conductor: 'bluebird', tower: 'ehv-500-horizontal' },
  230: { conductor: 'drake', tower: 'hv-230-vertical' },
  115: { conductor: 'drake', tower: 'hv-115-vertical' },
  12.47: { conductor: 'linnet', tower: 'dist-12-crossarm' },
};

export interface LineSpec {
  fromSite: string;
  toSite: string;
  kV: number;
  /** Number of identical parallel circuits on the route. */
  circuits: number;
  /** Override the computed route length, km. Used only where noted. */
  lengthKm?: number;
  /** Human-readable name for the circuit group, e.g. "Path 15". */
  label?: string;
  conductor?: string;
  tower?: string;
}

/** Expand a circuit group into one Branch per parallel circuit. */
export function makeLines(spec: LineSpec): Branch[] {
  const a = SITES[spec.fromSite];
  const b = SITES[spec.toSite];
  if (!a || !b) throw new Error(`unknown site in line ${spec.fromSite}–${spec.toSite}`);
  const cons = CLASS_CONSTRUCTION[spec.kV];
  if (!cons && !spec.conductor) throw new Error(`no construction defined for ${spec.kV} kV`);
  const p = lineParameters(spec.conductor ?? cons.conductor, spec.tower ?? cons.tower);
  const lengthKm = spec.lengthKm ?? routeLengthKm(a, b);
  const pu = lineToPerUnit(p, lengthKm, spec.kV, SYSTEM_BASE_MVA);

  // The rating a planner actually operates to is the lower of what the metal
  // can carry and what the line can transfer without the voltage collapsing or
  // the machines at each end falling out of step. On long lines the second is
  // far more restrictive, which is why a 500 kV circuit rated at 4,400 MVA of
  // copper is scheduled at a third of that.
  const { silMW } = surgeImpedance(p, spec.kV);
  const load = loadabilityLimitMW(lengthKm, silMW);
  const ratingMVA = Math.min(pu.ratingMVA, load.limitMW);

  const out: Branch[] = [];
  for (let i = 1; i <= spec.circuits; i++) {
    out.push({
      id: `L_${makeBusId(spec.fromSite, spec.kV)}_${makeBusId(spec.toSite, spec.kV)}_${i}`,
      name:
        `${a.name}–${b.name} ${spec.kV} kV` +
        (spec.circuits > 1 ? ` ckt ${i}` : '') +
        (spec.label ? ` (${spec.label})` : ''),
      from: makeBusId(spec.fromSite, spec.kV),
      to: makeBusId(spec.toSite, spec.kV),
      r: pu.r,
      x: pu.x,
      b: pu.b,
      ratingMVA,
      // Emergency ratings are conventionally set ~25 % above normal for the
      // short time it takes an operator to redispatch.
      ratingEmergencyMVA: ratingMVA * 1.25,
      kind: 'line',
      inService: true,
      lengthKm,
      conductor: p.conductor.id,
    });
  }
  return out;
}

export interface TransformerSpec {
  site: string;
  hvKV: number;
  lvKV: number;
  /** Nameplate rating of ONE bank, MVA. */
  mvaPerBank: number;
  banks: number;
  /** Impedance as a percentage of the transformer's own base. */
  percentZ: number;
  /** Ratio of reactance to resistance. Large units are far more reactive. */
  xOverR: number;
  /** Off-nominal tap position, as a ratio. 1.0 = nominal. */
  tap?: number;
  /** IEC/IEEE vector group, e.g. "YNa0" for an autotransformer. */
  vectorGroup?: string;
}

/**
 * Transformer per-unit impedance on the SYSTEM base.
 *
 *   Z_pu(new) = Z_pu(old) · (S_new / S_old) · (V_old / V_new)²
 *
 * The voltage bases match here (the system base at a bus is that bus's nominal
 * voltage), so only the power ratio applies. From %Z and X/R:
 *
 *   |Z| = %Z/100,   X = |Z| · (X/R) / √(1 + (X/R)²),   R = X / (X/R)
 */
export function makeTransformers(spec: TransformerSpec): Branch[] {
  const site = SITES[spec.site];
  if (!site) throw new Error(`unknown site "${spec.site}"`);
  const zMag = spec.percentZ / 100;
  const k = spec.xOverR;
  const x = (zMag * k) / Math.sqrt(1 + k * k);
  const r = x / k;
  const scale = SYSTEM_BASE_MVA / spec.mvaPerBank;

  const out: Branch[] = [];
  for (let i = 1; i <= spec.banks; i++) {
    out.push({
      id: `T_${makeBusId(spec.site, spec.hvKV)}_${makeBusId(spec.site, spec.lvKV)}_${i}`,
      name:
        `${site.name} ${spec.hvKV}/${spec.lvKV} kV bank ${i}` +
        ` — ${spec.mvaPerBank} MVA, ${spec.percentZ}% Z`,
      from: makeBusId(spec.site, spec.hvKV),
      to: makeBusId(spec.site, spec.lvKV),
      r: r * scale,
      x: x * scale,
      b: 0,
      ratingMVA: spec.mvaPerBank,
      ratingEmergencyMVA: spec.mvaPerBank * 1.33,
      kind: 'transformer',
      inService: true,
      ...(spec.tap && spec.tap !== 1 ? { tap: spec.tap } : {}),
      vectorGroup: spec.vectorGroup ?? 'YNa0',
    });
  }
  return out;
}

/** Canonical transformer classes, with sources for the impedance values. */
export const TRANSFORMER_CLASSES = {
  auto500_230: {
    mvaPerBank: 1120, percentZ: 12.0, xOverR: 45, vectorGroup: 'YNa0',
    note:
      'Single-phase autotransformer banks, 500/230 kV. Typical impedance for ' +
      'this size is 10–14 % on self-cooled rating with X/R of 40–60; an ' +
      'autotransformer is used because the two windings share turns, which ' +
      'makes it far smaller and cheaper than a two-winding unit of the same ' +
      'rating when the voltage ratio is modest.',
  },
  auto230_115: {
    mvaPerBank: 280, percentZ: 10.0, xOverR: 30, vectorGroup: 'YNa0',
    note: 'Typical 230/115 kV autotransformer bank; 8–12 % Z, X/R of 25–40.',
  },
  dist115_12: {
    mvaPerBank: 28, percentZ: 8.5, xOverR: 15, vectorGroup: 'Dyn1',
    note:
      'Distribution substation transformer, delta on the 115 kV side and ' +
      'grounded-wye on the 12.47 kV side. The delta traps zero-sequence ' +
      'current so a fault on the feeder does not push ground current back onto ' +
      'the transmission system; the grounded wye gives the feeder its neutral.',
  },
  gsu: {
    percentZ: 13.0, xOverR: 40, vectorGroup: 'Dyn1',
    note:
      'Generator step-up transformer, delta on the machine side and grounded ' +
      'wye on the system side. 12–15 % Z is standard; the high impedance is ' +
      'deliberate, because it limits the current the machine can deliver into ' +
      'a fault.',
  },
  service: {
    percentZ: 2.0, xOverR: 1.5, vectorGroup: 'Dyn0',
    note:
      'Pole-mounted or pad-mounted service transformer, 12.47 kV to 240/120 V. ' +
      'Small transformers have low impedance and a low X/R ratio — their ' +
      'windings are relatively resistive, so their losses are dominated by ' +
      'copper loss rather than leakage reactance.',
  },
} as const;

export type { RegionId };
