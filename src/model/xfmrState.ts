import type { Grid } from './grid';
import type { Snapshot } from './snapshot';
import type { Feeder } from './feeder';
import { nodeIndex } from './feeder';
import { COUPLING_BUS } from './coupling';
import { EVERGREEN } from '../data/dist/evergreen';
import { TRANSFORMERS } from '../data/ca/network';

/**
 * A power transformer as a component: its nameplate, and its state in a solved
 * interval — whichever solution it belongs to (a transmission bank: the Newton–Raphson
 * power flow; the Evergreen bank: the coupled distribution sweep). The transformer
 * level, its inspector and its math panel all read it from here.
 *
 * Every value carries the key it came from (`solver:…`, `data:…`), so the display
 * layer can tag what it shows.
 */
export interface XfmrPlate {
  /** The portal key of its level, and its name. */
  key: string;
  name: string;
  /** Data-file key prefix of the nameplate (e.g. `network.xfmr.TESLA 500/230 #1`). */
  dataKey: string;
  /** Winding connection per IEEE C57.12.00 notation. */
  vectorGroup: string;
  /** Nominal line-to-line voltages, kV, and rating, MVA (3φ). */
  hvKV: number;
  lvKV: number;
  mva: number;
  /** Delta tertiary's line-to-line voltage, kV (a typical value, for the drawing: it carries no load here). */
  tertiaryKV?: number;
  /** On-load tap changer: step size (% of the low-side voltage) and steps either way. */
  ltc?: { stepPct: number; maxSteps: number };
  /** Data-file keys of the nameplate values (provenance of what is shown). */
  keys: { name: string; hvKV: string; lvKV: string; mva: string; vectorGroup: string; tertiaryKV: string; stepPct?: string; maxSteps?: string };
}

export interface XfmrState {
  t: number;
  /** In service and its high side energised. */
  on: boolean;
  /** Terminal voltages: per unit of each side's nominal, kV line-to-line (magnitude). */
  vH: number;
  vL: number;
  vHkV: number;
  vLkV: number;
  /** Power into each terminal, 3φ, MW and MVAr (positive into the transformer). */
  pH: number;
  qH: number;
  pL: number;
  qL: number;
  /** Line current at each terminal, A (RMS), from |S| / (√3 |V|). */
  iH: number;
  iL: number;
  /** Losses, MW (3φ): what goes in and does not come out. */
  loss: number;
  /** |S| at the high side over the rating. */
  loading: number;
  /** Tap changer position, steps, and the ratio multiplier it gives. */
  step?: number;
  ltcRatio?: number;
  /** Where each value came from (display-layer provenance keys). */
  prov: { vH: string; vL: string; pH: string; qH: string; pL: string; qL: string; loading: string; step?: string };
  /** The phases are nearly but not exactly balanced (the distribution sweep is unbalanced). */
  unbalanced: boolean;
}

/** A transmission bank's nameplate, from its branch. */
export function gridPlate(grid: Grid, k: number, key: string): XfmrPlate {
  const br = grid.branches[k]!;
  const X = br.xfmr!;
  const rec = TRANSFORMERS.find((t) => t.site === br.from.site.id && t.hvKV === X.hvKV && t.lvKV === X.lvKV);
  return {
    key,
    name: br.name,
    dataKey: `network.xfmr.${br.id}`,
    vectorGroup: X.vectorGroup,
    hvKV: X.hvKV,
    lvKV: X.lvKV,
    mva: X.mva,
    ...(rec?.tertiaryKV ? { tertiaryKV: rec.tertiaryKV } : {}),
    keys: {
      name: `network.xfmr.${br.id}.name`,
      hvKV: `network.xfmr.${br.id}.hvKV`,
      lvKV: `network.xfmr.${br.id}.lvKV`,
      mva: `network.xfmr.${br.id}.mva`,
      vectorGroup: `network.xfmr.${br.id}.vectorGroup`,
      tertiaryKV: `network.xfmr.${br.id}.tertiaryKV`,
    },
  };
}

/** The Evergreen bank's nameplate. */
export function evergreenPlate(key: string): XfmrPlate {
  const B = EVERGREEN.bank;
  return {
    key,
    name: 'Evergreen bank 1',
    dataKey: 'evergreen.bank',
    vectorGroup: B.vectorGroup,
    hvKV: B.kvHighLL,
    lvKV: B.kvLowLL,
    mva: B.kva / 1000,
    ltc: { stepPct: EVERGREEN.ltc.stepPct, maxSteps: EVERGREEN.ltc.maxSteps },
    keys: {
      name: 'evergreen.bank.name',
      hvKV: 'evergreen.bank.kvHighLL',
      lvKV: 'evergreen.bank.kvLowLL',
      mva: 'evergreen.bank.kva',
      vectorGroup: 'evergreen.bank.vectorGroup',
      tertiaryKV: 'evergreen.bank.tertiaryKV',
      stepPct: 'evergreen.ltc.stepPct',
      maxSteps: 'evergreen.ltc.maxSteps',
    },
  };
}

