import { beforeAll, describe, expect, it } from 'vitest';
import { Grid } from '../src/model/grid';
import { runDay, type DayRun } from '../src/model/day';
import { operate } from '../src/model/operate';
import { snapshot } from '../src/model/snapshot';

/**
 * Phase 4's done-condition: any trip gives either a correct solution or an honest
 * no-solution. Every branch (lines and transformers) is tripped on its own at the
 * evening peak and at noon, and each result is checked:
 *   - solved or partly dark: every energised island balances (generation = load +
 *     shunts + losses, to 1 W), nothing out of service carries flow, and dark islands
 *     are reported with their unserved demand;
 *   - no operating point: said so, with a reason in words, and nothing drawn as solved.
 */
describe('single trips', () => {
  let g: Grid;
  let day: DayRun;
  beforeAll(() => {
    g = new Grid();
    day = runDay(g);
  }, 120_000);

  it('cutting every circuit to a substation leaves it dark, reported as unserved demand', () => {
    const base = day.points[76]!;
    const cut = g.branches.filter((b) => b.from.site.id === 'EVERGREEN' || b.to.site.id === 'EVERGREEN').map((b) => b.index);
    expect(cut.length).toBeGreaterThan(1);
    const op = operate(g, base.step, g.baseCase(), { participation: 'governor', branchOutages: new Set(cut), warm: base.result, shuntSteps: base.shuntSteps });
    const s = snapshot(g, op, 1, cut);
    expect(s.outcome).toBe('partial');
    const ev = g.buses.filter((b) => b.site.id === 'EVERGREEN');
    for (const b of ev) expect(s.energized[b.index]).toBe(0);
    // the demand left unserved is exactly Evergreen's
    const evDemand = ev.reduce((a, b) => a + s.pd[b.index]!, 0);
    expect(s.unservedMW).toBeCloseTo(evDemand, 9);
    expect(Math.abs(s.residualMW)).toBeLessThan(1e-6);
    expect(s.reason).toMatch(/cut off from every generator/);
  });

  it('a generator islanded behind its step-up transformer drops out; the rest makes up for it', () => {
    const base = day.points[76]!;
    const gsu = g.branches.find((b) => b.kind === 'transformer' && (b.from.terminalOf || b.to.terminalOf))!;
    const term = gsu.from.terminalOf ? gsu.from : gsu.to;
    const unit = g.gens.find((x) => x.bus === term)!;
    expect(base.result.pg[unit.index]!).toBeGreaterThan(0);
    const op = operate(g, base.step, g.baseCase(), { participation: 'governor', branchOutages: new Set([gsu.index]), warm: base.result, shuntSteps: base.shuntSteps });
    const s = snapshot(g, op, 1, [gsu.index]);
    expect(s.outcome).toBe('solved');
    expect(s.energized[term.index]).toBe(0);
    expect(Math.abs(s.residualMW)).toBeLessThan(1e-6);
    // what the unit was producing is now produced elsewhere (plus the change in losses)
    const genBefore = base.balance!.gen.re * 100;
    expect(Math.abs(s.genMW - genBefore)).toBeLessThan(50);
  });

  for (const t of [76, 50]) {
    it(`every branch tripped at interval ${t} solves or says honestly why not`, () => {
      const base = day.points[t]!;
      const pf0 = g.baseCase();
      const tally = { solved: 0, partial: 0, none: 0 };
      g.branches.forEach((br, k) => {
        const op = operate(g, base.step, pf0, { participation: 'governor', branchOutages: new Set([k]), warm: base.result, shuntSteps: base.shuntSteps });
        const s = snapshot(g, op, 1, [k]);
        tally[s.outcome]++;
        expect(s.inService[k], br.id).toBe(0);
        if (s.outcome === 'none') {
          expect(s.reason.length, `${br.id}: a reason in words`).toBeGreaterThan(40);
          return;
        }
        // conservation over what is energised
        expect(Math.abs(s.residualMW), `${br.id}: balance`).toBeLessThan(1e-6);
        expect(Math.abs(s.pf[k]!) + Math.abs(s.pt[k]!), `${br.id}: no flow when open`).toBeLessThan(1e-9);
        if (s.outcome === 'partial') {
          expect(s.unservedMW, `${br.id}: unserved demand reported`).toBeGreaterThan(0);
          for (const isl of s.darkIslands) for (const b of isl.buses) expect(s.energized[b]).toBe(0);
        }
      });
      // the synthetic network is built N-1 secure in the main but not everywhere: a few
      // trips must end without an operating point, and most must solve
      expect(tally.solved + tally.partial).toBeGreaterThan(0.9 * g.branches.length);
      console.log(`t=${t}`, JSON.stringify(tally));
    }, 120_000);
  }
});
