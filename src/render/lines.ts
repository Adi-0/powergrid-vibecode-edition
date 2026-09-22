import * as THREE from 'three';
import { projectedLength } from './iso';
import { DASH, DASH_PATTERNS, type DashName, rgb01 } from './style';

/**
 * Instanced quad lines with constant screen-space width.
 *
 * gl.lineWidth is ignored on nearly every platform, so each segment is a quad
 * expanded in screen space in the vertex shader. The fragment shader computes the
 * distance to the segment (a capsule: round caps give clean joins) for a 1 px
 * antialiased edge, and applies a dash pattern whose phase is continuous along a
 * polyline because each segment carries the projected length that precedes it.
 *
 * Every instance can also carry a collapse target: with uMorph < 1 the segment is
 * drawn part-way toward that point. Level transitions use it to fold machinery into
 * the node that stands for it (and unfold it again).
 */

const VERT = /* glsl */ `
precision highp float;
in vec2 corner;
in vec3 aStart;
in vec3 aEnd;
in vec4 aStyle;      // x: width (CSS px), y: pattern index, z: dash start (projected units), w: dash speed (px/s)
in vec4 aColor;
in vec4 aCollapse;   // xyz: collapse target, w: stagger in [0, 0.5]

uniform vec2 uResolution;
uniform float uPxPerUnit;
uniform float uPixelRatio;
uniform float uWidthScale;
uniform float uMorph;

out vec2 vLocal;
out float vLen;
out float vHalfW;
out float vDash;
out float vPattern;
out float vSpeed;
out vec4 vColor;

vec3 morphed(vec3 p) {
  float t = smoothstep(aCollapse.w, aCollapse.w + 0.5, uMorph);
  return mix(aCollapse.xyz, p, t);
}

void main() {
  vec3 A = morphed(aStart);
  vec3 B = morphed(aEnd);
  vec4 ca = projectionMatrix * modelViewMatrix * vec4(A, 1.0);
  vec4 cb = projectionMatrix * modelViewMatrix * vec4(B, 1.0);
  vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uResolution;
  vec2 sb = (cb.xy / cb.w * 0.5 + 0.5) * uResolution;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  float hw = 0.5 * aStyle.x * uPixelRatio * uWidthScale;
  float ext = max(hw, 0.5) + 1.0;
  float along = corner.x < 0.5 ? -ext : len + ext;
  vec2 p = sa + dir * along + n * corner.y * ext;
  float f = clamp(along / max(len, 1e-4), 0.0, 1.0);
  float z = mix(ca.z / ca.w, cb.z / cb.w, f);
  gl_Position = vec4(p / uResolution * 2.0 - 1.0, z, 1.0);
  vLocal = vec2(along, corner.y * ext);
  vLen = len;
  vHalfW = hw;
  vDash = aStyle.z * uPxPerUnit * uPixelRatio;
  vPattern = aStyle.y;
  vSpeed = aStyle.w * uPixelRatio;
  vColor = aColor;
}
`;

const FRAG = /* glsl */ `
precision highp float;
in vec2 vLocal;
in float vLen;
in float vHalfW;
in float vDash;
in float vPattern;
in float vSpeed;
in vec4 vColor;

uniform vec4 uPatterns[8];
uniform float uPixelRatio;
uniform float uTime;
uniform float uOpacity;

out vec4 fragColor;

void main() {
  float dist;
  if (vLocal.x < 0.0) dist = length(vLocal);
  else if (vLocal.x > vLen) dist = length(vec2(vLocal.x - vLen, vLocal.y));
  else dist = abs(vLocal.y);
  // Lines thinner than a device pixel keep 1 px of coverage and fade instead.
  float hw = max(vHalfW, 0.5);
  float a = clamp(hw + 0.5 - dist, 0.0, 1.0) * min(1.0, vHalfW * 2.0);

  int pi = int(vPattern + 0.5);
  if (pi > 0) {
    vec4 pat = uPatterns[pi] * uPixelRatio;
    float period = pat.x + pat.y + pat.z + pat.w;
    float s = mod(vDash + clamp(vLocal.x, 0.0, vLen) - uTime * vSpeed, period);
    float e1 = pat.x;
    float s2 = pat.x + pat.y;
    float e2 = s2 + pat.z;
    // signed distance into the nearest "on" interval (positive inside)
    float d1 = min(s, e1 - s);
    float d2 = pat.z > 0.0 ? min(s - s2, e2 - s) : -1e9;
    float d3 = s - period; // approaching the next period's first dash (negative)
    float inside = max(max(d1, d2), d3);
    a *= clamp(inside + 0.5, 0.0, 1.0);
  }
  a *= vColor.a * uOpacity;
  if (a <= 0.003) discard;
  fragColor = vec4(vColor.rgb, a);
}
`;

export interface LineStyle {
  /** Stroke width in CSS px. */
  width: number;
  dash?: DashName;
  color?: string;
  alpha?: number;
  /** Dash travel speed in CSS px per second (animated marks only). */
  speed?: number;
  /** Collapse target for level transitions (defaults to the frame origin). */
  collapse?: readonly [number, number, number];
  /** Stagger in [0, 0.5]: when this element starts to unfold during a transition. */
  stagger?: number;
}

