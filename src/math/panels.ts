import type { Grid } from '../model/grid';
import { S_BASE } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import type { Feeder } from '../model/feeder';
import { nodeIndex } from '../model/feeder';
import { WIRING_12AWG } from '../data/dist/evergreen';
import { COUPLING_BUS } from '../model/coupling';
import { add, atan, cos, div, mul, neg, num, par, ref, sigDigits, sin, sq, sqrt, sub, type Expr, type Panel, type Step } from './expr';
import { CCGT, plantState } from '../model/ccgt';
import { machineOf, phasors } from '../model/machine';
import type { TripResponse } from '../model/frequency';
import { busFaultLevel, type FaultStudy } from '../model/faultStudy';
import { C37_112, PROTECTION } from '../data/dist/protection';
import type { FeederEvent } from '../app/inspect-fault';
import type { XfmrPlate, XfmrState } from '../model/xfmrState';

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

// ---------------------------------------------------------------- plant, machine, frequency

/** The combined cycle: fuel to the 230 kV bus, every megawatt accounted for. */
export function plantPanel(grid: Grid, s: Snapshot, plantId: string): Panel | null {
  if (s.outcome === 'none') return null;
  const ps = plantState(grid, s, plantId);
  const b = ps.balance;
  if (!b) return null;
  const t = s.t;
  const d = ps.design;
  const P = (u: string, v: number) => num(v, 3, 'MW', `solver:t${t}.gen.${plantId}-${u}.pg`, `P_{${u}}`);
  const Fr = () => num(d.gtFuelLhv, 3, 'MWth', `derived:plants.${plantId}.design.gtFuelLhv`, 'F_r');
  const a = () => num(CCGT.noLoadFuel, 2, '', 'data:ccgt.noLoadFuel', 'a');
  const Pr = () => num(d.gtMW, 1, 'MW', `data:plants.${plantId}.units.GT.mw`, 'P_r');
  const eta = () => num(CCGT.etaGen, 3, '', 'data:ccgt.etaGen', 'η_{gen}');
  const key = (k: string) => `derived:t${t}.plant.${plantId}.${k}`;
  const steps: Step[] = [];
  ['GT1', 'GT2'].forEach((u, i) => {
    steps.push({
      label: `Fuel burned by the ${i ? 'second' : 'first'} gas turbine (lower heating value): a straight line from its no-load fuel`,
      general: 'F = F_r [a + (1 − a) P / P_r]',
      sym: `F_{${u}}`,
      expr: mul(Fr(), par(add(a(), mul(par(sub(num(1, 0, '', 'notation:one'), a())), div(P(u, b.gt[i]!.mw), Pr()))))),
      unit: 'MWth',
      digits: 3,
      prov: key(`${u}.fuel`),
      solver: b.gt[i]!.fuelLhv,
    });
  });
  steps.push(
    {
      label: 'Fuel on the higher heating value (what the gas meter bills)',
      general: 'F_{HHV} = (F_{GT1} + F_{GT2}) × HHV/LHV',
      sym: 'F_{HHV}',
      expr: mul(par(add(ref(0), ref(1))), num(CCGT.hhvOverLhv, 3, '', 'data:ccgt.hhvOverLhv', 'HHV/LHV')),
      unit: 'MWth',
      digits: 3,
      prov: key('fuelHhv'),
      solver: b.fuelHhv,
    },
    {
      label: 'Hot exhaust leaving the gas turbines: fuel less their shaft work',
      general: 'Q_{ex} = F_{GT1} + F_{GT2} − (P_{GT1} + P_{GT2}) / η_{gen}',
      sym: 'Q_{ex}',
      expr: sub(add(ref(0), ref(1)), div(par(add(P('GT1', b.gt[0]!.mw), P('GT2', b.gt[1]!.mw))), eta())),
      unit: 'MWth',
      digits: 3,
      prov: key('exhaust'),
      solver: b.gt.reduce((acc, g) => acc + g.exhaust, 0),
    },
    {
      label: 'Heat the HRSGs pass to the steam',
      general: 'Q_{st} = η_{HRSG} Q_{ex}',
      sym: 'Q_{st}',
      expr: mul(num(CCGT.etaHrsg, 2, '', 'data:ccgt.etaHrsg', 'η_{HRSG}'), ref(3)),
      unit: 'MWth',
      digits: 3,
      prov: key('steamHeat'),
      solver: b.steamHeat,
    },
    {
      label: 'Heat up the stacks, not recovered',
      general: 'Q_{stack} = Q_{ex} − Q_{st}',
      sym: 'Q_{stack}',
      expr: sub(ref(3), ref(4)),
      unit: 'MWth',
      digits: 3,
      prov: key('stack'),
      solver: b.stack,
    },
    {
      label: 'Latent heat of the water vapour, also up the stacks',
      general: 'F_{HHV} − (F_{GT1} + F_{GT2})',
      sym: 'Q_{latent}',
      expr: sub(ref(2), par(add(ref(0), ref(1)))),
      unit: 'MWth',
      digits: 3,
      prov: key('latent'),
      solver: b.latent,
    },
    {
      label: 'Heat to the condenser: steam heat the steam turbine did not turn into work',
      general: 'Q_{cond} = Q_{st} − P_{ST} / η_{gen}',
      sym: 'Q_{cond}',
      expr: sub(ref(4), div(P('ST', b.stMW), eta())),
      unit: 'MWth',
      digits: 3,
      prov: key('condenser'),
      solver: b.condenser,
    },
    {
      label: 'Lost in the generators',
      general: 'P_{gen,loss} = (P_{GT1} + P_{GT2} + P_{ST}) (1/η_{gen} − 1)',
      sym: 'P_{gen,loss}',
      expr: mul(par(add(add(P('GT1', b.gt[0]!.mw), P('GT2', b.gt[1]!.mw)), P('ST', b.stMW))), par(sub(div(num(1, 0, '', 'notation:one'), eta()), num(1, 0, '', 'notation:one')))),
      unit: 'MW',
      digits: 3,
      prov: key('genLoss'),
      solver: b.generatorLoss,
    },
    {
      label: 'Lost in the step-up transformers (the power flow’s: out of the generators less into the bus)',
      general: 'P_{GSU,loss} = P_{GT1} + P_{GT2} + P_{ST} − P_{net}',
      sym: 'P_{GSU,loss}',
      expr: sub(add(add(P('GT1', b.gt[0]!.mw), P('GT2', b.gt[1]!.mw)), P('ST', b.stMW)), num(b.netMW, 3, 'MW', `solver:t${t}.plant.${plantId}.net`, 'P_{net}')),
      unit: 'MW',
      digits: 3,
      prov: key('gsuLoss'),
      solver: b.gsuLoss,
    },
    {
      label: 'The check: fuel less everything it became',
      general: 'F_{HHV} − (P_{net} + P_{GSU,loss} + P_{gen,loss} + Q_{stack} + Q_{latent} + Q_{cond})',
      sym: 'ΔE',
      expr: sub(ref(2), par(add(add(add(add(add(num(b.netMW, 3, 'MW', `solver:t${t}.plant.${plantId}.net`, 'P_{net}'), ref(9)), ref(8)), ref(5)), ref(6)), ref(7)))),
      unit: 'MW',
      digits: 2,
      prov: key('residual'),
      solver: b.residual,
    },
    {
      label: 'Net heat rate: fuel per kilowatt-hour delivered (k: the Btu in a kilowatt-hour)',
      general: 'HR = F_{HHV} / P_{net} × k',
      sym: 'HR',
      expr: mul(div(ref(2), num(b.netMW, 3, 'MW', `solver:t${t}.plant.${plantId}.net`, 'P_{net}')), num(CCGT.btuPerKWh, 2, 'Btu/kWh', 'data:units.btuPerKWh', '')),
      unit: 'Btu/kWh',
      digits: 1,
      prov: key('heatRate'),
      solver: b.heatRate,
    },
  );
  return {
    title: 'Where the fuel goes',
    intro: 'Each unit’s output comes from the power flow; fuel and heat from the plant model (its gas turbines’ fuel line, generator efficiency and the HRSGs’ share are data). Heat in MWth, electricity in MW.',
    steps,
  };
}

