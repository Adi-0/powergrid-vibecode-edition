import type { Vec3 } from '../render/lines';
import { INK, INK_60, PEN } from '../render/style';
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
 * A dead-tank circuit breaker per phase: a horizontal tank on two legs, its two
 * bushings rising in a V to the terminals. `e0`, `e1`: the terminals along east.
 */
export function breaker(sk: Sketch, e0: number, e1: number, ns: number[], k: KvClass): Array<[P3, P3]> {
  const { f, hT } = k;
  const out: Array<[P3, P3]> = [];
  const lo = Math.min(e0, e1);
  const hi = Math.max(e0, e1);
  const r = 0.42 * f;
  const hTank = 1.3 * f + r;
  const t0 = lo + 0.55 * f;
  const t1 = hi - 0.55 * f;
  for (const n of ns) {
    for (const e of [t0 + 0.3 * f, t1 - 0.3 * f]) sk.seg(sk.plan(e, 0, n), sk.plan(e, hTank - r, n), thin);
    sk.cylinder(t0, t1, hTank, n, r, { width: PEN.outline, color: INK });
    insulator(sk, [t0 + 0.35 * f, hTank + r * 0.8, n], [lo, hT, n], 0.24 * f);
    insulator(sk, [t1 - 0.35 * f, hTank + r * 0.8, n], [hi, hT, n], 0.24 * f);
    out.push([
      [e0, hT, n],
      [e1, hT, n],
    ]);
  }
  return out;
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
 * A power transformer: its tank, cooling radiators down both long sides, the
 * conservator (the oil expansion tank) on legs above one end, three high-voltage
 * bushings on one side of the lid and three low-voltage on the other. Size by rating.
 * Returns the bushing tops, HV then LV, in order along north.
 */
export function transformer(sk: Sketch, e: number, n: number, se: number, sh: number, sn: number, f: number, hvSide: 1 | -1 = 1, alongN = false): { hv: P3[]; lv: P3[]; tank: Vec3[] } {
  sk.box(e, 0, n, se + 1.2, 0.4, sn + 1.2, { width: PEN.fine, color: INK_60 });
  const tank = sk.box(e, 0.4, n, se, sh, sn);
  // radiators: thin fins along the two east-facing sides
  for (const s of [-1, 1]) {
    const fins = Math.max(3, Math.round(sn / 1.1));
    for (let i = 0; i < fins; i++) {
      const fn = n - sn / 2 + ((i + 0.5) * sn) / fins;
      sk.box(e + s * (se / 2 + 0.45), 0.9, fn, 0.8, sh * 0.72, 0.12, { width: PEN.hairline, color: INK });
    }
  }
  // conservator on two legs
  const cE0 = e - se / 2 + 0.4;
  const cE1 = e - se / 2 + se * 0.55;
  const cH = 0.4 + sh + 1.1;
  for (const ce of [cE0 + 0.3, cE1 - 0.3]) sk.seg(sk.plan(ce, 0.4 + sh, n - sn / 2 + 0.6), sk.plan(ce, cH - 0.35, n - sn / 2 + 0.6), thin);
  sk.cylinder(cE0, cE1, cH, n - sn / 2 + 0.6, 0.38, { width: PEN.fine, color: INK });
  // bushings
  const lid = 0.4 + sh;
  const hv: P3[] = [];
  const lv: P3[] = [];
  for (let i = 0; i < 3; i++) {
    // the two rows of bushings: HV toward `hvSide` (along east, or along north), LV opposite
    const h = alongN ? [e - se * 0.3 + (i * se * 0.6) / 2, n + hvSide * sn * 0.28] : [e + hvSide * se * 0.28, n - sn * 0.3 + (i * sn * 0.6) / 2];
    const l = alongN ? [h[0]!, n - hvSide * sn * 0.28] : [e - hvSide * se * 0.28, h[1]!];
    insulator(sk, [h[0]!, lid, h[1]!], [h[0]!, lid + 2.2 * f, h[1]!], 0.22 * f);
    insulator(sk, [l[0]!, lid, l[1]!], [l[0]!, lid + 1.2 * f, l[1]!], 0.2 * f);
    hv.push([h[0]!, lid + 2.2 * f, h[1]!]);
    lv.push([l[0]!, lid + 1.2 * f, l[1]!]);
  }
  return { hv, lv, tank };
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
