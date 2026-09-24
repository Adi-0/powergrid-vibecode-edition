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
  src: 'estimate' as SourceId,
};
