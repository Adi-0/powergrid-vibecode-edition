/**
 * The ground layers: the coast, and demand as a dot-density map.
 *
 * The dot map has one property that is easy to get wrong and impossible to
 * notice in a still screenshot: as load rises and falls through the day the
 * scatter must GROW AND SHRINK, never re-roll. A re-rolled scatter looks like
 * static when the reader scrubs the time, and a still frame of it looks
 * perfect. So the test is the one a screenshot cannot be: the dots drawn at a
 * light hour must still be there, in the same places, at a heavy one.
 *
 * That holds because the scatter's extent comes from the site's ANNUAL PEAK —
 * a property of the place, not of the hour — and the hour decides only how many
 * of the dots are drawn.
 */

import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { drawDemandDots, MW_PER_DOT } from '../src/render/scene-terrain.js';

const PEAK = 40 * MW_PER_DOT;

/** Close enough in that every site's scatter is wide enough to be drawn. */
const MPP = 20;

const site = (id: string, mw: number, peak = PEAK) => ({
  id, ground: new Vector3(1000, 0, -2000), loadMW: mw, peakLoadMW: peak,
});

const positions = (mw: number, id = 'testville'): string[] =>
  drawDemandDots([site(id, mw)], 1, null, MPP)
    .map((s) => `${s.a[0].toFixed(3)},${s.a[2].toFixed(3)}`);

describe('demand drawn as dots', () => {
  it('draws one dot per fixed quantity of demand', () => {
    expect(positions(10 * MW_PER_DOT).length).toBe(10);
    expect(positions(40 * MW_PER_DOT).length).toBe(40);
  });

  it('draws nothing for a site carrying less than one dot', () => {
    expect(positions(MW_PER_DOT * 0.4).length).toBe(0);
  });

  it('grows without moving anything that was already there', () => {
    const light = positions(12 * MW_PER_DOT);
    const heavy = positions(30 * MW_PER_DOT);
    const inHeavy = new Set(heavy);
    for (const p of light) {
      expect(inHeavy.has(p), `${p} moved when demand rose`).toBe(true);
    }
    expect(heavy.length).toBeGreaterThan(light.length);
  });

  it('shrinks back to exactly where it was', () => {
    const before = positions(9 * MW_PER_DOT);
    positions(40 * MW_PER_DOT);
    expect(positions(9 * MW_PER_DOT)).toEqual(before);
  });

  it('takes its extent from the annual peak, not from the hour on show', () => {
    // The same demand in a place whose peak is twice as big spreads twice as
    // far — and, crucially, the hour it is shown at cannot change that. This
    // is what stops the scatter re-rolling as the clock runs.
    const reach = (id: string, peak: number, mw: number): number => {
      const pts = drawDemandDots([site(id, mw, peak)], 1, null, MPP);
      return Math.max(...pts.map((s) =>
        Math.hypot(s.a[0] - 1000, s.a[2] + 2000)));
    };
    const small = reach('smallville', 400, 10 * MW_PER_DOT);
    const large = reach('largeville', 1600, 10 * MW_PER_DOT);
    expect(large).toBeGreaterThan(small);
  });

  it('grows from the middle outward, so a place fills in rather than sprawling', () => {
    const centre = new Vector3(1000, 0, -2000);
    const spread = (mw: number): number => {
      const pts = drawDemandDots([site('testville', mw)], 1, null, MPP);
      return Math.max(...pts.map((s) =>
        Math.hypot(s.a[0] - centre.x, s.a[2] - centre.z)));
    };
    expect(spread(8 * MW_PER_DOT)).toBeLessThan(spread(40 * MW_PER_DOT));
  });

  it('puts two different places in two different patterns', () => {
    const a = drawDemandDots([site('alpha', 20 * MW_PER_DOT)], 1, null, MPP);
    const b = drawDemandDots([site('beta', 20 * MW_PER_DOT)], 1, null, MPP);
    expect(a.map((s) => s.a[0])).not.toEqual(b.map((s) => s.a[0]));
  });

  it('says nothing at all from a distance, rather than a smudge', () => {
    // Seen from far enough away that the whole scatter is a few pixels wide,
    // every dot lands on top of every other one. Four hundred primitives then
    // draw a grey blob that carries no count and no shape, so the honest thing
    // — and the cheap one — is to draw none of them.
    const far = drawDemandDots([site('testville', 30 * MW_PER_DOT)], 1, null, 1400);
    expect(far.length).toBe(0);
    const near = drawDemandDots([site('testville', 30 * MW_PER_DOT)], 1, null, MPP);
    expect(near.length).toBe(30);
  });

  it('brings a big place in before a small one, because it is readable sooner', () => {
    const at = (peak: number, mpp: number): number =>
      drawDemandDots([site('x' + peak, 8 * MW_PER_DOT, peak)], 1, null, mpp).length;
    // A scale at which the large city is legible and the small town is not.
    expect(at(2600, 420)).toBeGreaterThan(0);
    expect(at(150, 420)).toBe(0);
  });

  it('draws every dot as a dot, never as a line', () => {
    for (const s of drawDemandDots([site('testville', 25 * MW_PER_DOT)], 1, null, MPP)) {
      expect(s.a).toEqual(s.b);
    }
  });
});
