import * as THREE from 'three';
import { rgb01 } from './style';
import type { Vec3 } from './lines';

/**
 * Power flow, drawn: a train of chevrons along a conductor pointing the way real
 * power flows, sized and moving in proportion to the megawatts. Nothing here is
 * scripted — size, speed and direction are set from the solved power flow each time
 * it changes.
 *
 *   chevron size (px)  = MW × FLOW_PX_PER_MW   (at least FLOW_MIN_PX, so small flows stay visible)
 *   speed (px/s)       = MW × FLOW_SPEED_PER_MW
 */
export const FLOW_PX_PER_MW = 1 / 120;
export const FLOW_MIN_PX = 5;
export const FLOW_MAX_PX = 22;
export const FLOW_SPEED_PER_MW = 1 / 40;

export function chevronSize(mw: number): number {
  return Math.min(FLOW_MAX_PX, Math.max(FLOW_MIN_PX, Math.abs(mw) * FLOW_PX_PER_MW));
}
export function chevronSpeed(mw: number): number {
  return Math.abs(mw) * FLOW_SPEED_PER_MW;
}

const VERT = /* glsl */ `
precision highp float;
in vec2 corner;
in vec3 aStart;
in vec3 aEnd;
in vec4 aFlow;   // x: chevron size px, y: signed speed px/s (+ start→end), z: side offset px, w: phase (px)
in vec4 aColor;
in float aDim;
uniform vec2 uResolution;
uniform float uPixelRatio;
flat out vec4 vSeg;
flat out vec3 vZ;
flat out vec3 vPlane;
out vec4 vFlow;
out vec4 vColor;
vec3 screenOf(vec3 p) {
  vec4 c = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  return vec3((c.xy / c.w * 0.5 + 0.5) * uResolution, c.z / c.w);
}
void main() {
  vec3 A = screenOf(aStart);
  vec3 B = screenOf(aEnd);
  vec2 d = B.xy - A.xy;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  vec2 side = n * aFlow.z * uPixelRatio;
  float hw = 0.5 * aFlow.x * uPixelRatio + 1.5;
  float along = corner.x < 0.5 ? 0.0 : len;
  vec2 p = A.xy + side + dir * along + n * corner.y * hw;
  float z = mix(A.z, B.z, corner.x);
  gl_Position = vec4(p / uResolution * 2.0 - 1.0, z, 1.0);
  vSeg = vec4(A.xy + side, dir);
  vZ = vec3(A.z, B.z, len);
  // depth of the plane under each fragment, as for offset strokes (lines.ts)
  vec3 G = screenOf(aStart + vec3(0.70710678, 0.0, -0.70710678));
  vPlane = vec3(A.y, B.y, (G.z - A.z) / max(G.y - A.y, 1e-6));
  vFlow = vec4(aFlow.x * uPixelRatio, aFlow.y * uPixelRatio, 0.0, aFlow.w * uPixelRatio);
  vColor = vec4(aColor.rgb, aColor.a * (1.0 - aDim));
}
`;

const FRAG = /* glsl */ `
precision highp float;
flat in vec4 vSeg;
flat in vec3 vZ;
flat in vec3 vPlane;
in vec4 vFlow;
in vec4 vColor;
uniform float uTime;
uniform float uPixelRatio;
uniform float uOpacity;
out vec4 fragColor;
void main() {
  // exact position and depth along the segment (see lines.ts)
  vec2 q = gl_FragCoord.xy - vSeg.xy;
  vec2 vLocal = vec2(dot(q, vSeg.zw), dot(q, vec2(-vSeg.w, vSeg.z)));
  float vLen = vZ.z;
  float f = clamp(vLocal.x / max(vLen, 1e-4), 0.0, 1.0);
  gl_FragDepth = 0.5 + 0.5 * (mix(vZ.x, vZ.y, f) + vPlane.z * (gl_FragCoord.y - mix(vPlane.x, vPlane.y, f)));
  float W = vFlow.x;              // chevron width across the line
  float speed = vFlow.y;          // signed
  float dirSign = speed >= 0.0 ? 1.0 : -1.0;
  float P = 2.4 * W + 6.0 * uPixelRatio;   // spacing
  float L = 0.55 * W;             // chevron depth along the line
  float stroke = max(1.25 * uPixelRatio, 0.2 * W);
  // position along the line in the direction of flow, advancing with time
  float s = vLocal.x * dirSign - uTime * abs(speed) + vFlow.w;
  float u = mod(s, P) - 0.5 * P;  // −P/2 … P/2, chevron tip near u = L/2
  float t = abs(vLocal.y);
  if (t > 0.5 * W + 1.0) discard;
  // arm: from tip (L/2, 0) back to (−L/2, W/2): u = L/2 − (L / (W/2))·t
  float m = L / (0.5 * W);
  float dArm = abs(u - 0.5 * L + m * t) / sqrt(1.0 + m * m);
  float a = clamp(0.5 * stroke + 0.5 - dArm, 0.0, 1.0);
  // keep inside the chevron's extent
  a *= step(-0.5 * L - stroke, u) * step(u, 0.5 * L + stroke);
  // fade in/out at the segment ends so marks do not pop
  float edge = min(vLocal.x, vLen - vLocal.x);
  a *= clamp(edge / (0.5 * W + 1.0), 0.0, 1.0);
  a *= vColor.a * uOpacity;
  if (a <= 0.003) discard;
  fragColor = vec4(vColor.rgb, a);
}
`;

