import type { SourceId } from '../sources';

/**
 * Protection on feeder 1105: what opens, and how fast, for a given current.
 *
 * Relay characteristics are IEEE C37.112's inverse-time equations:
 *   operate  t(M) = TDS · (A / (M^p − 1) + B)          M = I / I_pickup > 1
 *   reset    t_r(M) = TDS · t_r / (1 − M²)             M < 1
 * with the standard's constants for moderately, very and extremely inverse curves.
 * Device function numbers are IEEE C37.2's: 50 instantaneous overcurrent, 51 time
 * overcurrent, 50N/51N their ground (residual 3I₀) versions, 52 the breaker, 79 the
 * reclosing relay.
 *
 * Settings are this feeder's own (estimates), chosen from its fault currents so that
 * the devices coordinate: the lateral fuse clears a permanent fault before the
 * recloser's delayed (slow) trip; the recloser's fast trip beats the fuse where the fault
 * current allows it (fuse saving); the breaker's relay waits a coordination time
 * interval (CTI) behind the recloser at the largest fault the recloser sees; the
 * breaker's instantaneous element reaches only faults between it and the recloser.
 */
export const C37_112 = {
  MI: { A: 0.0515, B: 0.114, p: 0.02, tr: 4.85, name: 'moderately inverse' },
  VI: { A: 19.61, B: 0.491, p: 2.0, tr: 21.6, name: 'very inverse' },
  EI: { A: 28.2, B: 0.1217, p: 2.0, tr: 29.1, name: 'extremely inverse' },
  src: 'c37112' as SourceId,
} as const;

export type CurveId = 'MI' | 'VI' | 'EI';

export interface TocSetting {
  curve: CurveId;
  /** Pickup current, A (primary). */
  pickup: number;
  /** Time dial setting. */
  tds: number;
}

export const PROTECTION = {
  /** Coordination time interval between series time-overcurrent devices, s (Blackburn's family: 0.2–0.4 s). */
  cti: 0.3,
  breaker: {
    id: 'CB-1105',
    /** 52: breaker opening time after the relay operates, s (three cycles). */
    openS: 0.05,
    p51: { curve: 'VI', pickup: 600, tds: 1.5 } as TocSetting,
    n51: { curve: 'VI', pickup: 240, tds: 1.7 } as TocSetting,
    /**
     * 50 / 50N instantaneous pickups, A: above the largest fault the recloser or a
     * lateral fuse must clear (the 10.1 kA at the first node of lateral L2), so the
     * breaker reaches instantly only faults on the trunk near the substation.
     */
    p50: 11000,
    n50: 11000,
    /**
     * Reset after current stops: a numerical relay set to reset instantly. (C37.112's
     * electromechanical reset characteristic, t_r = TDS·t_r/(1 − M²), would let the
     * relay's travel ratchet up over the recloser's shots and trip the breaker too.)
     */
    reset: 'instantaneous' as 'instantaneous' | 'electromechanical',
    /** Relay operating time of an instantaneous element, s. */
    instS: 0.02,
  },
  recloser: {
    id: 'RCL-1',
    /** Minimum trip, phase and ground, A. */
    phaseMin: 280,
    groundMin: 140,
    /** Fast curve: a short definite time, s (sensing plus interrupting). */
    fastS: 0.05,
    /** Delayed (slow) curve: C37.112 very inverse, plus interrupting time. */
    slow: { curve: 'VI', tds: 1.0 } as { curve: CurveId; tds: number },
    interruptS: 0.03,
    /** 79: two fast then two slow trips; open intervals before each reclose, s; lockout after the fourth trip. */
    sequence: ['fast', 'fast', 'slow', 'slow'] as const,
    reclosesS: [2, 2, 5],
  },
  fuse: {
    /** Lateral tap fuses: 100T expulsion links. */
    rating: 100,
    /**
     * Minimum-melt curve fitted to the shape of a T-link's (not a manufacturer's
     * table): t_mm = K / ((I / I_m)² − 1), I_m the 300-second melting current. The
     * total-clearing curve adds arcing: t_tc = 1.15 t_mm + 0.012 s.
     */
    imOverRating: 2.2,
    K: 15,
    clearFactor: 1.15,
    arcS: 0.012,
  },
  src: 'estimate' as SourceId,
};
