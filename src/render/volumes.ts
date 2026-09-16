/**
 * The primitives every drawing in this project builds its objects out of.
 *
 * A single-line diagram uses SYMBOLS: flat, screen-aligned, standing for a
 * device without describing it. That is exactly right on a one-line and exactly
 * wrong standing on a site, where the same flat marks read as annotations
 * pinned over a plan rather than as things occupying space. The substation
 * yard learned this first; the power station and the house learned it second.
 *
 * Everything here is EDGES IN WORLD METRES. No fills, no faces, no shading:
 * the renderer composites in painter's order with ground-coloured halos, so a
 * box drawn as all twelve of its edges comes out correctly hidden-lined without
 * anybody computing visibility. That is also why these builders never try to
 * work out which edges are at the back — they return the whole wireframe and
 * let the compositing do it.
 *
 * DIMENSIONS ARE REAL. A gas turbine enclosure is about thirty-four metres
 * long; a mechanical-draught cooling tower cell bank is about eighteen metres
 * high; a pad-mounted transformer is about the size of a chest freezer. Nothing
 * here is exaggerated, so every view reads at the same scale as every other.
 */

import { Vector3 } from 'three';

/** One edge of a volume, in world metres. */
export type Edge = [Vector3, Vector3];

export const v = (x: number, y: number, z: number): Vector3 =>
  new Vector3(x, y, z);

/**
 * The edges of an axis-aligned box, standing on `centre`.
 *
 * All twelve, not the nine a hidden-line treatment would keep: see the note at
 * the top of the file.
 */
export function boxEdges(
  centre: Vector3, wx: number, h: number, wz: number
): Edge[] {
  const hx = wx / 2;
  const hz = wz / 2;
  const x0 = centre.x - hx;
  const x1 = centre.x + hx;
  const z0 = centre.z - hz;
  const z1 = centre.z + hz;
  const y0 = centre.y;
  const y1 = centre.y + h;
  const c = [
    v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1),
    v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1),
  ];
  const e: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return e.map(([i, j]) => [c[i], c[j]] as Edge);
}

/** A vertical post. */
export const post = (base: Vector3, h: number): Edge =>
  [base.clone(), v(base.x, base.y + h, base.z)];

/**
 * A box with a pitched roof, ridge running along x.
 *
 * The one shape that says "building" rather than "container" at any size, and
 * the reason a turbine hall reads as a hall and not as a crate.
 */
export function gableEdges(
  centre: Vector3, wx: number, wallH: number, wz: number, ridgeH: number
): Edge[] {
  const out = boxEdges(centre, wx, wallH, wz);
  const hx = wx / 2;
  const x0 = centre.x - hx;
  const x1 = centre.x + hx;
  const yTop = centre.y + wallH;
  const yR = yTop + ridgeH;
  const a = v(x0, yR, centre.z);
  const b = v(x1, yR, centre.z);
  out.push([a, b]);
  const hz = wz / 2;
  for (const [x, apex] of [[x0, a], [x1, b]] as [number, Vector3][]) {
    out.push([v(x, yTop, centre.z - hz), apex]);
    out.push([v(x, yTop, centre.z + hz), apex]);
  }
  return out;
}

/**
 * A vertical prism of `sides` sides — the way to draw a cylinder in edges.
 *
 * Eight is enough for a chimney at any scale this project uses: fewer reads as
 * a hexagon, more costs strokes to say the same thing. The verticals are drawn
 * only on alternate corners, because a cylinder wants its silhouette and one or
 * two shading lines, not a cage.
 */
export function prismEdges(
  base: Vector3, radius: number, h: number, sides = 8, topRadius = radius
): Edge[] {
  const out: Edge[] = [];
  const ring = (y: number, r: number): Vector3[] =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      return v(base.x + r * Math.cos(a), y, base.z + r * Math.sin(a));
    });
  const lower = ring(base.y, radius);
  const upper = ring(base.y + h, topRadius);
  for (let i = 0; i < sides; i++) {
    out.push([lower[i], lower[(i + 1) % sides]]);
    out.push([upper[i], upper[(i + 1) % sides]]);
    if (i % 2 === 0) out.push([lower[i], upper[i]]);
  }
  return out;
}

/** A horizontal ring: a band round a stack, or the rim of a fan. */
export function ringEdges(
  centre: Vector3, radius: number, sides = 8
): Edge[] {
  const pts = Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return v(centre.x + radius * Math.cos(a), centre.y, centre.z + radius * Math.sin(a));
  });
  return pts.map((p, i) => [p, pts[(i + 1) % sides]] as Edge);
}

