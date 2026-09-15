/**
 * Overcurrent protection, and the reason it has curves rather than thresholds.
 *
 * THE PROBLEM. A fault has to be cleared by the device NEAREST to it, and by no
 * other. If a tree falls on one street, the fuse on that street should blow and
 * the substation breaker should not: otherwise one branch failing takes out four
 * thousand customers instead of forty.
 *
 * But every device in the chain sees the same fault current, because they are
 * all in series with it. A plain threshold cannot distinguish them — they would
 * all operate at once, and the fastest would win by accident.
 *
 * THE ANSWER IS TIME. Each device is given a characteristic of operating time
 * against current, and the characteristics are arranged so that at every fault
 * current the downstream device is always faster than the one behind it, by
 * enough margin to be sure. The upstream device does not trip because the
 * downstream one has already cleared the fault and the current has gone. That
 * arrangement is COORDINATION, and it is the single most important idea in
 * distribution protection.
 *
 * THE CURVES ARE INVERSE. The bigger the overcurrent, the sooner the device
 * acts — because a bigger current means the fault is closer, and because damage
 * accumulates as I²t so a large current can be tolerated for far less time. The
 * shapes are standardised so that devices from different manufacturers
 * coordinate with each other.
 */

/**
 * IEEE C37.112 inverse-time characteristic.
 *
 *              ⎛      A        ⎞
 *     t = TD · ⎜ ───────────── + B ⎟
 *              ⎝ (I/I_s)^p − 1     ⎠
 *
 * I_s is the PICKUP: the current at which the device starts timing at all.
 * Below it, nothing happens, ever. TD is the TIME DIAL, which slides the whole
 * curve up and down without changing its shape — that is the setting an engineer
 * actually adjusts to achieve coordination.
 *
 * The (I/I_s)^p − 1 in the denominator is what makes the curve asymptotic at
 * pickup: as the current approaches I_s from above, the operating time goes to
 * infinity. A relay at 1.01 times pickup never trips.
 */
export interface CurveShape {
  id: string;
  name: string;
  a: number;
  b: number;
  p: number;
  standard: string;
  /** When this shape is the right choice, in one line. */
  use: string;
}

export const CURVE_SHAPES: Record<string, CurveShape> = {
  moderately: {
    id: 'moderately', name: 'Moderately inverse',
    a: 0.0515, b: 0.1140, p: 0.02,
    standard: 'IEEE C37.112-1996',
    use:
      'Nearly flat. Used where the fault current barely changes along the ' +
      'protected circuit, so a steeper curve would give no discrimination.',
  },
  very: {
    id: 'very', name: 'Very inverse',
    a: 19.61, b: 0.491, p: 2.0,
    standard: 'IEEE C37.112-1996',
    use:
      'The usual choice on a distribution feeder, where the fault current ' +
      'falls off sharply with distance and a steep curve turns that into time ' +
      'discrimination.',
  },
  extremely: {
    id: 'extremely', name: 'Extremely inverse',
    a: 28.2, b: 0.1217, p: 2.0,
    standard: 'IEEE C37.112-1996',
    use:
      'Steeper still, and shaped to match the melting curve of a fuse — which ' +
      'is what it has to coordinate with on a feeder full of them. Also ' +
      'tolerates the inrush when a whole feeder is re-energised.',
  },
};

export type DeviceKind = 'fuse' | 'recloser' | 'breaker' | 'relay';

export interface ProtectiveDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  /** ANSI/IEEE C37.2 device number this element is. */
  device: string;
  /** Pickup current in primary amperes — the current in the actual conductor. */
  pickupA: number;
  /** Time dial. Larger is slower. */
  timeDial: number;
  curve: keyof typeof CURVE_SHAPES;
  /**
   * Instantaneous element pickup, primary amperes, if it has one. Above this
   * the device operates with no intentional delay at all.
   */
  instantaneousA?: number;
  /** How long the interrupting device itself takes once told to open, seconds. */
  mechanismS: number;
  /** Where in the chain it is: 0 is furthest from the source. */
  position: number;
  /**
   * The largest fault current this device can ever see for a fault in its OWN
   * protected zone, amperes.
   *
   * Coordination only has to hold over the currents a fault downstream can
   * actually produce. Above that, no downstream fault exists to coordinate
   * with, and an upstream instantaneous element may quite properly be faster —
   * that is what an instantaneous element is FOR. Checking a pair beyond this
   * current asks a question with no physical meaning and produces failures
   * that are not failures.
   */
  maxZoneFaultA?: number;
  note: string;
}

