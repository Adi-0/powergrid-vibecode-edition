import * as THREE from 'three';
import { GROUND, rgb01 } from './style';

/**
 * A flat region (a state's surface) as a ground-coloured, depth-writing face.
 *
 * Triangulating a coastline gives long, thin triangles hundreds of kilometres long.
 * A rasteriser derives each triangle's depth plane from its three snapped vertices;
 * for a sliver that plane can tilt by far more than polygon offset allows, and the
 * conductors drawn on the surface then fail the depth test over part of their length.
 *
 * So the region is drawn in two passes. The first writes only coverage into one
 * stencil bit: a fan from each ring's first vertex with the bit inverted per triangle,
 * which leaves it set exactly where the point is inside an odd number of rings (the
 * even–odd rule, so holes and islands need no special handling). The second draws a
 * single rectangle over the region's bounding box — two well-shaped triangles whose
 * depth is exact — where the bit is set, and clears the bit as it goes.
 */

const VERT = /* glsl */ `
precision highp float;
in vec3 position;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform vec3 uGround;
uniform float uOpacity;
out vec4 fragColor;
void main() {
  fragColor = vec4(mix(uGround, uColor, uOpacity), 1.0);
}
`;

export type Ring2 = ReadonlyArray<readonly [number, number]>;

export class RegionFace {
  readonly mask: THREE.Mesh;
  readonly fill: THREE.Mesh;
  private readonly fillMaterial: THREE.RawShaderMaterial;

  /**
   * @param rings closed rings in the ground plane, [x, z] in km
   * @param y height of the surface
   * @param bit the stencil bit this region owns (1, 2, 4, …); regions drawn in the
   *   same frame need distinct bits only if their passes interleave
   * @param order render order of the mask pass; the fill pass takes order + 1
   */
  constructor(rings: readonly Ring2[], y: number, bit: number, order: number, color = GROUND, name = 'region') {
    const tris: number[] = [];
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const r of rings) {
      const [ax, az] = r[0]!;
      for (let i = 1; i + 1 < r.length; i++) {
        const [bx, bz] = r[i]!;
        const [cx, cz] = r[i + 1]!;
        tris.push(ax, y, az, bx, y, bz, cx, y, cz);
      }
      for (const [x, z] of r) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
    }
    const maskGeom = new THREE.BufferGeometry();
    maskGeom.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
    const maskMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uColor: { value: new THREE.Vector3() }, uGround: { value: new THREE.Vector3() }, uOpacity: { value: 1 } },
      side: THREE.DoubleSide,
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      stencilWrite: true,
      stencilWriteMask: bit,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilRef: bit,
      stencilFuncMask: bit,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.InvertStencilOp,
      stencilZPass: THREE.InvertStencilOp,
    });
    this.mask = new THREE.Mesh(maskGeom, maskMaterial);
    this.mask.frustumCulled = false;
    this.mask.renderOrder = order;
    this.mask.name = `${name}-mask`;

    const pad = 1;
    const fillGeom = new THREE.BufferGeometry();
    fillGeom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [x0 - pad, y, z0 - pad, x1 + pad, y, z0 - pad, x1 + pad, y, z1 + pad, x0 - pad, y, z0 - pad, x1 + pad, y, z1 + pad, x0 - pad, y, z1 + pad],
        3,
      ),
    );
    this.fillMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uColor: { value: new THREE.Vector3(...rgb01(color)) },
        uGround: { value: new THREE.Vector3(...rgb01(GROUND)) },
        uOpacity: { value: 1 },
      },
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
      depthTest: true,
      depthWrite: true,
      stencilWrite: true,
      stencilWriteMask: bit,
      stencilFunc: THREE.EqualStencilFunc,
      stencilRef: bit,
      stencilFuncMask: bit,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.ZeroStencilOp,
      stencilZPass: THREE.ZeroStencilOp,
    });
    this.fill = new THREE.Mesh(fillGeom, this.fillMaterial);
    this.fill.frustumCulled = false;
    this.fill.renderOrder = order + 1;
    this.fill.name = `${name}-fill`;
  }

  get meshes(): THREE.Mesh[] {
    return [this.mask, this.fill];
  }

  set opacity(v: number) {
    this.fillMaterial.uniforms.uOpacity!.value = v;
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
