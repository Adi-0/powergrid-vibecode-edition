import type { Grid } from '../model/grid';
import { S_BASE } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import type { Feeder } from '../model/feeder';
import { nodeIndex } from '../model/feeder';
import { WIRING_12AWG } from '../data/dist/evergreen';
import { COUPLING_BUS } from '../model/coupling';
import { add, cos, div, mul, neg, num, par, ref, sigDigits, sin, sq, sqrt, sub, type Expr, type Panel, type Step } from './expr';

/**
 * Math panels for what can be selected: the working behind the numbers the inspector
 * shows, in standard notation (Glover, Sarma & Overbye's branch-flow equations; Ohm's
 * law; conservation of power). Pure: built from a snapshot, rendered elsewhere, and
 * re-checked by test/math-consistency.test.ts.
 */

const RAD = 180 / Math.PI;

/** Real and reactive power at both ends of a branch (π model, nominal ratio). */
export function branchPanel(grid: Grid, s: Snapshot, k: number): Panel | null {
  const br = grid.branches[k]!;
  if (!s.inService[k] || s.outcome === 'none') return null;
  const i = br.from.index;
  const j = br.to.index;
  const t = s.t;
  const bus = (b: typeof br.from) => `solver:t${t}.bus.${b.id}`;
  const Vi = num(s.vm[i]!, 7, 'pu', `${bus(br.from)}.vm`, 'V_i');
  const Vj = num(s.vm[j]!, 7, 'pu', `${bus(br.to)}.vm`, 'V_j');
  const ti = num(s.va[i]! * RAD, 6, '°', `${bus(br.from)}.va`, 'θ_i');
  const tj = num(s.va[j]! * RAD, 6, '°', `${bus(br.to)}.va`, 'θ_j');
  const key = br.kind === 'line' ? 'line' : 'xfmr';
  const r = num(br.r, sigDigits(br.r, 8), 'pu', `data:network.${key}.${br.id}.r_pu`, 'R');
  const x = num(br.x, sigDigits(br.x, 8), 'pu', `data:network.${key}.${br.id}.x_pu`, 'X');
  const bc = num(br.b, sigDigits(br.b || 1, 8), 'pu', `data:network.${key}.${br.id}.b_pu`, 'B');
  const Sb = num(S_BASE, 0, 'MVA', 'data:model.S_BASE', 'S_{base}');
  const z2 = par(add(sq(r), sq(x)));
  const g = 1 / (br.r * br.r + br.x * br.x);
  const steps: Step[] = [
    { label: 'Series conductance', general: 'g = R/(R^2 + X^2)', sym: 'g', expr: div(r, z2), unit: 'pu', digits: sigDigits(br.r * g, 9), prov: `derived:network.${key}.${br.id}.g` },
    { label: 'Series susceptance', general: 'b = −X/(R^2 + X^2)', sym: 'b', expr: div(neg(x), z2), unit: 'pu', digits: sigDigits(br.x * g, 9), prov: `derived:network.${key}.${br.id}.b` },
    { label: 'Angle across the branch', general: 'θ_{ij} = θ_i − θ_j', sym: 'θ_{ij}', expr: sub(ti, tj), unit: '°', digits: 6, prov: `derived:t${t}.branch.${br.id}.theta` },
  ];
  const G = ref(0);
  const B = ref(1);
  const th = ref(2);
  const half = (e: Expr) => div(e, num(2, 0, '', 'data:notation.half'));
  // P_ij = V_i² g − V_i V_j (g cos θ_ij + b sin θ_ij); Q_ij = −V_i² (b + B/2) − V_i V_j (g sin θ_ij − b cos θ_ij)
  steps.push({
    label: 'Real power entering at the from end',
    general: 'P_{ij} = [V_i^2 g − V_i V_j (g cos θ_{ij} + b sin θ_{ij})] S_{base}',
    sym: 'P_{ij}',
    expr: mul(par(sub(mul(sq(Vi), G), mul(mul(Vi, Vj), par(add(mul(G, cos(th)), mul(B, sin(th))))))), Sb),
    unit: 'MW',
    digits: 3,
    prov: `derived:t${t}.branch.${br.id}.pf`,
    solver: s.pf[k]!,
  });
  steps.push({
    label: 'Reactive power entering at the from end',
    general: 'Q_{ij} = [−V_i^2 (b + B/2) − V_i V_j (g sin θ_{ij} − b cos θ_{ij})] S_{base}',
    sym: 'Q_{ij}',
    expr: mul(par(sub(neg(mul(sq(Vi), par(add(B, half(bc))))), mul(mul(Vi, Vj), par(sub(mul(G, sin(th)), mul(B, cos(th))))))), Sb),
    unit: 'MVAr',
    digits: 3,
    prov: `derived:t${t}.branch.${br.id}.qf`,
    solver: s.qf[k]!,
  });
  // the to end: θ_ji = −θ_ij
  steps.push({
    label: 'Real power entering at the to end',
    general: 'P_{ji} = [V_j^2 g − V_j V_i (g cos θ_{ij} − b sin θ_{ij})] S_{base}',
    sym: 'P_{ji}',
    expr: mul(par(sub(mul(sq(Vj), G), mul(mul(Vj, Vi), par(sub(mul(G, cos(th)), mul(B, sin(th))))))), Sb),
    unit: 'MW',
    digits: 3,
    prov: `derived:t${t}.branch.${br.id}.pt`,
    solver: s.pt[k]!,
  });
  steps.push({ label: 'Lost in the branch', general: 'P_{loss} = P_{ij} + P_{ji}', sym: 'P_{loss}', expr: add(ref(3), ref(5)), unit: 'MW', digits: 3, prov: `derived:t${t}.branch.${br.id}.loss`, solver: s.pf[k]! + s.pt[k]! });
  steps.push({ label: 'Apparent power at the from end', general: '|S_{ij}| = sqrt(P_{ij}^2 + Q_{ij}^2)', sym: '|S_{ij}|', expr: sqrt(add(sq(ref(3)), sq(ref(4)))), unit: 'MVA', digits: 3, prov: `derived:t${t}.branch.${br.id}.sf`, solver: Math.hypot(s.pf[k]!, s.qf[k]!) });
  if (br.rateMVA > 0)
    steps.push({
      label: 'Loading at the from end',
      general: '|S_{ij}| / S_{rated}',
      sym: 'loading',
      expr: mul(div(ref(7), num(br.rateMVA, Number.isInteger(br.rateMVA) ? 0 : 3, 'MVA', `data:network.${key}.${br.id}.rateMVA`, 'S_{rated}')), num(100, 0, '%', 'data:notation.percent')),
      unit: '%',
      digits: 2,
      prov: `derived:t${t}.branch.${br.id}.loadingFrom`,
      solver: (100 * Math.hypot(s.pf[k]!, s.qf[k]!)) / br.rateMVA,
    });
  return {
    title: 'Flow on the branch',
    introNums: [{ k: 'num', value: S_BASE, digits: 0, unit: 'MVA', prov: 'data:model.S_BASE' }],
    intro: 'The π model: a series impedance with half the line’s charging at each end. Values in per unit on a {0} base; the result converted to MW and MVAr.',
    steps,
  };
}

