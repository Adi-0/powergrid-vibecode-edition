/**
 * Which derivations belong to what the reader has selected.
 *
 * The brief: "the math panel shows the derivation for whatever is selected".
 * That is one sentence and several different answers, because the things a
 * reader can select are not all the same kind of thing. A circuit has a flow
 * calculation and, behind it, the geometry that produced its impedance. A
 * transformer has a flow calculation and, behind it, a nameplate. A socket has
 * a chain of voltage drops. This module is the map.
 *
 * It lives beside the derivations rather than in the interface so that a test
 * can walk every selectable object in the network and check that each one
 * produces a derivation that holds together — which is exactly what
 * `test/math-panel.test.ts` does.
 */

import { SolvedCase } from '../core/results.js';
import { ServiceSolution, serviceNodeById, SERVICE_RUNS } from '../data/california/service.js';
import { elementById } from '../data/california/substation.js';
import { plantItemById, energyChain } from '../data/california/plant.js';
import { operatingPoint, capabilityCurve, solvedOutput } from '../core/machine.js';
import { FEEDER_NODES, feederBusId } from '../data/california/feeder.js';
import {
  Derivation, deriveBranch, deriveBus, deriveLineGeometry, deriveServiceDrop,
  deriveSystemBalance, deriveTransformerImpedance, derivePlantEnergy,
  deriveMachine, deriveFault, deriveFerranti,
} from './derive.js';
import { FaultResult } from '../core/fault.js';
import { ferrantiStudy, FerrantiStudy } from '../sim/ferranti.js';

export type SelectionKind = 'site' | 'circuit' | 'bus' | 'generator' | 'none';

/**
 * Every derivation worth showing for one selection, most important first.
 *
 * An empty array means there is nothing honest to show, and the interface must
 * then not offer the button — which is better than opening a panel that
 * apologises.
 */
export function derivationsFor(
  kind: SelectionKind,
  id: string | null,
  solved: SolvedCase,
  service: ServiceSolution,
  fault?: FaultResult | null
): Derivation[] {
  if (!id) return [];

  // A fault at the selected bus takes precedence: it is what the reader just
  // asked about, and the ordinary flow calculation for that bus is still
  // available underneath it.
  const faultFirst: Derivation[] = [];
  if (fault && fault.busId === id) {
    const bus = solved.net.buses.find((b) => b.id === id);
    if (bus) faultFirst.push(deriveFault(fault, bus.baseKV));
  }
  if (faultFirst.length > 0) {
    return [...faultFirst, ...derivationsFor(kind, id, solved, service, null)];
  }

  if (kind === 'circuit') {
    const byId = `${id}`;
    const br = solved.net.branches.find((b) => b.id === byId);
    const flow = solved.branchById.get(byId);
    if (br && flow) return branchDerivations(byId, solved);
    // A service run, which is a piece of wire the solver never saw.
    const run = SERVICE_RUNS.find((r) => `${r.from}_${r.to}` === byId);
    if (run) return serviceDerivations(run.to, service);
    return [];
  }

  if (kind === 'bus') {
    const bus = solved.net.buses.find((b) => b.id === id);
    return bus ? [deriveBus(bus, solved)].filter(isDerivation) : [];
  }

  if (kind !== 'site') return [];

  // --- a piece of equipment in the substation -------------------------------
  const element = elementById.get(id);
  if (element) {
    if (element.kind === 'bus') {
      const busId = element.kV >= 100 ? 'EDENVALE_115' : 'EDENVALE_12';
      const bus = solved.net.buses.find((b) => b.id === busId);
      return bus ? [deriveBus(bus, solved)].filter(isDerivation) : [];
    }
    // Everything else in a bay carries the flow of the bay it is in, so the
    // right derivation for a current transformer is the one for the circuit
    // it is measuring — which is also the honest answer to "what is this for".
    const branchId = branchForElement(id, solved);
    if (branchId) return branchDerivations(branchId, solved);
    return [];
  }

  // --- something inside the power station -----------------------------------
  const plantItem = plantItemById.get(id);
  if (plantItem) {
    const g = solved.net.generators.find(
      (x) => x.bus.startsWith('METCALF') && x.kind === 'gas-cc');
    if (!g) return [];
    const chain = energyChain(g, g.pMW);
    const out: Derivation[] = [derivePlantEnergy(chain)];
    // A generator inside the plant also has the machine derivation behind it,
    // because that is what it is.
    if (plantItem.kind === 'generator') {
      const bus = solved.busById.get(g.bus);
      const o = solvedOutput(
        g, bus, solved.net.generators.filter((x) => x.bus === g.bus));
      const op = operatingPoint(g, bus?.vpu ?? 1, o.pMW, o.qMVAr);
      out.unshift(deriveMachine(g, op, capabilityCurve(g, bus?.vpu ?? 1)));
    }
    return out;
  }

  // --- a pole on the feeder -------------------------------------------------
  const pole = FEEDER_NODES.find((n) => n.id === id);
  if (pole) {
    const bus = solved.net.buses.find((b) => b.id === feederBusId(pole.id));
    const out: Derivation[] = [];
    if (bus) {
      const d = deriveBus(bus, solved);
      if (d) out.push(d);
    }
    // The section arriving at this pole: where its voltage drop came from.
    const arriving = solved.net.branches.find(
      (b) => b.to === feederBusId(pole.id) && b.id.startsWith('FDR_')
    );
    if (arriving && solved.branchById.get(arriving.id)) {
      out.push(...branchDerivations(arriving.id, solved));
    }
    return out;
  }

  // --- something inside the house -------------------------------------------
  if (serviceNodeById.has(id)) return serviceDerivations(id, service);

  // --- a site on the map ----------------------------------------------------
  const siteBuses = solved.net.buses.filter(
    (b) => b.id.split('_')[0].toLowerCase() === id.toLowerCase()
  );
  if (siteBuses.length > 0) {
    // The highest voltage present, because that is the one the site is known
    // by and the one everything else there hangs off.
    const top = siteBuses.reduce((a, b) => (b.baseKV > a.baseKV ? b : a));
    return [deriveBus(top, solved), deriveSystemBalance(solved)].filter(isDerivation);
  }

  return [];
}

