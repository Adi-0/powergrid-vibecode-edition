/**
 * Derived quantities from a solved power flow.
 *
 * Everything here is computed from the solver's voltage vector and the network
 * data. Nothing in this file is a constant: if a number appears in the UI it
 * came through here, and the intermediate steps are all exposed so that the
 * math panel can show the work rather than just the answer.
 */

import { Complex, C, polar, abs, arg, conj, mul, add, toDeg } from './complex.js';
import { NetworkCase, indexCase, CaseIndex, Branch } from './network.js';
import { branchAdmittance } from './ybus.js';
import { PowerFlowResult } from './powerflow.js';

/** Everything worth knowing about the flow on one branch. */
export interface BranchFlow {
  branchId: string;
  from: string;
  to: string;
  inService: boolean;
  /** Voltage at each end, per-unit complex. */
  vFrom: Complex;
  vTo: Complex;
  /** Current leaving the `from` bus into the branch, per-unit. */
  iFrom: Complex;
  /** Current leaving the `to` bus into the branch, per-unit. */
  iTo: Complex;
  /** Complex power S = P + jQ entering at the `from` end, per-unit. */
  sFrom: Complex;
  /** Complex power entering at the `to` end, per-unit. Negative of what exits. */
  sTo: Complex;
  /** Loss in the branch, per-unit: S_from + S_to. Real part is I²R heating. */
  sLoss: Complex;
  // --- physical units, for display ---
  pFromMW: number;
  qFromMVAr: number;
  pToMW: number;
  qToMVAr: number;
  pLossMW: number;
  qLossMVAr: number;
  /** Apparent power |S| at the more heavily loaded end, MVA. */
  sMaxMVA: number;
  /** Loading as a fraction of the normal thermal rating. 1.0 = at the limit. */
  loading: number;
  /** Current magnitude at the `from` end, in amperes (line current). */
  iFromAmps: number;
  iToAmps: number;
  /** Angle across the branch, degrees: θ_from − θ_to. Drives real power flow. */
  angleDiffDeg: number;
  /** Direction real power actually travels: 'forward' is from→to. */
  direction: 'forward' | 'reverse' | 'none';
}

export interface BusResult {
  busId: string;
  index: number;
  /** Voltage magnitude, per-unit, and in kV line-to-line. */
  vpu: number;
  vkV: number;
  /** Voltage angle, degrees. */
  angleDeg: number;
  /** Net injection, MW / MVAr (generation minus load). */
  pInjMW: number;
  qInjMVAr: number;
  /** Generation and load at this bus, MW / MVAr. */
  pGenMW: number;
  qGenMVAr: number;
  pLoadMW: number;
  qLoadMVAr: number;
  type: 'slack' | 'PV' | 'PQ';
  /** Outside the bus's stated per-unit limits? The one thing drawn in colour. */
  voltageViolation: 'under' | 'over' | null;
}

export interface SystemResult {
  pGenMW: number;
  qGenMVAr: number;
  pLoadMW: number;
  qLoadMVAr: number;
  pLossMW: number;
  qLossMVAr: number;
  /** Shunt reactive contribution (line charging + capacitor banks), MVAr. */
  qShuntMVAr: number;
  /** Balance residual, MW. Conservation requires this to be ~0. */
  pBalanceMW: number;
  qBalanceMVAr: number;
  /** Loss as a percentage of generation — the headline efficiency number. */
  lossPercent: number;
  overloadedBranches: string[];
  voltageViolations: string[];
}

export interface SolvedCase {
  net: NetworkCase;
  pf: PowerFlowResult;
  idx: CaseIndex;
  buses: BusResult[];
  branches: BranchFlow[];
  system: SystemResult;
  busById: Map<string, BusResult>;
  branchById: Map<string, BranchFlow>;
}

