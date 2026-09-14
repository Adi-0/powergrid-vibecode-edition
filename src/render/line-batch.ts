/**
 * Quad-based line rendering with constant screen-space width.
 *
 * WHY THIS EXISTS
 * `gl.lineWidth` is ignored on nearly every platform — the WebGL specification
 * permits an implementation to support only a width of 1, and almost all of
 * them do exactly that. Any drawing that relies on it is a 1-pixel aliased
 * sketch, not technical line work. So lines are drawn as geometry instead: one
 * instanced quad per segment, expanded to the right width in the vertex shader
 * AFTER projection, which is what makes the width constant in pixels no matter
 * how far the camera has zoomed.
 *
 * WHAT THE SHADER DOES
 *  1. Project both endpoints to clip space, then to pixels.
 *  2. Expand the unit quad perpendicular to the projected direction by half the
 *     requested width, and along the direction by the same amount at each end,
 *     so that the segment has round caps and joins cleanly at a node.
 *  3. Convert back to clip space.
 *  4. In the fragment shader, evaluate the distance to the segment's centre
 *     line — a capsule signed distance — and use it to antialias the edge over
 *     one pixel. Dash patterns and travelling flow marks are both evaluated in
 *     the same pixel coordinate along the segment, which is why they stay the
 *     same size at every zoom level.
 *
 * A single batch draws thousands of segments in one call.
 */

import {
  BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, ShaderMaterial, Vector2, Color, DoubleSide,
} from 'three';

export interface LineSegment {
  /** Start point in world space. */
  a: [number, number, number];
  /** End point in world space. */
  b: [number, number, number];
  /** Stroke width in CSS pixels, held constant as the camera zooms. */
  widthPx: number;
  /** Stroke colour, any CSS colour string. */
  color: string;
  opacity?: number;
  /** Dash pattern in screen pixels: on-length, off-length. Omit for solid. */
  dash?: [number, number];
  /** Starting phase of the dash pattern, pixels. */
  dashPhase?: number;
  /**
   * Pixels per second the dash pattern travels along the segment. Positive is
   * from `a` toward `b`. This is how power flow is drawn: the marks move in the
   * direction real power is actually going, at a speed proportional to loading.
   */
  dashSpeed?: number;
}