/** The generator's internal voltage from its terminal quantities: E_f = V_t + (R_a + jX_d) I_a. */
export function machinePanel(grid: Grid, s: Snapshot, genId: string): Panel | null {
  if (s.outcome === 'none') return null;
  const g = grid.gens.find((x) => x.id === genId);
  const rec = machineOf(genId);
  if (!g || !rec || !s.genOnline[g.index]) return null;
  const t = s.t;
  const V = s.vm[g.bus.index]!;
  const p = phasors(rec, V, s.va[g.bus.index]!, s.pg[g.index]!, s.qg[g.index]!);
  const key = (k: string) => `derived:t${t}.machine.${genId}.${k}`;
  const S = () => num(rec.mva, 0, 'MVA', `data:machines.${genId}.mva`, 'S_{rated}');
  const Vt = () => num(V, 6, 'pu', `solver:t${t}.bus.${g.bus.id}.vm`, '|V_t|');
  const Ra = () => num(rec.ra, 3, 'pu', `data:machines.${genId}.ra`, 'R_a');
  const Xd = () => num(rec.xd, 2, 'pu', `data:machines.${genId}.xd`, 'X_d');
  const steps: Step[] = [
    { label: 'Real power, per unit on the machine’s rating', general: 'P = P_{MW} / S_{rated}', sym: 'P', expr: div(num(s.pg[g.index]!, 4, 'MW', `solver:t${t}.gen.${genId}.pg`, 'P'), S()), unit: 'pu', digits: 6, prov: key('P'), solver: p.P },
    { label: 'Reactive power, per unit', general: 'Q = Q_{MVAr} / S_{rated}', sym: 'Q', expr: div(num(s.qg[g.index]!, 4, 'MVAr', `solver:t${t}.gen.${genId}.qg`, 'Q'), S()), unit: 'pu', digits: 6, prov: key('Q'), solver: p.Q },
    { label: 'Armature current: S = V I*, so |I| = |S| / |V|', general: '|I_a| = √(P² + Q²) / |V_t|', sym: '|I_a|', expr: div(sqrt(add(sq(ref(0)), sq(ref(1)))), Vt()), unit: 'pu', digits: 6, prov: key('I'), solver: p.I },
    { label: 'Power-factor angle: how far the current lags the voltage', general: 'φ = atan(Q / P)', sym: 'φ', expr: atan(div(ref(1), ref(0))), unit: '°', digits: 4, prov: key('phi'), solver: (p.phi * 180) / Math.PI },
    {
      label: 'E_f along V_t (taking V_t as the reference)',
      general: 'E_{re} = |V_t| + R_a|I_a| cos φ + X_d|I_a| sin φ',
      sym: 'E_{re}',
      expr: add(add(Vt(), mul(mul(Ra(), ref(2)), cos(ref(3)))), mul(mul(Xd(), ref(2)), sin(ref(3)))),
      unit: 'pu',
      digits: 6,
      prov: key('Ere'),
      solver: p.Ef * Math.cos(p.delta),
    },
    {
      label: 'E_f across V_t',
      general: 'E_{im} = X_d|I_a| cos φ − R_a|I_a| sin φ',
      sym: 'E_{im}',
      expr: sub(mul(mul(Xd(), ref(2)), cos(ref(3))), mul(mul(Ra(), ref(2)), sin(ref(3)))),
      unit: 'pu',
      digits: 6,
      prov: key('Eim'),
      solver: p.Ef * Math.sin(p.delta),
    },
    { label: 'Internal voltage', general: '|E_f| = √(E_{re}² + E_{im}²)', sym: '|E_f|', expr: sqrt(add(sq(ref(4)), sq(ref(5)))), unit: 'pu', digits: 5, prov: key('Ef'), solver: p.Ef },
    { label: 'Load angle', general: 'δ = atan(E_{im} / E_{re})', sym: 'δ', expr: atan(div(ref(5), ref(4))), unit: '°', digits: 3, prov: key('delta'), solver: (p.delta * 180) / Math.PI },
  ];
  return {
    title: 'Inside the generator',
    intro: 'Round-rotor model, per phase, per unit on the machine’s rating. Generator reference: current out of the machine positive; S = V I* (current conjugated).',
    steps,
  };
}

