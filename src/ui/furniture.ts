import * as THREE from 'three';
import { ISO_ELEVATION_RAD, type IsoCamera } from '../render/iso';
import { SCALE_STEPS_M } from '../render/style';
import { NORTH } from '../model/geo';
import { data, derived, el, qty } from './quantity';

/**
 * Drawing furniture: a north arrow and a scale bar, kept true as the view pans and
 * zooms. In this projection east–west distances are drawn at full scale and
 * north–south ones are foreshortened by sin(elevation) ≈ 0.577, so the bar says which
 * direction it measures.
 */
const SVGNS = 'http://www.w3.org/2000/svg';

export class Furniture {
  readonly root: HTMLElement;
  private svg: SVGSVGElement;
  private caption: HTMLElement;
  private lastKey = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'furniture';
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('width', '220');
    this.svg.setAttribute('height', '46');
    this.svg.setAttribute('aria-hidden', 'true');
    this.caption = document.createElement('div');
    this.caption.className = 'cap';
    this.root.append(this.svg, this.caption);
    parent.appendChild(this.root);
  }

  /** `unitKm`: kilometres per unit of the frame the camera is in. */
  update(cam: IsoCamera, unitKm = 1, north: readonly [number, number] = NORTH): void {
    const v = new THREE.Vector3();
    const s0 = new THREE.Vector2();
    const s1 = new THREE.Vector2();
    cam.worldToScreen(v.copy(cam.target), s0);
    cam.worldToScreen(v.set(cam.target.x + north[0] * 100, 0, cam.target.z + north[1] * 100), s1);
    const nAng = Math.atan2(s1.y - s0.y, s1.x - s0.x);
    // east is north turned 90° clockwise in plan: (x, z) → (−z, x)
    cam.worldToScreen(v.set(cam.target.x - north[1] * 100, 0, cam.target.z + north[0] * 100), s1);
    const pxPerMEast = Math.hypot(s1.x - s0.x, s1.y - s0.y) / 100 / (unitKm * 1000);
    let stepIndex = 0;
    SCALE_STEPS_M.forEach((m, i) => {
      if (m * pxPerMEast <= 150) stepIndex = i;
    });
    const m = SCALE_STEPS_M[stepIndex]!;
    const L = m * pxPerMEast;
    const key = `${nAng.toFixed(3)}|${m}|${L.toFixed(1)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const g = this.svg;
    g.replaceChildren();
    const line = (x1: number, y1: number, x2: number, y2: number, w = 1) => {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', String(x1));
      l.setAttribute('y1', String(y1));
      l.setAttribute('x2', String(x2));
      l.setAttribute('y2', String(y2));
      l.setAttribute('stroke', '#14161A');
      l.setAttribute('stroke-width', String(w));
      g.appendChild(l);
    };
    // north arrow
    const cx = 18;
    const cy = 24;
    const r = 15;
    const tx = cx + Math.cos(nAng) * r;
    const ty = cy + Math.sin(nAng) * r;
    const bx = cx - Math.cos(nAng) * r;
    const by = cy - Math.sin(nAng) * r;
    line(bx, by, tx, ty, 1);
    const head = document.createElementNS(SVGNS, 'polygon');
    const ax = Math.cos(nAng);
    const ay = Math.sin(nAng);
    head.setAttribute('points', `${tx},${ty} ${tx - ax * 7 - ay * 3.5},${ty - ay * 7 + ax * 3.5} ${tx - ax * 7 + ay * 3.5},${ty - ay * 7 - ax * 3.5}`);
    head.setAttribute('fill', '#14161A');
    g.appendChild(head);
    const n = document.createElementNS(SVGNS, 'text');
    n.setAttribute('x', String(tx + ax * 7 - 3.5));
    n.setAttribute('y', String(ty + ay * 7 + 4));
    n.setAttribute('font-size', '10');
    n.setAttribute('font-family', 'Atlas Sans');
    n.textContent = 'N';
    g.appendChild(n);
    // scale bar: alternate filled and open quarters, as on a drawing
    const x0 = 48;
    const y0 = 22;
    for (let i = 0; i < 4; i++) {
      const rct = document.createElementNS(SVGNS, 'rect');
      rct.setAttribute('x', String(x0 + (i * L) / 4));
      rct.setAttribute('y', String(y0));
      rct.setAttribute('width', String(L / 4));
      rct.setAttribute('height', '4');
      rct.setAttribute('fill', i % 2 === 0 ? '#14161A' : 'none');
      rct.setAttribute('stroke', '#14161A');
      rct.setAttribute('stroke-width', '0.8');
      g.appendChild(rct);
    }
    line(x0, y0 - 3, x0, y0 + 7, 0.8);
    line(x0 + L, y0 - 3, x0 + L, y0 + 7, 0.8);
    const len = el(qty(m >= 1000 ? m / 1000 : m, m >= 1000 ? 'km' : 'm', data(`style.SCALE_STEPS_M.${stepIndex}`), { digits: 0 }));
    // A plan turned north-up (maps) keeps east–west true on screen and foreshortens
    // north–south by sin(elevation); a plan square to the frame (equipment) is true
    // isometric: both ground axes are drawn at √(2/3).
    this.caption.replaceChildren(
      ...(Math.abs(north[0]) > 0.1
        ? [
            len,
            document.createTextNode(' east–west; north–south is drawn at '),
            el(qty(100 * Math.sin(ISO_ELEVATION_RAD), '%', derived('iso.foreshortening', data('render.iso.ISO_ELEVATION_RAD')), { digits: 1 })),
          ]
        : [
            len,
            document.createTextNode(' along either ground axis (each drawn at '),
            el(qty(100 * Math.sqrt(2 / 3), '%', derived('iso.axisForeshortening', data('render.iso.ISO_ELEVATION_RAD')), { digits: 1 })),
            document.createTextNode(' of its true length)'),
          ]),
    );
    this.caption.style.marginLeft = '48px';
  }
}
