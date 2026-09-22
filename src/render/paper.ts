import * as THREE from 'three';

/**
 * Paper tooth: the faint grain of drawing paper, shown only at close zoom.
 *
 * A full-screen pass multiplies the finished frame by 1 − amp·n, where n is value
 * noise at the scale of the sheet (device pixels, fixed to the screen like the sheet's
 * border — the paper does not move when the drawing is panned). Multiplying keeps ink
 * ink and only roughens the ground a little. It is texture, not shading: no gradient,
 * no light, and at state zoom it is off entirely.
 */

const VERT = /* glsl */ `
precision highp float;
in vec3 position;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uAmp;
uniform float uPixelRatio;
out vec4 fragColor;
float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  vec2 p = gl_FragCoord.xy / uPixelRatio;
  // fibre (a few px) and tooth (about a px)
  float n = 0.6 * noise(p / 2.3) + 0.4 * noise(p * 0.9 + 17.0);
  fragColor = vec4(vec3(1.0 - uAmp * n), 1.0);
}
`;

export class PaperTooth {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.RawShaderMaterial;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uAmp: { value: 0 }, uPixelRatio: { value: 1 } },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.ZeroFactor,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.mesh.visible = false;
    this.mesh.name = 'paper-tooth';
  }

  /**
   * Grain for a zoom in px per km: none at state and region scale, rising to its full
   * (slight) strength once a kilometre is more than a few dozen pixels.
   */
  frame(pxPerKm: number, pixelRatio: number): void {
    const amp = 0.045 * Math.max(0, Math.min(1, (pxPerKm - 8) / 16));
    this.material.uniforms.uAmp!.value = amp;
    this.material.uniforms.uPixelRatio!.value = pixelRatio;
    this.mesh.visible = amp > 0.002;
  }
}
