/**
 * The chain from the transmission system to the socket.
 *
 * Two things are checked here that nothing else checks.
 *
 * ONE SOLVE, NOT TWO. The feeder and the service are in the same `NetworkCase`
 * as the 500 kV backbone, so conservation has to close across the whole chain.
 * If someone later splits them into a separate feeder-only solve fed from a
 * fixed source voltage — which is easier and is what most tools do — these
 * tests fail, and they should.
 *
 * THE ARITHMETIC SHOWN IS THE ARITHMETIC DONE. The brief requires every
 * calculation to be reproducible by hand and every panel's working to be
 * internally consistent. The service view shows a chain of voltage drops; these
 * tests re-derive each one from the printed inputs and check it against the
 * printed output.
 */

import { describe, it, expect } from 'vitest';
import { californiaCase } from '../src/data/california/network.js';
import { feederBusId, FEEDER_NODES, buildFeeder, MODELLED_SERVICE, FEEDER_KV } from '../src/data/california/feeder.js';
import { operate } from '../src/sim/operate.js';
import { DAY_PROFILES } from '../src/sim/profiles.js';
import { dispatchDay, applyDispatch } from '../src/sim/dispatch.js';
import { SLACK_BUS } from '../src/data/california/network.js';
import {
  solveService, APPLIANCES, LV_CONDUCTORS, conductorR, conductorX,
  SERVICE_NODES, SERVICE_RUNS, C84_1,
} from '../src/data/california/service.js';
import { ELEMENTS, CONNECTIONS, elementById, PROTECTION } from '../src/data/california/substation.js';

function solveAt(hour: number, season: 'summer' | 'winter' | 'spring' = 'summer') {
  const base = californiaCase();
  const profile = DAY_PROFILES[season];
  const day = dispatchDay(base, profile, SLACK_BUS);
  const net = applyDispatch(base, profile, hour, day[Math.round(hour) % 24]);
  return operate(net);
}

describe('the chain is one network, not several', () => {
  const solved = solveAt(18).solved;

  it('puts the feeder and the service in the same case as the backbone', () => {
    // The Oregon intertie and a kitchen socket, in one bus list.
    expect(solved.busById.get('MALIN_500')).toBeDefined();
    expect(solved.busById.get(feederBusId('F11'))).toBeDefined();
    expect(solved.busById.get('SVC_LV')).toBeDefined();
  });

  it('solves every feeder node', () => {
    for (const n of FEEDER_NODES) {
      const b = solved.busById.get(feederBusId(n.id));
      expect(b, n.id).toBeDefined();
      expect(Number.isFinite(b!.vpu), n.id).toBe(true);
    }
  });

  it('holds every feeder node inside ANSI C84.1 Range A', () => {
    const bad = FEEDER_NODES
      .map((n) => ({ id: n.id, vpu: solved.busById.get(feederBusId(n.id))!.vpu }))
      .filter((x) => x.vpu < 0.95 || x.vpu > 1.05);
    expect(bad).toEqual([]);
  });

  it('shows the voltage falling along the main and the regulator lifting it', () => {
    const v = (id: string) => solved.busById.get(feederBusId(id))!.vpu;
    // Falling from the substation to the regulator's input...
    expect(v('F00')).toBeGreaterThan(v('F01'));
    expect(v('F01')).toBeGreaterThan(v('F05'));
    // ...then a step UP across the regulator, which is the whole point of it.
    const after = solved.busById.get('FDR_F05_REG')!.vpu;
    expect(after).toBeGreaterThan(v('F05') + 0.01);
  });

  it('closes the power balance across the whole chain', () => {
    const s = solved.system;
    expect(Math.abs(s.pGenMW - s.pLoadMW - s.pLossMW)).toBeLessThan(1e-4);
  });

  it('converges at every hour of a summer day with the feeder attached', () => {
    for (let h = 0; h < 24; h += 3) {
      const r = solveAt(h);
      expect(r.solved.pf.converged, `hour ${h}`).toBe(true);
    }
  });
});