/** The frequency response in closed form where it has one: the first instant and the settled value. */
export function frequencyPanel(r: TripResponse): Panel {
  const f0 = r.params.f0;
  const key = (k: string) => `derived:trip.${r.plantId}.${k}`;
  const dw = r.settledHz / f0 - 1;
  let pLim = 0;
  let beta = r.params.D * r.params.PL;
  r.units.forEach((u) => {
    if (u.R === null) return;
    const cmd = (-dw * u.S) / u.R;
    const hi = u.Pmax - u.P0;
    if (cmd >= hi - 1e-9) pLim += Math.max(0, hi);
    else beta += u.S / u.R;
  });
  const dP = () => num(r.lossMW, 2, 'MW', `solver:trip.${r.plantId}.loss`, 'ΔP');
  const F0 = () => num(f0, 0, 'Hz', 'data:sfr.f0', 'f_0');
  return {
    title: 'The frequency, where it has a closed form',
    intro: 'The first instant and the settled value follow from the swing equation directly; the nadir between them depends on every governor’s timing and is integrated, not closed form.',
    steps: [
      {
        label: 'Rate of fall at the first instant: only inertia acts',
        general: 'df/dt = −ΔP f_0 / (2 Σ H_i S_i)',
        sym: 'df/dt',
        expr: div(mul(neg(dP()), F0()), par(mul(num(2, 0, '', 'notation:two'), num(r.kineticMWs, 0, 'MW·s', `solver:trip.${r.plantId}.kinetic`, 'Σ H_i S_i')))),
        unit: 'Hz/s',
        digits: 5,
        prov: key('rocof'),
        solver: r.rocof,
      },
      {
        label: 'Settled: governors not at a limit share what those at a limit could not give, with load damping',
        general: 'Δf = −(ΔP − P_{lim}) / (Σ_{free} S_i/R_i + D P_L) × f_0',
        sym: 'Δf',
        expr: mul(div(neg(par(sub(dP(), num(pLim, 2, 'MW', `solver:trip.${r.plantId}.pLim`, 'P_{lim}')))), num(beta, 1, 'MW/pu', `solver:trip.${r.plantId}.betaFree`, 'β')), F0()),
        unit: 'Hz',
        digits: 5,
        prov: key('df'),
        solver: r.settledHz - f0,
      },
      { label: 'Settled frequency', general: 'f = f_0 + Δf', sym: 'f', expr: add(F0(), ref(1)), unit: 'Hz', digits: 4, prov: key('settled'), solver: r.settledHz },
    ],
  };
}

