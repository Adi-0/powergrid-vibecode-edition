import type { SourceId } from './sources';

/**
 * Synchronous machines modelled individually (the plant and machine views). Values
 * are typical of their class — a two-pole, air-cooled turbine generator of about
 * 200 MVA — inside the ranges Kundur tabulates for round-rotor machines; the specific
 * numbers are estimates. Reactances are per unit on the machine's own rating and
 * rated line-to-line voltage; time constants in seconds.
 *
 * Sequence data: positive-sequence reactances by time frame (synchronous X_d, X_q;
 * transient X′_d; subtransient X″_d), negative-sequence X_2, zero-sequence X_0. The
 * stator neutral is grounded through a high-resistance grounding transformer, as is
 * usual for a unit-connected generator, so almost no zero-sequence current reaches
 * the generator from the grid (its step-up transformer's delta winding blocks it).
 */
export interface MachineRecord {
  /** Generator id (plant-unit). */
  gen: string;
  name: string;
  /** Rating, MVA; rated terminal voltage, kV (line-to-line); rated power factor. */
  mva: number;
  kv: number;
  pf: number;
  /** Poles and speed at 60 Hz. */
  poles: number;
  /** Armature resistance and reactances, pu on the machine base. */
  ra: number;
  xd: number;
  xq: number;
  xdp: number;
  xdpp: number;
  x2: number;
  x0: number;
  xl: number;
  /** Open-circuit time constants, s. */
  td0p: number;
  td0pp: number;
  /** Turbine rating (what the prime mover can deliver), MW. */
  turbineMW: number;
  grounding: string;
  src: SourceId;
  estimate: boolean;
}

const gt = (gen: string, name: string, turbineMW: number): MachineRecord => ({
  gen,
  name,
  mva: 210,
  kv: 18,
  pf: 0.85,
  poles: 2,
  ra: 0.003,
  xd: 1.8,
  xq: 1.75,
  xdp: 0.23,
  xdpp: 0.16,
  x2: 0.16,
  x0: 0.08,
  xl: 0.14,
  td0p: 6.0,
  td0pp: 0.03,
  turbineMW,
  grounding: 'High-resistance grounded neutral (distribution transformer and resistor)',
  src: 'kundur',
  estimate: true,
});

export const MACHINES: MachineRecord[] = [
  gt('ML1-GT1', 'Gas turbine generator 1', 178.5),
  gt('ML1-GT2', 'Gas turbine generator 2', 178.5),
  { ...gt('ML1-ST', 'Steam turbine generator', 153), mva: 180, xd: 1.9, xq: 1.85 },
];
