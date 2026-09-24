import type { Vec3 } from '../render/lines';
import { INK, INK_60, PEN } from '../render/style';
import type { Sketch } from './sketch';

/**
 * A home, drawn the same by the Feeder and Service levels (so one sits exactly on the
 * other as the service unfolds): walls, a pitched roof with its ridge along the street,
 * a door on the street side, windows, the meter where the service drop lands, and — for
 * a home with rooftop solar — panels on a roof slope. Plan (east, height, north), metres,
 * centred on (e, n); `streetE` is the east of the street it faces.
 */
export const HOME = { se: 10, sn: 8, wall: 3, ridge: 5.2, eave: 3.2 };

export function drawHome(sk: Sketch, e: number, n: number, pv: boolean, streetE: number): { corners: Vec3[]; meter: Vec3; drop: Vec3 } {
  const { se, sn, wall, ridge } = HOME;
  const x0 = e - se / 2;
  const x1 = e + se / 2;
  const y0 = n - sn / 2;
  const y1 = n + sn / 2;
  const P = sk.plan;
  const style = { width: PEN.fine, color: INK };
  const hair = { width: PEN.hairline, color: INK };
  const fs = { collapse: sk.anchor, stagger: sk.stagger };
  // walls: a box to the eaves
  sk.box(e, 0, n, se, wall, sn, style);
  // the roof: two slopes from the eaves (a little overhang) to the ridge, and the gables
  const o = 0.4;
  const r0 = P(x0 - o, wall, y0 - o);
  const r1 = P(x0 - o, wall, y1 + o);
  const r2 = P(x1 + o, wall, y1 + o);
  const r3 = P(x1 + o, wall, y0 - o);
  const k0 = P(e, ridge, y0 - o);
  const k1 = P(e, ridge, y1 + o);
  sk.faces.quad(r0, r1, k1, k0, fs);
  sk.faces.quad(r3, r2, k1, k0, fs);
  sk.faces.tri(P(x0, wall, y0), P(x1, wall, y0), P(e, ridge, y0), fs);
  sk.faces.tri(P(x0, wall, y1), P(x1, wall, y1), P(e, ridge, y1), fs);
  sk.poly([r0, k0, r3], style);
  sk.poly([r1, k1, r2], style);
  sk.seg(k0, k1, style);
  sk.seg(r0, r1, style);
  sk.seg(r3, r2, style);
  // the door on the side facing the street, windows either side of it and on the south wall
  const sx = streetE < e ? x0 : x1;
  sk.poly([P(sx, 0, n - 0.5), P(sx, 2.1, n - 0.5), P(sx, 2.1, n + 0.5), P(sx, 0, n + 0.5)], hair);
  for (const wn of [n - 2.6, n + 2.6]) sk.poly([P(sx, 1, wn - 0.6), P(sx, 2.1, wn - 0.6), P(sx, 2.1, wn + 0.6), P(sx, 1, wn + 0.6)], hair, true);
  for (const we of [e - 2.5, e + 2.5]) sk.poly([P(we - 0.7, 1, y0), P(we - 0.7, 2.1, y0), P(we + 0.7, 2.1, y0), P(we + 0.7, 1, y0)], hair, true);
  // the meter where the drop lands, on the street side
  const meter = P(sx, 1.6, n + 3.2);
  sk.box(sx, 1.3, n + 3.2, 0.12, 0.6, 0.35, hair);
  // the drop lands at the eave above it; a conduit runs down to the meter
  const drop = P(sx, HOME.eave, n + 3.2);
  sk.seg(drop, P(sx, 1.9, n + 3.2), hair);
  // rooftop solar on the west slope (the one that faces the afternoon)
  if (pv) {
    const t = (u: number, v: number): Vec3 => P(x0 + (e - x0) * u, wall + (ridge - wall) * u + 0.05, y0 + 1 + (sn - 2) * v);
    const q = [t(0.2, 0), t(0.85, 0), t(0.85, 1), t(0.2, 1)];
    sk.poly(q, { width: PEN.thin, color: INK }, true);
    for (let i = 1; i < 4; i++) sk.seg(t(0.2, i / 4), t(0.85, i / 4), { width: PEN.hairline, color: INK_60 });
  }
  return { corners: [P(x0, 0, y0), P(x1, 0, y1), P(x0, ridge, y1), P(x1, ridge, y0)], meter, drop };
}
