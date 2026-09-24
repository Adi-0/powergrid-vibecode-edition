import type * as THREE from 'three';
import type { Vec3 } from '../render/lines';
import { INK, INK_35, INK_60, PEN, voltageClassFor, type VoltageClass } from '../render/style';
import type { IsoCamera } from '../render/iso';
import type { Grid } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import { spanState, type SpanState, type Wind } from '../model/spanState';
import { SPAN_WEATHER } from '../data/conductors';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_MAP, PERSIST, Sketch } from './sketch';
import { tower } from './kit';
import type { CorridorSpan } from './site';

/**
 * The Span level: a corridor's first span out of a yard, from the tower outside the
 * fence to the next, in the yard's own frame (it unfolds where the conductors run).
 *
 * The conductors hang as they would at the temperature the current, the air, the sun
 * and the wind give them (IEEE 738), and a dashed line shows where they would hang at
 * their temperature limit: the line's rating is, at bottom, how far it may sag. A
 * dimension gives the clearance from the lowest conductor to the ground at mid-span.
 * Beyond the next tower the conductors run on to where the map's stroke takes them up.
 */

const N = 28;

/** A corridor span's length and its far tower: the span runs from the yard's tower toward the exit. */
export function spanGeom(cs: CorridorSpan): { S: number; ue: number; un: number; Fe: number; Fn: number; Me: number; Mn: number; lineAzDeg: number } {
  const dx = cs.X[0] - cs.te;
  const dn = -cs.X[2] - cs.tn;
  const L = Math.hypot(dx, dn) || 1;
  const ue = dx / L;
  const un = dn / L;
  const cls = cs.kv >= 345 ? 500 : cs.kv >= 200 ? 230 : cs.kv >= 100 ? 115 : 60;
  const S = Math.min(SPAN_WEATHER.spanM[cls] ?? 250, 0.85 * L);
  // the frame's plan runs 45° off true north (see sketch.ts): its (e, n) direction's true azimuth
  const lineAzDeg = ((Math.atan2(ue - un, ue + un) * 180) / Math.PI + 360) % 360;
  return { S, ue, un, Fe: cs.te + ue * S, Fn: cs.tn + un * S, Me: cs.te + (ue * S) / 2, Mn: cs.tn + (un * S) / 2, lineAzDeg };
}

export class SpanLevel implements Level {
  readonly kind = 'span' as const;
  readonly unitKm = 0.001;
  readonly needsDetail = false;
  readonly flowScale = FLOW_SCALES.span;
  readonly north = NORTH_MAP;
  readonly labels: LabelSpec[] = [];
  readonly sk: Sketch;
  readonly seat: Vec3;
  readonly name: string;
  readonly geom: ReturnType<typeof spanGeom>;
  wind: Wind = 'rating';
  state: SpanState | null = null;
  private last: Snapshot | null = null;
  private morphValue = 1;
  private wires: Array<{ circuit: number; a: Vec3; b: Vec3; segs: number[] }> = [];
  private ghosts: Array<{ circuit: number; a: Vec3; b: Vec3; segs: number[] }> = [];
  private flows: Array<{ circuit: number; a: Vec3; b: Vec3; segs: number[] }> = [];
  private dim: { line: number; ticks: [number, number]; circuit: number; a: Vec3; b: Vec3 } | null = null;
  private extent: Vec3[] = [];

