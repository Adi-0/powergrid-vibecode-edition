import type { Grid } from './grid';
import type { Snapshot } from './snapshot';
import { COMPONENTS } from '../data/components';

/**
 * A switched shunt capacitor bank, as physics: how it is built (steps of three phases,
 * each phase a stack of cans in series groups, cans in parallel within a group), and
 * what it does in a solved interval.
 *
 * The power flow models each step as a fixed susceptance, so the reactive power it
 * supplies goes as the voltage squared: Q = n·Q_step·|V|² (|V| in per unit of the rated
 * voltage). Everything below follows from that and from the steps in service:
 *
 *     C per phase (one step)   C = Q_step,1φ / (ω V_LN,rated²)
 *     current per phase        |I| = Q_3φ / (√3 |V_LL|), leading the voltage by 90°
 *     one can                  C_can = C·S/P, |V_can| = |V_LN|/S, Q_can = ω C_can |V_can|²
 *     energy at the peak       W = ½ C V_peak² = C |V_LN|² per phase (Q_1φ = ω W)
 *
 * with S series groups of P cans each per phase.
 */

export interface CapDesign {
  /** Series groups per phase, cans in parallel per group, tiers per stack, cans per tier. */
  series: number;
  parallel: number;
  tiers: number;
  perTier: number;
  /** The cans' rated voltage, kV (one can's share of the rated phase voltage). */
  canKV: number;
}

export function capDesign(kv: number): CapDesign {
  const C = COMPONENTS.capacitor;
  const cls = kv >= 200 ? 230 : 115;
  const series = C.series[cls];
  const parallel = C.parallel[cls];
  const tiers = C.tiers[cls];
  return { series, parallel, tiers, perTier: (series / tiers) * parallel, canKV: kv / Math.sqrt(3) / series };
}

/** The values before the reader last switched this bank, from that earlier solve. */
export interface CapBefore {
  t: number;
  seq: number;
  steps: number;
  vm: number;
  q: number;
  losses: number;
}

export interface CapBankState {
  t: number;
  seq: number;
  shunt: number;
  bus: number;
  busId: string;
  kvNom: number;
  /** One step's reactive power at rated voltage, MVAr (3φ), and how many there are. */
  stepMVAr: number;
  steps: number;
  /** Steps in service in this solution; whether the reader holds them there. */
  inService: number;
  held: boolean;
  energized: boolean;
  vm: number;
  vaDeg: number;
  /** |V_LL| and |V_LN| now, kV. */
  vLL: number;
  vLN: number;
  /** Reactive power supplied now, MVAr (3φ), and per phase. */
  q: number;
  q1: number;
  /** Current per phase, A (RMS), and phase a's angle, degrees (leads its voltage by 90°). */
  amps: number;
  iDeg: number;
  omega: number;
  /** One step's capacitance per phase, F. */
  cStep: number;
  design: CapDesign;
  /** One can: its capacitance, F; voltage, kV; reactive power, kvar; current, A (now). */
  cCan: number;
  vCan: number;
  qCan: number;
  iCan: number;
  /** Energy held per phase at the voltage's peak, all steps in service, J. */
  wPeak: number;
  /** The loads' reactive demand at this bus, MVAr (3φ), and the system's losses, MW. */
  qLoad: number;
  losses: number;
  before: CapBefore | null;
  prov: { vm: string; va: string; steps: string; qLoad: string; losses: string };
}

export function capBankState(grid: Grid, s: Snapshot, k: number, held: boolean, before: CapBefore | null): CapBankState | null {
  const sh = grid.shunts[k];
  if (!sh || sh.stepMVAr <= 0 || s.outcome === 'none') return null;
  const b = sh.bus;
  const i = b.index;
  const t = s.t;
  const vm = s.vm[i]!;
  const energized = s.energized[i] === 1;
  const inService = s.shuntSteps[k] ?? 0;
  const omega = 2 * Math.PI * COMPONENTS.fHz;
  const vLL = vm * b.kv;
  const vLN = vLL / Math.sqrt(3);
  const q = energized ? inService * sh.stepMVAr * vm * vm : 0;
  const vRatedLN = b.kv / Math.sqrt(3);
  const cStep = (sh.stepMVAr / 3) * 1e6 / (omega * (vRatedLN * 1e3) ** 2);
  const design = capDesign(b.kv);
  const cCan = (cStep * design.series) / design.parallel;
  const vCan = vLN / design.series;
  const on = energized && inService > 0;
  return {
    t,
    seq: s.seq,
    shunt: k,
    bus: i,
    busId: b.id,
    kvNom: b.kv,
    stepMVAr: sh.stepMVAr,
    steps: sh.steps,
    inService,
    held,
    energized,
    vm,
    vaDeg: (s.va[i]! * 180) / Math.PI,
    vLL,
    vLN,
    q,
    q1: q / 3,
    amps: vLL > 0 ? (q * 1e3) / (Math.sqrt(3) * vLL) : 0,
    iDeg: (s.va[i]! * 180) / Math.PI + 90,
    omega,
    cStep,
    design,
    cCan,
    vCan: on ? vCan : 0,
    qCan: on ? (omega * cCan * (vCan * 1e3) ** 2) / 1e3 : 0,
    iCan: on ? omega * cCan * vCan * 1e3 : 0,
    wPeak: on ? inService * cStep * (vLN * 1e3) ** 2 : 0,
    qLoad: s.qd[i]!,
    losses: s.lossesMW,
    before,
    prov: { vm: `solver:t${t}.bus.${b.id}.vm`, va: `solver:t${t}.bus.${b.id}.va`, steps: `solver:t${t}.shunt.${k}.steps`, qLoad: `solver:t${t}.bus.${b.id}.qd`, losses: `solver:t${t}.losses` },
  };
}

/** Phase a's instantaneous voltage (kV), current (A) and power (MW) at time τ (s, real), from the RMS phasors. */
export function capWave(st: CapBankState, tau: number, phase = 0): { v: number; i: number; p: number } {
  const sh = (-2 * Math.PI * phase) / 3;
  const th = (st.vaDeg * Math.PI) / 180 + sh;
  const v = Math.SQRT2 * st.vLN * Math.cos(st.omega * tau + th);
  const i = Math.SQRT2 * st.amps * Math.cos(st.omega * tau + th + Math.PI / 2);
  return { v, i, p: (v * i) / 1e3 };
}