/** Kirchhoff at a bus: what the Newton–Raphson solution satisfies. */
export function busPanel(grid: Grid, s: Snapshot, busIndex: number): Panel | null {
  if (s.outcome === 'none' || !s.energized[busIndex]) return null;
  const b = grid.buses[busIndex]!;
  const t = s.t;
  const terms: Expr[] = [];
  let solverOut = 0;
  grid.branches.forEach((br, k) => {
    if (!s.inService[k]) return;
    if (br.from.index === busIndex) {
      terms.push(num(s.pf[k]!, 4, 'MW', `solver:t${t}.branch.${br.id}.pf`));
      solverOut += s.pf[k]!;
    } else if (br.to.index === busIndex) {
      terms.push(num(s.pt[k]!, 4, 'MW', `solver:t${t}.branch.${br.id}.pt`));
      solverOut += s.pt[k]!;
    }
  });
  let pg = 0;
  grid.gens.forEach((g) => {
    if (g.bus.index === busIndex && s.genOnline[g.index]) pg += s.pg[g.index]!;
  });
  const flows = terms.reduce((a, e) => add(a, e));
  const steps: Step[] = [
    { label: 'Power leaving over the branches', general: 'Σ_k P_{ik}', sym: 'P_{out}', expr: flows, unit: 'MW', digits: 3, prov: `derived:t${t}.bus.${b.id}.pout`, solver: solverOut },
    {
      label: 'What does not balance (the mismatch)',
      general: 'ΔP_i = P_{G,i} − P_{D,i} − Σ_k P_{ik}',
      sym: 'ΔP_i',
      expr: sub(sub(num(pg, 4, 'MW', `solver:t${t}.bus.${b.id}.pg`, 'P_{G,i}'), num(s.pd[busIndex]!, 4, 'MW', `solver:t${t}.bus.${b.id}.pd`, 'P_{D,i}')), ref(0)),
      unit: 'MW',
      digits: 3,
      prov: `derived:t${t}.bus.${b.id}.mismatch`,
      solver: pg - s.pd[busIndex]! - solverOut,
    },
  ];
  return {
    title: 'Power balance at the {0} bus',
    introNums: [{ k: 'num', value: b.kv, digits: 0, unit: 'kV', prov: `data:network.bus.${b.id}.kv` }],
    intro: 'A Newton–Raphson solution is not a closed form; the check is to plug the solved voltages back in. At every bus, generation less demand less what leaves over the branches is (to the solver’s tolerance) zero.',
    steps,
  };
}