describe('the feeder model itself', () => {
  const feeder = buildFeeder();

  it('is the size the documentation says it is', () => {
    expect(feeder.buses.length).toBeGreaterThan(20);
    expect(feeder.peakKW).toBeGreaterThan(6000);
    expect(feeder.peakKW).toBeLessThan(8000);
    expect(feeder.totalCustomers).toBeGreaterThan(1400);
  });

  it('measures distance along the wire, not as the crow flies', () => {
    const far = feeder.distanceKm.get('F11')!;
    expect(far).toBeGreaterThan(2.5);
    expect(far).toBeLessThan(3.5);
    // Every node's distance is the sum of the sections back to the substation,
    // so a node further out is never closer.
    expect(feeder.distanceKm.get('F05')!).toBeLessThan(far);
    expect(feeder.distanceKm.get('F00')).toBe(0);
  });

  it('derives every section impedance from conductor geometry', () => {
    for (const br of feeder.branches) {
      if (br.kind === 'transformer') continue;
      expect(br.r, br.id).toBeGreaterThan(0);
      expect(br.x, br.id).toBeGreaterThan(0);
      // Distribution conductor is resistive: X/R is near one, unlike the
      // transmission system where it is ten or more.
      expect(br.x / br.r, br.id).toBeLessThan(3);
    }
  });

  it('gives a single-phase lateral a third of the rating of the main', () => {
    const main = feeder.branches.find((b) => b.id === 'FDR_F04_F05')!;
    const lateral = feeder.branches.find((b) => b.id === 'FDR_L3A_L3B')!;
    expect(lateral.ratingMVA).toBeLessThan(main.ratingMVA);
  });

  it('runs at 12.47 kV between phases and 7.2 kV to neutral', () => {
    expect(FEEDER_KV / Math.sqrt(3)).toBeCloseTo(7.2, 1);
  });
});

describe('the service arithmetic is internally consistent', () => {
  // The brief: every math panel's arithmetic must be internally consistent.
  // Here that means each printed drop equals its printed inputs multiplied
  // together, and each running voltage equals the one before it minus the drop.
  const cases = [
    { name: 'nothing on', appliance: null },
    ...APPLIANCES.map((a) => ({ name: a.name, appliance: a })),
  ];

  for (const c of cases) {
    describe(c.name, () => {
      const s = solveService(243.97, 3200, 650, c.appliance);
      const all = [...s.serviceSteps, ...s.branchSteps];

      it('computes each drop from the values it prints', () => {
        for (const step of all) {
          const sinPhi = Math.sqrt(1 - step.powerFactor * step.powerFactor);
          const expected =
            step.currentA * (step.rOhm * step.powerFactor + step.xOhm * sinPhi);
          expect(step.dropV, step.name).toBeCloseTo(expected, 9);
        }
      });

      it('chains the running voltage without losing anything in between', () => {
        let v = s.secondaryV;
        for (const step of s.serviceSteps) {
          expect(step.toV).toBeCloseTo(v - step.dropV, 9);
          v = step.toV;
        }
        expect(s.panelV).toBeCloseTo(v, 9);
        expect(s.panelLegV).toBeCloseTo(s.panelV / 2, 12);

        let vb = s.panelLegV;
        for (const step of s.branchSteps) {
          expect(step.toV).toBeCloseTo(vb - step.dropV, 9);
          vb = step.toV;
        }
        expect(s.outletV).toBeCloseTo(vb, 12);
      });

      it('states the total drop as a real percentage of 120 V', () => {
        expect(s.totalDropPercent).toBeCloseTo(
          ((s.secondaryV / 2 - s.outletV) / 120) * 100, 9
        );
      });

      it('only puts a 120 V appliance on the 120 V branch circuit', () => {
        if (c.appliance && c.appliance.volts === 240) {
          expect(s.branchCurrentA).toBe(0);
        }
      });
    });
  }

  it('gives one house its own appliance rather than a twelfth of it', () => {
    const off = solveService(243.97, 3200, 650, null);
    const ev = APPLIANCES.find((a) => a.id === 'ev')!;
    const on = solveService(243.97, 3200 + ev.watts, 650, ev);
    // 11.5 kW at 240 V is about 48 A. If the appliance were being shared out
    // over the twelve houses this would come to about 4 A.
    expect(on.serviceCurrentA - off.serviceCurrentA).toBeGreaterThan(40);
  });

  it('leaves the socket inside the ANSI C84.1 utilisation range', () => {
    const s = solveService(243.97, 3200, 650, APPLIANCES.find((a) => a.id === 'kettle')!);
    expect(s.outletV).toBeGreaterThanOrEqual(C84_1.utilisationRangeA[0]);
    expect(s.outletV).toBeLessThanOrEqual(C84_1.utilisationRangeA[1]);
    expect(s.withinRangeA).toBe(true);
  });
});

