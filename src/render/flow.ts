/**
 * Flow marks, shared by every view that draws a conductor.
 *
 * One rule, stated once here so that no view can drift from it: a mark on a
 * conductor moves because the solver says power is flowing through it, in the
 * direction the solution says, at a speed proportional to how heavily the
 * conductor is loaded. There is no decorative motion anywhere in this app.
 *
 * The mark is drawn in the colour of the PAPER, running along the core of the
 * conductor and leaving a hairline of ink on either side. That keeps the
 * conductor continuous at its own weight — which is already carrying the
 * voltage class — while a light bead travels along inside it.
 */

import { BranchFlow } from '../core/results.js';
import { LineSegment } from './line-batch.js';
import { INK, FLOW } from './style.js';

/** How heavily loaded a branch is, as a fraction of its normal rating. */
export const loadingOf = (f: BranchFlow): number => Math.abs(f.loading);

/**
 * A flow mark for one conductor, or null if it is carrying too little to be
 * worth animating. `phaseOffset` staggers parallel circuits so they do not all
 * pulse in step.
 */
export function flowMark(
  a: [number, number, number],
  b: [number, number, number],
  conductorWidthPx: number,
  flow: BranchFlow | undefined,
  phaseOffset = 0
): LineSegment | null {
  if (!flow || !flow.inService) return null;
  const loading = loadingOf(flow);
  if (loading <= FLOW.minLoadingToAnimate) return null;
  const speed =
    FLOW.minSpeedPxPerSec +
    (FLOW.maxSpeedPxPerSec - FLOW.minSpeedPxPerSec) * Math.min(loading, 1);
  const direction = flow.pFromMW >= 0 ? 1 : -1;
  return {
    a, b,
    widthPx: Math.max(0.8, conductorWidthPx - FLOW.coreInsetPx),
    color: INK.occluder,
    opacity: FLOW.opacity,
    dash: [
      FLOW.markSpacingPx * FLOW.markLengthFraction,
      FLOW.markSpacingPx * (1 - FLOW.markLengthFraction),
    ],
    dashPhase: phaseOffset % FLOW.markSpacingPx,
    dashSpeed: -direction * speed,
  };
}