/** A transmission bank's state (the high side is the branch's from end). */
export function gridXfmrState(grid: Grid, s: Snapshot, k: number): XfmrState | null {
  if (s.outcome === 'none') return null;
  const br = grid.branches[k]!;
  const t = s.t;
  const id = br.id;
  const i = br.from.index;
  const j = br.to.index;
  const on = !!s.inService[k] && s.energized[i] === 1;
  const vH = on ? s.vm[i]! : 0;
  const vL = on ? s.vm[j]! : 0;
  const vHkV = vH * br.from.kv;
  const vLkV = vL * br.to.kv;
  const pH = on ? s.pf[k]! : 0;
  const qH = on ? s.qf[k]! : 0;
  const pL = on ? s.pt[k]! : 0;
  const qL = on ? s.qt[k]! : 0;
  return {
    t,
    on,
    vH,
    vL,
    vHkV,
    vLkV,
    pH,
    qH,
    pL,
    qL,
    iH: on ? (Math.hypot(pH, qH) / (Math.sqrt(3) * vHkV)) * 1000 : 0,
    iL: on ? (Math.hypot(pL, qL) / (Math.sqrt(3) * vLkV)) * 1000 : 0,
    loss: pH + pL,
    loading: on ? s.loading[k]! : 0,
    prov: {
      vH: `solver:t${t}.bus.${br.from.id}.vm`,
      vL: `solver:t${t}.bus.${br.to.id}.vm`,
      pH: `solver:t${t}.branch.${id}.pf`,
      qH: `solver:t${t}.branch.${id}.qf`,
      pL: `solver:t${t}.branch.${id}.pt`,
      qL: `solver:t${t}.branch.${id}.qt`,
      loading: `solver:t${t}.branch.${id}.loading`,
    },
    unbalanced: false,
  };
}

/** The Evergreen bank's state, from the coupled distribution solution. */
export function evergreenXfmrState(grid: Grid, s: Snapshot, fd: Feeder): XfmrState | null {
  const f = s.feeder;
  if (s.outcome === 'none' || !f) return null;
  const t = s.t;
  const k = fd.base.branches.findIndex((b) => b.id === 'EV-BANK');
  const bus = grid.bus(COUPLING_BUS);
  const on = s.energized[bus.index] === 1;
  const B = EVERGREEN.bank;
  const i12 = nodeIndex(fd).get('EV-12')!;
  let vln = 0;
  for (let p = 0; p < 3; p++) vln += Math.hypot(f.V[i12 * 6 + 2 * p]!, f.V[i12 * 6 + 2 * p + 1]!) / 3;
  const vLkV = on ? (vln * Math.sqrt(3)) / 1000 : 0;
  const vHkV = on ? f.sourcePu * B.kvHighLL : 0;
  const pH = on ? f.flows[k * 4]! / 1e6 : 0;
  const qH = on ? f.flows[k * 4 + 1]! / 1e6 : 0;
  // the sweep reports what leaves at the low side: into the transformer is its negative
  const pL = on ? -f.flows[k * 4 + 2]! / 1e6 : 0;
  const qL = on ? -f.flows[k * 4 + 3]! / 1e6 : 0;
  return {
    t,
    on,
    vH: on ? f.sourcePu : 0,
    vL: vLkV / B.kvLowLL,
    vHkV,
    vLkV,
    pH,
    qH,
    pL,
    qL,
    iH: on ? (Math.hypot(pH, qH) / (Math.sqrt(3) * vHkV)) * 1000 : 0,
    iL: on ? (Math.hypot(pL, qL) / (Math.sqrt(3) * vLkV)) * 1000 : 0,
    loss: pH + pL,
    loading: on ? Math.hypot(pH, qH) / (B.kva / 1000) : 0,
    step: f.ltcStep,
    ltcRatio: 1 + (EVERGREEN.ltc.stepPct / 100) * f.ltcStep,
    prov: {
      vH: `solver:t${t}.evergreen.sourcePu`,
      vL: `solver:t${t}.feeder.V.EV-12`,
      pH: `solver:t${t}.feeder.EV-BANK.pf`,
      qH: `solver:t${t}.feeder.EV-BANK.qf`,
      pL: `solver:t${t}.feeder.EV-BANK.pt`,
      qL: `solver:t${t}.feeder.EV-BANK.qt`,
      loading: `derived:t${t}.evergreen.bankLoading`,
      step: `solver:t${t}.evergreen.ltc`,
    },
    unbalanced: true,
  };
}