  constructor(
    readonly grid: Grid,
    readonly siteId: string,
    readonly cs: CorridorSpan,
    plan: (e: number, h: number, n: number) => Vec3,
  ) {
    const sk = (this.sk = new Sketch(plan));
    const g = (this.geom = spanGeom(cs));
    const far = grid.sites.find((x) => x.id === cs.far)!;
    const here = grid.sites.find((x) => x.id === siteId)!;
    this.name = `Span from ${here.name} toward ${far.name}`;
    this.seat = plan(g.Me, 0, g.Mn);
    sk.anchor = plan(g.Me, cs.H * 0.7, g.Mn);
    const id = cs.key;
    const part = (what: string, sub?: string): Selection => ({ kind: 'part', id, what, ...(sub ? { sub } : {}) }) as Selection;

    // ---- the tower outside the yard (the yard draws it too), and the next one
    sk.stagger = PERSIST;
    const att = tower(sk, cs.te, cs.tn, cs.ue, cs.un, cs.towerH, cs.m, cs.spacing, cs.f);
    sk.stagger = 0.08;
    const attF = tower(sk, g.Fe, g.Fn, cs.ue, cs.un, cs.towerH, cs.m, cs.spacing, cs.f);
    sk.target(part('tower'), [plan(g.Fe, 0, g.Fn), plan(g.Fe, cs.towerH, g.Fn)]);
    this.labels.push({ id: 'sp:next', text: 'The next tower', anchor: plan(g.Fe, cs.towerH, g.Fn), priority: 6, minZoom: 0, kind: 'equip' });

    // ---- the ground under the span
    sk.stagger = 0.04;
    sk.seg(plan(cs.te, 0, cs.tn), plan(g.Fe, 0, g.Fn), { width: PEN.hairline, color: INK_60 });
    for (let i = 1; i < 12; i++) {
      const u = i / 12;
      const e = cs.te + (g.Fe - cs.te) * u;
      const n = cs.tn + (g.Fn - cs.tn) * u;
      sk.seg(plan(e - cs.un * 2, 0, n + cs.ue * 2), plan(e + cs.un * 2, 0, n - cs.ue * 2), { width: PEN.hairline, color: INK_35 });
    }

    // ---- the conductors: each circuit's phases from arm to arm, sagging; on beyond to the exit
    sk.stagger = 0.16;
    const cls = voltageClassFor(cs.kv);
    const X = cs.X;
    cs.circuits.forEach((c, ci) => {
      c.slots.forEach((j, p) => {
        const a = plan(...att[j]!);
        const b = plan(...attF[j]!);
        const segs: number[] = [];
        for (let i = 0; i < N; i++) segs.push(sk.seg(a, b, { width: cs.width, color: INK, dash: cs.dash }));
        this.wires.push({ circuit: ci, a, b, segs });
        sk.target(part('conductor', String(c.branch)), [a, plan(g.Me, cs.H * 0.6, g.Mn), b]);
        sk.seg(b, X, { width: cs.width, color: INK, dash: cls.dash, px: [0, 0, c.sidePx[0], c.sidePx[1]], collapsePx: [0, 0, c.sidePx[0], c.sidePx[1]] });
        if (p === 1) {
          // where it would hang at its temperature limit
          const gs: number[] = [];
          for (let i = 0; i < N; i++) gs.push(sk.seg(a, b, { width: PEN.fine, color: INK_35, dash: 'hidden' }));
          this.ghosts.push({ circuit: ci, a, b, segs: gs });
          // chevrons riding the middle phase
          const fs: number[] = [];
          for (let i = 0; i < 4; i++) fs.push(sk.flowSeg(a, b));
          this.flows.push({ circuit: ci, a, b, segs: fs });
          sk.flowSeg(b, X);
        }
      });
    });
    this.labels.push({ id: 'sp:wire', text: 'Hangs lower as it heats', anchor: plan(cs.te + (g.Fe - cs.te) * 0.35, cs.H * 0.75, cs.tn + (g.Fn - cs.tn) * 0.35), priority: 8, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'sp:ghost', text: 'At its temperature limit it would hang here', anchor: plan(cs.te + (g.Fe - cs.te) * 0.62, cs.H * 0.4, cs.tn + (g.Fn - cs.tn) * 0.62), priority: 7, minZoom: 0, kind: 'equip' });

    // ---- the clearance at mid-span, under the first circuit's middle phase
    sk.stagger = 0.3;
    const w0 = this.wires.find((w) => w.circuit === 0 && this.wires.indexOf(w) % 3 === 1) ?? this.wires[0]!;
    const mid: Vec3 = [(w0.a[0] + w0.b[0]) / 2, 0, (w0.a[2] + w0.b[2]) / 2];
    const line = sk.seg(mid, mid, { width: PEN.fine, color: INK });
    const t0 = sk.seg(mid, mid, { width: PEN.fine, color: INK });
    const t1 = sk.seg(mid, mid, { width: PEN.fine, color: INK });
    this.dim = { line, ticks: [t0, t1], circuit: 0, a: w0.a, b: w0.b };
    this.labels.push({ id: 'sp:clear', text: 'Clearance to the ground', anchor: [mid[0], cs.H * 0.25, mid[2]], priority: 7, minZoom: 0, kind: 'equip' });

    for (const [e, n] of [
      [cs.te, cs.tn],
      [g.Fe, g.Fn],
    ] as Array<[number, number]>)
      for (const s of [-1, 1]) this.extent.push(plan(e + s * cs.un * 12, 0, n - s * cs.ue * 12), plan(e + s * cs.un * 12, cs.towerH, n - s * cs.ue * 12));
    sk.stagger = 0;
    sk.commit();
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  get classes(): VoltageClass[] {
    return [voltageClassFor(this.cs.kv)];
  }

  stateFor(s: Snapshot): SpanState | null {
    return spanState(this.grid, s, this.siteId, this.cs.circuits.map((c) => c.branch), this.geom.S, this.geom.lineAzDeg, this.wind);
  }

  /** The reader changes the wind: the temperatures and sags follow (the network's flow does not). */
  setWind(w: Wind): void {
    this.wind = w;
    if (this.last) this.applySnapshot(this.last);
  }

  /** A point on a span from a to b that sags D at the middle: parabola below the chord. */
  private sagPoint(a: Vec3, b: Vec3, D: number, u: number): Vec3 {
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - 4 * D * u * (1 - u), a[2] + (b[2] - a[2]) * u];
  }