export type Vec3 = readonly [number, number, number];

const FLOATS = { start: 3, end: 3, style: 4, color: 4, collapse: 4 } as const;

export class LineBatch {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private start: number[] = [];
  private end: number[] = [];
  private style: number[] = [];
  private color: number[] = [];
  private collapse: number[] = [];
  private attrs: Record<keyof typeof FLOATS, THREE.InstancedBufferAttribute> | null = null;
  count = 0;

  constructor(name = 'lines') {
    const g = new THREE.InstancedBufferGeometry();
    // Two triangles: corner.x ∈ {0, 1} (which end), corner.y ∈ {-1, 1} (which side)
    const corners = new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]);
    g.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
    // Positions are computed in the shader; give three.js a dummy for bounds.
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    this.geometry = g;
    const patterns = DASH_PATTERNS.map((p) => new THREE.Vector4(p[0], p[1], p[2], p[3]));
    while (patterns.length < 8) patterns.push(new THREE.Vector4(0, 0, 0, 0));
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uPxPerUnit: { value: 1 },
        uPixelRatio: { value: 1 },
        uWidthScale: { value: 1 },
        uMorph: { value: 1 },
        uPatterns: { value: patterns },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = name;
    this.mesh.renderOrder = 10;
  }

  /** Add one segment. Returns its instance index. */
  segment(a: Vec3, b: Vec3, s: LineStyle, dashStart = 0): number {
    this.start.push(a[0], a[1], a[2]);
    this.end.push(b[0], b[1], b[2]);
    this.style.push(s.width, DASH[s.dash ?? 'solid'], dashStart, s.speed ?? 0);
    const [r, g, bl] = rgb01(s.color ?? '#14161A');
    this.color.push(r, g, bl, s.alpha ?? 1);
    const c = s.collapse ?? [0, 0, 0];
    this.collapse.push(c[0], c[1], c[2], s.stagger ?? 0);
    return this.count++;
  }

  /** Add a polyline with a continuous dash phase. Returns [first, count]. */
  polyline(points: readonly Vec3[], s: LineStyle, closed = false): [number, number] {
    const first = this.count;
    let acc = 0;
    const n = points.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % n]!;
      this.segment(a, b, s, acc);
      acc += projectedLength(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    return [first, this.count - first];
  }

  setColor(index: number, color: string, alpha = 1): void {
    const [r, g, b] = rgb01(color);
    const o = index * 4;
    this.color[o] = r;
    this.color[o + 1] = g;
    this.color[o + 2] = b;
    this.color[o + 3] = alpha;
    if (this.attrs) {
      const arr = this.attrs.color.array as Float32Array;
      arr[o] = r;
      arr[o + 1] = g;
      arr[o + 2] = b;
      arr[o + 3] = alpha;
      this.attrs.color.needsUpdate = true;
    }
  }

  setWidth(index: number, width: number): void {
    const o = index * 4;
    this.style[o] = width;
    if (this.attrs) {
      (this.attrs.style.array as Float32Array)[o] = width;
      this.attrs.style.needsUpdate = true;
    }
  }

  setPattern(index: number, dash: DashName, speed = 0): void {
    const o = index * 4;
    this.style[o + 1] = DASH[dash];
    this.style[o + 3] = speed;
    if (this.attrs) {
      const arr = this.attrs.style.array as Float32Array;
      arr[o + 1] = DASH[dash];
      arr[o + 3] = speed;
      this.attrs.style.needsUpdate = true;
    }
  }

  clear(): void {
    this.start = [];
    this.end = [];
    this.style = [];
    this.color = [];
    this.collapse = [];
    this.count = 0;
  }

  /** Upload buffers. Call after adding segments. */
  commit(): void {
    const mk = (data: number[], size: number) =>
      new THREE.InstancedBufferAttribute(new Float32Array(data), size);
    this.attrs = {
      start: mk(this.start, 3),
      end: mk(this.end, 3),
      style: mk(this.style, 4),
      color: mk(this.color, 4),
      collapse: mk(this.collapse, 4),
    };
    const g = this.geometry;
    g.setAttribute('aStart', this.attrs.start);
    g.setAttribute('aEnd', this.attrs.end);
    g.setAttribute('aStyle', this.attrs.style);
    g.setAttribute('aColor', this.attrs.color);
    g.setAttribute('aCollapse', this.attrs.collapse);
    g.instanceCount = this.count;
  }

  /** Per-frame uniforms. */
  frame(opts: { width: number; height: number; pixelRatio: number; pxPerUnit: number; time: number }): void {
    const u = this.material.uniforms;
    (u.uResolution!.value as THREE.Vector2).set(opts.width * opts.pixelRatio, opts.height * opts.pixelRatio);
    u.uPixelRatio!.value = opts.pixelRatio;
    u.uPxPerUnit!.value = opts.pxPerUnit;
    u.uTime!.value = opts.time;
  }

  set morph(v: number) {
    this.material.uniforms.uMorph!.value = v;
  }

  set opacity(v: number) {
    this.material.uniforms.uOpacity!.value = v;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
