/**
 * Faults, symmetrical components and protection coordination.
 *
 * Three claims are checked, and each is one that a model can look plausible
 * while quietly getting wrong.
 *
 * THE TRANSFORM IS EXACT AND REVERSIBLE. Symmetrical components are the whole
 * basis of unbalanced analysis, and a sign or a factor of three in the wrong
 * place gives answers that are the right order of magnitude and wrong.
 *
 * THE SEQUENCE NETWORKS ARE DIFFERENT NETWORKS. In particular a delta winding
 * blocks zero-sequence current completely, and if the model quietly lets it
 * through, every ground fault calculation on the system is wrong and every
 * conclusion about earthing with it.
 *
 * THE PROTECTION COORDINATES AT EVERY CURRENT, not just at one. Two curves can
 * be comfortably apart at one current and cross at another, and the crossing
 * point is exactly where a fault will eventually happen.
 */

import { describe, it, expect } from 'vitest';
import { C, polar, abs, arg, toDeg, add } from '../src/core/complex.js';
import {
  A, A2, toSequence, toPhase, residual, unbalanceFactor, balanced,
} from '../src/core/sequence.js';
import {
  buildFaultModel, solveFault, theveninImpedance, zeroSequencePath,
  branchImpedance, ZERO_SEQUENCE_RATIO, FaultKind,
} from '../src/core/fault.js';
import {
  CURVE_SHAPES, operatingTime, checkCoordination, checkChain, firstToOperate,
  ProtectiveDevice, COORDINATING_INTERVAL_S,
} from '../src/core/protection.js';
import { californiaCase, SLACK_BUS } from '../src/data/california/network.js';
import { indexCase } from '../src/core/network.js';
import { operate } from '../src/sim/operate.js';
import { DAY_PROFILES } from '../src/sim/profiles.js';
import { dispatchDay, applyDispatch } from '../src/sim/dispatch.js';
import { studyFault, feederFaultLevels } from '../src/sim/faults.js';
import { cherryLaneProtection } from '../src/data/california/protection-scheme.js';
import { feederBusId } from '../src/data/california/feeder.js';

// ---------------------------------------------------------------------------
// Symmetrical components
// ---------------------------------------------------------------------------

describe('the a operator', () => {
  it('is a rotation of 120° with no change of magnitude', () => {
    expect(abs(A)).toBeCloseTo(1, 12);
    expect(toDeg(arg(A))).toBeCloseTo(120, 10);
    expect(abs(A2)).toBeCloseTo(1, 12);
    expect(toDeg(arg(A2))).toBeCloseTo(-120, 10);
  });

  it('satisfies 1 + a + a² = 0', () => {
    // Which is the statement that three equal phasors 120° apart add to
    // nothing — and therefore that a balanced system needs no neutral.
    const sum = add(add(C(1, 0), A), A2);
    expect(abs(sum)).toBeLessThan(1e-12);
  });
});