/** A region: losses by difference, checked against the sum of each branch's own loss. */
export function regionPanel(grid: Grid, s: Snapshot, siteIds: string[], regionId: string): Panel | null {
  if (s.outcome === 'none') return null;
  const t = s.t;
  const inR = new Set(siteIds);
  let gen = 0;
  grid.gens.forEach((g) => {
    if (inR.has(g.bus.site.id) && s.genOnline[g.index]) gen += s.pg[g.index]!;
  });
  let imp = 0;
  let branchLoss = 0;
  const own: Expr[] = [];
  grid.branches.forEach((br, k) => {
    if (!s.inService[k]) return;
    const fi = inR.has(br.from.site.id);
    const ti = inR.has(br.to.site.id);
    if (fi !== ti) imp += fi ? -s.pf[k]! : -s.pt[k]!;
    else if (fi) {
      const l = s.pf[k]! + s.pt[k]!;
      branchLoss += l;
      own.push(num(l, 3, 'MW', `derived:t${t}.branch.${br.id}.loss`, `P_{loss,${br.id}}`));
    }
  });
  let demand = 0;
  for (const b of grid.buses) if (inR.has(b.site.id) && s.energized[b.index]) demand += s.pd[b.index]!;
  const steps: Step[] = [
    {
      label: 'Power into the region: generated there, plus the net arriving over its edge',
      general: 'P_G + P_{in}',
      sym: 'P_{supply}',
      expr: add(num(gen, 1, 'MW', `solver:t${t}.region.${regionId}.gen`, 'P_G'), num(imp, 1, 'MW', `solver:t${t}.region.${regionId}.importAC`, 'P_{in}')),
      unit: 'MW',
      digits: 1,
      prov: `derived:t${t}.region.${regionId}.supply`,
      solver: gen + imp,
    },
    {
      label: 'Lost in the region, by difference',
      general: 'P_{loss} = (P_G + P_{in}) − P_D',
      sym: 'P_{loss}',
      expr: sub(ref(0), num(demand, 1, 'MW', `solver:t${t}.region.${regionId}.busDemand`, 'P_D')),
      unit: 'MW',
      digits: 1,
      prov: `derived:t${t}.region.${regionId}.losses`,
      solver: gen + imp - demand,
    },
  ];
  if (own.length) {
    steps.push(
      {
        label: `Lost in the region, branch by branch: each in-service line and transformer inside it, its sending-end power plus its receiving-end power`,
        general: 'Σ (P_f + P_t)',
        sym: 'ΣP_{loss}',
        expr: own.reduce((acc, e) => add(acc, e)),
        unit: 'MW',
        digits: 2,
        prov: `derived:t${t}.region.${regionId}.branchLosses`,
        solver: branchLoss,
      },
      {
        label: 'The check: the two ways of counting agree, to the rounding shown',
        general: 'P_{loss} − Σ (P_f + P_t)',
        sym: 'ΔP',
        expr: sub(ref(1), ref(2)),
        unit: 'MW',
        digits: 1,
        prov: `derived:t${t}.region.${regionId}.lossCheck`,
        solver: gen + imp - demand - branchLoss,
      },
    );
  }
  return {
    title: 'The region’s balance',
    intro: 'Conservation: what the region generates and what arrives over its edge is what its buses draw, plus what its own lines and transformers lose. (Demand here is bus demand, including what DC links draw.)',
    steps,
  };
}