  private hang(segs: number[], a: Vec3, b: Vec3, D: number): void {
    for (let i = 0; i < segs.length; i++) this.sk.lines.setEnds(segs[i]!, this.sagPoint(a, b, D, i / segs.length), this.sagPoint(a, b, D, (i + 1) / segs.length));
  }

  applySnapshot(s: Snapshot): void {
    this.last = s;
    const st = (this.state = this.stateFor(s));
    const sk = this.sk;
    const sc = this.flowScale;
    for (const w of this.wires) this.hang(w.segs, w.a, w.b, st?.circuits[w.circuit]?.sag ?? 0);
    for (const w of this.ghosts) this.hang(w.segs, w.a, w.b, st?.circuits[w.circuit]?.sagMax ?? 0);
    for (const f of this.flows) {
      const c = st?.circuits[f.circuit];
      const D = c?.sag ?? 0;
      f.segs.forEach((k, i) => {
        const u0 = (i + 0.1) / f.segs.length;
        const u1 = (i + 0.9) / f.segs.length;
        sk.flow.setEnds(k, this.sagPoint(f.a, f.b, D, u0), this.sagPoint(f.a, f.b, D, u1));
        const mw = c?.p ?? 0;
        sk.flow.set(k, { sizePx: chevronSizeFor(mw, sc), speed: chevronSpeedFor(mw, sc) * Math.sign(mw), side: 0, color: INK, alpha: Math.abs(mw) > 0.5 ? 1 : 0 });
      });
    }
    if (this.dim && st) {
      const D = st.circuits[this.dim.circuit]?.sag ?? 0;
      const top = this.sagPoint(this.dim.a, this.dim.b, D, 0.5);
      const base: Vec3 = [top[0], 0, top[2]];
      sk.lines.setEnds(this.dim.line, base, top);
      const tick = (p: Vec3): [Vec3, Vec3] => [
        [p[0] - this.cs.un * 1.2, p[1], p[2] - this.cs.ue * 1.2],
        [p[0] + this.cs.un * 1.2, p[1], p[2] + this.cs.ue * 1.2],
      ];
      sk.lines.setEnds(this.dim.ticks[0], ...tick(base));
      sk.lines.setEnds(this.dim.ticks[1], ...tick(top));
    }
  }

  highlight(_sel: Selection | null): Set<string> | null {
    return null;
  }

  pick(sx: number, sy: number, cam: IsoCamera): Selection | null {
    return this.sk.pick(sx, sy, cam);
  }

  frame(o: FrameInfo): void {
    this.sk.frame(o);
  }

  set morph(m: number) {
    this.morphValue = m;
    this.sk.morph = m;
  }

  get morph(): number {
    return this.morphValue;
  }

  fitPoints(): Vec3[] {
    return this.extent;
  }
}
