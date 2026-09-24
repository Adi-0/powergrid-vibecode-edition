import type { Vec3 } from '../render/lines';
import { INK, INK_35, INK_60, PEN } from '../render/style';
import { BOX_EDGES, boxCorners } from '../render/faces';
import { projectToView } from '../render/iso';
import type { Sketch } from './sketch';

/**
 * Substation equipment, drawn as a technical drawing draws it: every piece a solid with
 * its terminals, and every conductor run from terminal to terminal, so the eye can follow
 * one phase from the bus, down through a disconnect, a breaker and another disconnect,
 * up to the gantry and out on the line. All in the sketch's plan (east, height, north),
 * metres; sizes scale with voltage (clearances grow with it).
 *
 * Proportions are typical of outdoor air-insulated stations of each class (estimates for
 * drawing, not a design): phase spacing, equipment heights and bay widths.
 */
export interface KvClass {
  kv: number;
  /** Size factor for equipment (1 at 60–70 kV). */
  f: number;
  /** Phase-to-phase spacing, m. */
  sp: number;
  /** Height of equipment terminals (disconnect blades, breaker bushings), m. */
  hT: number;
  /** Height of the rigid bus, m. */
  busH: number;
  gantryH: number;
  towerH: number;
  /** Bay width along the bus, m. */
  pitch: number;
  /** Disconnect length (post to post) and breaker tank length, m. */
  Ld: number;
  Lb: number;
}

export function kvClass(kv: number): KvClass {
  const f = kv >= 345 ? 2.6 : kv >= 200 ? 1.8 : kv >= 100 ? 1.35 : 1;
  const sp = kv >= 345 ? 7.5 : kv >= 200 ? 4 : kv >= 100 ? 2.8 : 2;
  const hT = 3.2 * f + 1.2;
  const busH = hT + 2.2 * f;
  const gantryH = busH + 3.2 * f;
  return { kv, f, sp, hT, busH, gantryH, towerH: gantryH * 1.45, pitch: 3 * sp + 4 * f + 5, Ld: 2.4 * f, Lb: 2.8 * f };
}

type P3 = [number, number, number];
const thin = { width: PEN.thin, color: INK };
const fine = { width: PEN.fine, color: INK };

/**
 * An insulator between two points (a post or a string): the core as a line and its sheds
 * as small discs, each drawn as the rhombus a disc makes in plan (an ellipse in iso).
 */
export function insulator(sk: Sketch, a: P3, b: P3, r: number): void {
  sk.seg(sk.plan(...a), sk.plan(...b), fine);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const k = Math.max(2, Math.min(4, Math.round(len / (r * 3.2))));
  for (let i = 1; i <= k; i++) {
    const t = i / (k + 1);
    const e = a[0] + (b[0] - a[0]) * t;
    const h = a[1] + (b[1] - a[1]) * t;
    const n = a[2] + (b[2] - a[2]) * t;
    const q = [sk.plan(e + r, h, n), sk.plan(e, h, n + r), sk.plan(e - r, h, n), sk.plan(e, h, n - r)];
    sk.poly(q, { width: PEN.hairline, color: INK_60 }, true);
  }
}

/** A post insulator on a steel pedestal, its top (a terminal) at `top`. */
export function post(sk: Sketch, e: number, n: number, top: number, f: number): P3 {
  const ins = 1.5 * f;
  sk.seg(sk.plan(e, 0, n), sk.plan(e, top - ins, n), thin);
  insulator(sk, [e, top - ins, n], [e, top, n], 0.28 * f);
  return [e, top, n];
}

/**
 * A three-phase disconnect switch across a bay: for each phase two post insulators and
 * the blade between their tops (closed), the posts of each row on one steel beam.
 * Returns each phase's two terminals, [near, far] along east.
 */