describe('the symmetrical component transform', () => {
  const sets = [
    balanced(1),
    balanced(2.5, 37),
    { a: C(1, 0), b: C(0, 0), c: C(0, 0) },
    { a: C(1.2, 0.3), b: polar(0.7, -2.1), c: polar(1.9, 1.4) },
    { a: C(0, 0), b: polar(3, -1.5), c: polar(3, 1.5) },
  ];

  it('is exactly reversible', () => {
    for (const p of sets) {
      const back = toPhase(toSequence(p));
      for (const k of ['a', 'b', 'c'] as const) {
        expect(back[k].re, k).toBeCloseTo(p[k].re, 12);
        expect(back[k].im, k).toBeCloseTo(p[k].im, 12);
      }
    }
  });

  it('gives a balanced set no negative or zero sequence at all', () => {
    const s = toSequence(balanced(1.03, 17));
    expect(abs(s.negative)).toBeLessThan(1e-12);
    expect(abs(s.zero)).toBeLessThan(1e-12);
    expect(abs(s.positive)).toBeCloseTo(1.03, 12);
  });

  it('makes the residual exactly three times the zero sequence', () => {
    // This is why a ground relay measures the residual: in a balanced circuit
    // it is zero however much load is flowing.
    for (const p of sets) {
      const s = toSequence(p);
      expect(abs(residual(p))).toBeCloseTo(3 * abs(s.zero), 11);
    }
    expect(abs(residual(balanced(5)))).toBeLessThan(1e-12);
  });

  it('measures unbalance as the negative over the positive sequence', () => {
    expect(unbalanceFactor(balanced(1))).toBeLessThan(1e-12);
    // One phase open is the textbook worst case.
    const openPhase = { a: C(1, 0), b: polar(1, (-120 * Math.PI) / 180), c: C(0, 0) };
    expect(unbalanceFactor(openPhase)).toBeGreaterThan(0.4);
  });

  it('puts a single energised phase equally into all three sequences', () => {
    // Ia = 1, Ib = Ic = 0 gives I₀ = I₁ = I₂ = ⅓, which is the reason a
    // single-line-to-ground fault connects the three networks in series.
    const s = toSequence({ a: C(1, 0), b: C(0, 0), c: C(0, 0) });
    for (const k of ['zero', 'positive', 'negative'] as const) {
      expect(s[k].re, k).toBeCloseTo(1 / 3, 12);
      expect(s[k].im, k).toBeCloseTo(0, 12);
    }
  });
});

// ---------------------------------------------------------------------------
// The sequence networks
// ---------------------------------------------------------------------------

describe('what a transformer does to zero sequence', () => {
  it('blocks it through a delta winding', () => {
    const p = zeroSequencePath('Dyn1');
    expect(p.through).toBe(false);
    expect(p.groundedFrom).toBe(false);
    expect(p.groundedTo).toBe(true);
  });

  it('passes it through an autotransformer', () => {
    expect(zeroSequencePath('YNa0').through).toBe(true);
  });

  it('explains itself in every case', () => {
    for (const g of ['Dyn1', 'YNa0', 'YNd1', 'Dyn0', 'regulator', undefined]) {
      expect(zeroSequencePath(g).why.length, String(g)).toBeGreaterThan(40);
    }
  });

  it('makes a line’s zero-sequence impedance about three times its positive', () => {
    const line = {
      id: 'x', name: 'x', from: 'a', to: 'b', r: 0.01, x: 0.1, b: 0.02,
      ratingMVA: 100, ratingEmergencyMVA: 120, kind: 'line' as const, inService: true,
    };
    const z1 = branchImpedance(line, 'positive');
    const z0 = branchImpedance(line, 'zero');
    expect(z0.im / z1.im).toBeCloseTo(ZERO_SEQUENCE_RATIO.line, 9);
    expect(branchImpedance(line, 'negative').im).toBeCloseTo(z1.im, 12);
  });
});

// ---------------------------------------------------------------------------
// Faults on the real network
// ---------------------------------------------------------------------------

function solved() {
  const base = californiaCase();
  const profile = DAY_PROFILES.summer;
  const day = dispatchDay(base, profile, SLACK_BUS);
  const net = applyDispatch(base, profile, 18, day[18]);
  return operate(net).solved;
}

const S = solved();
const IDX = indexCase(S.net);
const MODEL = buildFaultModel(S.net, IDX);

const at = (busId: string, kind: FaultKind) => {
  const bus = S.net.buses.find((b) => b.id === busId)!;
  const r = S.busById.get(busId)!;
  return solveFault(MODEL, busId, kind, {
    prefaultV: polar(r.vpu, (r.angleDeg * Math.PI) / 180),
    baseKV: bus.baseKV,
    baseMVA: S.net.baseMVA,
  });
};