/**
 * Flow on one branch, from the two end voltages and the branch's pi model.
 *
 *   I_ft = Y_ff·V_f + Y_ft·V_t        (current into the branch at the from end)
 *   S_ft = V_f · conj(I_ft)           (complex power in at the from end)
 * and symmetrically at the to end. The two do not sum to zero — the
 * difference is what the branch consumed.
 */
export function computeBranchFlow(
  br: Branch,
  vFrom: Complex,
  vTo: Complex,
  baseMVA: number,
  baseKVFrom: number,
  baseKVTo: number
): BranchFlow {
  if (!br.inService) {
    const zero = C(0, 0);
    return {
      branchId: br.id, from: br.from, to: br.to, inService: false,
      vFrom, vTo, iFrom: zero, iTo: zero, sFrom: zero, sTo: zero, sLoss: zero,
      pFromMW: 0, qFromMVAr: 0, pToMW: 0, qToMVAr: 0, pLossMW: 0, qLossMVAr: 0,
      sMaxMVA: 0, loading: 0, iFromAmps: 0, iToAmps: 0,
      angleDiffDeg: toDeg(arg(vFrom) - arg(vTo)), direction: 'none',
    };
  }
  const ba = branchAdmittance(br);
  const iFrom = add(mul(ba.yff, vFrom), mul(ba.yft, vTo));
  const iTo = add(mul(ba.ytf, vFrom), mul(ba.ytt, vTo));
  const sFrom = mul(vFrom, conj(iFrom));
  const sTo = mul(vTo, conj(iTo));
  const sLoss = add(sFrom, sTo);

  const pFromMW = sFrom.re * baseMVA;
  const qFromMVAr = sFrom.im * baseMVA;
  const pToMW = sTo.re * baseMVA;
  const qToMVAr = sTo.im * baseMVA;
  const sMaxMVA = Math.max(abs(sFrom), abs(sTo)) * baseMVA;

  // Base current I_base = S_base / (√3 · V_base), the standard three-phase base.
  const iBaseFrom = (baseMVA * 1e6) / (Math.sqrt(3) * baseKVFrom * 1e3);
  const iBaseTo = (baseMVA * 1e6) / (Math.sqrt(3) * baseKVTo * 1e3);

  return {
    branchId: br.id, from: br.from, to: br.to, inService: true,
    vFrom, vTo, iFrom, iTo, sFrom, sTo, sLoss,
    pFromMW, qFromMVAr, pToMW, qToMVAr,
    pLossMW: sLoss.re * baseMVA,
    qLossMVAr: sLoss.im * baseMVA,
    sMaxMVA,
    loading: br.ratingMVA > 0 ? sMaxMVA / br.ratingMVA : 0,
    iFromAmps: abs(iFrom) * iBaseFrom,
    iToAmps: abs(iTo) * iBaseTo,
    angleDiffDeg: toDeg(arg(vFrom) - arg(vTo)),
    direction: Math.abs(pFromMW) < 1e-9 ? 'none' : pFromMW > 0 ? 'forward' : 'reverse',
  };
}