// ---------------------------------------------------------------- faults

/** A transmission bus's fault levels from its sequence Thevenin impedances. */
export function busFaultPanel(grid: Grid, s: Snapshot, fs: FaultStudy, busIndex: number): Panel | null {
  const b = grid.buses[busIndex]!;
  const f = busFaultLevel(grid, fs, busIndex);
  const t = s.t;
  const key = (k: string) => `derived:t${t}.bus.${b.id}.fault.${k}`;
  const zkey = (k: string) => `solver:t${t}.bus.${b.id}.fault.${k}`;
  const d = (v: number) => sigDigits(v, 9); // inputs: enough figures that a small |Z| still divides accurately
  const V = () => num(f.vpre.abs(), 7, 'pu', `solver:t${t}.bus.${b.id}.vm`, '|V_f|');
  const Ib = () => num(fs.iBaseKA[busIndex]!, 8, 'kA', `derived:bus.${b.id}.iBase`, 'I_{base}');
  const r1 = f.z1.re;
  const x1 = f.z1.im;
  const z2 = f.r1.z2;
  const z0 = f.r1.z0;
  const steps: Step[] = [
    { label: 'Positive-sequence Thevenin impedance at the bus (from Z_bus)', general: '|Z_1| = √(R_1² + X_1²)', sym: '|Z_1|', expr: sqrt(add(sq(num(r1, d(r1), 'pu', zkey('R1'), 'R_1')), sq(num(x1, d(x1), 'pu', zkey('X1'), 'X_1')))), unit: 'pu', digits: sigDigits(f.z1.abs(), 8), prov: key('Z1'), solver: f.z1.abs() },
    { label: 'Three-phase fault current, per unit', general: 'I_{3φ} = |V_f| / |Z_1|', sym: 'I_{3φ}', expr: div(V(), ref(0)), unit: 'pu', digits: sigDigits(f.r3.ia.abs(), 6), prov: key('i3pu'), solver: f.r3.ia.abs() },
    { label: 'In kiloamperes (the base current at this voltage)', general: 'I_{3φ} × I_{base},  I_{base} = S_{base} / (√3 V_{base})', sym: 'I_{3φ}', expr: mul(ref(1), Ib()), unit: 'kA', digits: sigDigits(f.i3kA, 5), prov: key('i3'), solver: f.i3kA },
  ];
  if (Number.isFinite(z0.re)) {
    const rs = r1 + z2.re + z0.re;
    const xs = x1 + z2.im + z0.im;
    steps.push(
      {
        label: 'Resistances of the three sequence networks in series (a line-to-ground fault connects them so)',
        general: 'R_Σ = R_1 + R_2 + R_0',
        sym: 'R_Σ',
        expr: add(add(num(r1, d(r1), 'pu', zkey('R1'), 'R_1'), num(z2.re, d(z2.re), 'pu', zkey('R2'), 'R_2')), num(z0.re, d(z0.re), 'pu', zkey('R0'), 'R_0')),
        unit: 'pu',
        digits: sigDigits(rs, 8),
        prov: key('Rsum'),
        solver: rs,
      },
      {
        label: 'And their reactances',
        general: 'X_Σ = X_1 + X_2 + X_0',
        sym: 'X_Σ',
        expr: add(add(num(x1, d(x1), 'pu', zkey('X1'), 'X_1'), num(z2.im, d(z2.im), 'pu', zkey('X2'), 'X_2')), num(z0.im, d(z0.im), 'pu', zkey('X0'), 'X_0')),
        unit: 'pu',
        digits: sigDigits(xs, 8),
        prov: key('Xsum'),
        solver: xs,
      },
      {
        label: 'Line-to-ground fault current, $I_a = 3I_0$',
        general: 'I_{LG} = 3|V_f| / √(R_Σ² + X_Σ²) × I_{base}',
        sym: 'I_{LG}',
        expr: mul(div(mul(num(3, 0, '', 'notation:three'), V()), sqrt(add(sq(ref(3)), sq(ref(4))))), Ib()),
        unit: 'kA',
        digits: sigDigits(f.i1kA, 5),
        prov: key('i1'),
        solver: f.i1kA,
      },
    );
  }
  return {
    title: 'Fault current at the {0} bus',
    introNums: [{ k: 'num', value: b.kv, digits: 0, unit: 'kV', prov: `data:network.bus.${b.id}.kv` }],
    intro: 'Symmetrical components: a three-phase fault sees only the positive-sequence network; a line-to-ground fault connects all three in series. Pre-fault voltage from the power flow; loads neglected.',
    steps,
  };
}

