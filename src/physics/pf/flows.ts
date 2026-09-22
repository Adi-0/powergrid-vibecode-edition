import { Complex } from '../complex';
import type { PFCase } from './case';
import type { PFResult } from './acpf';
import { branchAdmittance } from './ybus';

/**
 * Branch quantities from a solved power flow, per unit on S_base.
 *
 * Complex power into a branch at an end is S = V·I* (current conjugated): with
 * V = |V|∠θ and I = |I|∠β, S = |V||I|∠(θ − β), so P = |V||I|cos(θ − β) and
 * Q = |V||I|sin(θ − β). Positive S_f means power flows into the branch at its
 * "from" end; the reference direction is from → to at both ends.
 */
export interface BranchFlow {
  inService: boolean;
  vf: Complex;
  vt: Complex;
  /** Current entering the branch at each end, per unit. */
  If: Complex;
  It: Complex;
  /** Complex power entering the branch at each end, per unit. */
  Sf: Complex;
  St: Complex;
  /** Real and reactive losses: Sf + St (I²R, and I²X − charging). */
  loss: Complex;
  /** Larger end apparent power / rating (0 when no rating). */
  loading: number;
}

export function branchFlows(c: PFCase, r: PFResult): BranchFlow[] {
  return c.branches.map((br) => {
    const vf = Complex.polar(r.vm[br.from]!, r.va[br.from]!);
    const vt = Complex.polar(r.vm[br.to]!, r.va[br.to]!);
    if (!br.inService || !r.energized[br.from] || !r.energized[br.to]) {
      return {
        inService: br.inService,
        vf,
        vt,
        If: Complex.ZERO,
        It: Complex.ZERO,
        Sf: Complex.ZERO,
        St: Complex.ZERO,
        loss: Complex.ZERO,
        loading: 0,
      };
    }
    const a = branchAdmittance(br);
    const If = a.yff.mul(vf).add(a.yft.mul(vt));
    const It = a.ytf.mul(vf).add(a.ytt.mul(vt));
    const Sf = vf.mul(If.conj());
    const St = vt.mul(It.conj());
    const smax = Math.max(Sf.abs(), St.abs()) * c.baseMVA;
    return {
      inService: true,
      vf,
      vt,
      If,
      It,
      Sf,
      St,
      loss: Sf.add(St),
      loading: br.rateMVA > 0 ? smax / br.rateMVA : 0,
    };
  });
}

/** System power balance, per unit: generation, load, losses, and what is left over. */
export interface Balance {
  gen: Complex;
  load: Complex;
  shunt: Complex;
  losses: Complex;
  /** gen − load − shunt − losses; zero to solver tolerance when the books close. */
  residual: Complex;
}

export function powerBalance(c: PFCase, r: PFResult, flows = branchFlows(c, r)): Balance {
  let gen = Complex.ZERO;
  c.gens.forEach((g, i) => {
    if (g.inService && r.energized[g.bus]) gen = gen.add(new Complex(r.pg[i]!, r.qg[i]!));
  });
  let load = Complex.ZERO;
  let shunt = Complex.ZERO;
  c.buses.forEach((b, i) => {
    if (!r.energized[i]) return;
    load = load.add(new Complex(b.pd, b.qd));
    // Shunt absorbs (Gs − jBs)|V|²; a capacitor (Bs > 0) supplies Q.
    const v2 = r.vm[i]! ** 2;
    shunt = shunt.add(new Complex(b.gs * v2, -b.bs * v2));
  });
  let losses = Complex.ZERO;
  for (const f of flows) losses = losses.add(f.loss);
  return { gen, load, shunt, losses, residual: gen.sub(load).sub(shunt).sub(losses) };
}
