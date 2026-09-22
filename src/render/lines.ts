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
 * Each endpoint is a world point plus a pixel offset added after projection, so the
 * same primitive draws world geometry (offset 0), screen-constant symbols (a world
 * anchor plus a shape in pixels), and parallel circuits (a sideways offset in px).
 *
 * Every instance can also carry a collapsed form — an anchor and pixel offsets. With
 * uMorph < 1 the segment is drawn part-way toward it. Level transitions use this to
 * fold machinery into the symbol that stands for it, and to unfold it again.
 */

const VERT = /* glsl */ `
precision highp float;
in vec2 corner;
in vec3 aStart;
in vec3 aEnd;
in vec4 aPx;          // xy: start offset (CSS px, y up), zw: end offset
in vec4 aStyle;       // x: width (CSS px), y: pattern, z: dash start (projected units), w: dash speed (px/s)
in vec4 aColor;
in vec4 aCollapse;    // xyz: collapse anchor (world), w: stagger in [0, 0.5]
in vec4 aCollapsePx;  // collapsed start/end offsets from the anchor, px
in vec4 aExtra;       // x: sideways offset (px), y: fade mode (0 none, 1 in with morph, 2 out with morph), z: dim (0 … 1)

uniform vec2 uResolution;
uniform float uPxPerUnit;
uniform float uPixelRatio;
uniform float uWidthScale;
uniform float uMorph;

flat out vec4 vSeg;   // segment start (device px) and direction
flat out vec3 vZ;     // NDC depth at start and end, and length (device px)
out float vHalfW;
out float vDash;
out float vPattern;
out float vSpeed;
out vec4 vColor;

vec3 screenOf(vec3 p) {
  vec4 c = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  return vec3((c.xy / c.w * 0.5 + 0.5) * uResolution, c.z / c.w);
}

void main() {
  vec3 A = screenOf(aStart);
  vec3 B = screenOf(aEnd);
  A.xy += aPx.xy * uPixelRatio;
  B.xy += aPx.zw * uPixelRatio;
  float t = 1.0;
  if (uMorph < 0.9999) {
    t = smoothstep(aCollapse.w, aCollapse.w + 0.5, uMorph);
    vec3 C = screenOf(aCollapse.xyz);
    vec3 CA = vec3(C.xy + aCollapsePx.xy * uPixelRatio, C.z);
    vec3 CB = vec3(C.xy + aCollapsePx.zw * uPixelRatio, C.z);
    A = mix(CA, A, t);
    B = mix(CB, B, t);
  }
  vec2 d = B.xy - A.xy;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  vec2 side = n * aExtra.x * uPixelRatio;
  A.xy += side;
  B.xy += side;
  float hw = 0.5 * aStyle.x * uPixelRatio * uWidthScale;
  float ext = max(hw, 0.5) + 1.0;
  float along = corner.x < 0.5 ? -ext : len + ext;
  vec2 p = A.xy + dir * along + n * corner.y * ext;
  float f = clamp(along / max(len, 1e-4), 0.0, 1.0);
  float z = mix(A.z, B.z, f);
  gl_Position = vec4(p / uResolution * 2.0 - 1.0, z, 1.0);
  vSeg = vec4(A.xy, dir);
  vZ = vec3(A.z, B.z, len);
  vHalfW = hw;
  vDash = aStyle.z * uPxPerUnit * uPixelRatio;
  vPattern = aStyle.y;
  vSpeed = aStyle.w * uPixelRatio;
  float fade = aExtra.y < 0.5 ? 1.0 : (aExtra.y < 1.5 ? t : 1.0 - uMorph);
  vColor = vec4(aColor.rgb, aColor.a * fade * (1.0 - aExtra.z));
}
`;