/** The feeder fault and the protection's times, from the fault current. */
export function feederFaultPanel(s: Snapshot, ev: FeederEvent): Panel {
  const r = ev.res;
  const t = s.t;
  const key = (k: string) => `derived:t${t}.fault.${ev.node}.${k}`;
  const zkey = (k: string) => `solver:t${t}.fault.${ev.node}.${k}`;
  const steps: Step[] = [];
  const p = r.phases[0]!;
  const ground = r.kind === 'slg' || r.kind === 'dlg';
  let Iref: Expr;
  let Ival: number;
  if (r.kind === 'slg') {
    const z = r.Z.get(p, p);
    const V = r.vpre[p]!.abs();
    steps.push(
      { label: 'Thevenin impedance of the faulted phase (source, bank and lines)', general: '|Z_{pp}| = √(R² + X²)', sym: '|Z_{pp}|', expr: sqrt(add(sq(num(z.re, 6, 'Ω', zkey('R'), 'R')), sq(num(z.im, 6, 'Ω', zkey('X'), 'X')))), unit: 'Ω', digits: 6, prov: key('Z'), solver: z.abs() },
      { label: 'Fault current: the pre-fault voltage over the impedance (a bolted fault on one phase)', general: 'I_f = |V_p| / |Z_{pp}|', sym: 'I_f', expr: div(num(V, 3, 'V', zkey('V'), '|V_p|'), ref(0)), unit: 'A', digits: 2, prov: key('I'), solver: r.I[p]!.abs() },
    );
    Iref = ref(1);
    Ival = r.I[p]!.abs();
  } else {
    // a three-phase or line-to-line fault: a small matrix solve, not closed form; its result is the input here
    Ival = ground ? r.residual.abs() : Math.max(...r.I.map((x) => x.abs()));
    Iref = num(Ival, 2, 'A', zkey(ground ? '3I0' : 'Iph'), 'I_f');
  }
  const CB = PROTECTION.breaker;
  const RC = PROTECTION.recloser;
  const vi = C37_112.VI;
  const onR = r.devices.includes(RC.id);
  const fuse = r.devices.find((d) => d.startsWith('FU-'));
  const n0 = steps.length;
  if (fuse) {
    steps.push({
      label: 'The lateral fuse’s minimum melting time (its fitted curve)',
      general: 't_{mm} = K / ((I_f / I_m)² − 1)',
      sym: 't_{mm}',
      expr: div(num(PROTECTION.fuse.K, 0, 's', 'data:protection.fuse.K', 'K'), par(sub(sq(par(div(Iref, num(PROTECTION.fuse.rating * PROTECTION.fuse.imOverRating, 0, 'A', 'data:protection.fuse.Im', 'I_m')))), num(1, 0, '', 'notation:one')))),
      unit: 's',
      digits: 4,
      prov: key('fuseMelt'),
    });
  }
  const pickupR = ground ? RC.groundMin : RC.phaseMin;
  const set = ground ? CB.n51 : CB.p51;
  if (onR) {
    steps.push({
      label: `The recloser’s delayed curve ([[c37112|C37.112]] very inverse, ${ground ? 'ground' : 'phase'} minimum trip), plus interrupting time`,
      general: 't_R = TDS (A / (M² − 1) + B) + t_{int},  M = I_f / I_{min}',
      sym: 't_R',
      expr: add(mul(num(RC.slow.tds, 1, '', 'data:protection.recloser.slow.tds', 'TDS'), par(add(div(num(vi.A, 2, '', 'data:c37112.VI.A', 'A'), par(sub(sq(par(div(Iref, num(pickupR, 0, 'A', 'data:protection.recloser.min', 'I_{min}')))), num(1, 0, '', 'notation:one')))), num(vi.B, 3, '', 'data:c37112.VI.B', 'B')))), num(RC.interruptS, 2, 's', 'data:protection.recloser.interruptS', 't_{int}')),
      unit: 's',
      digits: 4,
      prov: key('recloser'),
    });
  }
  const iR = steps.length - 1;
  steps.push({
    label: `The breaker’s ${ground ? '[[c372|51N]] (ground)' : '[[c372|51]] (phase)'} time-overcurrent element, plus the breaker’s opening time`,
    general: 't_B = TDS (A / (M² − 1) + B) + t_{open},  M = I_f / I_{pickup}',
    sym: 't_B',
    expr: add(mul(num(set.tds, 1, '', `data:protection.breaker.${ground ? 'n51' : 'p51'}.tds`, 'TDS'), par(add(div(num(vi.A, 2, '', 'data:c37112.VI.A', 'A'), par(sub(sq(par(div(Iref, num(set.pickup, 0, 'A', `data:protection.breaker.${ground ? 'n51' : 'p51'}.pickup`, 'I_{pickup}')))), num(1, 0, '', 'notation:one')))), num(vi.B, 3, '', 'data:c37112.VI.B', 'B')))), num(CB.openS, 2, 's', 'data:protection.breaker.openS', 't_{open}')),
    unit: 's',
    digits: 4,
    prov: key('breaker'),
  });
  if (onR)
    steps.push({ label: 'The margin the breaker leaves the recloser (at least the coordination time interval)', general: 't_B − t_R', sym: 'Δt', expr: sub(ref(steps.length - 1), ref(iR)), unit: 's', digits: 4, prov: key('cti') });
  void n0;
  return {
    title: 'The fault, and how fast each device acts',
    intro: 'Relay curves are [[c37112|IEEE C37.112]]’s; the fuse’s is fitted to the shape of a T-link’s. Load is neglected in the fault current.',
    steps,
  };
}

