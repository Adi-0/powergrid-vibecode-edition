import type { SourceId } from './sources';

/**
 * Constants of the component levels (a transformer or a circuit breaker opened up to
 * show how it works). Each is a display choice or a typical value, marked as such.
 */
export const COMPONENTS = {
  /** System frequency, Hz (North America). */
  fHz: 60,
  /**
   * How much slower than real time the component levels show alternating quantities
   * (the flux in a core, the currents in a breaker): a 60 Hz cycle, which takes 1/60 s,
   * shown over 2 s. A display choice, not a physical value.
   */
  slowdown: 120,
  /** Drawn turns in a transformer's highest-voltage winding (the others in proportion). */
  drawnTurns: 32,
  /**
   * A high-voltage SF6 breaker opening and closing, ms from the command: typical
   * values for a breaker of the three-cycle interrupting class (estimates, not one
   * manufacturer's figures).
   */
  breaker: {
    /** Trip coil and latch: until the contacts start to move. */
    moveMs: 12,
    /** Until the arcing contacts part (the arc strikes). */
    partMs: 25,
    /** Until the contacts are fully open. */
    fullMs: 45,
    /** The shortest arc the gas blast can put out at a current zero. */
    minArcMs: 5,
    /** Closing: the contacts start to move, and are home. */
    closeMoveMs: 30,
    closeHomeMs: 65,
    /** Rated interrupting time, cycles. */
    ratedCycles: 3,
  },
  /**
   * A pole-top transformer's turns as drawn: in the real ratio of its windings'
   * voltages (7200 V to each 120 V half), far fewer of each than a real one has.
   */
  poletop: { drawnPrimary: 60, drawnHalf: 1 },
  /**
   * A switched shunt capacitor bank's construction (estimates for a plausible design,
   * not one utility's): per phase of a step, `series` groups of `parallel` cans, on
   * `tiers` insulated tiers of a stack; the cans' case (thickness along the row, width,
   * height), terminals and spacing, m; a tier's height and the pedestal, m. Each can's
   * rating follows from the step's: its share of the phase voltage and of the kvar.
   */
  capacitor: {
    series: { 230: 10, 115: 5 },
    parallel: { 230: 2, 115: 4 },
    tiers: { 230: 5, 115: 5 },
    can: { t: 0.17, w: 0.45, h: 0.9, bush: 0.3, pitch: 0.3 },
    tierH: 1.5,
    pedH: 1.0,
    /** Elements drawn in a can's section (a real one has more, thinner). */
    elements: 12,
  },
  /**
   * IEEE 18: a capacitor unit above 600 V carries a discharge device that takes it from
   * the peak of its rated voltage to 50 V or less within 5 minutes of being switched off.
   */
  discharge: { v: 50, s: 300, src: 'ieee18' as SourceId },
  src: 'estimate' as SourceId,
};
