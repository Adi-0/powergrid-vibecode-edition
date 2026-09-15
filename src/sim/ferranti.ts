/**
 * The Ferranti effect: a long line whose far end is higher than its near end.
 *
 * It is the first result in transmission engineering that feels wrong. Voltage
 * falls along a wire — everybody knows that, and on a distribution feeder it is
 * all that ever happens. But energise three hundred kilometres of 500 kV line
 * and leave the far end OPEN, and the far end comes out several per cent HIGHER
 * than the end you energised it from.
 *
 * WHY. A transmission line is not only a series impedance. It is also a
 * capacitor, distributed along its whole length: two conductors separated by
 * air, at a potential difference, is the definition of one. With the far end
 * open there is no load current, but there IS charging current — the line
 * charging its own capacitance — and that current is drawn through the series
 * reactance of the line. A capacitive current through an inductive reactance
 * produces a voltage RISE, not a drop, because the two are 180° apart. So the
 * voltage climbs as you go along the line.
 *
 * THE ARITHMETIC, three ways, which is the reason this is worth building:
 *
 *   nominal π   V_r/V_s = 1 / (1 − XB/2)      what the solver's model gives
 *   exact       V_r/V_s = 1 / cos(βl)          the distributed-parameter answer
 *   solved      whatever the power flow says with the far end genuinely open
 *
 * The three agree closely for a few hundred kilometres and part company beyond
 * that, which is exactly the point at which a real study stops using the
 * nominal π model. Showing all three makes the modelling assumption visible
 * instead of silent.
 *
 * WHY ANYONE CARES. It is why a long line is not energised from one end without
 * thinking: the far-end voltage can exceed equipment ratings before a single
 * customer is connected. It is why shunt reactors exist, and why the first
 * switching step in a line energisation procedure is usually to put one in.
 */

import { NetworkCase, cloneCase, Bus } from '../core/network.js';
import { SolvedCase, analyse } from '../core/results.js';
import { solvePowerFlow } from '../core/powerflow.js';

export interface FerrantiStudy {
  branchId: string;
  branchName: string;
  lengthKm: number;
  baseKV: number;
  /** Per-unit series and shunt parameters of the line, on the system base. */
  r: number;
  x: number;
  b: number;
  /** Sending-end voltage, per-unit — the bus the line is energised from. */
  sendingPU: number;
  /** Receiving-end voltage with the far end open, per-unit, from the solve. */
  openEndPU: number;
  /** The same ratio from the nominal π model, by hand. */
  nominalPiRatio: number;
  /** And from the exact distributed-parameter equations. */
  exactRatio: number;
  /** Electrical length βl, radians, and in degrees for the readouts. */
  betaL: number;
  /** Charging current the line draws at the sending end, amperes. */
  chargingAmps: number;
  /** Reactive power the open line generates, MVAr. */
  chargingMVAr: number;
  /** Whether the solve converged at all. */
  converged: boolean;
}

/**
 * Energise the line from one end and leave the other open.
 *
 * This is done the way it is actually done in a control room: a SECOND circuit
 * of the same construction is energised from the sending bus with its far
 * breaker still open. The existing circuit stays in service, so the rest of the
 * network is undisturbed and the sending-end voltage is whatever the system
 * genuinely holds it at — which matters, because taking a 500 kV intertie out
 * of service to demonstrate a voltage rise would collapse half the state and
 * teach the wrong lesson loudly.
 *
 * The open end is a real bus in a real case solved by the real solver, not an
 * analytical special case bolted on the side.
 */
export function ferrantiStudy(net: NetworkCase, branchId: string): FerrantiStudy | null {
  const original = net.branches.find((b) => b.id === branchId);
  if (!original || original.kind !== 'line' || original.b <= 0) return null;

  const study = cloneCase(net);
  const br = study.branches.find((b) => b.id === branchId);
  if (!br) return null;
  const fromBus = study.buses.find((b) => b.id === br.from);
  const toBus = study.buses.find((b) => b.id === br.to);
  if (!fromBus || !toBus) return null;

  const openBus: Bus = {
    id: `${branchId}_OPEN`,
    name: `${toBus.name} — open end`,
    type: 'PQ',
    baseKV: toBus.baseKV,
    vMin: 0.9,
    vMax: 1.15,
    area: toBus.area,
  };
  study.buses.push(openBus);
  study.branches.push({
    ...br,
    id: `${branchId}_ENERGISE`,
    name: `${br.name} — energised, far end open`,
    to: openBus.id,
  });

  const pf = solvePowerFlow(study, {
    tol: 1e-9, init: 'dc', enforceQLimits: true, maxIterations: 40,
  });
  const solved: SolvedCase = analyse(study, pf);
  const sending = solved.busById.get(br.from);
  const open = solved.busById.get(openBus.id);

  // The nominal π model, by hand, from the branch's own per-unit parameters.
  // With the far end open the only current through the series branch is the
  // charging current of the receiving-end shunt, so V_s = V_r · (1 + Z·Y/2),
  // and with Z ≈ jX and Y = jB that denominator is (1 − XB/2).
  const nominalPiRatio = 1 / (1 - (original.x * original.b) / 2);

  // The exact answer treats the line as distributed rather than lumped:
  // V_r/V_s = 1/cos(βl), where βl = √(XB) for a lossless line — the total
  // series reactance times the total shunt susceptance, under a square root.
  const betaL = Math.sqrt(Math.max(0, original.x * original.b));
  const exactRatio = 1 / Math.cos(betaL);

  const vBase = toBus.baseKV;
  // Half the line's susceptance sits at each end of the π, so the reactive
  // power it generates is the two halves at their own voltages. Every var of
  // it has to be absorbed by the system, which is the operational problem.
  const vs = sending?.vpu ?? 1;
  const vr = open?.vpu ?? 1;
  const chargingMVAr = ((original.b / 2) * vs * vs + (original.b / 2) * vr * vr)
    * net.baseMVA;
  // The current in the series branch is what the RECEIVING-end shunt draws,
  // because there is nothing else beyond it.
  const seriesCurrentPU = vr * (original.b / 2);
  const chargingAmps =
    (seriesCurrentPU * net.baseMVA * 1e6) / (Math.sqrt(3) * vBase * 1000);

  return {
    branchId,
    branchName: original.name,
    lengthKm: original.lengthKm ?? 0,
    baseKV: vBase,
    r: original.r,
    x: original.x,
    b: original.b,
    sendingPU: sending?.vpu ?? 1,
    openEndPU: open?.vpu ?? 1,
    nominalPiRatio,
    exactRatio,
    betaL,
    chargingAmps,
    chargingMVAr,
    converged: pf.converged,
  };
}

/** Lines long enough for the effect to be worth showing, longest first. */
export function ferrantiCandidates(net: NetworkCase): string[] {
  return net.branches
    .filter((b) => b.kind === 'line' && b.inService && (b.lengthKm ?? 0) > 120 && b.b > 0)
    .sort((a, b) => (b.lengthKm ?? 0) - (a.lengthKm ?? 0))
    .map((b) => b.id);
}