/** The substation: what the bank loses. */
export function substationPanel(s: Snapshot): Panel | null {
  const f = s.feeder;
  if (!f || s.outcome === 'none') return null;
  const t = s.t;
  let other = 0;
  f.loadIds.forEach((id, i) => {
    if (id.startsWith('OTHER:')) other += f.loadP[i]!;
  });
  return {
    title: 'Through the bank',
    steps: [
      {
        label: 'Lost in the bank',
        general: 'P_{loss} = P_{60} − P_{1105} − P_{others}',
        sym: 'P_{loss}',
        expr: sub(sub(num(f.boundaryP / 1000, 1, 'kW', `solver:t${t}.evergreen.boundaryP`, 'P_{60}'), num(f.headP / 1000, 1, 'kW', `solver:t${t}.evergreen.f1105.headP`, 'P_{1105}')), num(other / 1000, 1, 'kW', `solver:t${t}.evergreen.otherFeeders`, 'P_{others}')),
        unit: 'kW',
        digits: 1,
        prov: `derived:t${t}.evergreen.bankLoss`,
        solver: (f.boundaryP - f.headP - other) / 1000,
      },
    ],
  };
}

/** The feeder: meters + losses = head. */
export function feederPanel(s: Snapshot, fd: Feeder): Panel | null {
  const f = s.feeder;
  if (!f || s.outcome === 'none') return null;
  const t = s.t;
  let meters = 0;
  f.loadIds.forEach((id, i) => {
    if (!id.startsWith('OTHER:')) meters += f.loadP[i]!;
  });
  let loss = 0;
  fd.base.branches.forEach((b, k) => {
    if (b.id !== 'EV-BANK' && b.id !== 'CB-1105') loss += f.flows[k * 4]! - f.flows[k * 4 + 2]!;
  });
  return {
    title: 'The feeder’s balance',
    steps: [
      {
        label: 'Meters plus losses',
        general: 'Σ P_{meter} + Σ P_{loss}',
        sym: 'P',
        expr: add(num(meters / 1000, 3, 'kW', `solver:t${t}.feeder.meters`, 'Σ P_{meter}'), num(loss / 1000, 3, 'kW', `solver:t${t}.feeder.losses`, 'Σ P_{loss}')),
        unit: 'kW',
        digits: 3,
        prov: `derived:t${t}.feeder.metersPlusLosses`,
        solver: f.headP / 1000,
      },
    ],
  };
}