/**
 * A transformer's working: the current at each terminal from its power and voltage
 * (S = V·I*, three-phase: |I| = |S| / (√3 |V|)), their ratio against the turns ratio,
 * and its loss two ways — what goes in less what comes out, and 3I²R in the windings.
 */
export function transformerPanel(
  p: XfmrPlate,
  st: XfmrState | null,
  R: { r: number; rProv: string; vBase: number; vProv: string; sBase: number; sProv: string; side: 'H' | 'L' },
): Panel | null {
  if (!st || !st.on) return null;
  const t = st.t;
  const k = (x: string) => `derived:t${t}.${p.key}.${x}`;
  const three = num(3, 0, '', 'data:notation.three');
  const kilo = num(1000, 0, '', 'data:notation.kilo');
  const a = p.hvKV / p.lvKV / (st.ltcRatio ?? 1);
  const unb = st.unbalanced ? { note: 'The feeder is solved phase by phase and its phases differ a little; the three-phase power gives the balanced equivalent.', tol: 0.004 } : undefined;
  const steps: Step[] = [
    { label: 'High-side voltage', general: '|V_H| = V_{H,pu} × V_{base,H}', sym: '|V_H|', expr: mul(num(st.vH, 6, 'pu', st.prov.vH, 'V_{H,pu}'), num(p.hvKV, 0, 'kV', `data:${p.keys.hvKV}`, 'V_{base,H}')), unit: 'kV', digits: 3, prov: k('vHkV'), solver: st.vHkV },
    { label: 'Apparent power in at the high side, three-phase', general: '|S_H| = √(P_H^2 + Q_H^2)', sym: '|S_H|', expr: sqrt(add(sq(num(st.pH, 4, 'MW', st.prov.pH, 'P_H')), sq(num(st.qH, 4, 'MVAr', st.prov.qH, 'Q_H')))), unit: 'MVA', digits: 4, prov: k('sH'), solver: Math.hypot(st.pH, st.qH) },
    { label: 'High-side current', general: 'I_H = |S_H| / (√3 |V_H|)', sym: 'I_H', expr: mul(div(ref(1), par(mul(sqrt(three), ref(0)))), kilo), unit: 'A', digits: 2, prov: k('iH'), solver: st.iH },
    { label: 'Low-side voltage', general: '|V_L| = V_{L,pu} × V_{base,L}', sym: '|V_L|', expr: mul(num(st.vL, 6, 'pu', st.prov.vL, 'V_{L,pu}'), num(p.lvKV, 2, 'kV', `data:${p.keys.lvKV}`, 'V_{base,L}')), unit: 'kV', digits: 3, prov: k('vLkV'), solver: st.vLkV, ...(unb ? { approx: { note: 'The average of the three phases’ voltages.', tol: 0.01 } } : {}) },
    { label: 'Apparent power at the low side, three-phase', general: '|S_L| = √(P_L^2 + Q_L^2)', sym: '|S_L|', expr: sqrt(add(sq(num(st.pL, 4, 'MW', st.prov.pL, 'P_L')), sq(num(st.qL, 4, 'MVAr', st.prov.qL, 'Q_L')))), unit: 'MVA', digits: 4, prov: k('sL'), solver: Math.hypot(st.pL, st.qL) },
    { label: 'Low-side current', general: 'I_L = |S_L| / (√3 |V_L|)', sym: 'I_L', expr: mul(div(ref(4), par(mul(sqrt(three), ref(3)))), kilo), unit: 'A', digits: 2, prov: k('iL'), solver: st.iL, ...(unb ? { approx: { note: 'From the average voltage.', tol: 0.5 } } : {}) },
    {
      label: st.ltcRatio !== undefined ? 'The currents’ ratio: the turns ratio, as the tap changer has set it (the model has no magnetizing current)' : 'The currents’ ratio: the turns ratio (the model has no magnetizing current)',
      general: st.ltcRatio !== undefined ? 'I_L / I_H = (V_{base,H} / V_{base,L}) / n_{tap}' : 'I_L / I_H = a = V_{base,H} / V_{base,L}',
      sym: 'I_L/I_H',
      expr: div(ref(5), ref(2)),
      unit: '',
      digits: 3,
      prov: k('ratio'),
      solver: a,
      ...(unb ? { approx: unb } : {}),
    },
    { label: 'Loss: what goes in less what comes out (P_L is negative: power leaves there)', general: 'P_{loss} = P_H + P_L', sym: 'P_{loss}', expr: mul(par(add(num(st.pH, 4, 'MW', st.prov.pH, 'P_H'), num(st.pL, 4, 'MW', st.prov.pL, 'P_L'))), kilo), unit: 'kW', digits: 1, prov: k('loss'), solver: st.loss * 1000 },
    {
      label: R.side === 'H' ? 'Winding resistance, referred to the high side' : 'Winding resistance, referred to the low side (where the model puts it)',
      general: R.side === 'H' ? 'R_H = r × V_{base,H}^2 / S_{base}' : 'R_L = r × V_{rated,L}^2 / S_{rated}',
      sym: R.side === 'H' ? 'R_H' : 'R_L',
      expr: div(mul(num(R.r, sigDigits(R.r, 5), 'pu', R.rProv, 'r'), sq(num(R.vBase, R.vBase >= 100 ? 0 : 2, 'kV', R.vProv, R.side === 'H' ? 'V_{base,H}' : 'V_{rated,L}'))), num(R.sBase, 0, 'MVA', R.sProv, R.side === 'H' ? 'S_{base}' : 'S_{rated}')),
      unit: 'Ω',
      digits: sigDigits((R.r * R.vBase * R.vBase) / R.sBase, 5),
      prov: k('R'),
    },
    {
      label: 'Loss again: the heat in the windings’ resistance',
      general: R.side === 'H' ? 'P_{loss} = 3 I_H^2 R_H' : 'P_{loss} = 3 I_L^2 R_L',
      sym: 'P_{loss}',
      expr: div(mul(mul(three, sq(ref(R.side === 'H' ? 2 : 5))), ref(8)), kilo),
      unit: 'kW',
      digits: 1,
      prov: k('lossI2R'),
      solver: st.loss * 1000,
      ...(unb ? { approx: { note: 'Each phase carries its own current; three times the balanced equivalent’s square is close, not exact.', tol: Math.max(0.5, st.loss * 1000 * 0.01) } } : {}),
    },
  ];
  return {
    title: 'Through the transformer',
    intro: 'Complex power S = V·I* (the current conjugated), three-phase. The currents follow from the power and voltage at each terminal; the loss is found twice, as the energy balance and as the heat in the resistance.',
    steps,
  };
}