export interface FlowStyle {
  sizePx: number;
  /** Signed: positive moves start → end. */
  speed: number;
  side?: number;
  phase?: number;
  color: string;
  alpha?: number;
}

export class FlowBatch {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private start: number[] = [];
  private end: number[] = [];
  private flow: number[] = [];
  private color: number[] = [];
  private dim: number[] = [];
  private attrDim: THREE.InstancedBufferAttribute | null = null;
  private attrFlow: THREE.InstancedBufferAttribute | null = null;
  private attrColor: THREE.InstancedBufferAttribute | null = null;
  count = 0;

  constructor(name = 'flow') {
    const g = this.geometry;
    g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]), 2));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uPixelRatio: { value: 1 },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = name;
    this.mesh.renderOrder = 20;
  }

  segment(a: Vec3, b: Vec3, s: FlowStyle): number {
    this.start.push(a[0], a[1], a[2]);
    this.end.push(b[0], b[1], b[2]);
    this.flow.push(s.sizePx, s.speed, s.side ?? 0, s.phase ?? 0);
    const [r, g, bl] = rgb01(s.color);
    this.color.push(r, g, bl, s.alpha ?? 1);
    this.dim.push(0);
    return this.count++;
  }

  set(index: number, s: FlowStyle): void {
    const f = [s.sizePx, s.speed, s.side ?? 0, s.phase ?? 0];
    const [r, g, b] = rgb01(s.color);
    const c = [r, g, b, s.alpha ?? 1];
    for (let k = 0; k < 4; k++) {
      this.flow[index * 4 + k] = f[k]!;
      this.color[index * 4 + k] = c[k]!;
    }
    if (this.attrFlow && this.attrColor) {
      (this.attrFlow.array as Float32Array).set(f, index * 4);
      (this.attrColor.array as Float32Array).set(c, index * 4);
      this.attrFlow.needsUpdate = true;
      this.attrColor.needsUpdate = true;
    }
  }

  /** Recede an instance (0: as drawn, 1: gone). */
  setDim(index: number, dim: number): void {
    this.dim[index] = dim;
    if (this.attrDim) {
      (this.attrDim.array as Float32Array)[index] = dim;
      this.attrDim.needsUpdate = true;
    }
  }

  commit(): void {
    const g = this.geometry;
    if (this.attrFlow) g.dispose(); // see LineBatch.commit
    this.attrDim = new THREE.InstancedBufferAttribute(new Float32Array(this.dim), 1);
    this.attrDim.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aDim', this.attrDim);
    g.setAttribute('aStart', new THREE.InstancedBufferAttribute(new Float32Array(this.start), 3));
    g.setAttribute('aEnd', new THREE.InstancedBufferAttribute(new Float32Array(this.end), 3));
    this.attrFlow = new THREE.InstancedBufferAttribute(new Float32Array(this.flow), 4);
    this.attrColor = new THREE.InstancedBufferAttribute(new Float32Array(this.color), 4);
    this.attrFlow.setUsage(THREE.DynamicDrawUsage);
    this.attrColor.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aFlow', this.attrFlow);
    g.setAttribute('aColor', this.attrColor);
    g.instanceCount = this.count;
  }

  frame(width: number, height: number, pixelRatio: number, time: number): void {
    const u = this.material.uniforms;
    (u.uResolution!.value as THREE.Vector2).set(width * pixelRatio, height * pixelRatio);
    u.uPixelRatio!.value = pixelRatio;
    u.uTime!.value = time;
  }

  set opacity(v: number) {
    this.material.uniforms.uOpacity!.value = v;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
