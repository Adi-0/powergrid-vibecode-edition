import * as THREE from 'three';

/**
 * The isometric view. One tunable constant each for azimuth and elevation.
 *
 * True isometric: the camera looks down the (1,1,1) diagonal, which puts it
 * atan(1/√2) ≈ 35.264° above the horizon and 45° around the vertical axis.
 *
 * World axes in every level frame: +x = east, +y = up, +z = south (three.js is
 * right-handed with y up, so north is −z). The camera sits south-west of its
 * target and looks north-east. That lays California's long NW→SE axis across the
 * screen's long axis. See docs/decisions/0005-iso-orientation.md.
 */
export const ISO_ELEVATION_RAD = Math.atan(1 / Math.SQRT2);
export const ISO_AZIMUTH_RAD = Math.PI / 4;

/** Unit vector from the camera target toward the camera. */
export function isoViewOffset(): THREE.Vector3 {
  const c = Math.cos(ISO_ELEVATION_RAD);
  return new THREE.Vector3(
    -c * Math.sin(ISO_AZIMUTH_RAD), // west
    Math.sin(ISO_ELEVATION_RAD), // up
    c * Math.cos(ISO_AZIMUTH_RAD), // south
  );
}

/** Rotation that takes world vectors into view space (camera looks down −z). */
export function isoViewRotation(): THREE.Matrix4 {
  const cam = new THREE.OrthographicCamera();
  cam.position.copy(isoViewOffset());
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam.matrixWorldInverse.clone();
}

const _rot = isoViewRotation();
const _v = new THREE.Vector3();

/**
 * Length of a world-space vector as projected onto the screen at 1 px per world
 * unit. The camera orientation is fixed, so this ratio holds at every zoom:
 * screen length = projectedLength × pixelsPerUnit. Dash patterns use it.
 */
export function projectedLength(dx: number, dy: number, dz: number): number {
  _v.set(dx, dy, dz).applyMatrix4(_rot);
  // applyMatrix4 includes translation; the rotation-only matrix has none.
  return Math.hypot(_v.x, _v.y);
}

/** Project a world point to view-plane coordinates (x right, y up) at 1 px/unit. */
export function projectToView(x: number, y: number, z: number): [number, number] {
  _v.set(x, y, z).applyMatrix4(_rot);
  return [_v.x, _v.y];
}

/**
 * An orthographic camera in isometric pose over a target, with zoom expressed as
 * pixels per world unit of the current frame.
 */
export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  readonly target = new THREE.Vector3();
  pxPerUnit = 1;
  width = 1;
  height = 1;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e5, 1e5);
    this.camera.up.set(0, 1, 0);
  }

  setViewport(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /**
   * Recompute the three.js camera from target and zoom. Near/far span ±depth units: by
   * default a generous multiple of what the viewport covers (so depth resolution keeps
   * up as the camera zooms in by orders of magnitude), never more than 10⁴ units.
   */
  update(depth = Math.min(1e4, Math.max(1, (40 * Math.max(this.width, this.height)) / this.pxPerUnit))): void {
    const off = isoViewOffset().multiplyScalar(depth);
    this.camera.position.copy(this.target).add(off);
    this.camera.lookAt(this.target);
    const hw = this.width / 2 / this.pxPerUnit;
    const hh = this.height / 2 / this.pxPerUnit;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.near = 0;
    this.camera.far = depth * 2;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  /** Screen (px, origin top-left) → point on the ground plane y = 0. */
  screenToGround(sx: number, sy: number, out = new THREE.Vector3()): THREE.Vector3 {
    const ndc = new THREE.Vector3((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1, 0);
    ndc.unproject(this.camera);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    // ray: ndc + t·dir hits y = 0
    const t = -ndc.y / dir.y;
    return out.copy(ndc).addScaledVector(dir, t);
  }

  /** World point → screen px (origin top-left). */
  worldToScreen(p: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 {
    const v = p.clone().project(this.camera);
    return out.set(((v.x + 1) / 2) * this.width, ((1 - v.y) / 2) * this.height);
  }
}