export function disconnect(sk: Sketch, eA: number, eB: number, ns: number[], k: KvClass): Array<[P3, P3]> {
  const { f, hT } = k;
  const out: Array<[P3, P3]> = [];
  const beamH = hT - 1.5 * f;
  for (const e of [eA, eB]) {
    const n0 = Math.min(...ns) - 0.6 * f;
    const n1 = Math.max(...ns) + 0.6 * f;
    sk.seg(sk.plan(e, beamH, n0), sk.plan(e, beamH, n1), { width: PEN.medium, color: INK });
    for (const n of [n0, n1]) sk.seg(sk.plan(e, 0, n), sk.plan(e, beamH, n), thin);
  }
  for (const n of ns) {
    for (const e of [eA, eB]) insulator(sk, [e, beamH, n], [e, hT, n], 0.28 * f);
    sk.seg(sk.plan(eA, hT, n), sk.plan(eB, hT, n), { width: PEN.medium, color: INK });
    out.push([
      [eA, hT, n],
      [eB, hT, n],
    ]);
  }
  return out;
}

/**
 * A dead-tank circuit breaker: per phase a horizontal tank of SF6 gas on two legs, its
 * two bushings rising in a V to the terminals, each bushing standing on the pod of its
 * current transformers; at the high-east end of each tank the crank that works its
 * contacts, all three linked by a gang shaft under the tanks to the operating
 * mechanism's cabinet beyond the last phase. `e0`, `e1`: the terminals along east.
 * `cut`: the index (in `ns`) of a pole drawn with its tank cut open toward the viewer.
 */
export function breaker(sk: Sketch, e0: number, e1: number, ns: number[], k: KvClass, cut = -1): Array<[P3, P3]> {
  const g = breakerGeom(e0, e1, k);
  const { f, hT } = k;
  const { lo, hi, r, hTank, t0, t1 } = g;
  const out: Array<[P3, P3]> = [];
  ns.forEach((n, i) => {
    for (const e of [t0 + 0.3 * f, t1 - 0.3 * f]) sk.seg(sk.plan(e, 0, n), sk.plan(e, hTank - r, n), thin);
    if (i === cut) sk.cylinder(t0, t1, hTank, n, r, { width: PEN.outline, color: INK }, { cut: [-Math.PI / 2 - 0.55, 0.75], inner: r * 0.93, capped: true });
    else sk.cylinder(t0, t1, hTank, n, r, { width: PEN.outline, color: INK });
    const ends: Array<[readonly [number, number], P3]> = [
      [g.base0, [lo, hT, n]],
      [g.base1, [hi, hT, n]],
    ];
    for (const [base, top] of ends) {
      const b: P3 = [base[0], base[1], n];
      const d = [top[0] - b[0], top[1] - b[1], top[2] - b[2]];
      const L = Math.hypot(d[0]!, d[1]!, d[2]!);
      const podEnd: P3 = [b[0] + (d[0]! / L) * g.pod, b[1] + (d[1]! / L) * g.pod, b[2] + (d[2]! / L) * g.pod];
      acyl(sk, b, podEnd, g.podR, fine);
      insulator(sk, podEnd, top, 0.24 * f);
    }
    // the crank at the tank's end, its link down to the gang shaft
    sk.box(g.crankE, hTank - 0.18 * f, n, 0.22 * f, 0.36 * f, 0.22 * f, { width: PEN.fine, color: INK });
    sk.seg(sk.plan(g.crankE, g.shaftH, n), sk.plan(g.crankE, hTank - 0.18 * f, n), thin);
    out.push([
      [e0, hT, n],
      [e1, hT, n],
    ]);
  });
  // the gang shaft, and the operating mechanism's cabinet beyond the last phase
  const nm = Math.max(...ns) + g.cabN;
  sk.seg(sk.plan(g.crankE, g.shaftH, Math.min(...ns)), sk.plan(g.crankE, g.shaftH, nm), { width: PEN.medium, color: INK });
  sk.box(g.crankE, 0, nm + g.cab.sn / 2, g.cab.se, g.cab.sh, g.cab.sn, { width: PEN.fine, color: INK });
  return out;
}

/** A breaker's dimensions along its axis (east), for the kit and for the level that opens one. */
export function breakerGeom(e0: number, e1: number, k: KvClass) {
  const { f } = k;
  const lo = Math.min(e0, e1);
  const hi = Math.max(e0, e1);
  const r = 0.42 * f;
  const hTank = 1.3 * f + r;
  const t0 = lo + 0.55 * f;
  const t1 = hi - 0.55 * f;
  return {
    lo,
    hi,
    r,
    hTank,
    t0,
    t1,
    /** Where each bushing leaves the tank (east, height). */
    base0: [t0 + 0.35 * f, hTank + 0.8 * r] as const,
    base1: [t1 - 0.35 * f, hTank + 0.8 * r] as const,
    /** The current transformers' pod: length along the bushing, radius. */
    pod: 0.5 * f,
    podR: 0.2 * f,
    crankE: t1 + 0.12 * f,
    shaftH: hTank - r - 0.35 * f,
    /** The mechanism cabinet: how far beyond the last phase, and its size. */
    cabN: 0.45 * k.sp + 0.3 * f,
    cab: { se: 0.9 * f, sh: 1.6 * f, sn: 0.6 * f },
  };
}

