import { MACHINES, type MachineRecord } from '../data/machines';

/**
 * A synchronous generator at its operating point, round-rotor model (X_q taken equal
 * to X_d; for a two-pole turbine generator they differ by a few percent). Per phase,
 * generator-reference convention (current out of the machine positive):
 *
 *   E_f = V_t + (R_a + jX_d) I_a        I_a = (S / V_t)*,  S = P + jQ
 *
 * E_f is the internal (excitation) voltage, proportional to field current on the
 * air-gap line (saturation neglected); its angle ahead of V_t is the load angle δ.
 * All in per unit on the machine's own rating and rated voltage; physical values
 * alongside (voltages line-to-neutral per phase, currents per phase, RMS).
 *
 * Capability (Kundur): at terminal voltage V the machine may operate where
 *   armature current   P² + Q² ≤ (V I_rated)²
 *   field current      P² + (Q + V²/X_d)² ≤ (V E_f,max / X_d)²   (E_f,max: at the rated point)
 *   prime mover        P ≤ P_turbine
 *   steady-state stability (under-excited, against a stiff bus through X_e)
 *                      P² + (Q − c)² ≤ r²,  c = (V²/2)(1/X_e − 1/X_d),  r = (V²/2)(1/X_e + 1/X_d)
 */
export interface Phasors {
  rec: MachineRecord;
  /** Terminal voltage magnitude (pu) and angle (rad, system reference). */
  V: number;
  theta: number;
  /** Output, pu on the machine base. */
  P: number;
  Q: number;
  /** Armature current: magnitude (pu), angle (rad, system reference); power-factor angle φ (rad, + lagging). */
  I: number;
  iAngle: number;
  phi: number;
  /** Excitation voltage: magnitude (pu), angle (rad, system reference); load angle δ (rad). */
  Ef: number;
  efAngle: number;
  delta: number;
  /** Base current, kA; base voltage per phase, kV (LN). */
  iBaseKA: number;
  vBaseLN: number;
}

export function machineOf(genId: string): MachineRecord | undefined {
  return MACHINES.find((m) => m.gen === genId);
}

/** Phasors at an operating point: terminal V∠θ (pu), output P, Q in MW / MVAr. */
export function phasors(rec: MachineRecord, V: number, theta: number, Pmw: number, Qmvar: number): Phasors {
  const P = Pmw / rec.mva;
  const Q = Qmvar / rec.mva;
  // I = (S/V)* with V at angle θ: I = (P − jQ)/V ∠θ  →  magnitude |S|/V, angle θ − atan2(Q, P)
  const S = Math.hypot(P, Q);
  const I = S / V;
  const phi = Math.atan2(Q, P);
  const iAngle = theta - phi;
  // E = V∠θ + (Ra + jXd) I∠iAngle
  const ir = I * Math.cos(iAngle);
  const ii = I * Math.sin(iAngle);
  const er = V * Math.cos(theta) + rec.ra * ir - rec.xd * ii;
  const ei = V * Math.sin(theta) + rec.ra * ii + rec.xd * ir;
  const Ef = Math.hypot(er, ei);
  const efAngle = Math.atan2(ei, er);
  return {
    rec,
    V,
    theta,
    P,
    Q,
    I,
    iAngle,
    phi,
    Ef,
    efAngle,
    delta: efAngle - theta,
    iBaseKA: rec.mva / (Math.sqrt(3) * rec.kv),
    vBaseLN: rec.kv / Math.sqrt(3),
  };
}

/** Excitation at the rated point (rated MVA at rated power factor, lagging, rated voltage). */
export function efMax(rec: MachineRecord): number {
  const p = phasors(rec, 1, 0, rec.mva * rec.pf, rec.mva * Math.sqrt(1 - rec.pf * rec.pf));
  return p.Ef;
}

/** The step-up transformer's reactance on the machine base (the machine's reach to a stiff bus). */
export function xeOf(rec: MachineRecord, gsuMVA: number, gsuXPct: number): number {
  return (gsuXPct / 100) * (rec.mva / gsuMVA);
}

export interface Capability {
  V: number;
  armature: Array<[number, number]>;
  field: Array<[number, number]>;
  stability: Array<[number, number]>;
  turbineP: number;
  efMax: number;
  xe: number;
}

/** The capability curve's boundaries at terminal voltage V, as (P, Q) points in pu (machine base). */
export function capability(rec: MachineRecord, V: number, xe: number, n = 90): Capability {
  const ef = efMax(rec);
  const arm: Array<[number, number]> = [];
  const fld: Array<[number, number]> = [];
  const stb: Array<[number, number]> = [];
  const rA = V;
  const cF = -(V * V) / rec.xd;
  const rF = (V * ef) / rec.xd;
  const cS = ((V * V) / 2) * (1 / xe - 1 / rec.xd);
  const rS = ((V * V) / 2) * (1 / xe + 1 / rec.xd);
  for (let k = 0; k <= n; k++) {
    const a = -Math.PI / 2 + (Math.PI * k) / n;
    arm.push([rA * Math.cos(a), rA * Math.sin(a)]);
  }
  // field circle: the arc with P ≥ 0 and above the armature limit's lagging corner region
  for (let k = 0; k <= n; k++) {
    const a = (Math.PI / 2) * (k / n);
    fld.push([rF * Math.cos(Math.PI / 2 - a) * 1, cF + rF * Math.sin(Math.PI / 2 - a)]);
  }
  // stability circle, lower arc for P ≥ 0
  for (let k = 0; k <= n; k++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (k / n);
    stb.push([rS * Math.cos(a), cS + rS * Math.sin(a)]);
  }
  return { V, armature: arm, field: fld, stability: stb, turbineP: rec.turbineMW / rec.mva, efMax: ef, xe };
}

export interface Margins {
  /** Each limit's use: 1 = at the limit. */
  armature: number;
  field: number;
  turbine: number;
  /** Under-excited stability: distance inside the circle as a fraction of its radius (1 = on it). */
  stability: number;
}

export function margins(p: Phasors, cap: Capability): Margins {
  const cS = ((p.V * p.V) / 2) * (1 / cap.xe - 1 / p.rec.xd);
  const rS = ((p.V * p.V) / 2) * (1 / cap.xe + 1 / p.rec.xd);
  return {
    armature: p.I,
    field: p.Ef / cap.efMax,
    turbine: p.P / cap.turbineP,
    stability: Math.hypot(p.P, p.Q - cS) / rS,
  };
}
