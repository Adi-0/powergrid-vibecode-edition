/**
 * The math panel says what it does, and does what it says.
 *
 * The brief asks for two tests by name. This is the second of them:
 *
 *   "Write a test that every math panel's arithmetic is internally consistent."
 *
 * It is enforceable here because a derivation step does not hold a number and a
 * separate description of how that number was reached. It holds ONE string of
 * arithmetic, which is both what the reader sees and what produces the result
 * printed beneath it. So this file can take the string off the page, evaluate
 * it with an independent parser, and check three things:
 *
 *   1. the printed result is what the printed working evaluates to;
 *   2. where a step reproduces something the solver also computed, the two
 *      agree — which is the actual claim the panel makes;
 *   3. the working is written in the numbers shown, at the precision shown, so
 *      a reader repeating it by hand lands on the same answer.
 *
 * Point 3 is the one that catches the interesting failure. A derivation can be
 * self-consistent and still be a lie, if it carries fifteen significant figures
 * internally and prints four: the reader does the arithmetic, gets a different
 * answer, and concludes they have misunderstood something. So the strings are
 * rounded to what is displayed, and the tolerance against the solver is set to
 * what that rounding costs.
 */

import { describe, it, expect } from 'vitest';
import { evaluate, pretty, num, ExpressionError } from '../src/math/expr.js';
import {
  deriveBases, deriveBus, deriveBranch, deriveLineGeometry,
  deriveTransformerImpedance, deriveServiceDrop, deriveSystemBalance,
  derivePlantEnergy, deriveMachine, deriveFault, deriveReliability,
  deriveMotorStart, deriveFerranti, deriveFactors, Derivation,
} from '../src/math/derive.js';
import { factors } from '../src/sim/factors.js';
import { ferrantiStudy, ferrantiCandidates } from '../src/sim/ferranti.js';
import { studyMotorStart, MOTOR_SITES } from '../src/sim/motor-start.js';
import { START_METHODS } from '../src/core/motor.js';
import { reliability, DEFAULT_RELIABILITY_OPTIONS } from '../src/sim/reliability.js';
import { buildFaultModel, solveFault, FaultKind } from '../src/core/fault.js';
import { indexCase } from '../src/core/network.js';
import { polar } from '../src/core/complex.js';
import { energyChain } from '../src/data/california/plant.js';
import { operatingPoint, capabilityCurve, solvedOutput } from '../src/core/machine.js';
import { californiaCase, SLACK_BUS } from '../src/data/california/network.js';
import { operate } from '../src/sim/operate.js';
import { DAY_PROFILES } from '../src/sim/profiles.js';
import { dispatchDay, applyDispatch } from '../src/sim/dispatch.js';
import { solveService, APPLIANCES } from '../src/data/california/service.js';
import { TRANSFORMER_CLASSES } from '../src/data/california/build.js';

// ---------------------------------------------------------------------------
// The evaluator itself
// ---------------------------------------------------------------------------

