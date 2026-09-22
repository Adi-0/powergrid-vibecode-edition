import * as THREE from 'three';
import type { IsoCamera } from './iso';

/**
 * Labels live in screen space as DOM text (crisp, selectable, readable by screen
 * readers) — never as 3D geometry. Each frame the camera moves, a greedy layout pass
 * places labels in priority order at the first free candidate position around their
 * anchor (right, left, above, below) and hides the ones that would collide.
 */
export interface LabelItem {
  id: string;
  anchor: readonly [number, number, number];
  priority: number;
  minZoom: number;
  className: string;
  /** Content: plain text or a builder for richer content (quantities). */
  text?: string;
  build?: (el: HTMLElement) => void;
  /** Extra pixel offset from the anchor. */
  dx?: number;
  dy?: number;
  /** Always shown (e.g. the selected object's label), ignoring collisions with lower items. */
  pinned?: boolean;
  /** Provenance key when the text carries figures (see ui/quantity.ts). */
  prov?: string;
}

interface Placed {
  item: LabelItem;
  el: HTMLElement;
  w: number;
  h: number;
}

export class LabelLayer {
  readonly root: HTMLDivElement;
  private placed = new Map<string, Placed>();
  private reserved: Array<{ x: number; y: number; w: number; h: number }> = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'labels';
    parent.appendChild(this.root);
  }

  set(items: LabelItem[]): void {
    const keep = new Set(items.map((i) => i.id));
    for (const [id, p] of this.placed) {
      if (!keep.has(id)) {
        p.el.remove();
        this.placed.delete(id);
      }
    }
    for (const item of items) {
      let p = this.placed.get(item.id);
      if (!p) {
        const el = document.createElement('div');
        el.className = `label ${item.className}`;
        if (item.prov) el.dataset.prov = item.prov;
        if (item.build) item.build(el);
        else el.textContent = item.text ?? '';
        this.root.appendChild(el);
        p = { item, el, w: 0, h: 0 };
        this.placed.set(item.id, p);
      } else {
        p.item = item;
        p.el.className = `label ${item.className}`;
        if (item.prov) p.el.dataset.prov = item.prov;
        else delete p.el.dataset.prov;
        if (!item.build) p.el.textContent = item.text ?? '';
      }
    }
    // measure once content is set
    for (const p of this.placed.values()) {
      p.w = p.el.offsetWidth;
      p.h = p.el.offsetHeight;
    }
  }

  /** Screen rectangles labels must avoid (panels, symbols). */
  reserve(rects: Array<{ x: number; y: number; w: number; h: number }>): void {
    this.reserved = rects;
  }

  layout(cam: IsoCamera): void {
    const boxes: Array<{ x: number; y: number; w: number; h: number }> = [...this.reserved];
    const v = new THREE.Vector3();
    const s = new THREE.Vector2();
    const items = [...this.placed.values()].sort((a, b) => Number(!!b.item.pinned) - Number(!!a.item.pinned) || b.item.priority - a.item.priority);
    const W = cam.width;
    const H = cam.height;
    for (const p of items) {
      const it = p.item;
      if (cam.pxPerUnit < it.minZoom && !it.pinned) {
        p.el.style.visibility = 'hidden';
        continue;
      }
      cam.worldToScreen(v.set(it.anchor[0], it.anchor[1], it.anchor[2]), s);
      const ax = s.x + (it.dx ?? 0);
      const ay = s.y + (it.dy ?? 0);
      const gap = 9;
      const cands: Array<[number, number]> =
        it.className.includes('region') || it.className.includes('sea')
          ? [[ax - p.w / 2, ay - p.h / 2]]
          : [
              [ax + gap, ay - p.h / 2],
              [ax - gap - p.w, ay - p.h / 2],
              [ax - p.w / 2, ay - gap - p.h],
              [ax - p.w / 2, ay + gap],
            ];
      let done = false;
      for (const [x, y] of cands) {
        if (x < 4 || y < 4 || x + p.w > W - 4 || y + p.h > H - 4) continue;
        const hit = !it.pinned && boxes.some((b) => x < b.x + b.w && x + p.w > b.x && y < b.y + b.h && y + p.h > b.y);
        if (hit) continue;
        boxes.push({ x: x - 2, y: y - 1, w: p.w + 4, h: p.h + 2 });
        p.el.style.visibility = 'visible';
        p.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        done = true;
        break;
      }
      if (!done) p.el.style.visibility = 'hidden';
    }
  }

  element(id: string): HTMLElement | undefined {
    return this.placed.get(id)?.el;
  }
}
