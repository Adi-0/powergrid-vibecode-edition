/**
 * The isometric camera.
 *
 * WORLD AXES. X is east, Z is south (so north is −Z), Y is up. All three in
 * metres. Geography is projected to X/Z by src/data/california/geography.ts;
 * Y carries real height — tower tops, busbar levels, the floors of a plant.
 *
 * THE PROJECTION. An orthographic camera placed along the direction (1, 1, 1)
 * from its target. That direction is equally inclined to all three axes, which
 * is what makes the projection isometric: azimuth 45°, elevation
 * arctan(1/√2) ≈ 35.264°, the three world axes 120° apart on screen, and equal
 * world lengths along them drawing as equal screen lengths. Any other elevation
 * is axonometric but not isometric, and the giveaway is that a cube stops
 * looking like a cube. The angle lives in one place — `ISOMETRIC` in style.ts —
 * so it can be changed and the change is total.
 *
 * ORTHOGRAPHIC, not perspective, because a technical drawing does not have a
 * vanishing point: two objects of the same size must draw the same size
 * wherever they sit, or the drawing stops being measurable.
 */

import { OrthographicCamera, Vector3, Vector2 } from 'three';
import { ISOMETRIC, ZOOM } from './style.js';

const DEG = Math.PI / 180;

/** Unit vector from target toward camera, from the isometric angle constants. */
export function isometricDirection(): Vector3 {
  const az = ISOMETRIC.azimuthDeg * DEG;
  const el = ISOMETRIC.elevationDeg * DEG;
  return new Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az)
  ).normalize();
}

export interface IsoViewState {
  /** Point on the ground plane the view is centred on, metres. */
  target: Vector3;
  /** Metres of world per CSS pixel. Larger is further out. */
  metresPerPixel: number;
}

export class IsoCamera {
  readonly camera: OrthographicCamera;
  readonly direction: Vector3;
  target = new Vector3(0, 0, 0);
  metresPerPixel = ZOOM.system;
  /**
   * The finest scale worth zooming to at the current position, set by the
   * compositor each frame.
   *
   * A hard global minimum is the wrong rule: how far in it is worth going
   * depends on what is modelled underneath. Past this floor every drawing has
   * faded out and the reader gets a blank page, which reads as the app being
   * broken rather than as the model ending.
   */
  floorScale = ZOOM.min;

  private viewportWidth = 1;
  private viewportHeight = 1;
  /** Distance from target to camera. Only affects clipping, not scale. */
  private readonly standoff = 6_000_000;

