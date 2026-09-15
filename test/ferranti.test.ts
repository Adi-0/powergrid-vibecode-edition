/**
 * The Ferranti effect, and what a lumped model costs.
 *
 * The claim the app makes here is not just that a long open line rises. It is
 * that three different ways of working it out agree — the nominal π model the
 * solver uses, the distributed-parameter equations a real study uses, and the
 * power flow itself — and that where they DISAGREE is a property of the line's
 * electrical length rather than of anybody's arithmetic. Both halves of that
 * are testable, and the second is the one that keeps the app honest about its
 * own modelling.
 */

import { describe, it, expect } from 'vitest';
import { californiaCase, SLACK_BUS } from '../src/data/california/network.js';
import { operate } from '../src/sim/operate.js';
import { DAY_PROFILES } from '../src/sim/profiles.js';
import { dispatchDay, applyDispatch } from '../src/sim/dispatch.js';
import { ferrantiStudy, ferrantiCandidates } from '../src/sim/ferranti.js';

const base = californiaCase();
const profile = DAY_PROFILES.summer;
const day = dispatchDay(base, profile, SLACK_BUS);
// Three in the morning: the system is at its lightest, which is when a line
// energisation would actually be done and when the effect is largest.
const net = applyDispatch(base, profile, 3, day[3]);
operate(net);

const candidates = ferrantiCandidates(net);
const studies = candidates
  .map((id) => ferrantiStudy(net, id))
  .filter((f): f is NonNullable<typeof f> => f !== null);

describe('a long line with its far end open', () => {
  it('finds lines long enough for it to matter', () => {
    expect(candidates.length).toBeGreaterThan(5);
  });

  it('always converges, because the circuit in service is left alone', () => {
    for (const f of studies) expect(f.converged, f.branchName).toBe(true);
  });

  it('comes out HIGHER at the open end, every time', () => {
    for (const f of studies) {
      expect(f.openEndPU, f.branchName).toBeGreaterThan(f.sendingPU);
    }
  });

  it('rises more the longer the line is', () => {
    const byLength = [...studies].sort((a, b) => a.lengthKm - b.lengthKm);
    const shortest = byLength[0];
    const longest = byLength[byLength.length - 1];
    expect(longest.nominalPiRatio).toBeGreaterThan(shortest.nominalPiRatio);
  });
});

describe('the three ways of computing it', () => {
  it('has the solver reproduce the π model it is built on, to four figures', () => {
    for (const f of studies) {
      const solvedRatio = f.openEndPU / f.sendingPU;
      expect(Math.abs(solvedRatio - f.nominalPiRatio) / f.nominalPiRatio, f.branchName)
        .toBeLessThan(2e-3);
    }
  });

  it('has the π model over-predict, and by more on a longer line', () => {
    // 1/(1 − x²/2) against 1/cos(x): the lumped model always says more,
    // because it puts all the capacitance at the ends where the voltage is
    // highest rather than spreading it along the line.
    for (const f of studies) {
      expect(f.nominalPiRatio, f.branchName).toBeGreaterThanOrEqual(f.exactRatio);
    }
    const byLength = [...studies].sort((a, b) => a.lengthKm - b.lengthKm);
    const errorOf = (f: typeof studies[0]) => f.nominalPiRatio / f.exactRatio - 1;
    expect(errorOf(byLength[byLength.length - 1]))
      .toBeGreaterThan(errorOf(byLength[0]));
  });

  it('keeps every line well short of a quarter wavelength', () => {
    // βl → 90° is where 1/cos blows up. A real line is nowhere near, and if
    // one in this model ever were, the model would be wrong.
    for (const f of studies) {
      expect((f.betaL * 180) / Math.PI, f.branchName).toBeLessThan(45);
      expect((f.betaL * 180) / Math.PI, f.branchName).toBeGreaterThan(0);
    }
  });
});

describe('the charging it draws', () => {
  it('carries current with nothing connected to the far end', () => {
    for (const f of studies) {
      expect(f.chargingAmps, f.branchName).toBeGreaterThan(0);
      expect(f.chargingMVAr, f.branchName).toBeGreaterThan(0);
    }
  });

  it('generates more reactive power on a longer line at the same voltage', () => {
    const fiveHundred = studies.filter((f) => f.baseKV > 400);
    expect(fiveHundred.length).toBeGreaterThan(1);
    const byLength = [...fiveHundred].sort((a, b) => a.lengthKm - b.lengthKm);
    expect(byLength[byLength.length - 1].chargingMVAr)
      .toBeGreaterThan(byLength[0].chargingMVAr);
  });
});