describe('the arithmetic parser', () => {
  it('follows the ordinary precedence of written arithmetic', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
    expect(evaluate('-3 + 5')).toBe(2);
    expect(evaluate('10 / 2 / 5')).toBe(1);
  });

  it('makes exponentiation right-associative, as an equation is read', () => {
    expect(evaluate('2^3^2')).toBe(512);
    expect(evaluate('(2^3)^2')).toBe(64);
  });

  it('reads scientific notation', () => {
    expect(evaluate('2e-7')).toBeCloseTo(2e-7, 15);
    expect(evaluate('1.5e3 + 500')).toBe(2000);
  });

  it('knows ln is natural and log is base ten, which is the engineering convention', () => {
    expect(evaluate('ln(e)')).toBeCloseTo(1, 12);
    expect(evaluate('log(1000)')).toBeCloseTo(3, 12);
  });

  it('takes angles in degrees, because that is how they are quoted', () => {
    expect(evaluate('sind(30)')).toBeCloseTo(0.5, 12);
    expect(evaluate('cosd(60)')).toBeCloseTo(0.5, 12);
  });

  it('refuses anything that is not arithmetic', () => {
    for (const bad of [
      'process.exit(1)', 'x + 1', 'globalThis', '2 +', ')', 'foo(2)', '1/0',
    ]) {
      expect(() => evaluate(bad), bad).toThrow(ExpressionError);
    }
  });

  it('sets arithmetic the way it would be written by hand', () => {
    expect(pretty('2 * 3')).toBe('2 · 3');
    expect(pretty('1.5e-7')).toContain('×10');
    expect(pretty('sqrt(3)')).toBe('√(3)');
    expect(pretty('2 * pi * 60')).toContain('π');
    // Spaces around operators are load-bearing: "1000 · 7.6" must not tighten
    // into something that reads as binding more strongly than the division
    // beside it.
    expect(pretty('0.1 / 1000 * 7.6')).toBe('0.1 / 1000 · 7.6');
    expect(pretty('cbrt(8)')).toBe('∛(8)');
  });

  it('raises integer exponents and refuses to raise fractional ones', () => {
    // "^(1/3)" set as a superscript 1 followed by a literal "/3)" is not a
    // typographic nicety, it is a different number.
    expect(pretty('500^2 / 100')).toBe('500² / 100');
    expect(pretty('(2)^(-3)')).toBe('(2)⁻³');
    expect(pretty('x^(1/3)')).not.toContain('¹');
  });

  it('switches to scientific notation only where a decimal would be unreadable', () => {
    expect(num(1234.5678, 2)).toBe('1234.57');
    expect(num(0.0000408)).toContain('e');
    expect(num(0)).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// The derivations
// ---------------------------------------------------------------------------

function solveAt(hour: number) {
  const base = californiaCase();
  const profile = DAY_PROFILES.summer;
  const day = dispatchDay(base, profile, SLACK_BUS);
  const net = applyDispatch(base, profile, hour, day[hour % 24]);
  return operate(net);
}

const solved = solveAt(18).solved;

/** Every derivation the app can show, for one solved case. */
function allDerivations(): Derivation[] {
  const out: Derivation[] = [];
  out.push(deriveBases(230, solved.net.baseMVA));
  out.push(deriveSystemBalance(solved));

  // A bus of each type, so no type's special case goes unchecked.
  const seen = new Set<string>();
  for (const b of solved.net.buses) {
    const r = solved.busById.get(b.id);
    if (!r || seen.has(r.type)) continue;
    seen.add(r.type);
    const d = deriveBus(b, solved);
    if (d) out.push(d);
  }

  // Branches of every kind: overhead line, cable, transformer, with and
  // without an off-nominal tap.
  const kinds = new Set<string>();
  for (const br of solved.net.branches) {
    const flow = solved.branchById.get(br.id);
    if (!flow || !flow.inService) continue;
    const key = `${br.kind}:${br.tap && br.tap !== 1 ? 'tapped' : 'plain'}:` +
      `${br.b > 0 ? 'charging' : 'none'}`;
    if (kinds.has(key)) continue;
    kinds.add(key);
    out.push(deriveBranch(br, flow, solved));
    const geo = deriveLineGeometry(br, solved.net);
    if (geo) out.push(geo);
  }

  out.push(deriveTransformerImpedance(
    solved.net.branches.find((b) => b.id.startsWith('T_EDENVALE'))!,
    solved.net,
    TRANSFORMER_CLASSES.dist115_12.percentZ,
    TRANSFORMER_CLASSES.dist115_12.xOverR,
    TRANSFORMER_CLASSES.dist115_12.mvaPerBank
  ));

  // The generation branch.
  {
    const g = solved.net.generators.find(
      (x) => x.bus.startsWith('METCALF') && x.kind === 'gas-cc');
    if (g) {
      for (const mw of [g.pMinMW, g.pMaxMW]) {
        out.push(derivePlantEnergy(energyChain(g, mw)));
      }
      const bus = solved.busById.get(g.bus);
      const o = solvedOutput(
        g, bus, solved.net.generators.filter((x) => x.bus === g.bus));
      for (const [p, q] of [[o.pMW, o.qMVAr], [g.pMaxMW, 200], [500, -150]]) {
        const op = operatingPoint(g, bus?.vpu ?? 1, p, q);
        out.push(deriveMachine(g, op, capabilityCurve(g, bus?.vpu ?? 1)));
      }
    }
  }

  // Faults, of every kind, at a strong bus and a weak one.
  {
    const model = buildFaultModel(solved.net, indexCase(solved.net));
    const kinds: FaultKind[] = [
      'three-phase', 'single-line-to-ground', 'line-to-line', 'double-line-to-ground',
    ];
    for (const busId of ['EDENVALE_12', 'METCALF_230', 'FDR_F06']) {
      const bus = solved.net.buses.find((b) => b.id === busId);
      const r = solved.busById.get(busId);
      if (!bus || !r) continue;
      for (const kind of kinds) {
        const f = solveFault(model, busId, kind, {
          prefaultV: polar(r.vpu, (r.angleDeg * Math.PI) / 180),
          baseKV: bus.baseKV, baseMVA: solved.net.baseMVA,
        });
        out.push(deriveFault(f, bus.baseKV));
      }
    }
  }

  // The planning factors, in every season, with a different example unit.
  {
    const base2 = californiaCase();
    for (const season of ['summer', 'spring', 'winter'] as const) {
      const d = dispatchDay(base2, DAY_PROFILES[season], SLACK_BUS);
      const f = factors(base2, d);
      out.push(deriveFactors(f, f.capacity.find((g) => g.capacityFactor > 0.1
        && g.capacityFactor < 0.9) ?? f.capacity[0]));
      out.push(deriveFactors(f, null));
    }
  }

  // The Ferranti effect, on the longest lines in the case.
  {
    for (const id of ferrantiCandidates(solved.net).slice(0, 4)) {
      const f = ferrantiStudy(solved.net, id);
      if (f && f.converged) out.push(deriveFerranti(f));
    }
  }

  // Starting the motor: every starter, in both places, plus running.
  {
    const base = californiaCase();
    const profile = DAY_PROFILES.summer;
    const day = dispatchDay(base, profile, SLACK_BUS);
    const dispatched = applyDispatch(base, profile, 18, day[18]);
    const beforeRun = operate(dispatched);
    for (const site of MOTOR_SITES) {
      for (const m of START_METHODS) {
        out.push(deriveMotorStart(
          studyMotorStart(dispatched, beforeRun, 'starting', m.id, site.id)));
      }
      out.push(deriveMotorStart(
        studyMotorStart(dispatched, beforeRun, 'running', 'across-the-line', site.id)));
    }
  }

  // The reliability indices, under every combination of the three decisions
  // the panel offers, because each one changes which sections group together.
  for (const recloserInService of [true, false]) {
    for (const fuseSaving of [true, false]) {
      for (const tieAvailable of [true, false]) {
        out.push(deriveReliability(reliability(
          { ...DEFAULT_RELIABILITY_OPTIONS, recloserInService, fuseSaving, tieAvailable })));
      }
    }
  }

  for (const appliance of [null, APPLIANCES[3], APPLIANCES[5]]) {
    const svc = solveService(243.97, 3200, 650, appliance);
    out.push(deriveServiceDrop(svc.serviceSteps, svc.secondaryV, 'the panel'));
    out.push(deriveServiceDrop(
      svc.branchSteps, svc.panelLegV, 'the kitchen socket'));
  }
  return out;
}

const DERIVATIONS = allDerivations();

describe('every derivation the app can show', () => {
  it('offers a geometry derivation for every overhead line in the case', () => {
    // A null here means the construction table and the derivation disagree
    // about what a line of that voltage is built on, which is exactly the
    // kind of silent drift this file exists to catch.
    const missing = solved.net.branches
      .filter((b) => b.kind === 'line' && b.conductor && b.lengthKm)
      .filter((b) => deriveLineGeometry(b, solved.net) === null)
      .map((b) => b.id);
    expect(missing).toEqual([]);
  });

  it('produces a useful number of them to check', () => {
    // If this ever collapses to a handful, the checks below have quietly
    // stopped covering the app.
    expect(DERIVATIONS.length).toBeGreaterThan(15);
  });

  for (const d of DERIVATIONS) {
    describe(`${d.title} — ${d.subtitle}`, () => {
      it('prints the result its own working produces', () => {
        for (const s of d.steps) {
          // The step was built by evaluating its own string, so this is a
          // guard against anyone ever changing that.
          expect(evaluate(s.substituted), `${d.id} / ${s.label}`)
            .toBeCloseTo(s.value, 12);
        }
      });

      it('writes arithmetic a person could actually read', () => {
        for (const s of d.steps) {
          expect(s.general.length, `${d.id} / ${s.label}`).toBeGreaterThan(3);
          expect(s.substituted, `${d.id} / ${s.label}`).not.toMatch(/NaN|Infinity|undefined/);
          expect(pretty(s.substituted), `${d.id} / ${s.label}`).not.toMatch(/e[+-]?\d/);
          expect(s.unit !== undefined, `${d.id} / ${s.label}`).toBe(true);
        }
      });

      it('agrees with the solver wherever it claims to', () => {
        for (const s of d.steps) {
          if (!s.checkAgainst) continue;
          const diff = Math.abs(s.value - s.checkAgainst.value);
          const scale = Math.max(1, Math.abs(s.checkAgainst.value));
          expect(
            diff / scale,
            `${d.id} / ${s.label}: derived ${s.value}, ${s.checkAgainst.name} ` +
            `${s.checkAgainst.value}`
          ).toBeLessThan(s.checkAgainst.tolerance);
        }
      });

      it('states its sign convention rather than assuming one', () => {
        expect(d.convention, d.id).toBeTruthy();
        expect(d.convention!.length, d.id).toBeGreaterThan(40);
      });

      it('shows the per-unit bases wherever it uses per-unit', () => {
        const usesPerUnit = d.steps.some((s) => s.unit === 'pu');
        if (usesPerUnit && d.id.startsWith('branch:')) {
          expect(d.bases, d.id).toBeDefined();
          expect(d.bases!.length, d.id).toBeGreaterThan(2);
        }
      });
    });
  }
});

describe('a reader repeating the arithmetic by hand lands in the same place', () => {
  // The strings are written in the numbers the panel shows, so re-evaluating
  // them must reproduce the solver's answer to within what that rounding
  // costs — which is what each step's own tolerance encodes.
  it('reproduces branch flows from the printed working alone', () => {
    const br = solved.net.branches.find(
      (b) => b.kind === 'line' && (solved.branchById.get(b.id)?.pFromMW ?? 0) > 100
    )!;
    const flow = solved.branchById.get(br.id)!;
    const d = deriveBranch(br, flow, solved);
    const p = d.steps.find((s) => s.label === 'Real power')!;
    const q = d.steps.find((s) => s.label === 'Reactive power')!;
    expect(evaluate(p.substituted)).toBeCloseTo(flow.pFromMW, 2);
    expect(evaluate(q.substituted)).toBeCloseTo(flow.qFromMVAr, 2);
  });

  it('reproduces a line’s per-unit reactance from the conductor table alone', () => {
    const br = solved.net.branches.find(
      (b) => b.kind === 'line' && deriveLineGeometry(b, solved.net) !== null
    )!;
    expect(br, 'no line has a geometry derivation at all').toBeDefined();
    const d = deriveLineGeometry(br, solved.net)!;
    const last = d.steps.find((s) => s.label === 'Into per-unit')!;
    expect(evaluate(last.substituted) / br.x).toBeCloseTo(1, 3);
  });

  it('closes the system balance from the printed working alone', () => {
    const d = deriveSystemBalance(solved);
    expect(evaluate(d.steps[0].substituted))
      .toBeCloseTo(solved.system.pGenMW, 2);
  });
});
