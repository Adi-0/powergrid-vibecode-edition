import * as THREE from 'three';
import { ISO_ELEVATION_RAD, type IsoCamera } from '../render/iso';
import { SCALE_STEPS_KM } from '../render/style';
import { EAST, NORTH } from '../model/geo';
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

  update(cam: IsoCamera): void {
    const v = new THREE.Vector3();
    const s0 = new THREE.Vector2();
    const s1 = new THREE.Vector2();
    cam.worldToScreen(v.copy(cam.target), s0);
    cam.worldToScreen(v.set(cam.target.x + NORTH[0] * 100, 0, cam.target.z + NORTH[1] * 100), s1);
    const nAng = Math.atan2(s1.y - s0.y, s1.x - s0.x);
    cam.worldToScreen(v.set(cam.target.x + EAST[0] * 100, 0, cam.target.z + EAST[1] * 100), s1);
    const pxPerKmEast = Math.hypot(s1.x - s0.x, s1.y - s0.y) / 100;
    let stepIndex = 0;
    SCALE_STEPS_KM.forEach((k, i) => {
      if (k * pxPerKmEast <= 150) stepIndex = i;
    });
    const km = SCALE_STEPS_KM[stepIndex]!;
    const L = km * pxPerKmEast;
    const key = `${nAng.toFixed(3)}|${km}|${L.toFixed(1)}`;
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
    this.caption.replaceChildren(
      el(qty(km, 'km', data(`style.SCALE_STEPS_KM.${stepIndex}`), { digits: 0 })),
      document.createTextNode(' east–west; north–south is drawn at '),
      el(qty(100 * Math.sin(ISO_ELEVATION_RAD), '%', derived('iso.foreshortening', data('render.iso.ISO_ELEVATION_RAD')), { digits: 1 })),
    );
    this.caption.style.marginLeft = '48px';
  }
}
