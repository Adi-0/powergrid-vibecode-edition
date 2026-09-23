import type { CoupledPoint } from './coupling';

/**
 * The substation and feeder as solved for one interval, coupled to the transmission
 * solution at the Evergreen 60 kV bus: flat arrays in the order of the feeder model's
 * own nodes, branches and loads (the drawing thread builds the same model, so indices
 * line up). Volts, amperes, watts and vars, as the distribution solver works.
 */
export interface FeederSnap {
  hour: number;
  /** Bank tap changer position (steps of 0.625 %). */
  ltcStep: number;
  /** Feeder regulator taps, per phase (−16 … +16). */
  regTaps: [number, number, number];
  /** Transmission ↔ distribution passes until both sides agreed, and the last change, VA. */
  couplingPasses: number;
  couplingChangeVA: number;
  /** The 60 kV bus as the transmission solution left it: per unit and degrees. */
  sourcePu: number;
  sourceDeg: number;
  /** Power into the substation from the 60 kV bus, W and var. */
  boundaryP: number;
  boundaryQ: number;
  /** Power into feeder 1105 at its breaker, W and var. */
  headP: number;
  headQ: number;
  /** Node voltages (V), re/im per phase a, b, c: 6 per node. */
  V: Float64Array;
  /** Per branch: P and Q entering at the from end, P and Q leaving at the to end (W, var). */
  flows: Float64Array;
  /** Per load (feederLoads order): P and Q actually drawn (W, var; negative: rooftop solar). */
  loadP: Float64Array;
  loadQ: Float64Array;
  loadIds: string[];
  /** Capacitor bank output, var (positive: supplied). */
  capQ: number;
  lossesP: number;
  lossesQ: number;
  converged: boolean;
}

export function feederSnap(cp: CoupledPoint): FeederSnap {
  const fs = cp.feeder;
  const r = fs.result;
  const nodes = [...fs.net.nodes.keys()];
  const V = new Float64Array(nodes.length * 6);
  nodes.forEach((n, i) => {
    const v = r.V.get(n);
    if (!v) return;
    for (let p = 0; p < 3; p++) {
      V[i * 6 + 2 * p] = v[p]!.re;
      V[i * 6 + 2 * p + 1] = v[p]!.im;
    }
  });
  const flows = new Float64Array(fs.net.branches.length * 4);
  fs.net.branches.forEach((b, k) => {
    const br = r.branch.get(b.id);
    if (!br) return;
    flows[k * 4] = br.Sf.re;
    flows[k * 4 + 1] = br.Sf.im;
    flows[k * 4 + 2] = br.St.re;
    flows[k * 4 + 3] = br.St.im;
  });
  const loadIds = fs.net.loads.map((l) => l.id);
  const loadP = Float64Array.from(fs.net.loads, (l) => r.loadS.get(l.id)?.re ?? 0);
  const loadQ = Float64Array.from(fs.net.loads, (l) => r.loadS.get(l.id)?.im ?? 0);
  const reg = r.taps.get('REG-1') ?? [0, 0, 0];
  const last = cp.history[cp.history.length - 1];
  return {
    hour: fs.hour,
    ltcStep: fs.ltcStep,
    regTaps: [reg[0], reg[1], reg[2]],
    couplingPasses: cp.iterations,
    couplingChangeVA: cp.lastChangeVA,
    sourcePu: last?.vPu ?? 0,
    sourceDeg: last?.angleDeg ?? 0,
    boundaryP: fs.substationS.re,
    boundaryQ: fs.substationS.im,
    headP: fs.feederHeadS.re,
    headQ: fs.feederHeadS.im,
    V,
    flows,
    loadP,
    loadQ,
    loadIds,
    capQ: [...r.capQ.values()].reduce((a, b) => a + b, 0),
    lossesP: r.losses.re,
    lossesQ: r.losses.im,
    converged: r.converged,
  };
}

export function feederTransferables(f: FeederSnap): ArrayBuffer[] {
  return [f.V, f.flows, f.loadP, f.loadQ].map((a) => a.buffer as ArrayBuffer);
}
