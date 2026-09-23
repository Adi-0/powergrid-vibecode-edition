import { Complex, c } from '../physics/complex';
import { buildYbus, factor, fault, type Factored, type FaultResult, type FaultType, type SeqBranch, type SeqNetwork, type SeqSource } from '../physics/fault/seq';
import type { TechId } from '../data/tech';
import { machineOf } from './machine';
import { S_BASE, type Grid } from './grid';
import type { Snapshot } from './snapshot';

/**
 * The California network's sequence networks at a solved interval, for faults.
 *
 * Lines: positive and zero sequence from their own conductor geometry (Carson with
 * earth return, the transposed-line averages), with their charging. Transformers by
 * vector group: generator step-ups YNd1 (a zero-sequence path to ground from the
 * high side only); banks with a delta tertiary (YNyn0d1, YNa0d1) as a three-winding T
 * whose tertiary gives zero sequence a path to ground at the star point. Sources: each
 * online synchronous machine behind its subtransient reactance (the first cycles of
 * a fault) and its step-up transformer; the neighbours behind each AC tie as a
 * Thevenin equivalent. Inverter-based plants (solar, wind, batteries) limit their
 * fault current to little more than rated and are left out (a simplification, stated).
 * Loads are neglected, as is standard. Pre-fault voltages are the power flow's.
 */
export const FAULT_DATA = {
  /** Subtransient reactance X″_d (= X₂) on the machine's rating, by technology (Kundur's ranges; estimates). */
  xdpp: { nuclear: 0.2, gas_ccgt: 0.18, gas_ct: 0.18, gas_cogen: 0.16, gas_recip: 0.15, hydro: 0.25, pumped_storage: 0.25, geothermal: 0.18, syncon: 0.2 } as Partial<Record<TechId, number>>,
  /** A plant's step-up transformer, % on the machine's rating, when not modelled explicitly. */
  gsuXPct: 12,
  /** Machine X/R for the subtransient impedance. */
  genXR: 40,
  /** Short-circuit strength of the neighbouring system behind each AC tie, MVA, and its X/R (estimates). */
  tieScMVA: 10000,
  tieXR: 15,
  /** Three-winding T split of a bank's H–L reactance: star-to-H, star-to-L, star-to-tertiary (estimates). */
  tee: { h: 0.75, l: 0.25, t: 0.75 },
  src: 'kundur' as const,
  estimate: true,
};

export interface FaultStudy {
  net: SeqNetwork;
  fac: Factored;
  vpre: Complex[];
  /** Base current at each bus, kA. */
  iBaseKA: number[];
  n: number;
}

