/**
 * Loader for cases written in the MATPOWER / IEEE Common Data Format column
 * layout. The published IEEE test systems are distributed in this form, so the
 * data files below are transcriptions of the published tables rather than
 * re-typed values — that keeps them checkable against the source.
 *
 * Column layouts (MATPOWER 7 caseformat):
 *   bus:    [bus_i, type, Pd, Qd, Gs, Bs, area, Vm, Va, baseKV, zone, Vmax, Vmin]
 *   gen:    [bus, Pg, Qg, Qmax, Qmin, Vg, mBase, status, Pmax, Pmin]
 *   branch: [fbus, tbus, r, x, b, rateA, rateB, rateC, ratio, angle, status]
 *
 * MATPOWER bus type codes: 1 = PQ, 2 = PV, 3 = slack (ref), 4 = isolated.
 */

import { NetworkCase, Bus, Branch, Generator, Load, BusType } from '../core/network.js';

export interface MatpowerCase {
  id: string;
  name: string;
  baseMVA: number;
  bus: number[][];
  gen: number[][];
  branch: number[][];
  source: string;
  /** Published converged solution, if one is being asserted against. */
  reference?: {
    note: string;
    /** [|V| per-unit, θ degrees] per bus, in bus order. */
    voltages: [number, number][];
    totalLossMW?: number;
  };
}

const TYPE: Record<number, BusType> = { 1: 'PQ', 2: 'PV', 3: 'slack' };

export function fromMatpower(mc: MatpowerCase): NetworkCase {
  const buses: Bus[] = [];
  const loads: Load[] = [];
  const genVSet = new Map<string, number>();
  for (const g of mc.gen) {
    if (g[7] > 0) genVSet.set(String(g[0]), g[5]);
  }

  for (const row of mc.bus) {
    const id = String(row[0]);
    const type = TYPE[row[1]];
    if (!type) throw new Error(`${mc.id}: bus ${id} has unsupported type code ${row[1]}`);
    const bus: Bus = {
      id,
      name: `Bus ${id}`,
      type,
      baseKV: row[9] || 1,
      vMin: row[12] || 0.94,
      vMax: row[11] || 1.06,
    };
    // The scheduled voltage for slack/PV comes from the generator record, which
    // is authoritative in this format; the bus Vm column holds the SOLVED value.
    const vs = genVSet.get(id);
    if (type !== 'PQ') bus.vSched = vs ?? row[7];
    if (type === 'slack') bus.thetaSched = (row[8] * Math.PI) / 180;
    if (row[4]) bus.gShunt = row[4] / mc.baseMVA;
    if (row[5]) bus.bShunt = row[5] / mc.baseMVA;
    buses.push(bus);
    if (row[2] !== 0 || row[3] !== 0) {
      loads.push({ id: `L${id}`, name: `Load at bus ${id}`, bus: id, pMW: row[2], qMVAr: row[3] });
    }
  }

  const generators: Generator[] = mc.gen.map((g, k) => ({
    id: `G${k + 1}@${g[0]}`,
    name: `Generator ${k + 1} at bus ${g[0]}`,
    bus: String(g[0]),
    kind: 'gas-cc',
    pMW: g[1],
    qMVAr: g[2],
    qMaxMVAr: g[3],
    qMinMVAr: g[4],
    mBaseMVA: g[6],
    inService: g[7] > 0,
    pMaxMW: g[8],
    pMinMW: g[9],
  }));

  const branches: Branch[] = mc.branch.map((b, k) => {
    const ratio = b[8] ?? 0;
    const isXfmr = ratio !== 0 && ratio !== 1;
    return {
      id: `BR${k + 1}`,
      name: `${b[0]}–${b[1]}`,
      from: String(b[0]),
      to: String(b[1]),
      r: b[2],
      x: b[3],
      b: b[4],
      ratingMVA: b[5] || 9999,
      kind: isXfmr ? ('transformer' as const) : ('line' as const),
      ...(ratio && ratio !== 1 ? { tap: ratio } : {}),
      ...(b[9] ? { shiftDeg: b[9] } : {}),
      inService: (b[10] ?? 1) > 0,
    };
  });

  return {
    id: mc.id,
    name: mc.name,
    baseMVA: mc.baseMVA,
    buses,
    branches,
    generators,
    loads,
    source: mc.source,
  };
}