describe('short-circuit current on the modelled network', () => {
  const strong = 'METCALF_230';
  const weak = 'FDR_F11';

  it('finds a Thevenin impedance that is mostly reactive', () => {
    for (const bus of [strong, weak]) {
      const z = theveninImpedance(MODEL.positive, bus);
      expect(z.im, bus).toBeGreaterThan(0);
      // A transmission network is inductive: X/R of five or more.
      expect(z.im / Math.max(1e-9, z.re), bus).toBeGreaterThan(1);
    }
  });

  it('gives a stronger source at a transmission bus than at the end of a feeder', () => {
    const z1strong = abs(theveninImpedance(MODEL.positive, strong));
    const z1weak = abs(theveninImpedance(MODEL.positive, weak));
    expect(z1weak).toBeGreaterThan(z1strong * 10);
    expect(at(strong, 'three-phase').maxAmps)
      .toBeGreaterThan(at(weak, 'three-phase').maxAmps);
  });

  it('produces fault levels in the range real equipment is rated for', () => {
    const f = at(strong, 'three-phase');
    // A 230 kV bus in a meshed network: tens of kiloamperes, a few GVA.
    expect(f.maxAmps).toBeGreaterThan(2000);
    expect(f.maxAmps).toBeLessThan(80000);
    expect(f.mva).toBeGreaterThan(500);
  });

  it('makes a three-phase fault perfectly balanced', () => {
    const f = at(strong, 'three-phase');
    expect(abs(f.sequenceCurrents.zero)).toBeLessThan(1e-12);
    expect(abs(f.sequenceCurrents.negative)).toBeLessThan(1e-12);
    const mags = f.phaseAmps.map((p) => p.magnitude);
    expect(Math.max(...mags) - Math.min(...mags)).toBeLessThan(1e-6);
  });

  it('puts equal current in all three sequences for a line-to-ground fault', () => {
    const f = at(strong, 'single-line-to-ground');
    const z = abs(f.sequenceCurrents.zero);
    expect(abs(f.sequenceCurrents.positive)).toBeCloseTo(z, 9);
    expect(abs(f.sequenceCurrents.negative)).toBeCloseTo(z, 9);
    // Only the faulted phase carries current.
    const byPhase = Object.fromEntries(f.phaseAmps.map((p) => [p.phase, p.magnitude]));
    expect(byPhase.b).toBeLessThan(byPhase.a * 1e-6);
    expect(byPhase.c).toBeLessThan(byPhase.a * 1e-6);
    // And the residual is the whole of it.
    expect(f.residualAmps).toBeCloseTo(byPhase.a, 6);
  });

  it('puts no current to earth in a line-to-line fault', () => {
    const f = at(strong, 'line-to-line');
    expect(abs(f.sequenceCurrents.zero)).toBeLessThan(1e-12);
    expect(f.residualAmps).toBeLessThan(1e-6);
    // Phase a carries nothing; b and c carry equal and opposite current.
    const byPhase = Object.fromEntries(f.phaseAmps.map((p) => [p.phase, p.magnitude]));
    expect(byPhase.a).toBeLessThan(byPhase.b * 1e-6);
    expect(byPhase.b).toBeCloseTo(byPhase.c, 6);
  });

  it('makes a line-to-line fault about 87 % of a three-phase one', () => {
    // √3/2 exactly, when Z₁ = Z₂ — which is the standard rule of thumb and
    // falls straight out of the sequence network connection.
    const three = at(strong, 'three-phase').maxAmps;
    const ll = at(strong, 'line-to-line').maxAmps;
    expect(ll / three).toBeGreaterThan(0.8);
    expect(ll / three).toBeLessThan(0.92);
  });

  it('gives every fault type a connection explained in words', () => {
    const kinds: FaultKind[] = [
      'three-phase', 'single-line-to-ground', 'line-to-line', 'double-line-to-ground',
    ];
    for (const k of kinds) {
      const f = at(strong, k);
      expect(f.connection.length, k).toBeGreaterThan(60);
      expect(Number.isFinite(f.maxAmps), k).toBe(true);
      expect(f.maxAmps, k).toBeGreaterThan(0);
    }
  });

  it('reduces the current when the fault has impedance in it', () => {
    const bus = S.net.buses.find((b) => b.id === strong)!;
    const r = S.busById.get(strong)!;
    const bolted = solveFault(MODEL, strong, 'three-phase', {
      prefaultV: polar(r.vpu, 0), baseKV: bus.baseKV, baseMVA: S.net.baseMVA,
    });
    const arcing = solveFault(MODEL, strong, 'three-phase', {
      prefaultV: polar(r.vpu, 0), zf: C(0.05, 0),
      baseKV: bus.baseKV, baseMVA: S.net.baseMVA,
    });
    expect(arcing.maxAmps).toBeLessThan(bolted.maxAmps);
  });

  it('keeps zero-sequence current off the transmission side of a delta winding', () => {
    // The whole point of Dyn1 on a distribution transformer. A ground fault on
    // the 12.47 kV feeder must not push earth current onto the 115 kV system,
    // so the zero-sequence Thevenin impedance seen at the high-voltage bus is
    // very much larger than at the low-voltage one.
    const lv = abs(theveninImpedance(MODEL.zero, 'EDENVALE_12'));
    const hv = abs(theveninImpedance(MODEL.zero, 'EDENVALE_115'));
    expect(lv).toBeGreaterThan(0);
    expect(hv).toBeGreaterThan(lv);
  });
});