export function faultStudy(grid: Grid, s: Snapshot): FaultStudy {
  const nb = grid.buses.length;
  let n = nb;
  const branches: SeqBranch[] = [];
  const zeroShunts: SeqNetwork['zeroShunts'] = [];
  for (const b of grid.branches) {
    if (!s.inService[b.index]) continue;
    const z1 = c(b.r, b.x);
    if (b.kind === 'line') {
      const lp = b.line!;
      const zb = (b.kv * b.kv) / S_BASE;
      const z0 = lp.constants.z0.scale(lp.lengthKm / zb);
      const b0 = lp.constants.y0.im * lp.lengthKm * zb;
      branches.push({ from: b.from.index, to: b.to.index, z1, z0, b1: b.b, b0 });
      continue;
    }
    const vg = b.xfmr?.vectorGroup ?? 'YNyn0';
    if (vg === 'YNd1') {
      branches.push({ from: b.from.index, to: b.to.index, z1, z0: z1, xfmr: { from: 'Yg', to: 'D' } });
    } else if (/d/.test(vg.slice(2))) {
      // grounded wye (or auto) with a delta tertiary: a star point between H and L,
      // and the tertiary's path to ground at it (zero sequence only)
      const star = n++;
      const T = FAULT_DATA.tee;
      branches.push({ from: b.from.index, to: star, z1: z1.scale(T.h), z0: z1.scale(T.h), xfmr: { from: 'Yg', to: 'Yg' } });
      branches.push({ from: star, to: b.to.index, z1: z1.scale(T.l), z0: z1.scale(T.l), xfmr: { from: 'Yg', to: 'Yg' } });
      zeroShunts.push({ bus: star, z: z1.scale(T.t) });
    } else {
      branches.push({ from: b.from.index, to: b.to.index, z1, z0: z1, xfmr: { from: 'Yg', to: 'Yg' } });
    }
  }
  const sources: SeqSource[] = [];
  for (const g of grid.gens) {
    if (!s.genOnline[g.index] || !s.energized[g.bus.index]) continue;
    const t = g.tech;
    if (t.id === 'import_ac') {
      const zm = S_BASE / FAULT_DATA.tieScMVA;
      const z = c(zm / Math.hypot(1, FAULT_DATA.tieXR), (zm * FAULT_DATA.tieXR) / Math.hypot(1, FAULT_DATA.tieXR));
      sources.push({ bus: g.bus.index, z1: z, z2: z, z0: z });
      continue;
    }
    if (!t.synchronous) continue;
    const rec = machineOf(g.id);
    if (rec) {
      // modelled unit by unit, behind its own step-up transformer in the network; its
      // neutral is high-resistance grounded, so no zero-sequence path from the machine
      const zb = S_BASE / rec.mva;
      sources.push({ bus: g.bus.index, z1: c(rec.xdpp / FAULT_DATA.genXR, rec.xdpp).scale(zb), z2: c(rec.x2 / FAULT_DATA.genXR, rec.x2).scale(zb), z0: null });
      continue;
    }
    const x = FAULT_DATA.xdpp[t.id];
    if (x === undefined) continue;
    const mva = t.id === 'syncon' ? (g.plant.mvar ?? g.pmaxMW) : g.pmaxMW / Math.max(0.8, t.pfLag || 0.85);
    if (mva <= 0) continue;
    const zb = S_BASE / mva;
    const xg = FAULT_DATA.gsuXPct / 100;
    const zm = c(x / FAULT_DATA.genXR, x + xg).scale(zb);
    // behind an implicit YNd step-up: zero sequence sees only the transformer, grounded at the high side
    sources.push({ bus: g.bus.index, z1: zm, z2: zm, z0: c(0, xg).scale(zb) });
  }
  const net: SeqNetwork = { n, branches, sources, zeroShunts };
  const fac = factor(buildYbus(net));
  const vpre: Complex[] = [];
  const iBaseKA: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i < nb) {
      const bus = grid.buses[i]!;
      vpre.push(s.energized[i] ? Complex.polar(s.vm[i]!, s.va[i]!) : Complex.ZERO);
      iBaseKA.push(S_BASE / (Math.sqrt(3) * bus.kv));
    } else {
      vpre.push(Complex.ZERO); // star points: not faulted
      iBaseKA.push(0);
    }
  }
  return { net, fac, vpre, iBaseKA, n };
}

export interface BusFaultLevel {
  bus: number;
  kv: number;
  /** Three-phase and single line-to-ground fault currents, kA (RMS, symmetrical, first cycles). */
  i3kA: number;
  i1kA: number;
  /** Short-circuit MVA (√3 V I, three-phase) and X/R of the positive-sequence Thevenin impedance. */
  mva3: number;
  xr: number;
  z1: Complex;
  z0: Complex;
  vpre: Complex;
  r3: FaultResult;
  r1: FaultResult;
}

export function busFaultLevel(grid: Grid, fs: FaultStudy, busIndex: number): BusFaultLevel {
  const r3 = fault(fs.fac, busIndex, '3ph', fs.vpre);
  const r1 = fault(fs.fac, busIndex, 'slg', fs.vpre);
  const ib = fs.iBaseKA[busIndex]!;
  const bus = grid.buses[busIndex]!;
  const i3 = r3.ia.abs() * ib;
  return {
    bus: busIndex,
    kv: bus.kv,
    i3kA: i3,
    i1kA: r1.ia.abs() * ib,
    mva3: Math.sqrt(3) * bus.kv * i3,
    xr: r3.z1.im / Math.max(1e-12, r3.z1.re),
    z1: r3.z1,
    z0: r1.z0,
    vpre: fs.vpre[busIndex]!,
    r3,
    r1,
  };
}

export type { FaultType };
