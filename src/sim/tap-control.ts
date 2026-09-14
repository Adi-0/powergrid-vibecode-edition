/**
 * Tap changers under load.
 *
 * A transformer's turns ratio is not quite fixed. Tapped off one winding are a
 * dozen or so extra connections, and a motor-driven selector moves between them
 * without interrupting supply — an ON-LOAD TAP CHANGER. Each step is typically
 * 0.625 % of nominal, and there are sixteen either side, so the ratio can be
 * moved by about a tenth in total.
 *
 * WHAT IT IS FOR. The voltage at the end of a distribution feeder falls as the
 * load on it rises, because the current flowing through the conductor's
 * impedance drops voltage along the way. At four in the morning the far end
 * might sit at 1.02 per-unit; at six in the evening the same feeder unchanged
 * would be at 0.93, which is below what a customer's equipment is entitled to.
 * The tap changer closes that gap: it lifts the whole downstream voltage as the
 * load comes on and lets it back down as the load goes off.
 *
 * HOW THE CONTROL WORKS. It compares the regulated voltage with a setpoint and
 * moves ONE step at a time, and only when the error is outside a deadband
 * called the BANDWIDTH. Both matter. One step at a time, because a tap changer
 * is a mechanical device that takes several seconds per step and wears out. A
 * bandwidth, because without one a regulator sitting exactly on its setpoint
 * would hunt up and down forever, and the contacts would not last a month.
 *
 * Real controls add a time delay of thirty to ninety seconds on top, so a
 * momentary dip does not start the motor. This model has no time axis, so it
 * settles to where a real one would settle after the delay expired.
 */

import { NetworkCase } from '../core/network.js';
import { PowerFlowResult } from '../core/powerflow.js';

export interface TapChanger {
  /** The branch whose ratio is being moved. */
  branchId: string;
  /** The bus whose voltage the control is watching. */
  controlledBus: string;
  /** Voltage it is trying to hold there, per-unit. */
  setpointPU: number;
  /**
   * Half the deadband, per-unit. The control does nothing while the error is
   * inside it. Usually set to a little more than one step, so that a single
   * step cannot carry the voltage from one edge of the band to the other and
   * start the thing hunting.
   */
  bandwidthPU: number;
  /** Size of one step, as a fraction of nominal ratio. 0.00625 is standard. */
  stepPU: number;
  /** Step limits, inclusive. ±16 is the usual range. */
  minStep: number;
  maxStep: number;
  /** Present position, in steps from nominal. */
  step: number;
  /** Plain-language name for the UI. */
  name: string;
}

/**
 * Tap position → branch ratio.
 *
 * The tap is on the FROM side of the branch in this model, and the Ybus divides
 * the from-side self term by the ratio. So a ratio BELOW one raises the voltage
 * on the to side, which is why the sign looks inverted: step +6 gives a ratio
 * of 1 − 6×0.00625 = 0.9625, which lifts the downstream voltage by about 3.9 %.
 */
export const ratioForStep = (t: TapChanger, step: number): number =>
  1 - step * t.stepPU;

/** The regulated voltage as a percentage boost, for display. */
export const boostPercent = (t: TapChanger): number => t.step * t.stepPU * 100;

export interface TapAdjustment {
  changer: TapChanger;
  from: number;
  to: number;
  /** Voltage seen at the controlled bus before the move, per-unit. */
  observedPU: number;
  reason: 'raise' | 'lower' | 'at-limit';
}

/**
 * Move every tap changer one step toward its setpoint, and write the resulting
 * ratios into the case. Returns what moved, so the UI can say so.
 *
 * Call this, re-solve, and call it again until nothing moves.
 */
export function stepTaps(
  net: NetworkCase,
  pf: PowerFlowResult,
  changers: TapChanger[]
): TapAdjustment[] {
  const vByBus = new Map(pf.busOrder.map((id, i) => [id, pf.vm[i]]));
  const moves: TapAdjustment[] = [];

  for (const t of changers) {
    const v = vByBus.get(t.controlledBus);
    if (v === undefined) continue;
    const error = t.setpointPU - v;
    if (Math.abs(error) <= t.bandwidthPU) continue;

    const wanted = error > 0 ? t.step + 1 : t.step - 1;
    const next = Math.max(t.minStep, Math.min(t.maxStep, wanted));
    if (next === t.step) {
      moves.push({
        changer: t, from: t.step, to: t.step, observedPU: v, reason: 'at-limit',
      });
      continue;
    }
    moves.push({
      changer: t, from: t.step, to: next, observedPU: v,
      reason: error > 0 ? 'raise' : 'lower',
    });
    t.step = next;
  }

  applyTaps(net, changers);
  return moves;
}

/** Write every changer's present position into the case as a branch ratio. */
export function applyTaps(net: NetworkCase, changers: readonly TapChanger[]): void {
  const byId = new Map(net.branches.map((b) => [b.id, b]));
  for (const t of changers) {
    const br = byId.get(t.branchId);
    if (br) br.tap = ratioForStep(t, t.step);
  }
}

/**
 * The tap changers in the California model.
 *
 * Two of them, and they are the two a reader can actually see the effect of:
 * the bank that feeds the whole substation, and the regulator a third of the
 * way down the modelled feeder.
 */
export function californiaTapChangers(): TapChanger[] {
  return [
    {
      branchId: 'T_EDENVALE_115_EDENVALE_12_1',
      controlledBus: 'EDENVALE_12',
      // A little above nominal, because everything downstream of here only
      // falls: the whole feeder is below this bus.
      setpointPU: 1.025,
      bandwidthPU: 0.010,
      stepPU: 0.00625,
      minStep: -16, maxStep: 16, step: 2,
      name: 'Eden Vale 115/12.47 kV bank 1 — on-load tap changer',
    },
    {
      branchId: 'FDR_REGULATOR',
      // It watches its own output, which is the standard arrangement: a
      // regulator with line-drop compensation watches further downstream, and
      // that refinement is in the honesty register rather than here.
      controlledBus: 'FDR_F05_REG',
      setpointPU: 1.025,
      bandwidthPU: 0.010,
      stepPU: 0.00625,
      minStep: -16, maxStep: 16, step: 4,
      name: 'Cherry Lane 1201 step voltage regulator',
    },
  ];
}