  constructor() {
    this.direction = isometricDirection();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 1, this.standoff * 2.5);
    this.apply();
  }

  setViewport(widthPx: number, heightPx: number): void {
    this.viewportWidth = Math.max(1, widthPx);
    this.viewportHeight = Math.max(1, heightPx);
    this.apply();
  }

  /** Recompute the frustum and camera position from target and scale. */
  apply(): void {
    const halfW = (this.viewportWidth * this.metresPerPixel) / 2;
    const halfH = (this.viewportHeight * this.metresPerPixel) / 2;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.near = 1;
    this.camera.far = this.standoff * 2.5;
    this.camera.position.copy(this.target).addScaledVector(this.direction, this.standoff);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  setZoom(metresPerPixel: number): void {
    const floor = Math.max(ZOOM.min, this.floorScale);
    this.metresPerPixel = clamp(metresPerPixel, floor, ZOOM.max);
    this.apply();
  }

  /** Pan by a screen-space delta in CSS pixels. */
  panByPixels(dxPx: number, dyPx: number): void {
    // Screen right and screen up, expressed in world space on the ground plane.
    const right = this.screenRightOnGround();
    const up = this.screenUpOnGround();
    this.target.addScaledVector(right, -dxPx * this.metresPerPixel);
    this.target.addScaledVector(up, dyPx * this.metresPerPixel);
    this.apply();
  }

  /**
   * Zoom about a point on screen, so the world point under the cursor stays
   * under the cursor. Anything else feels like the map is sliding away.
   */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.screenToGround(screenX, screenY);
    this.setZoom(this.metresPerPixel * factor);
    const after = this.screenToGround(screenX, screenY);
    if (before && after) {
      this.target.add(before.sub(after));
      this.apply();
    }
  }

  /**
   * The exact ground-plane vectors that correspond to one screen pixel right
   * and one screen pixel down.
   *
   * This is what lets a symbol be drawn IN the isometric world — lying flat on
   * the ground like a mark on a map — while still projecting to an exact shape
   * on screen. Because an orthographic projection restricted to a plane is an
   * affine map, inverting its 2x2 linear part gives world offsets that project
   * to precisely the screen offsets asked for. A circle built from these two
   * vectors draws as a circle, not as the ellipse that naive foreshortening
   * would give.
   */
  groundBasis(): { rightX: number; rightZ: number; downX: number; downZ: number } {
    const o = this.worldToScreen(new Vector3(0, 0, 0), new Vector2());
    const ex = this.worldToScreen(new Vector3(1, 0, 0), new Vector2()).sub(o);
    const ez = this.worldToScreen(new Vector3(0, 0, 1), new Vector2()).sub(o);
    // Screen delta = M * world delta, with M = [ex ez] as columns. Invert it.
    const det = ex.x * ez.y - ez.x * ex.y;
    if (Math.abs(det) < 1e-12) return { rightX: 1, rightZ: 0, downX: 0, downZ: 1 };
    return {
      rightX: ez.y / det, rightZ: -ex.y / det,
      downX: -ez.x / det, downZ: ex.x / det,
    };
  }

  /** World-space direction corresponding to one screen pixel to the right. */
  screenRightOnGround(): Vector3 {
    // The camera's right vector, flattened onto the ground plane.
    const r = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    r.y = 0;
    return r.normalize();
  }

  /** World-space direction corresponding to one screen pixel upward. */
  screenUpOnGround(): Vector3 {
    const u = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    u.y = 0;
    return u.normalize();
  }

  /** Project a world point to CSS pixel coordinates. */
  worldToScreen(world: Vector3, out = new Vector2()): Vector2 {
    const v = world.clone().project(this.camera);
    out.set(
      (v.x * 0.5 + 0.5) * this.viewportWidth,
      (-v.y * 0.5 + 0.5) * this.viewportHeight
    );
    return out;
  }

  /** True if a projected point is inside the viewport, with a margin. */
  isOnScreen(px: Vector2, marginPx = 64): boolean {
    return (
      px.x >= -marginPx && px.x <= this.viewportWidth + marginPx &&
      px.y >= -marginPx && px.y <= this.viewportHeight + marginPx
    );
  }

  /**
   * Where a screen point lands on the ground plane (y = 0).
   *
   * With an orthographic camera every ray is parallel to the view direction, so
   * this is a plane intersection with no perspective divide anywhere in it.
   */
  screenToGround(screenX: number, screenY: number): Vector3 | null {
    const ndcX = (screenX / this.viewportWidth) * 2 - 1;
    const ndcY = -((screenY / this.viewportHeight) * 2 - 1);
    const origin = new Vector3(ndcX, ndcY, -1).unproject(this.camera);
    const dir = this.direction.clone().negate();
    if (Math.abs(dir.y) < 1e-9) return null;
    const t = -origin.y / dir.y;
    return origin.addScaledVector(dir, t);
  }

  get viewport(): { width: number; height: number } {
    return { width: this.viewportWidth, height: this.viewportHeight };
  }

  /**
   * Frame a bounding box.
   *
   * Insets let the framing account for panels sitting over the canvas: without
   * them the drawing is centred on the whole viewport and then half of it hides
   * behind the legend.
   *
   * HEIGHT IS PART OF THE BOX. A ground rectangle is the right description of a
   * map and the wrong description of a substation: the yard is eighty metres
   * across and the take-off structures stand twelve metres up, and in an
   * isometric projection that height is most of what the drawing occupies on
   * the page. Framing on the ground alone put the whole yard in the top-right
   * quarter of an otherwise empty page — the drawing was too small AND too
   * high, and both came from the same missing dimension. Pass `minY`/`maxY`
   * for anything that stands up, and the box is framed as the solid it is.
   */
  frame(
    min: { x: number; z: number; y?: number },
    max: { x: number; z: number; y?: number },
    marginPx = 64,
    inset: { left?: number; right?: number; top?: number; bottom?: number } = {}
  ): void {
    const left = inset.left ?? 0;
    const right = inset.right ?? 0;
    const top = inset.top ?? 0;
    const bottom = inset.bottom ?? 0;
    const cx = (min.x + max.x) / 2;
    const cz = (min.z + max.z) / 2;
    this.target.set(cx, 0, cz);

    const y0 = min.y ?? 0;
    const y1 = max.y ?? 0;
    const cornersOf = (): Vector3[] => {
      const out: Vector3[] = [];
      for (const x of [min.x, max.x]) {
        for (const z of [min.z, max.z]) {
          for (const y of y0 === y1 ? [y0] : [y0, y1]) {
            out.push(new Vector3(x, y, z));
          }
        }
      }
      return out;
    };

    // Project the box corners at unit scale and see how many pixels they span.
    this.metresPerPixel = 1;
    this.apply();
    const corners = cornersOf().map((c) => this.worldToScreen(c));
    const spanX = Math.max(...corners.map((c) => c.x)) - Math.min(...corners.map((c) => c.x));
    const spanY = Math.max(...corners.map((c) => c.y)) - Math.min(...corners.map((c) => c.y));

    const availW = Math.max(1, this.viewportWidth - left - right - marginPx * 2);
    const availH = Math.max(1, this.viewportHeight - top - bottom - marginPx * 2);
    this.setZoom(Math.max(spanX / availW, spanY / availH, ZOOM.min));

    // Centre what is actually drawn, in the space that is actually visible.
    //
    // The target sits on the ground, so at this point the GROUND centre is in
    // the middle of the canvas and everything standing on it is above that.
    // Measuring the projected solid and pushing the difference back is what
    // puts the drawing in the middle of the page rather than the plot it
    // stands on.
    const now = cornersOf().map((c) => this.worldToScreen(c));
    const boxCx = (Math.max(...now.map((c) => c.x)) + Math.min(...now.map((c) => c.x))) / 2;
    const boxCy = (Math.max(...now.map((c) => c.y)) + Math.min(...now.map((c) => c.y))) / 2;
    const dxPx = (left - right) / 2 + (this.viewportWidth / 2 - boxCx);
    const dyPx = (top - bottom) / 2 + (this.viewportHeight / 2 - boxCy);
    if (dxPx !== 0 || dyPx !== 0) {
      this.panByPixels(dxPx, dyPx);
    }
  }
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