/**
 * A cylinder along any axis, from plan point `a` to `b`: end circles, the two
 * silhouettes the camera sees, faces for hidden-line removal.
 */
export function acyl(sk: Sketch, a: P3, b: P3, r: number, s: { width: number; color: string } = fine, N = 20): void {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
  const dz = d.map((x) => x / L) as [number, number, number];
  const helper: [number, number, number] = Math.abs(dz[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cross = (p: number[], q: number[]): [number, number, number] => [p[1]! * q[2]! - p[2]! * q[1]!, p[2]! * q[0]! - p[0]! * q[2]!, p[0]! * q[1]! - p[1]! * q[0]!];
  let u = cross(dz, helper);
  const ul = Math.hypot(...u);
  u = u.map((x) => x / ul) as [number, number, number];
  const w = cross(dz, u);
  const ring = (p: P3, t: number): Vec3 => sk.plan(p[0] + r * (Math.cos(t) * u[0] + Math.sin(t) * w[0]), p[1] + r * (Math.cos(t) * u[1] + Math.sin(t) * w[1]), p[2] + r * (Math.cos(t) * u[2] + Math.sin(t) * w[2]));
  const fs = { collapse: sk.anchor, stagger: sk.stagger };
  for (let i = 0; i < N; i++) {
    const t0 = (2 * Math.PI * i) / N;
    const t1 = (2 * Math.PI * (i + 1)) / N;
    sk.faces.quad(ring(a, t0), ring(b, t0), ring(b, t1), ring(a, t1), fs);
    sk.faces.tri(sk.plan(...a), ring(a, t0), ring(a, t1), fs);
    sk.faces.tri(sk.plan(...b), ring(b, t0), ring(b, t1), fs);
    sk.seg(ring(a, t0), ring(a, t1), s);
    sk.seg(ring(b, t0), ring(b, t1), s);
  }
  const [ax, ay] = projectToView(...sk.plan(...a));
  const [bx, by] = projectToView(...sk.plan(...b));
  const l = Math.hypot(bx - ax, by - ay);
  if (l < 1e-6) return;
  let tMin = 0;
  let tMax = 0;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (let i = 0; i < 180; i++) {
    const t = (2 * Math.PI * i) / 180;
    const [px, py] = projectToView(...ring(a, t));
    const dd = ((px - ax) * -(by - ay) + (py - ay) * (bx - ax)) / l;
    if (dd < dMin) (dMin = dd), (tMin = t);
    if (dd > dMax) (dMax = dd), (tMax = t);
  }
  for (const t of [tMin, tMax]) sk.seg(ring(a, t), ring(b, t), s);
}

/**
 * A dead-end gantry across a bay: two lattice columns and a beam at `H`, and from the
 * beam an insulator string for each phase. Returns where each phase's conductor hangs.
 */
export function gantry(sk: Sketch, e: number, ns: number[], H: number, k: KvClass): P3[] {
  const { f } = k;
  const n0 = Math.min(...ns) - 1.4 * f;
  const n1 = Math.max(...ns) + 1.4 * f;
  const w = 0.45 * f;
  for (const n of [n0, n1]) {
    sk.box(e, 0, n, w, H, w, { width: PEN.fine, color: INK });
    // lattice: a zig-zag up the face the camera sees
    const steps = Math.max(3, Math.round(H / (1.6 * f)));
    const pts: Vec3[] = [];
    for (let i = 0; i <= steps; i++) pts.push(sk.plan(e + (i % 2 ? w / 2 : -w / 2), (H * i) / steps, n + w / 2));
    sk.poly(pts, { width: PEN.hairline, color: INK });
  }
  sk.box(e, H - 0.55 * f, (n0 + n1) / 2, w * 0.9, 0.55 * f, n1 - n0 + w, { width: PEN.fine, color: INK });
  return ns.map((n) => {
    insulator(sk, [e, H - 0.55 * f, n], [e, H - 0.55 * f - 1.5 * f, n], 0.22 * f);
    return [e, H - 2.05 * f, n] as P3;
  });
}

/**
 * A lattice transmission tower at (e, n), its crossarm across the direction (ue, un) the
 * line runs, with `m` conductor positions along the arm (spaced `sp`). The legs taper to
 * a waist; X-bracing on the two faces the camera sees. Returns the attachment points
 * (bottoms of the insulator strings), in order along the arm.
 */
export function tower(sk: Sketch, e: number, n: number, ue: number, un: number, H: number, m: number, sp: number, f: number): P3[] {
  const ve = -un;
  const vn = ue;
  const at = (a: number, b: number, h: number): Vec3 => sk.plan(e + ue * a + ve * b, h, n + un * a + vn * b);
  const bw = Math.max(1.2 * f, 0.09 * H);
  const ww = Math.max(0.5 * f, 0.03 * H);
  const hw = H * 0.62;
  const legs: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const style = { width: PEN.fine, color: INK };
  for (const [a, b] of legs) {
    sk.seg(at(a * bw, b * bw, 0), at(a * ww, b * ww, hw), style);
    sk.seg(at(a * ww, b * ww, hw), at(a * ww * 0.7, b * ww * 0.7, H), style);
  }
  // bracing on the faces (both diagonals, three panels)
  for (let i = 0; i < 3; i++) {
    const h0 = (hw * i) / 3;
    const h1 = (hw * (i + 1)) / 3;
    const w0 = bw + ((ww - bw) * i) / 3;
    const w1 = bw + ((ww - bw) * (i + 1)) / 3;
    for (const b of [-1, 1]) {
      sk.seg(at(-w0, b * w0, h0), at(w1, b * w1, h1), { width: PEN.hairline, color: INK });
      sk.seg(at(w0, b * w0, h0), at(-w1, b * w1, h1), { width: PEN.hairline, color: INK });
    }
  }
  // the crossarm, and a string at each conductor position
  const armH = H * 0.88;
  const half = Math.max(((m - 1) / 2) * sp, sp) + 0.8 * f;
  sk.seg(at(0, -half, armH), at(0, half, armH), { width: PEN.thin, color: INK });
  sk.seg(at(0, -half, armH), at(0, -ww, H * 0.97), style);
  sk.seg(at(0, half, armH), at(0, ww, H * 0.97), style);
  const out: P3[] = [];
  for (let i = 0; i < m; i++) {
    const b = m === 1 ? 0 : -((m - 1) / 2) * sp + i * sp;
    const pe = e + ve * b;
    const pn = n + vn * b;
    insulator(sk, [pe, armH, pn], [pe, armH - 1.6 * f, pn], 0.22 * f);
    out.push([pe, armH - 1.6 * f, pn]);
  }
  return out;
}

/**
 * A transformer's tank in its own axes: `u` along the row of phases (the core's limbs
 * stand along it, one under each pair of bushings), `v` across it. The camera looks
 * toward +east and +north, so in both orientations the side toward the viewer is v < v0.
 */
export interface XfBody {
  e: number;
  n: number;
  se: number;
  sh: number;
  sn: number;
  f: number;
  hvSide: 1 | -1;
  alongN: boolean;
}

export interface XfAxes {
  su: number;
  sv: number;
  u0: number;
  v0: number;
  /** The lid's height (the tank stands on a 0.4 m plinth). */
  lid: number;
  /** (u, height, v) → plan (east, height, north). */
  at: (u: number, h: number, v: number) => P3;
}

export function xfAxes(b: XfBody): XfAxes {
  return {
    su: b.alongN ? b.se : b.sn,
    sv: b.alongN ? b.sn : b.se,
    u0: b.alongN ? b.e : b.n,
    v0: b.alongN ? b.n : b.e,
    lid: 0.4 + b.sh,
    at: (u, h, v) => (b.alongN ? [u, h, v] : [v, h, u]),
  };
}

/** Something drawn cut away: a light outline where it was, no faces. */
export const GHOST = { width: PEN.hairline, color: INK_35 };

/** A box's twelve edges and no faces (a cut-away part's outline). */
export function ghostBox(sk: Sketch, e: number, h: number, n: number, se: number, sh: number, sn: number): void {
  const c = boxCorners(e - se / 2, h, n - sn / 2, e + se / 2, h + sh, n + sn / 2).map(([x, y, z]) => sk.plan(x, y, z));
  for (const [i, j] of BOX_EDGES) sk.seg(c[i]!, c[j]!, GHOST);
}

/**
 * A horizontal cylinder between two plan points (any horizontal direction): end circles,
 * the two silhouettes the camera sees, faces for hidden-line removal.
 */
export function hcyl(sk: Sketch, a: P3, b: P3, r: number, s: { width: number; color: string } = fine): void {
  const N = 24;
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const L = Math.hypot(dx, dz) || 1;
  // the circle's plane: across the axis (horizontal) and up
  const cx = -dz / L;
  const cz = dx / L;
  const ring = (p: P3, t: number): Vec3 => sk.plan(p[0] + r * Math.cos(t) * cx, p[1] + r * Math.sin(t), p[2] + r * Math.cos(t) * cz);
  const fs = { collapse: sk.anchor, stagger: sk.stagger };
  for (let i = 0; i < N; i++) {
    const t0 = (2 * Math.PI * i) / N;
    const t1 = (2 * Math.PI * (i + 1)) / N;
    sk.faces.quad(ring(a, t0), ring(b, t0), ring(b, t1), ring(a, t1), fs);
    sk.faces.tri(sk.plan(...a), ring(a, t0), ring(a, t1), fs);
    sk.faces.tri(sk.plan(...b), ring(b, t0), ring(b, t1), fs);
    sk.seg(ring(a, t0), ring(a, t1), s);
    sk.seg(ring(b, t0), ring(b, t1), s);
  }
  // silhouettes: the ring points furthest either side of the axis on screen
  const [ax, ay] = projectToView(...sk.plan(...a));
  const [bx, by] = projectToView(...sk.plan(...b));
  const l = Math.hypot(bx - ax, by - ay) || 1;
  let tMin = 0;
  let tMax = 0;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (let i = 0; i < 360; i++) {
    const t = (2 * Math.PI * i) / 360;
    const [px, py] = projectToView(...ring(a, t));
    const d = ((px - ax) * -(by - ay) + (py - ay) * (bx - ax)) / l;
    if (d < dMin) (dMin = d), (tMin = t);
    if (d > dMax) (dMax = d), (tMax = t);
  }
  for (const t of [tMin, tMax]) sk.seg(ring(a, t), ring(b, t), s);
}

/**
 * A power transformer: its tank, cooling radiators across both ends (fins, with the
 * header pipes that take oil out at the top and back in at the bottom), the
 * conservator (the oil expansion tank) across the lid at one end with the pipe to the
 * tank, three high-voltage bushings on one side of the lid and three low-voltage on the
 * other. Size by rating. Returns the bushing tops, HV then LV, in order along u.
 *
 * `cut`: the tank drawn cut open on the vertical plane through its limbs — the half
 * toward the viewer (walls, lid, radiator fins) reduced to a light outline, the far
 * walls standing with their cut edges drawn heavy — for a level that draws what is
 * inside. Everything that stays is drawn exactly where the uncut drawing has it.
 */
export function transformer(sk: Sketch, e: number, n: number, se: number, sh: number, sn: number, f: number, hvSide: 1 | -1 = 1, alongN = false, cut = false): { hv: P3[]; lv: P3[]; tank: Vec3[] } {
  const X = xfAxes({ e, n, se, sh, sn, f, hvSide, alongN });
  const { su, sv, u0, v0, lid, at } = X;
  const P = (u: number, h: number, v: number): Vec3 => sk.plan(...at(u, h, v));
  sk.box(e, 0, n, se + 1.2, 0.4, sn + 1.2, { width: PEN.fine, color: INK_60 });
  const tank = boxCorners(e - se / 2, 0.4, n - sn / 2, e + se / 2, 0.4 + sh, n + sn / 2).map(([x, y, z]) => sk.plan(x, y, z));
  if (!cut) sk.box(e, 0.4, n, se, sh, sn);
  else cutTank(sk, X);
  // radiators: fins across both ends, and their header pipes along the top and bottom
  const fins = Math.max(3, Math.round(sv / 1.1));
  const finH = sh * 0.72;
  for (const s of [-1, 1]) {
    const uf = u0 + s * (su / 2 + 0.45);
    for (let i = 0; i < fins; i++) {
      const vf = v0 - sv / 2 + ((i + 0.5) * sv) / fins;
      const [fe, , fnn] = at(uf, 0, vf);
      const [we, wn] = alongN ? [0.8, 0.12] : [0.12, 0.8];
      if (cut && vf < v0) ghostBox(sk, fe, 0.9, fnn, we, finH, wn);
      else sk.box(fe, 0.9, fnn, we, finH, wn, { width: PEN.hairline, color: INK });
    }
    const v1 = v0 - sv / 2 + (0.5 * sv) / fins;
    const v2 = v0 + sv / 2 - (0.5 * sv) / fins;
    for (const hh of [0.9 + finH - 0.25, 1.15]) {
      if (cut) {
        sk.seg(P(uf, hh, v1), P(uf, hh, v0), GHOST);
        sk.seg(P(uf, hh, v0), P(uf, hh, v2), thin);
      } else sk.seg(P(uf, hh, v1), P(uf, hh, v2), thin);
    }
  }
  // conservator across the lid at the +u end, on two legs, with its pipe down to the tank
  const cr = 0.18 + 0.05 * sh;
  const cu = u0 + su / 2 - 0.2 - cr;
  const cH = lid + 0.75 + cr;
  for (const s of [-1, 1]) sk.seg(P(cu, lid, v0 + s * 0.25 * sv), P(cu, cH - cr * 0.9, v0 + s * 0.25 * sv), thin);
  hcyl(sk, at(cu, cH, v0 - 0.32 * sv), at(cu, cH, v0 + 0.32 * sv), cr);
  const pipe: Vec3[] = [P(cu, cH - cr, v0 + 0.1 * sv), P(cu - 0.35, lid + 0.45, v0 + 0.1 * sv), P(cu - 0.7, lid, v0 + 0.1 * sv)];
  sk.poly(pipe, thin);
  // bushings: the two rows, HV toward `hvSide` of v, LV opposite
  const hv: P3[] = [];
  const lv: P3[] = [];
  for (let i = 0; i < 3; i++) {
    const u = u0 + (i - 1) * 0.3 * su;
    const h = at(u, lid, v0 + hvSide * sv * 0.28);
    const l = at(u, lid, v0 - hvSide * sv * 0.28);
    insulator(sk, h, [h[0], lid + 2.2 * f, h[2]], 0.22 * f);
    insulator(sk, l, [l[0], lid + 1.2 * f, l[2]], 0.2 * f);
    if (cut) {
      // the bushings' lower ends, in the oil
      insulator(sk, h, [h[0], lid - 0.9 * f, h[2]], 0.16 * f);
      insulator(sk, l, [l[0], lid - 0.6 * f, l[2]], 0.15 * f);
    }
    hv.push([h[0], lid + 2.2 * f, h[2]]);
    lv.push([l[0], lid + 1.2 * f, l[2]]);
  }
  return { hv, lv, tank };
}

/**
 * The tank cut open on v = v0: the far wall and the far halves of the end walls and
 * floor stand, their cut edges heavy; the near half and the lid are a light outline.
 */
function cutTank(sk: Sketch, X: XfAxes): void {
  const { su, sv, u0, v0, lid, at } = X;
  const P = (u: number, h: number, v: number): Vec3 => sk.plan(...at(u, h, v));
  const fs = { collapse: sk.anchor, stagger: sk.stagger };
  const ua = u0 - su / 2;
  const ub = u0 + su / 2;
  const vn = v0 - sv / 2;
  const vf = v0 + sv / 2;
  const h0 = 0.4;
  const wall = { width: PEN.outline, color: INK };
  const cutEdge = { width: PEN.bold, color: INK };
  // far wall, far halves of the end walls, far half of the floor
  sk.faces.quad(P(ua, h0, vf), P(ub, h0, vf), P(ub, lid, vf), P(ua, lid, vf), fs);
  for (const u of [ua, ub]) sk.faces.quad(P(u, h0, v0), P(u, h0, vf), P(u, lid, vf), P(u, lid, v0), fs);
  sk.faces.quad(P(ua, h0, v0), P(ub, h0, v0), P(ub, h0, vf), P(ua, h0, vf), fs);
  // the rim and the far corners
  sk.poly([P(ua, lid, v0), P(ua, lid, vf), P(ub, lid, vf), P(ub, lid, v0)], wall);
  sk.seg(P(ua, h0, v0), P(ua, h0, vf), wall);
  sk.seg(P(ua, h0, vf), P(ua, lid, vf), wall);
  sk.seg(P(ua, h0, vf), P(ub, h0, vf), { width: PEN.fine, color: INK });
  // the section: where the walls and floor were cut
  sk.seg(P(ua, h0, v0), P(ua, lid, v0), cutEdge);
  sk.seg(P(ub, h0, v0), P(ub, lid, v0), cutEdge);
  sk.seg(P(ua, h0, v0), P(ub, h0, v0), cutEdge);
  // the near half, cut away
  sk.poly([P(ua, lid, v0), P(ua, lid, vn), P(ub, lid, vn), P(ub, lid, v0)], GHOST);
  sk.poly([P(ua, h0, v0), P(ua, h0, vn), P(ub, h0, vn), P(ub, h0, v0)], GHOST);
  for (const u of [ua, ub]) sk.seg(P(u, h0, vn), P(u, lid, vn), GHOST);
}

/** A conductor from terminal to terminal (plan points), returning the segment index. */
export function wire(sk: Sketch, a: P3, b: P3, width: number): number {
  return sk.seg(sk.plan(...a), sk.plan(...b), { width, color: INK });
}

/** A vertical cylinder standing on (e, n): a tank, a containment, a cooling tower. */
export function vcyl(sk: Sketch, e: number, n: number, r: number, h: number, h0 = 0, dome = 0): void {
  const N = 28;
  const pt = (t: number, y: number, rr = r): Vec3 => sk.plan(e + rr * Math.cos(t), y, n + rr * Math.sin(t));
  const fs = { collapse: sk.anchor, stagger: sk.stagger };
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N;
    const b = (2 * Math.PI * (i + 1)) / N;
    sk.faces.quad(pt(a, h0), pt(b, h0), pt(b, h), pt(a, h), fs);
    sk.seg(pt(a, h0), pt(b, h0), { width: PEN.outline, color: INK });
    if (!dome) {
      sk.faces.tri(sk.plan(e, h, n), pt(a, h), pt(b, h), fs);
      sk.seg(pt(a, h), pt(b, h), { width: PEN.outline, color: INK });
    }
  }
  // silhouettes: where the wall turns away from the camera
  for (const t of [Math.PI / 4, (5 * Math.PI) / 4]) sk.seg(pt(t, h0), pt(t, h), { width: PEN.outline, color: INK });
  if (dome) {
    // a hemispherical dome as rings, its outline the ring the camera sees edge-on
    const rings = 4;
    for (let k = 0; k < rings; k++) {
      const p0 = (k / rings) * (Math.PI / 2);
      const p1 = ((k + 1) / rings) * (Math.PI / 2);
      for (let i = 0; i < N; i++) {
        const a = (2 * Math.PI * i) / N;
        const b = (2 * Math.PI * (i + 1)) / N;
        const q = [pt(a, h + dome * Math.sin(p0), r * Math.cos(p0)), pt(b, h + dome * Math.sin(p0), r * Math.cos(p0)), pt(b, h + dome * Math.sin(p1), r * Math.cos(p1)), pt(a, h + dome * Math.sin(p1), r * Math.cos(p1))];
        sk.faces.quad(q[0]!, q[1]!, q[2]!, q[3]!, fs);
        if (k > 0) sk.seg(q[0]!, q[1]!, { width: PEN.hairline, color: INK });
      }
    }
    // the dome's outline against the sky: a half-ellipse through the silhouette points
    const outline: Vec3[] = [];
    for (let i = 0; i <= 16; i++) {
      const phi = (i / 16) * Math.PI;
      outline.push(sk.plan(e + r * Math.cos(Math.PI / 4) * Math.cos(phi), h + dome * Math.sin(phi), n + r * Math.sin(Math.PI / 4) * Math.cos(phi)));
    }
    sk.poly(outline, { width: PEN.outline, color: INK });
  }
}
