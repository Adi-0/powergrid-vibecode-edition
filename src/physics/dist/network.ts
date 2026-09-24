import { Complex } from '../complex';
import { CMatrix } from '../linalg';

/**
 * A radial distribution network, phase by phase.
 *
 * Primary nodes carry up to three phases (a, b, c → indices 0, 1, 2), each voltage a
 * line-to-neutral phasor in volts (RMS). A secondary node (the 120/240 V split-phase
 * service behind a center-tapped transformer) carries two "legs", 1 and 2 (indices 0
 * and 1), each measured from the grounded neutral: leg 1 ≈ +120 V, leg 2 ≈ −120 V, so
 * leg-to-leg is ≈ 240 V.
 */
export type Phase = 0 | 1 | 2;
export const PHASE_NAMES = ['a', 'b', 'c'] as const;
export const LEG_NAMES = ['1', '2'] as const;

export interface DNode {
  id: string;
  kind: 'primary' | 'secondary';
  phases: Phase[];
  /** Nominal line-to-neutral voltage, V (the per-unit base for this node). */
  vbaseLN: number;
}

interface BranchBase {
  id: string;
  from: string;
  to: string;
}

/** Overhead or underground line: series Z and shunt Y matrices of the whole segment. */
export interface LineBranch extends BranchBase {
  kind: 'line';
  phases: Phase[];
  /** 3×3, Ω, whole segment (rows/cols of absent phases are zero). */
  Z: CMatrix;
  /** 3×3, S, whole segment. */
  Y: CMatrix;
  lengthFt: number;
  config: string;
}

/**
 * Step-voltage regulators: three single-phase units (wye). Each tap changes the
 * ratio by 0.625 % (5/8 %), ±16 taps = ±10 %. Line-drop compensation (LDC) makes the
 * regulator hold a voltage at a point down the feeder rather than at its own terminals.
 */
export interface RegulatorBranch extends BranchBase {
  kind: 'regulator';
  phases: Phase[];
  taps: [number, number, number];
  control?: {
    /** Voltage set-point on the 120 V base, V; bandwidth, V. */
    vset: number;
    band: number;
    /** Potential transformer ratio; CT primary rating (A); compensator R and X settings (V). */
    ptRatio: number;
    ctPrimary: number;
    r: number;
    x: number;
  };
}

/**
 * Three-phase transformer bank. 'YgYg': grounded wye – grounded wye. 'DYg': delta
 * primary, grounded-wye secondary, step-down — per ANSI the low side lags by 30°.
 */
export interface TransformerBranch extends BranchBase {
  kind: 'transformer';
  conn: 'YgYg' | 'DYg';
  kva: number;
  kvHighLL: number;
  kvLowLL: number;
  /** Per-unit series impedance on the bank's own base. */
  zpu: Complex;
  /** Load tap changer: ratio multiplier on the low side (1 = nominal). */
  ltc?: number;
}

/**
 * Single-phase center-tapped distribution transformer: one primary phase (line-to-
 * neutral) to a 120/240 V three-wire secondary. Impedance split between the primary
 * and the two half windings by the usual rule: Z0 = 0.5R + j0.8X (primary),
 * Z1 = Z2 = R + j0.4X (each half, on a 120 V base).
 */
export interface CenterTapBranch extends BranchBase {
  kind: 'centertap';
  phase: Phase;
  kva: number;
  kvPrimaryLN: number;
  zpu: Complex;
}

export interface SwitchBranch extends BranchBase {
  kind: 'switch';
  phases: Phase[];
  closed: boolean;
}

export type DBranch = LineBranch | RegulatorBranch | TransformerBranch | CenterTapBranch | SwitchBranch;

export type LoadModel = 'PQ' | 'Z' | 'I';

/**
 * A load element. 'Y' is one phase to neutral; 'D' is phase to phase; on a
 * secondary node 'L1N'/'L2N' are the 120 V circuits and 'L12' the 240 V ones.
 * kW and kvar are at rated voltage; the model says how they vary with voltage.
 */
export interface DLoad {
  id: string;
  node: string;
  conn: 'Y' | 'D' | 'L1N' | 'L2N' | 'L12';
  /** For 'Y': [p]; for 'D': [p, q] meaning the element sits between phases p and q. */
  phases: Phase[];
  kw: number;
  kvar: number;
  model: LoadModel;
  /** Rated voltage across the element, V. */
  vRated: number;
}

export interface DCapacitor {
  id: string;
  node: string;
  phases: Phase[];
  /** kvar per phase at rated voltage (wye-connected, constant impedance). */
  kvarPerPhase: number;
  vRatedLN: number;
  closed: boolean;
}

export interface DistNetwork {
  root: string;
  nodes: Map<string, DNode>;
  branches: DBranch[];
  loads: DLoad[];
  caps: DCapacitor[];
}

export function network(root: string, nodes: DNode[], branches: DBranch[], loads: DLoad[], caps: DCapacitor[]): DistNetwork {
  return { root, nodes: new Map(nodes.map((n) => [n.id, n])), branches, loads, caps };
}

/** Balanced three-phase source phasors, line-to-neutral volts. */
export function balancedSource(vLN: number, angleDeg = 0): [Complex, Complex, Complex] {
  return [Complex.polarDeg(vLN, angleDeg), Complex.polarDeg(vLN, angleDeg - 120), Complex.polarDeg(vLN, angleDeg + 120)];
}