const VERTEX_SHADER = /* glsl */ `
precision highp float;

// The built-in attribute "position" carries the unit quad: x is 0..1 along the
// segment, y is -0.5..0.5 across it. It MUST be named that - three.js declares
// it in every ShaderMaterial prologue, and reads its count to decide how many
// vertices a non-indexed draw covers. A geometry without one draws nothing.
attribute vec3 iStart;
attribute vec3 iEnd;
attribute float iWidth;       // CSS pixels
attribute vec4 iColor;        // rgba, premultiplied opacity in a
attribute vec4 iDash;         // on, off, phase, speed  (all in pixels / px-per-sec)

uniform vec2 uResolution;     // drawing buffer size in CSS pixels
uniform float uTime;          // seconds
uniform float uWidthScale;    // global multiplier, for print/export

varying float vAlongPx;
varying float vLenPx;
varying float vEdgePx;
varying float vHalfPx;
varying vec4 vColor;
varying vec4 vDash;

void main() {
  vec4 clipA = projectionMatrix * modelViewMatrix * vec4(iStart, 1.0);
  vec4 clipB = projectionMatrix * modelViewMatrix * vec4(iEnd, 1.0);

  vec2 ndcA = clipA.xy / clipA.w;
  vec2 ndcB = clipB.xy / clipB.w;
  vec2 pxA = (ndcA * 0.5 + 0.5) * uResolution;
  vec2 pxB = (ndcB * 0.5 + 0.5) * uResolution;

  vec2 delta = pxB - pxA;
  float len = length(delta);
  vec2 dir = len > 1e-6 ? delta / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);

  float halfW = max(iWidth * uWidthScale, 0.35) * 0.5;
  // One extra pixel each way so the antialiasing feather has somewhere to live.
  float pad = halfW + 1.0;

  vec2 centre = mix(pxA, pxB, position.x);
  vec2 px = centre
          + dir * (position.x * 2.0 - 1.0) * pad
          + nrm * position.y * 2.0 * pad;

  vAlongPx = position.x * len + (position.x * 2.0 - 1.0) * pad;
  vLenPx   = len;
  vEdgePx  = position.y * 2.0 * pad;
  vHalfPx  = halfW;
  vColor   = iColor;
  vDash    = vec4(iDash.x, iDash.y, iDash.z + uTime * iDash.w, 0.0);

  vec2 ndc = px / uResolution * 2.0 - 1.0;
  float z = mix(clipA.z / clipA.w, clipB.z / clipB.w, position.x);
  gl_Position = vec4(ndc, z, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

// Halos write depth so that later strokes behind them are rejected. They must
// do so only where they are SOLID: a depth write inside the one-pixel
// antialiasing feather makes every halo two pixels wider than it looks, which
// on parallel circuits quietly erases the neighbour.
uniform float uAlphaCutoff;

varying float vAlongPx;
varying float vLenPx;
varying float vEdgePx;
varying float vHalfPx;
varying vec4 vColor;
varying vec4 vDash;

void main() {
  // Capsule signed distance in pixels: distance from this fragment to the
  // segment's centre line, with the ends rounded.
  float along = clamp(vAlongPx, 0.0, vLenPx);
  float overshoot = vAlongPx - along;
  float dist = length(vec2(overshoot, vEdgePx));

  float alpha = clamp(vHalfPx - dist + 0.5, 0.0, 1.0);

  // Dash pattern, measured in pixels along the segment so it holds its size at
  // every zoom level. A moving phase turns the same code into flow marks.
  float on = vDash.x;
  float off = vDash.y;
  if (on > 0.0 && off > 0.0) {
    float period = on + off;
    float t = mod(along + vDash.z, period);
    // Positive inside the dash, negative outside; feathered over one pixel.
    float edge = min(t, on - t);
    alpha *= clamp(edge + 0.5, 0.0, 1.0);
  }

  if (alpha <= uAlphaCutoff) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);

  // three.js converts every colour into a linear working space. Writing that
  // value straight to an sRGB framebuffer would show a ground-coloured halo as
  // a visible pale band against ground of exactly the same nominal colour, and
  // would lighten the ink. This chunk converts back to the output colour space.
  #include <colorspace_fragment>
}
`;

/**
 * Unit quad, two triangles, shared by every batch.
 *
 * It has to be called `position`: three.js reads `geometry.attributes.position`
 * to work out how many vertices a non-indexed draw covers, and declares the
 * attribute itself in every ShaderMaterial's vertex shader prologue.
 */
function unitQuad(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([
    0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0,
    0, -0.5, 0, 1, 0.5, 0, 0, 0.5, 0,
  ], 3));
  return g;
}

const scratchColor = new Color();

/**
 * A batch of line segments drawn in one call.
 *
 * Capacity is fixed at construction. `update` rewrites the instance buffers in
 * place, which is what makes re-solving and redrawing on every scrubber frame
 * cheap: no allocation, no geometry rebuild.
 */
export class LineBatch {
  readonly mesh: Mesh;
  private readonly geometry: InstancedBufferGeometry;
  private readonly material: ShaderMaterial;
  private readonly start: Float32Array;
  private readonly end: Float32Array;
  private readonly width: Float32Array;
  private readonly colour: Float32Array;
  private readonly dash: Float32Array;
  private readonly capacity: number;
  private count = 0;

