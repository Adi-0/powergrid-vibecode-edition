import { Complex } from '../physics/complex';
import { balancedSource, type DLoad, type DistNetwork } from '../physics/dist/network';
import { solveSweep, type SweepResult } from '../physics/dist/sweep';
import { clearSky, planeOfArray, pvOutput, sunPosition, PV_DEFAULTS } from '../physics/solar';
import { DAY, GROCERY_KW, LOAD_SHAPE, RESIDENTIAL_KW, airTemperature, hourly } from '../data/ca/profiles';
import { buildEvergreen, EVERGREEN, type FeederLayout } from '../data/dist/evergreen';

/**
 * The Evergreen substation and feeder 1105 at a moment of the day: loads attached,
 * source voltage taken from the transmission solution, solved phase by phase.
 */

export const EVERGREEN_SITE = { lat: 37.31, lon: -121.79 };

export interface Feeder {
  base: DistNetwork;
  layout: FeederLayout;
}

export function makeFeeder(): Feeder {
  const { net, layout } = buildEvergreen();
  return { base: net, layout };
}

/** Everything plugged in at this hour: homes, rooftop solar, the grocery, the other feeders. */
export function feederLoads(f: Feeder, hour: number): DLoad[] {
  const loads: DLoad[] = [];
  const avg = hourly(RESIDENTIAL_KW, hour);
  const sun = sunPosition(EVERGREEN_SITE.lat, EVERGREEN_SITE.lon, DAY.doy, hour, DAY.tzHours);
  const poa = planeOfArray(sun, clearSky(sun.zenith), 'fixed', 20).poa;
  const pvFrac = pvOutput(poa, airTemperature('bay', hour), { ...PV_DEFAULTS, dcacRatio: 1.15, dcLosses: 0.1 }).pac;
  for (const h of f.layout.homes) {
    const p = avg * h.scale;
    const base = Math.min(p, 0.6 * h.scale);
    const ac = Math.max(0, p - base);
    // 120 V circuits (lighting, outlets, fridge) on each leg; 240 V air conditioner
    loads.push({ id: `${h.id}:L1`, node: h.meter, conn: 'L1N', phases: [], kw: base * h.leg1, kvar: base * h.leg1 * 0.25, model: 'PQ', vRated: 120 });
    loads.push({ id: `${h.id}:L2`, node: h.meter, conn: 'L2N', phases: [], kw: base * (1 - h.leg1), kvar: base * (1 - h.leg1) * 0.25, model: 'PQ', vRated: 120 });
    if (ac > 0) loads.push({ id: `${h.id}:AC`, node: h.meter, conn: 'L12', phases: [], kw: ac, kvar: ac * 0.48, model: 'PQ', vRated: 240 });
    if (h.pvKW > 0 && pvFrac > 0)
      loads.push({ id: `${h.id}:PV`, node: h.meter, conn: 'L12', phases: [], kw: -h.pvKW * pvFrac, kvar: 0, model: 'PQ', vRated: 240 });
  }
  // the appliance at the outlet the chain ends at: a 1500 W hair dryer (resistive)
  const o = f.layout.outlet;
  loads.push({ id: 'OUTLET:appliance', node: o.node, conn: 'L1N', phases: [], kw: o.applianceW / 1000, kvar: 0, model: 'Z', vRated: 120 });
  // grocery store, 480Y/277 V, balanced
  const g = hourly(GROCERY_KW, hour);
  for (const p of [0, 1, 2] as const)
    loads.push({ id: `GROCERY:${'abc'[p]}`, node: 'C1-480', conn: 'Y', phases: [p], kw: g / 3, kvar: (g / 3) * 0.54, model: 'PQ', vRated: 277 });
  // the three other feeders on the bank, lumped at the 12 kV bus
  const other = EVERGREEN.otherFeedersPeakMW * 1000 * hourly(LOAD_SHAPE, hour);
  const q = Math.tan(Math.acos(EVERGREEN.otherFeedersPF));
  for (const p of [0, 1, 2] as const)
    loads.push({ id: `OTHER:${'abc'[p]}`, node: 'EV-12', conn: 'Y', phases: [p], kw: other / 3, kvar: (other / 3) * q, model: 'PQ', vRated: 7200 });
  return loads;
}

export interface FeederState {
  hour: number;
  net: DistNetwork;
  result: SweepResult;
  /** Tap changer position on the substation bank (steps of 0.625 %). */
  ltcStep: number;
  /** Complex power into the substation from the 60 kV bus, W + j var. */
  substationS: Complex;
  /** Complex power leaving the 12 kV bus into feeder 1105 (breaker CB-1105), W + j var. */
  feederHeadS: Complex;
  /** Planning estimate of the substation's demand at nominal voltage, no losses, W + j var. */
  nominalS: Complex;
}

/**
 * Solve the substation and feeder for a 60 kV source voltage (per unit and angle in
 * radians, from the transmission solution). The bank's tap changer holds the 12 kV
 * bus in its band; the feeder regulator follows its line-drop compensation.
 */
export function solveFeeder(f: Feeder, hour: number, vPu: number, angleRad: number, ltcStart = 0, open?: ReadonlySet<string>, regVset?: number): FeederState {
  const loads = feederLoads(f, hour);
  const net: DistNetwork = {
    ...f.base,
    loads,
    // a device opened by protection: everything beyond it is out
    // (and the regulator's set point, if the reader has moved it)
    branches: f.base.branches.map((b) => (b.kind === 'switch' && open?.has(b.id) ? { ...b, closed: false } : b.kind === 'regulator' && b.control && regVset !== undefined ? { ...b, control: { ...b.control, vset: regVset } } : { ...b })),
  };
  const src = balancedSource((vPu * 60000) / Math.sqrt(3), (angleRad * 180) / Math.PI);
  const bank = net.branches.find((b) => b.id === 'EV-BANK')!;
  if (bank.kind !== 'transformer') throw new Error('bank');
  let step = ltcStart;
  let result!: SweepResult;
  for (let k = 0; k < 20; k++) {
    bank.ltc = 1 + (EVERGREEN.ltc.stepPct / 100) * step;
    result = solveSweep(net, src, { regulate: true });
    const v12 = result.V.get('EV-12')!;
    const avg120 = ((v12[0].abs() + v12[1].abs() + v12[2].abs()) / 3 / (12470 / Math.sqrt(3))) * 120;
    const err = EVERGREEN.ltc.vset - avg120;
    if (Math.abs(err) <= EVERGREEN.ltc.band / 2) break;
    const next = Math.max(-EVERGREEN.ltc.maxSteps, Math.min(EVERGREEN.ltc.maxSteps, step + Math.round(err / 0.75)));
    if (next === step) break;
    step = next;
  }
  const head = result.branch.get('CB-1105')!;
  let nominal = Complex.ZERO;
  for (const l of loads) nominal = nominal.add(new Complex(l.kw * 1000, l.kvar * 1000));
  return { hour, net, result, ltcStep: step, substationS: result.headS, feederHeadS: head.Sf, nominalS: nominal };
}

const indexCache = new WeakMap<Feeder, Map<string, number>>();
/** Node id → index in the feeder model's node order (the order snapshots use). */
export function nodeIndex(f: Feeder): Map<string, number> {
  let m = indexCache.get(f);
  if (!m) {
    m = new Map([...f.base.nodes.keys()].map((id, i) => [id, i]));
    indexCache.set(f, m);
  }
  return m;
}