const FRAG = /* glsl */ `
precision highp float;
flat in vec4 vSeg;
flat in vec3 vZ;
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
  // Position along and across the segment, from the fragment's own window position.
  // A segment's quad is a sliver hundreds of pixels long; interpolating varyings or
  // depth across it is not exact enough, so both are computed here instead.
  vec2 q = gl_FragCoord.xy - vSeg.xy;
  vec2 vLocal = vec2(dot(q, vSeg.zw), dot(q, vec2(-vSeg.w, vSeg.z)));
  float vLen = vZ.z;
  gl_FragDepth = 0.5 + 0.5 * mix(vZ.x, vZ.y, clamp(vLocal.x / max(vLen, 1e-4), 0.0, 1.0));
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
    float d1 = min(s, e1 - s);
    float d2 = pat.z > 0.0 ? min(s - s2, e2 - s) : -1e9;
    float d3 = s - period;
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
  /** Pixel offsets added to the start and end after projection (y up). */
  px?: readonly [number, number, number, number];
  /** Sideways offset in px (parallel circuits). */
  side?: number;
  /** Collapse anchor for level transitions, and the collapsed shape in px around it. */
  collapse?: readonly [number, number, number];
  collapsePx?: readonly [number, number, number, number];
  /** Stagger in [0, 0.5]: when this element starts to unfold during a transition. */
  stagger?: number;
  /** 'in': fades in as it unfolds; 'out': fades out as the morph completes. */
  fade?: 'none' | 'in' | 'out';
}

export type Vec3 = readonly [number, number, number];

type AttrName = 'start' | 'end' | 'px' | 'style' | 'color' | 'collapse' | 'collapsePx' | 'extra';
const SIZES: Record<AttrName, number> = { start: 3, end: 3, px: 4, style: 4, color: 4, collapse: 4, collapsePx: 4, extra: 4 };
const NAMES: Record<AttrName, string> = {
  start: 'aStart',
  end: 'aEnd',
  px: 'aPx',
  style: 'aStyle',
  color: 'aColor',
  collapse: 'aCollapse',
  collapsePx: 'aCollapsePx',
  extra: 'aExtra',
};

export class LineBatch {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private data: Record<AttrName, number[]> = { start: [], end: [], px: [], style: [], color: [], collapse: [], collapsePx: [], extra: [] };
  private attrs: Record<AttrName, THREE.InstancedBufferAttribute> | null = null;
  count = 0;

  constructor(name = 'lines') {
    const g = new THREE.InstancedBufferGeometry();
    // Two triangles: corner.x ∈ {0, 1} (which end), corner.y ∈ {-1, 1} (which side)
    const corners = new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]);
    g.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
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
    const d = this.data;
    d.start.push(a[0], a[1], a[2]);
    d.end.push(b[0], b[1], b[2]);
    const px = s.px ?? [0, 0, 0, 0];
    d.px.push(px[0], px[1], px[2], px[3]);
    d.style.push(s.width, DASH[s.dash ?? 'solid'], dashStart, s.speed ?? 0);
    const [r, g, bl] = rgb01(s.color ?? '#14161A');
    d.color.push(r, g, bl, s.alpha ?? 1);
    const c = s.collapse ?? a;
    d.collapse.push(c[0], c[1], c[2], s.stagger ?? 0);
    const cp = s.collapsePx ?? [0, 0, 0, 0];
    d.collapsePx.push(cp[0], cp[1], cp[2], cp[3]);
    d.extra.push(s.side ?? 0, s.fade === 'in' ? 1 : s.fade === 'out' ? 2 : 0, 0, 0);
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

  /** A screen-constant shape (polyline in px, y up) anchored at a world point. */
  glyph(anchor: Vec3, pts: ReadonlyArray<readonly [number, number]>, s: LineStyle, closed = false): [number, number] {
    const first = this.count;
    const n = pts.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p = pts[i]!;
      const q = pts[(i + 1) % n]!;
      this.segment(anchor, anchor, { ...s, px: [p[0], p[1], q[0], q[1]] });
    }
    return [first, this.count - first];
  }

  private write(name: AttrName, index: number, values: number[]): void {
    const size = SIZES[name];
    const o = index * size;
    for (let k = 0; k < values.length; k++) this.data[name][o + k] = values[k]!;
    if (this.attrs) {
      const arr = this.attrs[name].array as Float32Array;
      for (let k = 0; k < values.length; k++) arr[o + k] = values[k]!;
      this.attrs[name].needsUpdate = true;
    }
  }

  setColor(index: number, color: string, alpha = 1): void {
    const [r, g, b] = rgb01(color);
    this.write('color', index, [r, g, b, alpha]);
  }

  setAlpha(index: number, alpha: number): void {
    const o = index * 4 + 3;
    this.data.color[o] = alpha;
    if (this.attrs) {
      (this.attrs.color.array as Float32Array)[o] = alpha;
      this.attrs.color.needsUpdate = true;
    }
  }

  /** Recede an instance (0: as drawn, 1: gone), independent of its colour and alpha. */
  setDim(index: number, dim: number): void {
    const o = index * 4 + 2;
    this.data.extra[o] = dim;
    if (this.attrs) {
      (this.attrs.extra.array as Float32Array)[o] = dim;
      this.attrs.extra.needsUpdate = true;
    }
  }

  setWidth(index: number, width: number): void {
    const o = index * 4;
    this.data.style[o] = width;
    if (this.attrs) {
      (this.attrs.style.array as Float32Array)[o] = width;
      this.attrs.style.needsUpdate = true;
    }
  }

  setPattern(index: number, dash: DashName, speed = 0): void {
    const o = index * 4;
    this.data.style[o + 1] = DASH[dash];
    this.data.style[o + 3] = speed;
    if (this.attrs) {
      const arr = this.attrs.style.array as Float32Array;
      arr[o + 1] = DASH[dash];
      arr[o + 3] = speed;
      this.attrs.style.needsUpdate = true;
    }
  }

  clear(): void {
    for (const k of Object.keys(this.data) as AttrName[]) this.data[k] = [];
    this.count = 0;
  }

  /** Upload buffers. Call after adding segments. */
  commit(): void {
    const attrs = {} as Record<AttrName, THREE.InstancedBufferAttribute>;
    for (const k of Object.keys(SIZES) as AttrName[]) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(this.data[k]), SIZES[k]);
      a.setUsage(THREE.DynamicDrawUsage);
      attrs[k] = a;
      this.geometry.setAttribute(NAMES[k], a);
    }
    this.attrs = attrs;
    this.geometry.instanceCount = this.count;
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