/**
 * A horizontal cylinder lying along one ground axis — a generator, a condenser
 * shell, a tank, the glass of a meter standing off a wall.
 *
 * Drawn as two end rings in the vertical plane and the four silhouette lines
 * between them, which is all a cylinder on its side needs to be unmistakable.
 */
export function drumEdges(
  centre: Vector3, length: number, radius: number, sides = 8,
  axis: 'x' | 'z' = 'x'
): Edge[] {
  const out: Edge[] = [];
  const along = axis === 'x' ? centre.x : centre.z;
  const ends = [along - length / 2, along + length / 2];
  const rings: Vector3[][] = ends.map((t) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      const y = centre.y + radius * Math.sin(a);
      const off = radius * Math.cos(a);
      return axis === 'x' ? v(t, y, centre.z + off) : v(centre.x + off, y, t);
    })
  );
  for (const r of rings) {
    for (let i = 0; i < sides; i++) out.push([r[i], r[(i + 1) % sides]]);
  }
  for (let i = 0; i < sides; i += 2) out.push([rings[0][i], rings[1][i]]);
  return out;
}

/**
 * A run of pipe or duct between two points, drawn as its silhouette.
 *
 * Two parallel lines offset vertically, with a ring at each end. Enough to say
 * "this is a pipe, not a wire" without drawing a cylinder along a diagonal.
 */
export function pipeEdges(a: Vector3, b: Vector3, radius: number): Edge[] {
  const out: Edge[] = [];
  for (const dy of [-radius, radius]) {
    out.push([v(a.x, a.y + dy, a.z), v(b.x, b.y + dy, b.z)]);
  }
  out.push(...ringEdges(v(a.x, a.y, a.z), radius, 6));
  out.push(...ringEdges(v(b.x, b.y, b.z), radius, 6));
  return out;
}

/**
 * Louvres down a face: the horizontal bands on the intake side of a cooling
 * tower, or the ventilation of an enclosure.
 *
 * `along` is 'x' or 'z' — which way the face runs.
 */
export function louvreEdges(
  centre: Vector3, wx: number, h: number, wz: number,
  count: number, along: 'x' | 'z'
): Edge[] {
  const out: Edge[] = [];
  for (let i = 1; i <= count; i++) {
    const y = centre.y + (h * i) / (count + 1);
    if (along === 'x') {
      for (const dz of [-wz / 2, wz / 2]) {
        out.push([v(centre.x - wx / 2, y, centre.z + dz),
          v(centre.x + wx / 2, y, centre.z + dz)]);
      }
    } else {
      for (const dx of [-wx / 2, wx / 2]) {
        out.push([v(centre.x + dx, y, centre.z - wz / 2),
          v(centre.x + dx, y, centre.z + wz / 2)]);
      }
    }
  }
  return out;
}

/**
 * An insulator stack: a column with its sheds shown as a few discs.
 *
 * The discs are what make a porcelain stack recognisable from fifty metres, and
 * they are the reason a yard photograph reads as a yard rather than as pipework.
 */
export function insulatorEdges(base: Vector3, h: number, sheds = 4): Edge[] {
  const out: Edge[] = [post(base, h)];
  const r = 0.35;
  for (let i = 1; i <= sheds; i++) {
    const y = base.y + (h * i) / (sheds + 1);
    out.push([v(base.x - r, y, base.z), v(base.x + r, y, base.z)]);
  }
  return out;
}

/** Move a whole volume. Cheaper to build at the origin and place it. */
export function translated(edges: Edge[], by: Vector3): Edge[] {
  return edges.map(([a, b]) =>
    [a.clone().add(by), b.clone().add(by)] as Edge);
}

// ---------------------------------------------------------------------------
// Solid faces
// ---------------------------------------------------------------------------

/**
 * A wireframe box is TRANSPARENT BY CONSTRUCTION.
 *
 * The renderer has no depth buffer: hidden-line removal happens because each
 * stroke is drawn over a ground-coloured backing, in painter's order. That
 * erases a line where another line crosses in front of it — and erases nothing
 * in the middle of a face, because an edge-only box has nothing there. On the
 * yard's small equipment the result reads as wireframe detail. On a boiler
 * twenty-six metres tall it reads as glass, and a power station made of glass
 * boxes is harder to follow than the flat glyphs it replaced.
 *
 * So the big masses get a WASH: their camera-facing faces filled with strokes
 * in the colour of the paper, drawn behind the edges. Not shading — there is no
 * light in this drawing and never will be — just the opacity that a solid
 * object has and a wireframe does not.
 */
export type Quad = readonly [Vector3, Vector3, Vector3, Vector3];

