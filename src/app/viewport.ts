/**
 * The drawing surface: WebGL canvas, camera control, picking, render loop.
 *
 * The loop only does work when there is work to do. A redraw is requested when
 * the solution changes, when the camera moves, or when something is animating
 * (flow marks). Otherwise it idles, which is what keeps a laptop fan quiet
 * while someone reads a panel.
 */

import { Scene, WebGLRenderer, Color, Vector2, Vector3 } from 'three';
import { IsoCamera } from '../render/iso.js';
import { LineBatch, LineSegment } from '../render/line-batch.js';
import { LabelLayer, LabelSpec } from '../render/labels.js';
import { INK, ZOOM, levelForScale, LevelId } from '../render/style.js';
import { PickTarget } from '../render/scene-system.js';

export interface FrameContent {
  /**
   * Every stroke in the drawing, already in painter's order: farthest first,
   * each halo immediately before the ink it backs. The batch draws instances in
   * the order given, with no depth testing, so this array IS the drawing.
   */
  segments: LineSegment[];
  labels: LabelSpec[];
  picks: PickTarget[];
}

export interface ViewportEvents {
  onPick?: (id: string | null, kind: PickTarget['kind'] | null) => void;
  onHover?: (id: string | null, kind: PickTarget['kind'] | null) => void;
  onCameraChange?: (metresPerPixel: number, level: LevelId) => void;
  /** Called when a frame is about to be drawn; return the content to draw. */
  build: () => FrameContent;
}

const CAPACITY = 24000;

export class Viewport {
  readonly camera = new IsoCamera();
  readonly labels: LabelLayer;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly batch: LineBatch;
  private readonly stage: HTMLElement;
  private readonly events: ViewportEvents;

  private picks: PickTarget[] = [];
  private needsBuild = true;
  private needsDraw = true;
  private animating = true;
  private running = false;
  private startedAt = performance.now();
  private hoveredId: string | null = null;

  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private pointerMoved = 0;

  constructor(stage: HTMLElement, events: ViewportEvents) {
    this.stage = stage;
    this.events = events;

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(new Color(INK.ground), 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    stage.appendChild(this.renderer.domElement);

    this.batch = new LineBatch(CAPACITY);
    this.scene.add(this.batch.mesh);

    this.labels = new LabelLayer(stage);

    this.attach();
    this.resize();
  }

  // --- lifecycle ----------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.frame();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
  }

  /** Mark the scene content stale; it will be rebuilt on the next frame. */
  invalidate(): void {
    this.needsBuild = true;
    this.needsDraw = true;
  }

  /** Whether flow marks should keep the loop running. */
  setAnimating(on: boolean): void {
    this.animating = on;
    this.needsDraw = true;
  }

  private frame(): void {
    const t = (performance.now() - this.startedAt) / 1000;

    if (this.needsBuild) {
      const content = this.events.build();
      this.batch.update(content.segments);
      this.labels.layout(this.camera, content.labels);
      this.picks = content.picks;
      this.needsBuild = false;
      this.needsDraw = true;
    }

    if (!this.needsDraw && !this.animating) return;

    this.batch.setTime(t);
    this.renderer.render(this.scene, this.camera.camera);
    this.needsDraw = false;
  }

  // --- sizing -------------------------------------------------------------

  resize(): void {
    const rect = this.stage.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(w, h, false);
    this.camera.setViewport(w, h);
    this.batch.setResolution(w, h);
    this.invalidate();
  }

  // --- interaction --------------------------------------------------------

  private attach(): void {
    const el = this.renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.pointerMoved = 0;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.stage.classList.add('is-dragging');
      // Flow animation is suspended while dragging: it is a distraction when
      // the whole drawing is already moving, and it costs frames.
      this.setAnimating(false);
    });

    el.addEventListener('pointermove', (e) => {
      if (this.dragging) {
        const dx = e.clientX - this.lastPointer.x;
        const dy = e.clientY - this.lastPointer.y;
        this.pointerMoved += Math.abs(dx) + Math.abs(dy);
        this.lastPointer = { x: e.clientX, y: e.clientY };
        this.camera.panByPixels(dx, dy);
        this.invalidate();
        return;
      }
      const hit = this.pick(e);
      const id = hit?.id ?? null;
      if (id !== this.hoveredId) {
        this.hoveredId = id;
        this.stage.classList.toggle('is-over-target', id !== null);
        this.events.onHover?.(id, hit?.kind ?? null);
      }
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.stage.classList.remove('is-dragging');
      this.setAnimating(true);
      // A click is a press that did not travel. Three pixels of slop, because
      // a mouse always moves a little.
      if (this.pointerMoved < 3) {
        const hit = this.pick(e);
        this.events.onPick?.(hit?.id ?? null, hit?.kind ?? null);
      }
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Exponential in the wheel delta so that zooming feels the same whether
      // the input is a mouse notch or a trackpad's continuous scroll.
      const factor = Math.exp(e.deltaY * 0.0016);
      this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
      this.invalidate();
      this.events.onCameraChange?.(
        this.camera.metresPerPixel, levelForScale(this.camera.metresPerPixel)
      );
    }, { passive: false });

    window.addEventListener('resize', () => this.resize());
  }

  /** Nearest pick target to the pointer, within its own radius. */
  private pick(e: { clientX: number; clientY: number }): PickTarget | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const p = new Vector2(px, py);
    const a = new Vector2();
    const b = new Vector2();

    let best: PickTarget | null = null;
    let bestDist = Infinity;
    for (const target of this.picks) {
      this.camera.worldToScreen(target.world, a);
      let d: number;
      if (target.worldB) {
        this.camera.worldToScreen(target.worldB, b);
        d = distanceToSegment(p, a, b);
      } else {
        d = p.distanceTo(a);
      }
      if (d <= target.radiusPx && d < bestDist) {
        bestDist = d;
        best = target;
      }
    }
    return best;
  }

  /** Move the camera to frame a bounding box, over `ms` milliseconds. */
  flyTo(
    target: Vector3, metresPerPixel: number, ms = 900,
    onDone?: () => void
  ): void {
    const startTarget = this.camera.target.clone();
    const startScale = this.camera.metresPerPixel;
    const endScale = Math.max(ZOOM.min, Math.min(ZOOM.max, metresPerPixel));
    const t0 = performance.now();

    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      // Ease in and out. The transition has to be slow enough to follow: it is
      // the part of the interface that shows what a model IS, by making one
      // level visibly collapse into its place in the level above.
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera.target.lerpVectors(startTarget, target, e);
      // Scale interpolates geometrically: zoom is multiplicative, so a linear
      // blend would crawl at the far end and lurch at the near one.
      this.camera.setZoom(startScale * Math.pow(endScale / startScale, e));
      this.invalidate();
      this.events.onCameraChange?.(
        this.camera.metresPerPixel, levelForScale(this.camera.metresPerPixel)
      );
      if (t < 1) requestAnimationFrame(step);
      else onDone?.();
    };
    requestAnimationFrame(step);
  }

  get level(): LevelId {
    return levelForScale(this.camera.metresPerPixel);
  }

  dispose(): void {
    this.stop();
    this.batch.dispose();
    this.labels.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-9) return p.distanceTo(a);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}