/**
 * How long a device takes to clear, at a given current.
 *
 * Returns null if the current is below pickup, which means "never" rather than
 * "a very long time" — and that distinction matters, because a device below
 * pickup is not slow, it is absent.
 */
export function operatingTime(d: ProtectiveDevice, currentA: number): number | null {
  if (d.instantaneousA !== undefined && currentA >= d.instantaneousA) {
    return d.mechanismS;
  }
  const m = currentA / d.pickupA;
  if (m <= 1.0) return null;
  const c = CURVE_SHAPES[d.curve];
  const t = d.timeDial * (c.a / (Math.pow(m, c.p) - 1) + c.b);
  return t + d.mechanismS;
}

export interface CoordinationCheck {
  downstream: ProtectiveDevice;
  upstream: ProtectiveDevice;
  currentA: number;
  downstreamS: number | null;
  upstreamS: number | null;
  /** How much later the upstream device would act, seconds. */
  marginS: number | null;
  ok: boolean;
}

/**
 * The coordinating time interval.
 *
 * Between two devices in series there has to be enough time for the downstream
 * one to clear the fault AND for the upstream one to notice it has, with margin
 * for the errors in both. A fifth to a third of a second is the usual figure,
 * and it is made of four things: the downstream breaker's own opening time, the
 * upstream relay's overtravel after the current goes, the error in both curves,
 * and a safety factor.
 */
export const COORDINATING_INTERVAL_S = 0.25;

/** Check one pair of devices at one fault current. */
export function checkCoordination(
  downstream: ProtectiveDevice,
  upstream: ProtectiveDevice,
  currentA: number,
  intervalS = COORDINATING_INTERVAL_S
): CoordinationCheck {
  const d = operatingTime(downstream, currentA);
  const u = operatingTime(upstream, currentA);
  // If the upstream device does not see enough current to operate at all, the
  // pair is trivially coordinated: it cannot mis-operate.
  if (u === null) {
    return {
      downstream, upstream, currentA,
      downstreamS: d, upstreamS: null, marginS: null, ok: true,
    };
  }
  if (d === null) {
    // The downstream device cannot clear this and the upstream one will. That
    // is not a coordination failure; it is the upstream device doing its job as
    // backup.
    return {
      downstream, upstream, currentA,
      downstreamS: null, upstreamS: u, marginS: null, ok: true,
    };
  }
  const margin = u - d;
  return {
    downstream, upstream, currentA,
    downstreamS: d, upstreamS: u,
    marginS: margin,
    ok: margin >= intervalS,
  };
}

/**
 * Check a whole chain across a range of fault currents.
 *
 * Coordination is not a property of a pair of settings; it is a property of a
 * pair of settings ACROSS EVERY CURRENT THEY WILL BOTH SEE. Two curves can be
 * comfortably apart at one current and cross at another, and the crossing point
 * is exactly where a fault will eventually happen.
 */
export function checkChain(
  chain: readonly ProtectiveDevice[],
  currents: readonly number[],
  intervalS = COORDINATING_INTERVAL_S
): CoordinationCheck[] {
  const ordered = [...chain].sort((a, b) => a.position - b.position);
  const out: CoordinationCheck[] = [];
  for (let i = 0; i + 1 < ordered.length; i++) {
    const downstream = ordered[i];
    const limit = downstream.maxZoneFaultA ?? Infinity;
    for (const a of currents) {
      // Only over the currents a fault in the downstream device's own zone can
      // produce. See `maxZoneFaultA`.
      if (a > limit) continue;
      out.push(checkCoordination(downstream, ordered[i + 1], a, intervalS));
    }
  }
  return out;
}

/** Which device clears a given fault, and how long it takes. */
export function firstToOperate(
  chain: readonly ProtectiveDevice[], currentA: number
): { device: ProtectiveDevice; seconds: number } | null {
  let best: { device: ProtectiveDevice; seconds: number } | null = null;
  for (const d of chain) {
    const t = operatingTime(d, currentA);
    if (t === null) continue;
    if (!best || t < best.seconds) best = { device: d, seconds: t };
  }
  return best;
}