const isDerivation = (d: Derivation | null): d is Derivation => d !== null;

/** Lines shorter than this do not rise enough for the point to be worth making. */
export const FERRANTI_MIN_KM = 120;

/**
 * The Ferranti study, cached per solved case.
 *
 * It is a whole extra power flow, and the math panel is rebuilt every time the
 * network is re-solved. Caching on the solved case means it is computed once
 * per line per solve and never on a redraw.
 */
const ferrantiCache = new WeakMap<SolvedCase, Map<string, FerrantiStudy | null>>();

function ferrantiFor(solved: SolvedCase, branchId: string): FerrantiStudy | null {
  let byLine = ferrantiCache.get(solved);
  if (!byLine) {
    byLine = new Map();
    ferrantiCache.set(solved, byLine);
  }
  if (!byLine.has(branchId)) {
    byLine.set(branchId, ferrantiStudy(solved.net, branchId));
  }
  return byLine.get(branchId) ?? null;
}

/** The flow calculation for a branch, and where its impedance came from. */
function branchDerivations(branchId: string, solved: SolvedCase): Derivation[] {
  const br = solved.net.branches.find((b) => b.id === branchId);
  const flow = solved.branchById.get(branchId);
  if (!br || !flow) return [];
  const out: Derivation[] = [deriveBranch(br, flow, solved)];

  const geometry = deriveLineGeometry(br, solved.net);
  if (geometry) out.push(geometry);

  // A line long enough for its own capacitance to matter gets the Ferranti
  // study, because on a line this long the capacitance is not a correction
  // term — it is the dominant thing about the line when it is lightly loaded.
  if (br.kind === 'line' && (br.lengthKm ?? 0) > FERRANTI_MIN_KM && br.b > 0) {
    const f = ferrantiFor(solved, branchId);
    if (f && f.converged) out.push(deriveFerranti(f));
  }

  if (br.kind === 'transformer') {
    // Recover the nameplate from the model, rather than looking it up in a
    // second table that could disagree with the branch actually being shown.
    // |Z| on the transformer's own base is the per-unit impedance scaled back
    // by the ratio of the bases, which is the base change run backwards.
    const ownMVA = br.ratingMVA;
    const zMagSystem = Math.hypot(br.r, br.x);
    const percentZ = zMagSystem * (ownMVA / solved.net.baseMVA) * 100;
    const xOverR = br.r > 0 ? br.x / br.r : 0;
    if (percentZ > 0 && xOverR > 0) {
      out.push(deriveTransformerImpedance(br, solved.net, percentZ, xOverR, ownMVA));
    }
  }
  return out;
}

/** The chain of drops from the transformer down to one point in the house. */
function serviceDerivations(nodeId: string, service: ServiceSolution): Derivation[] {
  const node = serviceNodeById.get(nodeId);
  if (!node) return [];
  const order = SERVICE_RUNS.map((r) => `${r.from}_${r.to}`);
  const chain = [...service.serviceSteps, ...service.branchSteps];
  const upto: typeof chain = [];
  for (const runId of order) {
    const step = chain.find((s) => s.runId === runId);
    if (!step) continue;
    upto.push(step);
    if (runId.endsWith(`_${nodeId}`)) break;
  }
  if (upto.length === 0) return [];
  return [deriveServiceDrop(upto, service.secondaryV, node.name)];
}

/**
 * The circuit a piece of substation equipment sits in.
 *
 * A breaker, a disconnect and a pair of current transformers in the same bay
 * all carry the same current, so they all have the same derivation behind them.
 * The bays are matched by the prefix of the element id, which is how the
 * substation data names them.
 */
function branchForElement(elementId: string, solved: SolvedCase): string | null {
  if (elementId.startsWith('T1')) return findBranch(solved, 'T_EDENVALE_115_EDENVALE_12_1');
  if (elementId.startsWith('T2')) return findBranch(solved, 'T_EDENVALE_115_EDENVALE_12_2');
  if (elementId.startsWith('FDR1201')) return findBranch(solved, 'FDR_GETAWAY');
  if (elementId.startsWith('L1') || elementId.startsWith('L2')) {
    // Whichever incoming circuits the case actually has, in a stable order.
    const incoming = solved.branches
      .filter((f) =>
        (f.from === 'EDENVALE_115' || f.to === 'EDENVALE_115') &&
        solved.net.branches.find((b) => b.id === f.branchId)?.kind !== 'transformer')
      .map((f) => f.branchId)
      .sort();
    return incoming[elementId.startsWith('L1') ? 0 : 1] ?? null;
  }
  return null;
}

const findBranch = (solved: SolvedCase, id: string): string | null =>
  solved.branchById.has(id) ? id : null;