/** The six faces of a box, wound so that `quadNormal` points outward. */
export function boxQuads(
  centre: Vector3, wx: number, h: number, wz: number
): Quad[] {
  const hx = wx / 2;
  const hz = wz / 2;
  const x0 = centre.x - hx;
  const x1 = centre.x + hx;
  const z0 = centre.z - hz;
  const z1 = centre.z + hz;
  const y0 = centre.y;
  const y1 = centre.y + h;
  return [
    // WINDING MATTERS: `quadNormal` takes q1−q0 crossed with q3−q0, so a face
    // listed the other way round reports an inward normal and gets culled as
    // if the camera were behind it. A box whose top is culled is a box with
    // its lid off, and that is exactly how the first pad-mounted transformer
    // came out. `test/volumes.test.ts` checks every face of every primitive.
    [v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0), v(x0, y1, z0)], // top
    [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)], // +z
    [v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0)], // -z
    [v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1)], // +x
    [v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)], // -x
  ];
}

/** The side faces and cap of a vertical prism. */
export function prismQuads(
  base: Vector3, radius: number, h: number, sides = 8, topRadius = radius
): Quad[] {
  const at = (i: number, y: number, r: number): Vector3 => {
    const a = (i / sides) * Math.PI * 2;
    return v(base.x + r * Math.cos(a), y, base.z + r * Math.sin(a));
  };
  const out: Quad[] = [];
  for (let i = 0; i < sides; i++) {
    out.push([
      at(i + 1, base.y, radius), at(i, base.y, radius),
      at(i, base.y + h, topRadius), at(i + 1, base.y + h, topRadius),
    ]);
  }
  // The cap, as a fan of quads so the same wash works on it.
  for (let i = 0; i < sides; i += 2) {
    out.push([
      base.clone().setY(base.y + h), at(i + 2, base.y + h, topRadius),
      at(i + 1, base.y + h, topRadius), at(i, base.y + h, topRadius),
    ]);
  }
  return out;
}

/** The two roof planes and two gable ends of a pitched-roof building. */
export function gableQuads(
  centre: Vector3, wx: number, wallH: number, wz: number, ridgeH: number
): Quad[] {
  const out = boxQuads(centre, wx, wallH, wz).filter((_, i) => i !== 0);
  const hx = wx / 2;
  const hz = wz / 2;
  const yTop = centre.y + wallH;
  const yR = yTop + ridgeH;
  const rA = v(centre.x - hx, yR, centre.z);
  const rB = v(centre.x + hx, yR, centre.z);
  // The near roof plane and the far one are mirror images, so they have to be
  // wound in opposite directions to both face outward. Same for the two gable
  // ends. See the note in `boxQuads`.
  out.push([
    v(centre.x - hx, yTop, centre.z + hz), v(centre.x + hx, yTop, centre.z + hz),
    rB, rA,
  ]);
  out.push([
    v(centre.x + hx, yTop, centre.z - hz), v(centre.x - hx, yTop, centre.z - hz),
    rA, rB,
  ]);
  out.push([
    v(centre.x - hx, yTop, centre.z - hz), v(centre.x - hx, yTop, centre.z + hz),
    rA, rA,
  ]);
  out.push([
    v(centre.x + hx, yTop, centre.z + hz), v(centre.x + hx, yTop, centre.z - hz),
    rB, rB,
  ]);
  return out;
}

/** Outward normal of a quad, from its first three corners. */
export function quadNormal(q: Quad): Vector3 {
  const u = q[1].clone().sub(q[0]);
  const w = q[3].clone().sub(q[0]);
  return u.cross(w).normalize();
}

/** The centre of a face. */
export function quadCentre(q: Quad): Vector3 {
  return q[0].clone().add(q[1]).add(q[2]).add(q[3]).multiplyScalar(0.25);
}

/**
 * The same quad, wound so that its normal points away from `inside`.
 *
 * For a solid built by hand out of placed corners — the substation's control
 * house is placed through the yard's own coordinate frame — getting the
 * winding right by inspection is a good way to end up with a building that is
 * open on one side. This asks the geometry instead.
 */
export function facingAwayFrom(q: Quad, inside: Vector3): Quad {
  return quadNormal(q).dot(quadCentre(q).sub(inside)) >= 0
    ? q : [q[3], q[2], q[1], q[0]];
}

/** The faces of a solid that the camera can see, given its view direction. */
export function facingQuads(quads: Quad[], towardCamera: Vector3): Quad[] {
  return quads.filter((q) => quadNormal(q).dot(towardCamera) > 0.001);
}
