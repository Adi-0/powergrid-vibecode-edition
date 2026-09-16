/**
 * The geometry primitives every structure in the atlas is built from.
 *
 * ONE RULE IS CHECKED HERE AND IT IS THE ONE THAT CANNOT BE CHECKED BY EYE.
 *
 * A wireframe box is transparent by construction, so each solid is also made
 * of faces filled with the colour of the paper — `washSegments` strokes the
 * faces the camera can see, and `facingQuads` decides which those are by the
 * sign of each face's normal. A face listed in the wrong order reports an
 * inward normal, is taken for a back face, and is never filled.
 *
 * What that looks like is a box with its lid off. It is not obvious in a
 * screenshot, because a box with its lid off looks exactly like a box until
 * you notice you can see its back edges through the top — which is how the
 * pad-mounted transformer at 14 Cherry Lane spent a while reading as an open
 * crate, and how every flat-roofed building in the power station was quietly
 * open to the sky at the same time.
 *
 * So: every face of every primitive must point away from the inside.
 */

import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  Quad, quadNormal, boxQuads, prismQuads, gableQuads, facingQuads,
} from '../src/render/volumes.js';
import { isometricDirection } from '../src/render/iso.js';

/** The centre of a face, which is where its normal is anchored. */
function faceCentre(q: Quad): Vector3 {
  return q[0].clone().add(q[1]).add(q[2]).add(q[3]).multiplyScalar(0.25);
}

/** Every face must point away from a point known to be inside the solid. */
function facesPointOutward(quads: Quad[], inside: Vector3): void {
  for (const q of quads) {
    const outward = faceCentre(q).sub(inside);
    expect(quadNormal(q).dot(outward)).toBeGreaterThan(0);
  }
}

describe('solid faces', () => {
  it('a box points every face outward, lid included', () => {
    const base = new Vector3(3, 0, -7);
    facesPointOutward(
      boxQuads(base, 4, 2.5, 6), new Vector3(3, 1.25, -7));
  });

  it('a prism points every face outward, cap included', () => {
    const base = new Vector3(-2, 1, 5);
    facesPointOutward(
      prismQuads(base, 2.6, 30, 8, 2.2), new Vector3(-2, 16, 5));
  });

  it('a gabled building points every face outward, both slopes included', () => {
    const base = new Vector3(0, 0, 0);
    facesPointOutward(gableQuads(base, 11, 2.7, 9, 2.6), new Vector3(0, 1.3, 0));
  });

  it('the camera sees the top of a box it is looking down on', () => {
    // The isometric camera is 35° above the ground, so the top of any box is
    // always one of the faces in view. If this fails, flat roofs are holes.
    const quads = boxQuads(new Vector3(0, 0, 0), 4, 2, 4);
    const seen = facingQuads(quads, isometricDirection());
    const tops = seen.filter((q) => quadNormal(q).y > 0.9);
    expect(tops).toHaveLength(1);
    // And exactly three of the five: the top and the two near sides.
    expect(seen).toHaveLength(3);
  });
});