export function analyse(net: NetworkCase, pf: PowerFlowResult): SolvedCase {
  const idx = indexCase(net);
  const V = net.buses.map((_, i) => polar(pf.vm[i], pf.va[i]));

  const branches = net.branches.map((br) => {
    const f = idx.indexOf.get(br.from)!;
    const t = idx.indexOf.get(br.to)!;
    return computeBranchFlow(
      br, V[f], V[t], net.baseMVA, net.buses[f].baseKV, net.buses[t].baseKV
    );
  });

  // Generation and load per bus.
  const pGen = new Map<string, number>();
  const qGen = new Map<string, number>();
  const pLoad = new Map<string, number>();
  const qLoad = new Map<string, number>();
  for (const l of net.loads) {
    pLoad.set(l.bus, (pLoad.get(l.bus) ?? 0) + l.pMW);
    qLoad.set(l.bus, (qLoad.get(l.bus) ?? 0) + l.qMVAr);
  }
  for (const g of net.generators) {
    if (!g.inService) continue;
    pGen.set(g.bus, (pGen.get(g.bus) ?? 0) + g.pMW);
    qGen.set(g.bus, (qGen.get(g.bus) ?? 0) + g.qMVAr);
  }

  // Which buses actually have a machine on them. This is not the same as
  // "which buses are PV": a plant dispatched to zero megawatts is still
  // connected, and if the reactive-limit loop has pinned its bus at a limit it
  // is producing reactive power even though it is producing no real power. A
  // bus that has a machine on it has its reactive output DETERMINED BY THE
  // SOLVER, whatever its real output happens to be.
  const hasMachine = new Set(net.generators.filter((g) => g.inService).map((g) => g.bus));

  const buses: BusResult[] = net.buses.map((b, i) => {
    const vpu = pf.vm[i];
    const pInjMW = pf.pInj[i] * net.baseMVA;
    const qInjMVAr = pf.qInj[i] * net.baseMVA;
    const lp = pLoad.get(b.id) ?? 0;
    const lq = qLoad.get(b.id) ?? 0;
    // At the slack bus the solver determines real generation too.
    const gp = pf.finalType[i] === 'slack' ? pInjMW + lp : pGen.get(b.id) ?? 0;
    const gq = hasMachine.has(b.id) ? qInjMVAr + lq : qGen.get(b.id) ?? 0;
    const vMin = b.vMin ?? 0.95;
    const vMax = b.vMax ?? 1.05;
    return {
      busId: b.id, index: i, vpu,
      vkV: vpu * b.baseKV,
      angleDeg: toDeg(pf.va[i]),
      pInjMW, qInjMVAr,
      pGenMW: gp, qGenMVAr: gq,
      pLoadMW: lp, qLoadMVAr: lq,
      type: pf.finalType[i],
      voltageViolation: vpu < vMin ? 'under' : vpu > vMax ? 'over' : null,
    };
  });

  let pGenTot = 0, qGenTot = 0, pLossTot = 0, qLossTot = 0;
  for (const b of buses) { pGenTot += b.pGenMW; qGenTot += b.qGenMVAr; }
  for (const f of branches) { pLossTot += f.pLossMW; qLossTot += f.qLossMVAr; }
  let pLoadTot = 0, qLoadTot = 0;
  for (const l of net.loads) { pLoadTot += l.pMW; qLoadTot += l.qMVAr; }

  // Reactive power produced by shunt elements: line charging is already inside
  // qLoss (as a negative), so this counts only bus shunts and capacitor banks.
  let qShunt = 0;
  net.buses.forEach((b, i) => {
    if (b.bShunt) qShunt += b.bShunt * pf.vm[i] * pf.vm[i] * net.baseMVA;
  });
  for (const sh of net.shunts ?? []) {
    if (!sh.inService) continue;
    const i = idx.indexOf.get(sh.bus)!;
    qShunt += sh.qMVAr * pf.vm[i] * pf.vm[i];
  }

  const system: SystemResult = {
    pGenMW: pGenTot, qGenMVAr: qGenTot,
    pLoadMW: pLoadTot, qLoadMVAr: qLoadTot,
    pLossMW: pLossTot, qLossMVAr: qLossTot,
    qShuntMVAr: qShunt,
    pBalanceMW: pGenTot - pLoadTot - pLossTot,
    qBalanceMVAr: qGenTot + qShunt - qLoadTot - qLossTot,
    lossPercent: pGenTot !== 0 ? (pLossTot / pGenTot) * 100 : 0,
    overloadedBranches: branches.filter((b) => b.loading > 1).map((b) => b.branchId),
    voltageViolations: buses.filter((b) => b.voltageViolation).map((b) => b.busId),
  };

  return {
    net, pf, idx, buses, branches, system,
    busById: new Map(buses.map((b) => [b.busId, b])),
    branchById: new Map(branches.map((b) => [b.branchId, b])),
  };
}

/** Solve and analyse in one step — the normal entry point for the app. */
