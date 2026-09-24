import type { Snapshot } from './snapshot';
import type { Feeder } from './feeder';
import { nodeIndex } from './feeder';
import type { RegulatorBranch } from '../physics/dist/network';
import { EVERGREEN } from '../data/dist/evergreen';

/**
 * Feeder 1105's step-voltage regulator, as its control sees it in a solved interval.
 *
 * Three single-phase units, one per phase. Each changes its ratio by 0.625 % a tap, up
 * to 16 taps each way (±10 %). Its control measures the output voltage through a
 * potential transformer (PT, down to a 120 V base) and the line current through a
 * current transformer (CT). Line-drop compensation takes off the drop an imaginary
 * line of impedance R′ + jX′ would cause, so the control holds the voltage at a point
 * down the feeder (the load centre), not at its own terminals:
 *
 *     V_relay = V_out / N_PT − (R′ + jX′) · I / CT_P
 *
 * and moves a tap whenever |V_relay| is outside set-point ± half the bandwidth.
 */

export interface RegPhase {
  /** Tap now (−16 … +16), and the ratio it gives. */
  tap: number;
  ratio: number;
  /** Source and output voltages (RMS, line-to-neutral), V, and their angles, degrees. */
  vS: number;
  vL: number;
  degS: number;
  degL: number;
  /** Line current through it, A, and its angle, degrees. */
  amps: number;
  degI: number;
  /** The control's view, on the 120 V base: the output as the PT gives it, the compensator's drop, and the relay voltage. */
  vPT: number;
  dropRe: number;
  dropIm: number;
  vRelay: number;
  /** Inside the band (no tap change pending)? */
  inBand: boolean;
}

export interface RegState {
  t: number;
  hour: number;
  phases: RegPhase[];
  control: NonNullable<RegulatorBranch['control']>;
  /** Set by the reader (null: as installed). */
  vsetHeld: number | null;
  /** Voltage along the trunk, each phase, on the 120 V base: node ids, distance from the substation (m), values. */
  profile: { ids: string[]; x: number[]; v: Array<[number, number, number]> };
  /** Where the regulator stands along the trunk, m. */
  xReg: number;
  prov: { V: string; I: string; tap: string };
}

const TRUNK = ['F0', 'F1', 'F2', 'F2R', 'F3', 'F4', 'F4R', 'F5', 'F6'];

export function regState(s: Snapshot, f: Feeder, vsetHeld: number | null): RegState | null {
  const fd = s.feeder;
  if (!fd || s.outcome === 'none') return null;
  const br = f.base.branches.find((b) => b.id === 'REG-1') as RegulatorBranch | undefined;
  if (!br || !br.control) return null;
  const control = { ...br.control, ...(vsetHeld !== null ? { vset: vsetHeld } : {}) };
  const idx = nodeIndex(f);
  const k = f.base.branches.indexOf(br);
  const iS = idx.get(br.from)!;
  const iL = idx.get(br.to)!;
  const V = (i: number, p: number): [number, number] => [fd.V[i * 6 + 2 * p]!, fd.V[i * 6 + 2 * p + 1]!];
  const deg = (c: [number, number]) => (Math.atan2(c[1], c[0]) * 180) / Math.PI;
  const phases: RegPhase[] = [0, 1, 2].map((p) => {
    const vs = V(iS, p);
    const vl = V(iL, p);
    const i: [number, number] = [fd.I[k * 12 + 6 + 2 * p]!, fd.I[k * 12 + 6 + 2 * p + 1]!];
    const tap = fd.regTaps[p]!;
    const pt: [number, number] = [vl[0] / control.ptRatio, vl[1] / control.ptRatio];
    // (R′ + jX′)·I / CT_P
    const dr = (control.r * i[0] - control.x * i[1]) / control.ctPrimary;
    const di = (control.r * i[1] + control.x * i[0]) / control.ctPrimary;
    const vr = Math.hypot(pt[0] - dr, pt[1] - di);
    return {
      tap,
      ratio: 1 + (EVERGREEN.regulator.stepPct / 100) * tap,
      vS: Math.hypot(...vs),
      vL: Math.hypot(...vl),
      degS: deg(vs),
      degL: deg(vl),
      amps: Math.hypot(...i),
      degI: deg(i),
      vPT: Math.hypot(...pt),
      dropRe: dr,
      dropIm: di,
      vRelay: vr,
      inBand: Math.abs(control.vset - vr) <= control.band / 2 + 1e-9,
    };
  });
  // the PT brings the line-to-neutral voltage to the 120 V base
  const base = control.ptRatio;
  const x0 = f.layout.pos.get(TRUNK[0]!)!.x;
  const x = TRUNK.map((id) => Math.abs(f.layout.pos.get(id)!.x - x0));
  const profile = {
    ids: TRUNK,
    x,
    v: TRUNK.map((id) => {
      const i = idx.get(id)!;
      return [0, 1, 2].map((p) => Math.hypot(...V(i, p)) / base) as [number, number, number];
    }),
  };
  return {
    t: s.t,
    hour: fd.hour,
    phases,
    control,
    vsetHeld,
    profile,
    xReg: x[TRUNK.indexOf('F4R')]!,
    prov: { V: `solver:t${s.t}.feeder.V`, I: `solver:t${s.t}.feeder.REG-1.I`, tap: `solver:t${s.t}.feeder.REG-1.tap` },
  };
}
