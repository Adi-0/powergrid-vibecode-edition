import { Complex } from '../physics/complex';
import type { CMatrix } from '../physics/linalg';
import { feederFault, pathBetween, phaseFromSeq, theveninAt, type FeederFaultKind } from '../physics/dist/fault';
import type { Phase } from '../physics/dist/network';
import { EVERGREEN } from '../data/dist/evergreen';
import { COUPLING_BUS } from './coupling';
import { busFaultLevel, type FaultStudy } from './faultStudy';
import { nodeIndex, type Feeder } from './feeder';
import { S_BASE, type Grid } from './grid';
import type { Snapshot } from './snapshot';

/**
 * A fault on feeder 1105. The source is the transmission system's Thevenin impedance at
 * Evergreen's 60 kV bus (from the sequence networks at this interval), carried through
 * the 60 kV Δ / 12.47 kV grounded-wye bank: positive and negative sequence pass through
 * (system plus bank), zero sequence on the 12 kV side sees only the bank's leakage
 * impedance to its grounded neutral (the delta blocks the 60 kV system's). From the
 * 12 kV bus down, the feeder's own phase matrices. Pre-fault voltages are the coupled
 * solution's; load is neglected in the fault current.
 */
export const KV12 = 12.47;

export interface FeederSource {
  /** Sequence impedances at the 12 kV bus, Ω (referred to the 12.47 kV side). */
  z0: Complex;
  z1: Complex;
  z2: Complex;
  /** Of which the bank's own leakage, Ω. */
  zBank: Complex;
  /** The 60 kV system's, referred to 12.47 kV, Ω. */
  zSys1: Complex;
  zSys2: Complex;
  zabc: CMatrix;
}

export function feederSource(grid: Grid, fs: FaultStudy): FeederSource {
  const bus = grid.bus(COUPLING_BUS).index;
  const f = busFaultLevel(grid, fs, bus);
  const zb12 = (KV12 * KV12) / S_BASE;
  const bank = EVERGREEN.bank;
  const zBank = bank.zpu.scale((KV12 * KV12) / (bank.kva / 1000));
  const zSys1 = f.z1.scale(zb12);
  const zSys2 = f.r3.zc2[bus]!.scale(zb12);
  const z1 = zSys1.add(zBank);
  const z2 = zSys2.add(zBank);
  const z0 = zBank;
  return { z0, z1, z2, zBank, zSys1, zSys2, zabc: phaseFromSeq(z0, z1, z2) };
}

export interface FeederFaultResult {
  node: string;
  kind: FeederFaultKind;
  phases: Phase[];
  /** Fault current per phase (a, b, c), A; and the residual 3I₀ = I_a + I_b + I_c. */
  I: [Complex, Complex, Complex];
  residual: Complex;
  /** Pre-fault voltages at the node, V (line-to-neutral). */
  vpre: Complex[];
  /** Thevenin matrix at the node, Ω. */
  Z: CMatrix;
  /** Protective devices between the source and the fault, nearest the source first. */
  devices: string[];
}

export function faultOnFeeder(fd: Feeder, s: Snapshot, src: FeederSource, node: string, kind: FeederFaultKind, on?: Phase[]): FeederFaultResult | null {
  const f = s.feeder;
  const n = fd.base.nodes.get(node);
  if (!f || !n || n.kind !== 'primary') return null;
  const Z = theveninAt(fd.base, 'EV-12', src.zabc, node);
  if (!Z) return null;
  const i = nodeIndex(fd).get(node)!;
  const vpre = [0, 1, 2].map((p) => new Complex(f.V[i * 6 + 2 * p]!, f.V[i * 6 + 2 * p + 1]!));
  const need = kind === '3ph' ? 3 : kind === 'll' || kind === 'dlg' ? 2 : 1;
  // a fault needs the phases it involves: no line-to-line fault on a single-phase lateral
  if (n.phases.length < need) return null;
  const phases = on ?? (kind === '3ph' ? [0, 1, 2] : need === 2 ? n.phases.slice(0, 2) : [n.phases[0]!]);
  if (phases.length !== need || phases.some((p) => !n.phases.includes(p))) return null;
  const I = feederFault(Z, vpre, kind, phases as Phase[]);
  const residual = I[0].add(I[1]).add(I[2]);
  const devices = (pathBetween(fd.base, 'EV-12', node) ?? []).filter((b) => b.kind === 'switch').map((b) => b.id);
  return { node, kind, phases: phases as Phase[], I, residual, vpre, Z, devices };
}
