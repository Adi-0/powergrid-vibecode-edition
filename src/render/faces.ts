import * as THREE from 'three';
import { GROUND, rgb01 } from './style';
import type { Vec3 } from './lines';

/**
 * Ground-coloured faces for hidden-line removal.
 *
 * Isometric line art needs near geometry to occlude far geometry. Every solid
 * gets its faces drawn in the ground colour, depth-written and pushed back with
 * polygon offset, so its own edges (drawn as lines at the same depth) survive
 * while lines behind it fail the depth test. Occlusion is structural, not a
 * shading effect: there is no lighting, only paper-coloured faces.
 *
 * A face can instead be hatched (45° lines in screen space), which is how a
 * drawing marks a cut section, and how the signal colour fills an area.
 */

const VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec4 aCollapse;
in vec4 aColor;
in float aFill;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform float uMorph;
out vec4 vColor;
out float vFill;
void main() {
  float t = smoothstep(aCollapse.w, aCollapse.w + 0.5, uMorph);
  vec3 p = mix(aCollapse.xyz, position, t);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vColor = aColor;
  vFill = aFill;
}
`;

const FRAG = /* glsl */ `
precision highp float;
in vec4 vColor;
in float vFill;
uniform float uPixelRatio;
uniform vec3 uGround;
uniform float uOpacity;
out vec4 fragColor;
void main() {
  vec3 c = vColor.rgb;
  if (vFill > 0.5) {
    // 45° hatch, 6 CSS px pitch, 1.2 px lines, in screen space
    float pitch = 6.0 * uPixelRatio;
    float w = 1.2 * uPixelRatio;
    float s = mod(gl_FragCoord.x + gl_FragCoord.y, pitch);
    float a = clamp(w * 0.5 + 0.5 - abs(s - pitch * 0.5), 0.0, 1.0);
    c = mix(uGround, vColor.rgb, a);
  }
  fragColor = vec4(mix(uGround, c, uOpacity), 1.0);
}
`;

export interface FaceStyle {
  color?: string;
  hatch?: boolean;
  collapse?: Vec3;
  stagger?: number;
}

export class FaceBatch {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.RawShaderMaterial;
  private readonly geometry = new THREE.BufferGeometry();
  private pos: number[] = [];
  private col: number[] = [];
  private fill: number[] = [];
  private coll: number[] = [];
  private attrColl: THREE.Float32BufferAttribute | null = null;

  constructor(name = 'faces') {
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
      depthTest: true,
      depthWrite: true,
      uniforms: {
        uMorph: { value: 1 },
        uPixelRatio: { value: 1 },
        uGround: { value: new THREE.Vector3(...rgb01(GROUND)) },
        uOpacity: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = name;
    this.mesh.renderOrder = 0;
  }

  /** A planar convex polygon (fan-triangulated). */
  polygon(pts: readonly Vec3[], s: FaceStyle = {}): void {
    for (let i = 1; i + 1 < pts.length; i++) this.tri(pts[0]!, pts[i]!, pts[i + 1]!, s);
  }

  /** A quad a-b-c-d. */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, s: FaceStyle = {}): void {
    this.tri(a, b, c, s);
    this.tri(a, c, d, s);
  }

  tri(a: Vec3, b: Vec3, c: Vec3, s: FaceStyle = {}): void {
    const [r, g, bl] = rgb01(s.color ?? GROUND);
    const co = s.collapse ?? [0, 0, 0];
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.col.push(r, g, bl, 1);
      this.fill.push(s.hatch ? 1 : 0);
      this.coll.push(co[0], co[1], co[2], s.stagger ?? 0);
    }
  }

  /** Vertices so far: mark where a solid starts, to hide it later. */
  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /**
   * Hide (or show again) the faces between two vertex marks — something a lower level
   * draws in its place while it is open. A hidden face is folded to its collapse point
   * whatever the morph (its stagger pushed past the end of any transition).
   */
  setHidden(first: number, count: number, hidden: boolean, stagger = 0): void {
    const w = hidden ? 10 : stagger;
    for (let v = first; v < first + count; v++) this.coll[v * 4 + 3] = w;
    if (this.attrColl) {
      const a = this.attrColl.array as Float32Array;
      for (let v = first; v < first + count; v++) a[v * 4 + 3] = w;
      this.attrColl.needsUpdate = true;
    }
  }

  clear(): void {
    this.pos = [];
    this.col = [];
    this.fill = [];
    this.coll = [];
  }

  commit(): void {
    const g = this.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 4));
    g.setAttribute('aFill', new THREE.Float32BufferAttribute(this.fill, 1));
    this.attrColl = new THREE.Float32BufferAttribute(this.coll, 4);
    g.setAttribute('aCollapse', this.attrColl);
  }

  frame(pixelRatio: number): void {
    this.material.uniforms.uPixelRatio!.value = pixelRatio;
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

/** Faces and edges of an axis-aligned box, for iso equipment drawings. */
export function boxCorners(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Vec3[] {
  return [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y0, z1],
    [x0, y0, z1],
    [x0, y1, z0],
    [x1, y1, z0],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
}

export const BOX_FACES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
];

export const BOX_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];