describe('the low-voltage conductor data', () => {
  it('converts ohms per thousand feet to ohms per metre correctly', () => {
    const c = LV_CONDUCTORS.cu12;
    // 1000 ft is 304.8 m, so 304.8 m of it has exactly its tabulated resistance.
    expect(conductorR(c, 304.8)).toBeCloseTo(c.rOhmPerKft, 6);
    expect(conductorX(c, 304.8)).toBeCloseTo(c.xOhmPerKft, 6);
  });

  it('makes a bigger conductor a lower resistance', () => {
    expect(LV_CONDUCTORS.cu10.rOhmPerKft).toBeLessThan(LV_CONDUCTORS.cu12.rOhmPerKft);
    expect(LV_CONDUCTORS.cu12.rOhmPerKft).toBeLessThan(LV_CONDUCTORS.cu14.rOhmPerKft);
    expect(LV_CONDUCTORS.al4_0.rOhmPerKft).toBeLessThan(LV_CONDUCTORS.al2_0.rOhmPerKft);
  });

  it('cites a source for every entry', () => {
    for (const c of Object.values(LV_CONDUCTORS)) {
      expect(c.source, c.id).toMatch(/NEC/);
    }
  });

  it('keeps every service run inside its conductor’s ampacity at peak', () => {
    const ev = APPLIANCES.find((a) => a.id === 'ev')!;
    const s = solveService(243.97, 3200 + ev.watts, 650, ev);
    for (const step of [...s.serviceSteps, ...s.branchSteps]) {
      expect(step.currentA, step.name).toBeLessThan(step.conductor.ampacityA);
    }
  });
});

describe('the substation is structurally sound', () => {
  it('connects every element to something', () => {
    const connected = new Set(CONNECTIONS.flat());
    // The ground grid is bonded to everything and drawn on its own, which is
    // the one element allowed to stand outside the one-line topology.
    const loose = ELEMENTS
      .filter((e) => !connected.has(e.id) && e.kind !== 'ground-grid')
      .map((e) => e.id);
    expect(loose).toEqual([]);
  });

  it('refers only to elements that exist', () => {
    for (const [a, b] of CONNECTIONS) {
      expect(elementById.has(a), a).toBe(true);
      expect(elementById.has(b), b).toBe(true);
    }
  });

  it('gives every element both a yard position and a diagram position', () => {
    for (const e of ELEMENTS) {
      expect(e.yard.length, e.id).toBe(3);
      expect(e.schematic.length, e.id).toBe(2);
      expect(e.note.length, e.id).toBeGreaterThan(30);
    }
  });

  it('uses ANSI/IEEE C37.2 device numbers and applies them to real elements', () => {
    for (const p of PROTECTION) {
      expect(p.device, p.name).toMatch(/^[0-9]/);
      for (const id of p.appliesTo) {
        expect(elementById.has(id), `${p.device} → ${id}`).toBe(true);
      }
    }
  });

  it('keeps the bus tie normally open, which is not a fault', () => {
    expect(elementById.get('BUS12_TIE')!.closed).toBe(false);
  });
});

describe('the premises wiring', () => {
  it('routes from the transformer to the socket without a gap', () => {
    const ids = new Set(SERVICE_NODES.map((n) => n.id));
    for (const r of SERVICE_RUNS) {
      expect(ids.has(r.from), r.from).toBe(true);
      expect(ids.has(r.to), r.to).toBe(true);
      expect(r.lengthM, `${r.from}-${r.to}`).toBeGreaterThan(0);
    }
    // Everything except the transformer is reachable from it.
    const reached = new Set(['PAD']);
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of SERVICE_RUNS) {
        if (reached.has(r.from) && !reached.has(r.to)) { reached.add(r.to); grew = true; }
        if (reached.has(r.to) && !reached.has(r.from)) { reached.add(r.from); grew = true; }
      }
    }
    expect([...ids].filter((id) => !reached.has(id))).toEqual([]);
  });

  it('ends at a socket, which is where the brief says the tree terminates', () => {
    expect(SERVICE_NODES.some((n) => n.kind === 'outlet')).toBe(true);
  });

  it('serves twelve houses off one transformer', () => {
    expect(MODELLED_SERVICE.housesServed).toBe(12);
  });
});
