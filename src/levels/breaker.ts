import * as THREE from 'three';
import { LineBatch, type Vec3 } from '../render/lines';
import { INK, INK_60, PEN, type VoltageClass } from '../render/style';
import type { IsoCamera } from '../render/iso';
import type { Snapshot } from '../model/snapshot';
import type { BreakerState, Interruption } from '../model/breakerState';
import { interruption } from '../model/breakerState';
import { COMPONENTS } from '../data/components';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_ISO, PERSIST, Sketch } from './sketch';
import { acyl, breaker, breakerGeom, type KvClass } from './kit';

/**
 * The Breaker level: one bay's circuit breaker, its nearest pole cut open, drawn in the
 * frame of the yard it stands in (it unfolds in place).
 *
 * Inside the pole's tank of SF6 gas, left to right along its axis: the conductor down
 * from the first bushing to the fixed contact — fingers round a central arcing pin —
 * then the moving contact: a tube that slides off the pin, a nozzle round its mouth,
 * and behind it the puffer cylinder, driven by an insulating rod from the crank at the
 * tank's end; the crank is linked by the gang shaft to the operating mechanism's
 * cabinet, whose springs open and close all three poles together. The moving parts are
 * drawn on a group of their own and slide along the axis.
 *
 * Opening (asked for by the reader), in the real order, shown `slowdown` times slower:
 * the trip releases the opening spring; the main contacts part, then the arcing
 * contacts, and the current goes on across the gap as an arc; the puffer, compressed
 * by the motion, blows gas through the nozzle across it; at the first current zero
 * the arc is long enough to be put out, it goes out — each phase at its own zero —
 * and the contacts run on to fully open. Then the network is solved again with the
 * circuit open (the app's re-solve, not a script).
 */

export interface BreakerPlace {
  e0: number;
  e1: number;
  ns: number[];
  k: KvClass;
  /** Which terminal is on the bus side: 0 (at e0) or 1 (at e1). */
  busEnd: 0 | 1;
}

type Seq = { kind: 'open' | 'close'; start: number | null; plan: Interruption | null; done: () => void; finished: boolean };

export class BreakerLevel implements Level {
  readonly kind = 'breaker' as const;
  readonly unitKm = 0.001;
  readonly needsDetail = false;
  readonly flowScale = FLOW_SCALES.breaker;
  readonly north = NORTH_ISO;
  readonly labels: LabelSpec[] = [];
  readonly sk: Sketch;
  /** The moving contact, nozzle, puffer and rod: slid along the axis as the contacts travel. */
  private readonly mv: Sketch;
  readonly seat: Vec3;
  private morphValue = 1;
  private arc = new LineBatch('cb-arc');
  private arcSegs: number[] = [];
  private blast = new LineBatch('cb-blast');
  private flows: number[] = [];
  /** 0: closed; 1: fully open. */
  private travel = 0;
  private stroke: number;
  private axis: { ec: number; L: number; h: number; n: number; pinTip: number; front0: number };
  private seq: Seq | null = null;
  private lastTime = 0;
  private extent: Vec3[] = [];
  state: BreakerState | null = null;
  /** The pole cut open: its index in `ns` (the one nearest the viewer). */
  readonly cutPole: number;