// ---------------------------------------------------------------------------
// Protection
// ---------------------------------------------------------------------------

describe('inverse-time overcurrent curves', () => {
  const relay: ProtectiveDevice = {
    id: 'r', name: 'test relay', kind: 'relay', device: '51',
    pickupA: 600, timeDial: 2, curve: 'very', mechanismS: 0.05,
    position: 1, note: 'x',
  };

  it('never operates below pickup', () => {
    expect(operatingTime(relay, 599)).toBeNull();
    expect(operatingTime(relay, 600)).toBeNull();
    expect(operatingTime(relay, 601)).not.toBeNull();
  });

  it('operates sooner the larger the current', () => {
    const times = [700, 1200, 3000, 12000].map((a) => operatingTime(relay, a)!);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeLessThan(times[i - 1]);
    }
  });

  it('goes to infinity as the current approaches pickup', () => {
    expect(operatingTime(relay, 600.01)!).toBeGreaterThan(1000);
  });

  it('slides the whole curve with the time dial and does not reshape it', () => {
    const fast: ProtectiveDevice = { ...relay, timeDial: 1, mechanismS: 0 };
    const slow: ProtectiveDevice = { ...relay, timeDial: 3, mechanismS: 0 };
    for (const a of [800, 2000, 9000]) {
      expect(operatingTime(slow, a)! / operatingTime(fast, a)!).toBeCloseTo(3, 9);
    }
  });

  it('uses the published IEEE C37.112 constants', () => {
    expect(CURVE_SHAPES.very.a).toBe(19.61);
    expect(CURVE_SHAPES.very.p).toBe(2);
    expect(CURVE_SHAPES.extremely.a).toBe(28.2);
    for (const c of Object.values(CURVE_SHAPES)) {
      expect(c.standard).toMatch(/C37\.112/);
      expect(c.use.length).toBeGreaterThan(40);
    }
  });

  it('makes a steeper curve discriminate harder between near and far faults', () => {
    const near = 8000;
    const far = 1200;
    const ratio = (shape: 'moderately' | 'very' | 'extremely') => {
      const d: ProtectiveDevice = { ...relay, curve: shape, mechanismS: 0 };
      return operatingTime(d, far)! / operatingTime(d, near)!;
    };
    expect(ratio('very')).toBeGreaterThan(ratio('moderately'));
    expect(ratio('extremely')).toBeGreaterThan(ratio('very'));
  });

  it('bypasses the curve entirely above the instantaneous setting', () => {
    const withInst: ProtectiveDevice = { ...relay, instantaneousA: 5000 };
    expect(operatingTime(withInst, 6000)).toBe(withInst.mechanismS);
    expect(operatingTime(withInst, 4000)).toBeGreaterThan(withInst.mechanismS);
  });
});

