import type * as THREE from 'three';
import type { Vec3 } from '../render/lines';
import { INK, type VoltageClass } from '../render/style';
import type { IsoCamera } from '../render/iso';
import type { Snapshot } from '../model/snapshot';
import { capWave, type CapBankState } from '../model/capState';
import { COMPONENTS } from '../data/components';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_ISO, PERSIST, Sketch } from './sketch';
import type { KvClass } from './kit';
import { capGeom, setShuntSteps, shuntBank, type ShuntBankDraw } from './capkit';

/**
 * The Capacitor bank level: a yard's switched shunt capacitor bank, drawn where it
 * stands (it unfolds in place). Its steps in a row along a short bus, each switched on
 * its own; each step three stacks of cans, one per phase, the cans of a stack wired in
 * series up its insulated tiers, the stacks' bottoms joined at the step's grounded
 * neutral.
 *
 * What moves is energy. A capacitor takes no net power: each phase takes energy in
 * as its voltage rises and gives it back as the voltage falls, twice a cycle. The
 * chevrons on each phase's bus show that, p(t) = v(t)·i(t) from the solved voltage and
 * current phasors, slowed `slowdown` times; they reverse twice a cycle, and the three
 * phases' together add to nothing at every instant.
 *
 * Switching steps in and out is the reader's (a real re-solve); the drawing shows the
 * steps the solution has in service, the rest with their switches open, drawn light.
 */

export interface CapBankPlace {
  shunt: number;
  e0: number;
  s: 1 | -1;
  ns: number[];
  k: KvClass;
  steps: number;
  from: Array<[number, number, number]>;
  widths: { bus: number; phase: number };
}

export class CapBankLevel implements Level {
  readonly kind = 'capacitor' as const;
  readonly unitKm = 0.001;
  readonly needsDetail = false;
  readonly flowScale = FLOW_SCALES.capacitor;
  readonly north = NORTH_ISO;
  readonly labels: LabelSpec[] = [];
  readonly sk: Sketch;
  readonly seat: Vec3;
  readonly draw: ShuntBankDraw;
  state: CapBankState | null = null;
  private morphValue = 1;
  private flows: number[] = [];
  private travel = [0, 0, 0];
  private lastTime = -1;
  private extent: Vec3[] = [];

  constructor(
    readonly place: CapBankPlace,
    plan: (e: number, h: number, n: number) => Vec3,
    readonly name: string,
    private readonly stateOf: (s: Snapshot) => CapBankState | null,
    readonly classes: VoltageClass[],
    readonly key: string,
  ) {
    const { e0, s, ns, k } = place;
    const sk = (this.sk = new Sketch(plan));
    const g = capGeom(k);
    const P = (e: number, h: number, n: number): Vec3 => sk.plan(e, h, n);
    const part = (what: string, sub?: string): Selection => ({ kind: 'part', id: key, what, ...(sub ? { sub } : {}) }) as Selection;

    // ---- the shell: everything the yard draws of the bank, in the same place
    sk.stagger = PERSIST;
    const d = (this.draw = shuntBank(sk, 'cap', e0, s, ns, k, place.steps, place.from, place.widths));
    const near = d.steps[s === 1 ? 0 : d.steps.length - 1]!;
    const nLo = Math.min(...ns);
    this.seat = plan(near.e, 0, ns[1] ?? nLo);
    sk.anchor = plan(near.e, g.hTop / 2, nLo);

    // ---- energy in and out of each phase, along its bus
    sk.stagger = 0.35;
    for (const [a, b] of d.stub) this.flows.push(sk.flowSeg(P(...a), P(...b)));

    // ---- parts to pick, and names
    const C = COMPONENTS.capacitor;
    const hw = g.rackE / 2;
    const hn = g.rackN / 2;
    d.steps.forEach((st, j) => {
      ns.forEach((n, p) => sk.target(part('stack', `${j}.${p}`), [P(st.e - hw, g.hBase, n - hn), P(st.e + hw, g.hTop, n + hn)], true));
      for (const n of ns) sk.target(part('switch', `${j}`), [P(st.e, g.hStub, n), P(st.e, g.hTop, n)]);
    });
    for (const [a, b] of d.stub) sk.target(part('bus'), [P(...a), P(...b)]);
    const tMid = Math.floor(g.d.tiers / 2);
    const hMid = g.hBase + tMid * C.tierH;
    this.labels.push({ id: 'cap:stack', text: 'One phase: a stack of cans in series', anchor: P(near.e - hw, hMid + C.can.h, nLo - hn), priority: 8, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'cap:tiers', text: 'Tiers insulated from each other: the voltage divides up the stack', anchor: P(near.e + hw, g.hBase + C.tierH * 1.5, nLo - hn), priority: 7, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'cap:switch', text: 'Each step switched on its own', anchor: P(near.e, (g.hStub + g.hTop) / 2, nLo), priority: 7, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'cap:neutral', text: 'Neutral, to ground', anchor: P(near.e, g.hBase - 0.25, Math.max(...ns) + g.rackN), priority: 5, minZoom: 0, kind: 'equip' });
    this.labels.push({ id: 'cap:bus', text: 'Bus to the steps', anchor: P(...d.stub[0]![1]), priority: 4, minZoom: 0, kind: 'equip' });

    // fit on the nearest step, whole
    this.extent = d.near.map((q) => P(...q));
    sk.stagger = 0;
    sk.commit();
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  /** Real time, s, of the quantities shown (the display's time slowed). */
  get tau(): number {
    return Math.max(0, this.lastTime) / COMPONENTS.slowdown;
  }

  applySnapshot(s: Snapshot): void {
    this.state = this.stateOf(s);
    setShuntSteps(this.sk, this.draw, this.state?.inService ?? 0);
    this.setFlows();
  }

  /** Each phase's instantaneous power into the bank, as chevrons that move with the energy. */
  private setFlows(dt = 0): void {
    const st = this.state;
    const sc = this.flowScale;
    const on = !!st && st.energized && st.inService > 0;
    this.flows.forEach((fl, p) => {
      const w = on ? capWave(st!, this.tau, p) : null;
      const mw = w ? w.p : 0;
      const peak = on ? st!.q1 : 1;
      this.travel[p] = this.travel[p]! + chevronSpeedFor(mw, sc) * dt;
      this.sk.flow.set(fl, {
        sizePx: chevronSizeFor(mw, sc),
        speed: (mw >= 0 ? 1 : -1) * 1e-6,
        phase: -this.travel[p]!,
        side: 0,
        color: INK,
        alpha: on ? Math.min(1, (2.5 * Math.abs(mw)) / peak) : 0,
      });
    });
  }

  highlight(_sel: Selection | null): Set<string> | null {
    return null;
  }

  pick(sx: number, sy: number, cam: IsoCamera): Selection | null {
    return this.sk.pick(sx, sy, cam);
  }

  frame(o: FrameInfo): void {
    const dt = this.lastTime < 0 ? 0 : Math.max(0, o.time - this.lastTime);
    this.lastTime = o.time;
    this.setFlows(dt);
    this.sk.frame(o);
  }

  /** The can's own level draws it, cut open, while that level is open. */
  yieldTo(key: string, m: number): void {
    const c = this.draw.can;
    if (!c || !key.startsWith('can:')) return;
    for (let i = c.lines[0]; i < c.lines[0] + c.lines[1]; i++) this.sk.lines.setDim(i, m > 0 ? 1 : 0);
    this.sk.faces.setHidden(c.faces[0], c.faces[1], m > 0, 0);
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