/** The outlet: Ohm's law on the branch circuit. */
export function outletPanel(s: Snapshot, fd: Feeder): Panel | null {
  const f = s.feeder;
  if (!f || s.outcome === 'none') return null;
  const t = s.t;
  const idx = nodeIndex(fd);
  const o = idx.get(fd.layout.outlet.node)!;
  const m = idx.get(fd.layout.outlet.home)!;
  const vo = Math.hypot(f.V[o * 6]!, f.V[o * 6 + 1]!);
  const vm = Math.hypot(f.V[m * 6]!, f.V[m * 6 + 1]!);
  const li = f.loadIds.indexOf('OUTLET:appliance');
  const P = li >= 0 ? f.loadP[li]! : 0;
  const Lm = fd.layout.outlet.lengthM;
  const steps: Step[] = [
    { label: 'Current drawn by the hair dryer, at the voltage the solve finds at the outlet (the last step comes back to it)', general: 'I = P / V_{outlet}', sym: 'I', expr: div(num(P, 1, 'W', `solver:t${t}.feeder.load.OUTLET`, 'P'), num(vo, 3, 'V', `solver:t${t}.feeder.V.OUTLET`, 'V_{outlet}')), unit: 'A', digits: 3, prov: `derived:t${t}.feeder.outlet.I`, solver: P / vo },
    {
      label: 'Resistance of the circuit, there and back',
      general: 'R = 2 L r',
      sym: 'R',
      expr: mul(mul(num(2, 0, '', 'data:notation.twoConductors'), num(Lm / 1000, 3, 'km', 'data:evergreen.layout.outlet.lengthM', 'L')), num(WIRING_12AWG.r_ohm_per_km, 2, 'Ω/km', 'data:evergreen.WIRING_12AWG.r_ohm_per_km', 'r')),
      unit: 'Ω',
      digits: 4,
      prov: 'derived:evergreen.outlet.R',
    },
    {
      label: 'Voltage lost on the way (a resistive load: current in step with voltage)',
      general: 'ΔV ≈ I R',
      sym: 'ΔV',
      expr: mul(ref(0), ref(1)),
      unit: 'V',
      digits: 3,
      prov: `derived:t${t}.feeder.outlet.dV`,
      solver: vm - vo,
      approx: { note: 'the small reactance of the cable is left out', tol: 0.02 },
    },
    {
      label: 'At the outlet',
      general: 'V_{outlet} ≈ V_{meter} − ΔV',
      sym: 'V_{outlet}',
      expr: sub(num(vm, 3, 'V', `solver:t${t}.feeder.V.meter`, 'V_{meter}'), ref(2)),
      unit: 'V',
      digits: 3,
      prov: `derived:t${t}.feeder.outlet.V`,
      solver: vo,
      approx: { note: 'as above', tol: 0.02 },
    },
  ];
  return { title: 'Ohm’s law at the outlet', intro: 'The last few volts, by hand.', steps };
}

/** A home's meter: the sum of what is plugged in, net of rooftop solar. */
export function meterPanel(s: Snapshot, fd: Feeder, homeId: string): Panel | null {
  const f = s.feeder;
  if (!f || s.outcome === 'none') return null;
  const t = s.t;
  const parts: Expr[] = [];
  let total = 0;
  f.loadIds.forEach((id, i) => {
    const mine = id.startsWith(`${homeId}:`) || (id === 'OUTLET:appliance' && fd.layout.outlet.home === homeId);
    if (!mine) return;
    parts.push(num(f.loadP[i]! / 1000, 3, 'kW', `solver:t${t}.feeder.load.${id}`));
    total += f.loadP[i]!;
  });
  if (!parts.length) return null;
  return {
    title: 'The meter',
    steps: [{ label: 'Through the meter', general: 'P_{meter} = Σ P_{circuit}', sym: 'P_{meter}', expr: parts.reduce((a, e) => add(a, e)), unit: 'kW', digits: 3, prov: `derived:t${t}.feeder.meter.${homeId}`, solver: total / 1000 }],
  };
}

export { COUPLING_BUS };