  constructor(
    readonly place: BreakerPlace,
    plan: (e: number, h: number, n: number) => Vec3,
    readonly name: string,
    private readonly stateOf: (s: Snapshot) => BreakerState | null,
    readonly classes: VoltageClass[],
    readonly key: string,
  ) {
    const { e0, e1, ns, k } = place;
    const sk = (this.sk = new Sketch(plan));
    const g = breakerGeom(e0, e1, k);
    const f = k.f;
    this.cutPole = ns.indexOf(Math.min(...ns));
    const n = ns[this.cutPole]!;
    const h = g.hTank;
    const L = g.t1 - g.t0;
    const ec = (g.t0 + g.t1) / 2;
    const r = g.r;
    this.stroke = 0.26 * L;
    const B = COMPONENTS.breaker;
    const sPart = (B.partMs - B.moveMs) / (B.fullMs - B.moveMs);
    const front0 = ec - 0.11 * L;
    const pinTip = front0 + sPart * this.stroke;
    this.axis = { ec, L, h, n, pinTip, front0 };
    this.seat = plan((g.lo + g.hi) / 2, 0, ns[1] ?? n);
    sk.anchor = plan(ec, h, n);
    const part = (what: string): Selection => ({ kind: 'part', id: key, what }) as Selection;
    const P = (e: number, hh: number, nn = n): Vec3 => sk.plan(e, hh, nn);

    // ---- the shell: three poles, bushings on their current transformers, crank, shaft, cabinet
    sk.stagger = PERSIST;
    breaker(sk, e0, e1, ns, k, this.cutPole);

    // ---- the fixed side: conductor down from the first bushing, the contact fingers, the arcing pin
    sk.stagger = 0.12;
    const thin = { width: PEN.thin, color: INK };
    const cond = { width: PEN.medium, color: INK };
    sk.poly([P(g.base0[0], g.base0[1]), P(g.base0[0], h), P(g.t0 + 0.1 * L, h)], cond);
    acyl(sk, [g.t0 + 0.1 * L, h, n], [ec - 0.16 * L, h, n], 0.3 * r, thin);
    acyl(sk, [ec - 0.16 * L, h, n], [ec - 0.07 * L, h, n], 0.24 * r, thin);
    sk.seg(P(ec - 0.07 * L, h), P(pinTip, h), { width: 3, color: INK });
    sk.target(part('fixed'), [P(g.t0 + 0.1 * L, h), P(pinTip, h)]);
    this.labels.push({ id: 'cb:fixed', text: 'Fixed contact: fingers round an arcing pin', anchor: P(ec - 0.3 * L, h + 0.3 * r), priority: 8, minZoom: 0, kind: 'equip' });
    // the moving side's housing (the puffer slides into it), and the conductor up to the second bushing
    acyl(sk, [ec + 0.3 * L, h, n], [g.t1 - 0.08 * L, h, n], 0.3 * r, thin);
    sk.poly([P(g.t1 - 0.08 * L, h), P(g.base1[0], h), P(g.base1[0], g.base1[1])], cond);

    // ---- the moving parts, on their own group
    const mv = (this.mv = new Sketch(plan));
    mv.anchor = sk.anchor;
    mv.stagger = 0.2;
    sk.group.add(mv.group);
    // the puffer cylinder, whose front is the moving main contact (the fingers grip it)
    acyl(mv, [front0, h, n], [ec + 0.2 * L, h, n], 0.2 * r, { width: PEN.thin, color: INK });
    // the nozzle on its front, round the moving arcing contact: a funnel narrowing to its throat
    const noz: Array<[number, number]> = [
      [front0, 0.15 * r],
      [front0 - 0.035 * L, 0.055 * r],
      [front0 - 0.055 * L, 0.085 * r],
    ];
    const ring = (e: number, rr: number) => {
      const pts: Vec3[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = (2 * Math.PI * i) / 16;
        pts.push(P(e, h + rr * Math.cos(t), n + rr * Math.sin(t)));
      }
      mv.poly(pts, { width: PEN.hairline, color: INK });
    };
    for (const [e, rr] of noz) ring(e, rr);
    for (const t of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) mv.poly(noz.map(([e, rr]) => P(e, h + rr * Math.cos(t), n + rr * Math.sin(t))), { width: PEN.fine, color: INK });
    // the insulating operating rod, back to the crank
    mv.seg(P(ec + 0.2 * L, h), P(g.t1 - 0.02 * L, h), { width: 2.6, color: INK_60 });
    mv.target(part('moving'), [P(front0 - 0.055 * L, h), P(ec + 0.2 * L, h)]);
    mv.target(part('rod'), [P(ec + 0.2 * L, h), P(g.t1, h)]);
    // (labels do not travel with the moving parts: this one sits where the nozzle passes)
    this.labels.push({ id: 'cb:moving', text: 'Moving contact, its nozzle round the arc', anchor: P(front0 + this.stroke * 0.5, h - 0.2 * r), priority: 8, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'cb:puffer', text: 'Puffer: squeezes the gas as it opens', anchor: P(ec + 0.2 * L, h + 0.2 * r), priority: 7, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'cb:rod', text: 'Operating rod', anchor: P(ec + 0.36 * L, h), priority: 5, minZoom: 0, kind: 'equip' });

    // ---- the arc (while it burns) and the gas blast through the nozzle
    this.arc.mesh.renderOrder = 33;
    this.blast.mesh.renderOrder = 33;
    sk.group.add(this.arc.mesh);
    mv.group.add(this.blast.mesh);
    const arcStyle = { width: 2.8, color: INK, collapse: sk.anchor, stagger: 0.3 };
    for (let i = 0; i < 7; i++) this.arcSegs.push(this.arc.segment(sk.anchor, sk.anchor, arcStyle));
    this.arc.commit();
    const bl = { width: PEN.medium, color: INK, collapse: sk.anchor, stagger: 0.3 };
    for (const s2 of [-1, 1]) {
      const y = h + s2 * 0.11 * r;
      const a = P(front0 + 0.06 * L, y);
      const b = P(front0 - 0.02 * L, y);
      this.blast.segment(a, b, bl);
      this.blast.segment(P(front0, y + 0.04 * r), b, bl);
      this.blast.segment(P(front0, y - 0.04 * r), b, bl);
    }
    this.blast.commit();
    this.blast.opacity = 0;

    // ---- power through the pole cut open: in at the bus-side bushing, out at the line side
    sk.stagger = 0.4;
    const top0 = P(g.lo, k.hT);
    const top1 = P(g.hi, k.hT);
    const busFirst = (place.busEnd === 0 ? e0 : e1) === g.lo;
    const legs: Array<[Vec3, Vec3]> = [
      [top0, P(g.base0[0], g.base0[1] + g.pod)],
      [P(g.base1[0], g.base1[1] + g.pod), top1],
    ];
    for (const [a, b] of busFirst ? legs : legs.map(([a, b]) => [b, a] as [Vec3, Vec3]).reverse()) this.flows.push(sk.flowSeg(a, b));

    // ---- parts to pick, names
    const podTop = (base: readonly [number, number], lo: boolean): Vec3 => P(base[0] + (lo ? -1 : 1) * 0.2 * f, base[1] + 0.4 * f);
    sk.target(part('ct'), [P(g.base0[0], g.base0[1]), podTop(g.base0, true)]);
    sk.target(part('ct'), [P(g.base1[0], g.base1[1]), podTop(g.base1, false)]);
    this.labels.push({ id: 'cb:ct', text: 'Current transformers: what protection measures', anchor: podTop(g.base0, true), priority: 7, minZoom: 0, kind: 'equip' });
    const nm = Math.max(...ns) + g.cabN;
    sk.target(part('mechanism'), [P(g.crankE - g.cab.se / 2, 0, nm), P(g.crankE + g.cab.se / 2, g.cab.sh, nm + g.cab.sn)], true);
    this.labels.push({ id: 'cb:mech', text: 'Operating mechanism: springs, trip and close coils', anchor: P(g.crankE, g.cab.sh, nm + g.cab.sn / 2), priority: 6, minZoom: 0, kind: 'equip' });
    sk.target(part('tank'), [P(g.t0, h - r), P(g.t1, h + r)], true);
    this.labels.push({ id: 'cb:gas', text: 'Tank of SF₆ gas, at earth potential', anchor: P(g.t0 + 0.1 * L, h - r), priority: 6, minZoom: 0, kind: 'equip', prov: 'data:notation.SF6' });
    this.labels.push({ id: 'cb:bush', text: 'Bushings', anchor: top1, priority: 5, minZoom: 0, kind: 'equip' });

    // fit on the pole cut open: its tank and the feet of its bushings (the rest stands behind and above)
    for (const e of [g.t0 - 0.2 * f, g.t1 + 0.3 * f]) for (const nn of [n - r, n + r]) this.extent.push(P(e, h - r, nn), P(e, h + r + g.pod, nn));
    sk.stagger = 0;
    sk.commit();
    mv.commit();
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  stateFor(s: Snapshot): BreakerState | null {
    return this.stateOf(s);
  }

  /** Is a sequence running? */
  get busy(): boolean {
    return !!this.seq && !this.seq.finished;
  }

  /**
   * Play the opening or closing in the real order, slowed; `done` runs when the
   * contacts are home (the app then solves the network again with the circuit so).
   */
  play(kind: 'open' | 'close', done: () => void): void {
    if (this.busy) return;
    this.seq = { kind, start: null, plan: kind === 'open' && this.state ? interruption(this.state) : null, done, finished: false };
  }

  /** Stop a sequence without acting on it, and show the breaker as the solution has it. */
  cancel(): void {
    if (!this.seq) return;
    this.seq = null;
    this.travel = this.state?.closed ? 0 : 1;
    this.setTravel(this.travel);
    this.setArc(false);
    this.blast.opacity = 0;
    this.setFlow(this.state?.closed && this.state.energized ? this.state.p / 3 : 0);
  }

  applySnapshot(s: Snapshot): void {
    this.state = this.stateOf(s);
    if (this.busy) return;
    this.seq = null;
    this.travel = this.state?.closed ? 0 : 1;
    this.setTravel(this.travel);
    this.setFlow(this.state?.closed && this.state.energized ? this.state.p / 3 : 0);
    this.setArc(false);
  }

  private setFlow(mwPerPhase: number): void {
    const sc = this.flowScale;
    for (const fl of this.flows) this.sk.flow.set(fl, { sizePx: chevronSizeFor(mwPerPhase, sc), speed: chevronSpeedFor(mwPerPhase, sc) * Math.sign(mwPerPhase), side: 0, color: INK, alpha: Math.abs(mwPerPhase) > 0.05 ? 1 : 0 });
  }

  private setTravel(s: number): void {
    const { e0 } = this.place;
    const a = this.sk.plan(e0, 0, 0);
    const b = this.sk.plan(e0 + s * this.stroke, 0, 0);
    this.mv.group.position.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }

  /** The arc, from the pin's tip to the moving contact's mouth, jagged. */
  private setArc(on: boolean): void {
    const { h, n, pinTip, front0 } = this.axis;
    const x = this.travel * this.stroke;
    const a = pinTip;
    const b = front0 + x;
    const N = this.arcSegs.length;
    const amp = 0.09 * breakerGeom(this.place.e0, this.place.e1, this.place.k).r;
    let prev = this.sk.plan(a, h, n);
    for (let i = 0; i < N; i++) {
      const u = (i + 1) / N;
      const e = a + (b - a) * u;
      const off = i === N - 1 ? 0 : (i % 2 ? 1 : -1) * amp * (1 - Math.abs(2 * u - 1) * 0.5);
      const p = this.sk.plan(e, h + off, n + off * 0.6);
      this.arc.setEnds(this.arcSegs[i]!, prev, p);
      this.arc.setAlpha(this.arcSegs[i]!, on && b > a ? 1 : 0);
      prev = p;
    }
  }

  highlight(_sel: Selection | null): Set<string> | null {
    return null;
  }

  pick(sx: number, sy: number, cam: IsoCamera): Selection | null {
    return this.mv.pick(sx, sy, cam) ?? this.sk.pick(sx, sy, cam);
  }

  frame(o: FrameInfo): void {
    this.sk.frame(o);
    this.mv.frame(o);
    this.arc.frame(o);
    this.blast.frame(o);
    this.lastTime = o.time;
    const q = this.seq;
    if (!q || q.finished) return;
    if (q.start === null) q.start = o.time;
    const B = COMPONENTS.breaker;
    const ms = ((o.time - q.start) * 1000) / COMPONENTS.slowdown;
    const clamp = (x: number) => Math.max(0, Math.min(1, x));
    let end: number;
    if (q.kind === 'open') {
      this.travel = clamp((ms - B.moveMs) / (B.fullMs - B.moveMs));
      const clearA = q.plan ? q.plan.clearMs[0] : B.partMs;
      const arcing = !!q.plan && ms >= B.partMs && ms < clearA && (this.state?.amps ?? 0) > 0;
      this.setArc(arcing);
      this.blast.opacity = arcing ? 1 : 0;
      this.setFlow(ms < clearA && this.state?.closed ? (this.state?.p ?? 0) / 3 : 0);
      end = Math.max(B.fullMs, ...(q.plan?.clearMs ?? [0])) + 12;
    } else {
      this.travel = 1 - clamp((ms - B.closeMoveMs) / (B.closeHomeMs - B.closeMoveMs));
      this.setArc(false);
      this.blast.opacity = 0;
      end = B.closeHomeMs + 12;
    }
    this.setTravel(this.travel);
    if (ms >= end) {
      q.finished = true;
      q.done();
    }
  }

  /** Where the sequence is, real ms from the command (null: none running). */
  get sequenceMs(): number | null {
    const q = this.seq;
    if (!q || q.start === null || q.finished) return null;
    return ((this.lastTime - q.start) * 1000) / COMPONENTS.slowdown;
  }

  set morph(m: number) {
    this.morphValue = m;
    this.sk.morph = m;
    this.mv.morph = m;
    this.arc.morph = m;
    this.blast.morph = m;
    this.arc.opacity = Math.max(0, Math.min(1, (m - 0.85) / 0.15));
  }

  get morph(): number {
    return this.morphValue;
  }

  fitPoints(): Vec3[] {
    return this.extent;
  }
}