  constructor(
    capacity: number,
    options: { depthTest?: boolean; renderOrder?: number; halo?: boolean } = {}
  ) {
    this.capacity = capacity;
    this.start = new Float32Array(capacity * 3);
    this.end = new Float32Array(capacity * 3);
    this.width = new Float32Array(capacity);
    this.colour = new Float32Array(capacity * 4);
    this.dash = new Float32Array(capacity * 4);

    const base = unitQuad();
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('iStart', new InstancedBufferAttribute(this.start, 3));
    g.setAttribute('iEnd', new InstancedBufferAttribute(this.end, 3));
    g.setAttribute('iWidth', new InstancedBufferAttribute(this.width, 1));
    g.setAttribute('iColor', new InstancedBufferAttribute(this.colour, 4));
    g.setAttribute('iDash', new InstancedBufferAttribute(this.dash, 4));
    g.instanceCount = 0;
    this.geometry = g;

    this.material = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uResolution: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uWidthScale: { value: 1 },
        uAlphaCutoff: { value: 0.002 },
      },
      transparent: true,
      // HIDDEN-LINE REMOVAL IS DONE BY PAINTING, NOT BY DEPTH TESTING.
      //
      // The obvious approach is to give every conductor a wider ground-coloured
      // backing that writes depth, and let the depth buffer decide. It does not
      // work here, and the reason is worth recording: transmission circuits run
      // in corridors. A 500 kV line and a 230 kV line very often follow the
      // same right-of-way for a hundred kilometres, because the land was bought
      // once. Depth testing then does its job perfectly and the upper circuit
      // erases the lower one along its ENTIRE LENGTH — geometrically correct,
      // and useless as a drawing.
      //
      // What a draughtsman does instead is draw from the back forward, breaking
      // each line only where something in front actually crosses it. That is
      // painter's order, and it is what this does: the caller sorts every mark
      // by distance and interleaves each halo immediately before its own
      // stroke, so a nearer line's halo erases only the strokes already laid
      // down behind it. No depth buffer is involved at all.
      depthTest: options.depthTest ?? false,
      depthWrite: false,
      side: DoubleSide,
    });

    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = options.renderOrder ?? 0;
  }

  get instanceCount(): number {
    return this.count;
  }

  get maxInstances(): number {
    return this.capacity;
  }

  /** Replace the batch's contents. Segments beyond capacity are dropped. */
  update(segments: readonly LineSegment[]): void {
    const n = Math.min(segments.length, this.capacity);
    for (let i = 0; i < n; i++) {
      const s = segments[i];
      this.start[i * 3] = s.a[0];
      this.start[i * 3 + 1] = s.a[1];
      this.start[i * 3 + 2] = s.a[2];
      this.end[i * 3] = s.b[0];
      this.end[i * 3 + 1] = s.b[1];
      this.end[i * 3 + 2] = s.b[2];
      this.width[i] = s.widthPx;
      scratchColor.set(s.color);
      this.colour[i * 4] = scratchColor.r;
      this.colour[i * 4 + 1] = scratchColor.g;
      this.colour[i * 4 + 2] = scratchColor.b;
      this.colour[i * 4 + 3] = s.opacity ?? 1;
      this.dash[i * 4] = s.dash ? s.dash[0] : 0;
      this.dash[i * 4 + 1] = s.dash ? s.dash[1] : 0;
      this.dash[i * 4 + 2] = s.dashPhase ?? 0;
      this.dash[i * 4 + 3] = s.dashSpeed ?? 0;
    }
    this.count = n;
    this.geometry.instanceCount = n;
    for (const name of ['iStart', 'iEnd', 'iWidth', 'iColor', 'iDash']) {
      (this.geometry.getAttribute(name) as InstancedBufferAttribute).needsUpdate = true;
    }
  }

  setResolution(widthPx: number, heightPx: number): void {
    (this.material.uniforms.uResolution.value as Vector2).set(widthPx, heightPx);
  }

  setTime(seconds: number): void {
    this.material.uniforms.uTime.value = seconds;
  }

  /** Global stroke-width multiplier, for high-resolution export. */
  setWidthScale(scale: number): void {
    this.material.uniforms.uWidthScale.value = scale;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