describe('coordination', () => {
  const fuse: ProtectiveDevice = {
    id: 'fuse', name: 'lateral fuse', kind: 'fuse', device: '—',
    pickupA: 140, timeDial: 0.09, curve: 'extremely', mechanismS: 0,
    position: 0, note: 'x',
  };
  const recloser: ProtectiveDevice = {
    id: 'rec', name: 'recloser', kind: 'recloser', device: '79',
    pickupA: 400, timeDial: 1.1, curve: 'very', mechanismS: 0.05,
    position: 1, note: 'x',
  };
  const breaker: ProtectiveDevice = {
    id: 'cb', name: 'feeder breaker', kind: 'breaker', device: '51',
    pickupA: 600, timeDial: 3.0, curve: 'very', mechanismS: 0.08,
    position: 2, note: 'x',
  };
  const chain = [fuse, recloser, breaker];
  const currents = [500, 900, 1600, 3000, 6000];

  it('lets the nearest device clear the fault', () => {
    for (const a of currents) {
      const first = firstToOperate(chain, a)!;
      expect(first.device.id, `${a} A`).toBe('fuse');
    }
  });

  it('keeps the upstream device slower at every current, with margin', () => {
    const checks = checkChain(chain, currents);
    const failures = checks
      .filter((c) => !c.ok)
      .map((c) => `${c.downstream.name} vs ${c.upstream.name} at ${c.currentA} A: ` +
        `${c.marginS?.toFixed(3)} s`);
    expect(failures).toEqual([]);
  });

  it('catches a pair that crosses somewhere in the middle', () => {
    // Two curves comfortably apart at low current and crossing at high, which
    // is the failure this whole exercise exists to prevent. A flat upstream
    // curve against a steep downstream one does exactly that.
    const flatDownstream: ProtectiveDevice = {
      ...recloser, curve: 'moderately', timeDial: 4, mechanismS: 0.05, position: 0,
    };
    const steepUpstream: ProtectiveDevice = {
      ...breaker, curve: 'extremely', timeDial: 3, mechanismS: 0.08, position: 1,
    };
    const currentsAcross = [700, 1500, 4000, 15000];
    const checks = checkChain([flatDownstream, steepUpstream], currentsAcross);
    // Comfortable at low current, crossed at high — the failure that matters,
    // and the reason coordination is checked across a RANGE rather than at one
    // convenient number.
    const low = checks.find((c) => c.currentA === 700)!;
    const high = checks.find((c) => c.currentA === 15000)!;
    expect(low.ok).toBe(true);
    expect(high.ok).toBe(false);
    expect(high.marginS!).toBeLessThan(low.marginS!);
  });

  it('does not call it a failure when the upstream device cannot see the fault', () => {
    // Below the upstream pickup there is nothing to coordinate with: the pair
    // cannot mis-operate, and reporting it as a failure would bury the real ones.
    const c = checkCoordination(fuse, breaker, 200);
    expect(c.upstreamS).toBeNull();
    expect(c.ok).toBe(true);
  });

  it('uses a coordinating interval a real engineer would recognise', () => {
    expect(COORDINATING_INTERVAL_S).toBeGreaterThanOrEqual(0.2);
    expect(COORDINATING_INTERVAL_S).toBeLessThanOrEqual(0.4);
  });
});

// ---------------------------------------------------------------------------
// The whole study, on the real feeder
// ---------------------------------------------------------------------------

describe('a fault on Cherry Lane, end to end', () => {
  const levels = feederFaultLevels(S);

  it('finds fault levels that fall with distance from the substation', () => {
    expect(levels.atBusA).toBeGreaterThan(levels.atRecloserA);
    expect(levels.atRecloserA).toBeGreaterThan(levels.atFarEndA);
    // A 12.47 kV bus behind two 28 MVA transformers: twenty-odd kiloamperes.
    expect(levels.atBusA).toBeGreaterThan(8000);
    expect(levels.atBusA).toBeLessThan(45000);
    // And the far end of three kilometres of 336 kcmil is a few thousand.
    expect(levels.atFarEndA).toBeGreaterThan(1500);
  });

  it('puts only the devices in series with the fault into the chain', () => {
    // Selectivity is geometry before it is timing. A fuse on Cherry Lane does
    // not carry the current to a fault on the substation busbar.
    const onLateral = studyFault(S, feederBusId('L3B'), 'three-phase')!;
    const onMain = studyFault(S, feederBusId('F06'), 'three-phase')!;
    const onBus = studyFault(S, 'EDENVALE_12', 'three-phase')!;
    expect(onLateral.chain.map((d) => d.id)).toContain('FUSE_L3');
    expect(onMain.chain.map((d) => d.id)).not.toContain('FUSE_L3');
    expect(onBus.chain.map((d) => d.id)).toEqual(['T1_51']);
  });

  it('clears each fault with the device nearest to it', () => {
    expect(studyFault(S, feederBusId('L3B'), 'three-phase')!.clearedBy!.device.id)
      .toBe('FUSE_L3');
    expect(studyFault(S, feederBusId('F06'), 'three-phase')!.clearedBy!.device.id)
      .toBe('REC_R1');
    expect(studyFault(S, 'EDENVALE_12', 'three-phase')!.clearedBy!.device.id)
      .toBe('T1_51');
  });

  it('clears a fault nearer the customer faster', () => {
    // Which is the whole point: a fault on one street takes out one street,
    // quickly, and does not reach the substation breaker at all.
    const lateral = studyFault(S, feederBusId('L3B'), 'three-phase')!;
    const main = studyFault(S, feederBusId('F06'), 'three-phase')!;
    expect(lateral.clearedBy!.seconds).toBeLessThan(main.clearedBy!.seconds);
  });

  it('coordinates at every fault current the feeder can produce', () => {
    const study = studyFault(S, feederBusId('F06'), 'three-phase')!;
    expect(study.coordination.length).toBeGreaterThan(50);
    const failures = study.miscoordinations.map(
      (c) => `${c.downstream.id} vs ${c.upstream.id} at ${c.currentA.toFixed(0)} A`);
    expect(failures).toEqual([]);
  });

  it('names the differential as primary on a busbar, not the overcurrent relay', () => {
    // Quoting the backup relay's two seconds as the clearing time for a bus
    // fault would be off by a factor of forty.
    const onBus = studyFault(S, 'EDENVALE_12', 'three-phase')!;
    expect(onBus.primary?.device).toBe('87B');
    expect(onBus.primary!.seconds).toBeLessThan(0.1);
    expect(onBus.primary!.seconds).toBeLessThan(onBus.clearedBy!.seconds / 10);
    expect(studyFault(S, feederBusId('F06'), 'three-phase')!.primary).toBeUndefined();
  });

  it('says which element decided, the curve or the instantaneous', () => {
    const near = studyFault(S, feederBusId('F01'), 'three-phase')!;
    const breaker = near.responses.find((r) => r.device.id === 'FDR1201_51')!;
    expect(breaker.element).toBe('instantaneous');
    const far = studyFault(S, feederBusId('F11'), 'three-phase')!;
    const breakerFar = far.responses.find((r) => r.device.id === 'FDR1201_51')!;
    expect(breakerFar.element).toBe('time-overcurrent');
  });

  it('leaves the chain empty where this feeder’s protection is not involved', () => {
    const elsewhere = studyFault(S, 'MALIN_500', 'three-phase')!;
    expect(elsewhere.chain).toEqual([]);
    expect(elsewhere.clearedBy).toBeNull();
    // The fault current itself is still real.
    expect(elsewhere.result.maxAmps).toBeGreaterThan(1000);
  });

  it('derives every protection setting from the feeder’s own numbers', () => {
    const chain = cherryLaneProtection(levels);
    for (const d of chain) {
      expect(d.pickupA, d.id).toBeGreaterThan(0);
      expect(d.note.length, d.id).toBeGreaterThan(60);
    }
    // Pickup rises as you move back towards the source, because each device
    // has to carry everything downstream of it.
    const byPosition = [...chain].sort((a, b) => a.position - b.position);
    for (let i = 1; i < byPosition.length; i++) {
      expect(byPosition[i].pickupA, byPosition[i].id)
        .toBeGreaterThan(byPosition[i - 1].pickupA);
    }
  });

  it('sets the instantaneous above the fault current at the recloser', () => {
    // So that it can only ever respond to a fault between the breaker and the
    // recloser. One number, and it distinguishes near from far without
    // measuring distance at all.
    const breaker = cherryLaneProtection(levels)
      .find((d) => d.id === 'FDR1201_51')!;
    expect(breaker.instantaneousA!).toBeGreaterThan(levels.atRecloserA);
    expect(breaker.instantaneousA!).toBeLessThan(levels.atBusA);
  });
});
