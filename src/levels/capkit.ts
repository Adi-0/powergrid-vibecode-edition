import type { Vec3 } from '../render/lines';
import { INK, INK_60, PEN } from '../render/style';
import { COMPONENTS } from '../data/components';
import { capDesign, type CapDesign } from '../model/capState';
import type { Sketch } from './sketch';
import { insulator, post, type KvClass } from './kit';

/**
 * Switched shunt banks, as a yard has them: a row of steps along a short bus on post
 * insulators, each step switched onto it on its own. A capacitor step is three stacks,
 * one per phase, of cans on insulated tiers; the cans of a tier are wired in series
 * groups of parallel cans, the tiers in series up the stack, the bottom of each stack
 * to the step's grounded neutral. A reactor step is three single-phase oil-filled
 * units. All in the sketch's plan (east, height, north), metres; the bank runs outward
 * along east (`s`) from where its lead arrives.
 */

type P3 = [number, number, number];

export interface ShuntStepDraw {
  /** Centre of the step along east. */
  e: number;
  /** The step's strokes (not its switches): drawn light while it is switched out. */
  lines: [number, number];
  /** Each phase's switch blade, closed and open: one of each pair shows. */
  closed: number[];
  open: number[];
}

export interface CanPlace {
  /** Bottom centre of the case; its step, phase (index into ns) and tier. */
  e: number;
  h: number;
  n: number;
  step: number;
  phase: number;
  tier: number;
  lines: [number, number];
  faces: [number, number];
}

export interface ShuntBankDraw {
  steps: ShuntStepDraw[];
  /** The order the steps switch in: nearest the viewer first (so the can drawn open is live whenever any step is). */
  order: number[];
  /** Everything the bank draws, from its lead to its last step. */
  lines: [number, number];
  faces: [number, number];
  /** Each phase's bus over the steps: from where the lead arrives to its far end. */
  stub: Array<[P3, P3]>;
  /** The can the bank opens into (capacitor banks: the nearest step's nearest phase, a middle tier, the end of the row). */
  can: CanPlace | null;
  /** The nearest step's stacks: their extent, for a level's fit. */
  near: P3[];
  /** The whole bank's extent. */
  all: P3[];
}

/** A capacitor step's dimensions at a voltage class. */
export function capGeom(k: KvClass): { d: CapDesign; rackE: number; rackN: number; pitchE: number; hBase: number; hTop: number; hStub: number } {
  const C = COMPONENTS.capacitor;
  const d = capDesign(k.kv);
  const c = C.can;
  const rackE = d.perTier * c.pitch + 0.3;
  const rackN = c.w + 0.3;
  const hBase = C.pedH + 0.45 * k.f;
  const hTop = hBase + (d.tiers - 1) * C.tierH + c.h + c.bush;
  return { d, rackE, rackN, pitchE: rackE + 2.4, hBase, hTop, hStub: hTop + 1.1 * k.f };
}

/** A single-phase shunt reactor's dimensions at a voltage class. */
export function reactorGeom(k: KvClass): { se: number; sn: number; sh: number; bush: number; hTop: number; pitchE: number; hStub: number } {
  const se = 1.6 * k.f;
  const sn = 1.0 * k.f;
  const sh = 1.3 * k.f;
  const bush = 2.2 * k.f;
  const hTop = 0.4 + sh + bush;
  return { se, sn, sh, bush, hTop, pitchE: se + 1.6 + 2.2, hStub: hTop + 1.1 * k.f };
}

const steel = { width: PEN.fine, color: INK_60 };
const thin = { width: PEN.thin, color: INK };
const fine = { width: PEN.fine, color: INK };

/**
 * One phase's stack of a capacitor step, standing on (e, n): a steel pedestal, base
 * insulators, then `tiers` frames each carrying a row of cans, insulated from the tier
 * below; bars along the row join the cans' terminals, a jumper takes the series string
 * up to the next tier. Returns every can's place (for the one a level opens into).
 */
function capStack(sk: Sketch, e: number, n: number, k: KvClass, step: number, phase: number, want: { tier: number; index: number } | null): CanPlace | null {
  const C = COMPONENTS.capacitor;
  const c = C.can;
  const g = capGeom(k);
  const P = (ee: number, h: number, nn: number): Vec3 => sk.plan(ee, h, nn);
  const hw = g.rackE / 2;
  const hn = g.rackN / 2;
  const corners: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  // pedestal: four legs and a frame
  for (const [a, b] of corners) sk.seg(P(e + a * hw * 0.8, 0, n + b * hn * 0.8), P(e + a * hw * 0.8, C.pedH, n + b * hn * 0.8), steel);
  sk.poly(corners.map(([a, b]) => P(e + a * hw * 0.8, C.pedH, n + b * hn * 0.8)), steel, true);
  for (const [a, b] of corners) insulator(sk, [e + a * hw * 0.8, C.pedH, n + b * hn * 0.8], [e + a * hw * 0.8, g.hBase, n + b * hn * 0.8], 0.09 * k.f);
  let found: CanPlace | null = null;
  for (let t = 0; t < g.d.tiers; t++) {
    const h0 = g.hBase + t * C.tierH;
    sk.poly(corners.map(([a, b]) => P(e + a * hw, h0, n + b * hn)), steel, true);
    const hb = h0 + c.h + c.bush;
    for (let i = 0; i < g.d.perTier; i++) {
      const ce = e - hw + 0.15 + (i + 0.5) * c.pitch;
      const l0 = sk.lines.count;
      const f0 = sk.faces.vertexCount;
      sk.box(ce, h0, n, c.t, c.h, c.w, thin);
      for (const sb of [-1, 1]) sk.seg(P(ce, h0 + c.h, n + (sb * c.w) / 4), P(ce, hb, n + (sb * c.w) / 4), fine);
      if (want && want.tier === t && want.index === i) found = { e: ce, h: h0, n, step, phase, tier: t, lines: [l0, sk.lines.count - l0], faces: [f0, sk.faces.vertexCount - f0] };
    }
    // the row's terminals joined: one bar over each line of terminals
    const ea = e - hw + 0.15 + 0.5 * c.pitch;
    const eb = e + hw - 0.15 - 0.5 * c.pitch;
    for (const sb of [-1, 1]) sk.seg(P(ea, hb, n + (sb * c.w) / 4), P(eb, hb, n + (sb * c.w) / 4), thin);
    if (t < g.d.tiers - 1) {
      // insulators up to the next tier's frame, and the string's jumper, at alternate ends
      for (const [a, b] of corners) insulator(sk, [e + a * hw, h0, n + b * hn], [e + a * hw, h0 + C.tierH, n + b * hn], 0.05 * k.f);
      const ej = t % 2 ? ea : eb;
      sk.seg(P(ej, hb, n + c.w / 4), P(ej, h0 + C.tierH, n + c.w / 4), thin);
    }
  }
  // the bottom of the string to the step's neutral
  sk.seg(P(e - hw + 0.15 + 0.5 * c.pitch, g.hBase, n - c.w / 4), P(e - hw + 0.15 + 0.5 * c.pitch, g.hBase - 0.25, n - c.w / 4), thin);
  return found;
}

/** A single-phase oil-filled shunt reactor standing on (e, n): tank, radiators toward +e, conservator, its bushing. Returns the bushing's top. */
function reactorUnit(sk: Sketch, e: number, n: number, k: KvClass): P3 {
  const g = reactorGeom(k);
  const P = (ee: number, h: number, nn: number): Vec3 => sk.plan(ee, h, nn);
  sk.box(e, 0, n, g.se + 0.8, 0.4, g.sn + 0.8, steel);
  sk.box(e, 0.4, n, g.se, g.sh, g.sn);
  // radiators along the +e end
  const fins = Math.max(3, Math.round(g.sn / 0.6));
  for (let i = 0; i < fins; i++) sk.box(e + g.se / 2 + 0.5, 0.9, n - g.sn / 2 + ((i + 0.5) * g.sn) / fins, 0.8, g.sh * 0.72, 0.1, { width: PEN.hairline, color: INK });
  // conservator across the lid at the −e end
  const lid = 0.4 + g.sh;
  const cr = 0.15 + 0.04 * g.sh;
  const ce = e - g.se / 2 + 0.3 + cr;
  for (const s of [-1, 1]) sk.seg(P(ce, lid, n + s * 0.25 * g.sn), P(ce, lid + 0.6, n + s * 0.25 * g.sn), thin);
  sk.box(ce, lid + 0.6, n, 2 * cr, 2 * cr, g.sn * 0.7, thin);
  // the line bushing, and the small neutral bushing to ground
  const top: P3 = [e + 0.15 * g.se, g.hTop, n];
  insulator(sk, [top[0], lid, n], top, 0.22 * k.f);
  const ne = e + 0.38 * g.se;
  insulator(sk, [ne, lid, n + 0.25 * g.sn], [ne, lid + 0.5 * k.f, n + 0.25 * g.sn], 0.08 * k.f);
  sk.poly([P(ne, lid + 0.5 * k.f, n + 0.25 * g.sn), P(ne + 0.9, lid + 0.5 * k.f, n + 0.25 * g.sn), P(ne + 0.9, 0, n + 0.25 * g.sn)], fine);
  return top;
}

/**
 * A switched shunt bank: `steps` steps in a row outward along east from e0 (s = ±1),
 * phases at `ns`, the lead in from `from` (the bank breaker's terminals). Capacitors
 * (`kind` 'cap') or reactors. `openCan`: record the can a level opens into.
 */
export function shuntBank(sk: Sketch, kind: 'cap' | 'reactor', e0: number, s: 1 | -1, ns: number[], k: KvClass, steps: number, from: P3[], widths: { bus: number; phase: number }): ShuntBankDraw {
  const P = (ee: number, h: number, nn: number): Vec3 => sk.plan(ee, h, nn);
  const L0 = sk.lines.count;
  const F0 = sk.faces.vertexCount;
  const cg = kind === 'cap' ? capGeom(k) : null;
  const rg = kind === 'reactor' ? reactorGeom(k) : null;
  const pitch = cg ? cg.pitchE : rg!.pitchE;
  const half = cg ? cg.rackE / 2 : rg!.se / 2 + 1.3;
  const hStub = cg ? cg.hStub : rg!.hStub;
  const hTop = cg ? cg.hTop : rg!.hTop;
  const eAt = (j: number) => e0 + s * (1.2 + half + j * pitch);
  const eEnd = eAt(steps - 1) + s * (half + 1.4);
  const stub: Array<[P3, P3]> = [];
  // the bus over the steps, on posts between them, and the lead up to it
  const posts = [e0, ...Array.from({ length: steps - 1 }, (_, j) => (eAt(j) + eAt(j + 1)) / 2), eEnd];
  ns.forEach((n, p) => {
    for (const pe of posts) post(sk, pe, n, hStub - 0.15, k.f);
    sk.seg(P(e0, hStub, n), P(eEnd, hStub, n), { width: widths.bus, color: INK });
    sk.seg(P(...from[p]!), P(e0, hStub, n), { width: widths.phase, color: INK });
    stub.push([[e0, hStub, n], [eEnd, hStub, n]]);
  });
  // the can a level opens into: nearest the viewer (least east and north), a middle tier
  const nearStep = s === 1 ? 0 : steps - 1;
  const nearPhase = ns.indexOf(Math.min(...ns));
  const out: ShuntStepDraw[] = [];
  let can: CanPlace | null = null;
  const near: P3[] = [];
  for (let j = 0; j < steps; j++) {
    const e = eAt(j);
    const l0 = sk.lines.count;
    ns.forEach((n, p) => {
      if (cg) {
        const want = j === nearStep && p === nearPhase ? { tier: Math.floor(cg.d.tiers / 2), index: 0 } : null;
        const got = capStack(sk, e, n, k, j, p, want);
        if (got) can = got;
      } else reactorUnit(sk, e - 0.15 * rg!.se, n, k);
    });
    if (cg) {
      // the step's neutral: the three stacks' bottoms joined, and down to ground
      const hN = cg.hBase - 0.25;
      const en = e - cg.rackE / 2 + 0.15 + 0.5 * COMPONENTS.capacitor.can.pitch;
      const nw = COMPONENTS.capacitor.can.w / 4;
      sk.seg(P(en, hN, Math.min(...ns) - nw), P(en, hN, Math.max(...ns) - nw), thin);
      const ng = Math.max(...ns) + cg.rackN;
      sk.poly([P(en, hN, Math.max(...ns) - nw), P(en, hN, ng), P(en, 0, ng)], thin);
      for (let i = 0; i < 3; i++) sk.seg(P(en - 0.3 + i * 0.1, 0, ng), P(en + 0.3 - i * 0.1, 0, ng), fine);
    }
    const lines: [number, number] = [l0, sk.lines.count - l0];
    // each phase's switch: a blade hung from the bus down to the step's terminal, or swung clear
    const closed: number[] = [];
    const open: number[] = [];
    const Lb = hStub - hTop;
    for (const n of ns) {
      closed.push(sk.seg(P(e, hStub, n), P(e, hTop, n), { width: widths.phase, color: INK }));
      const o = sk.seg(P(e, hStub, n), P(e + s * 0.8 * Lb, hStub - 0.45 * Lb, n), { width: widths.phase, color: INK });
      sk.lines.setAlpha(o, 0);
      open.push(o);
    }
    out.push({ e, lines, closed, open });
    if (j === nearStep) {
      const hw = cg ? cg.rackE / 2 : rg!.se / 2;
      const hn = cg ? cg.rackN / 2 : rg!.sn / 2;
      for (const ee of [e - hw, e + hw]) for (const nn of [Math.min(...ns) - hn, Math.max(...ns) + hn]) near.push([ee, 0, nn], [ee, hStub, nn]);
    }
  }
  const all: P3[] = [];
  const nLo = Math.min(...ns) - 1;
  const nHi = Math.max(...ns) + 1;
  for (const ee of [e0, eEnd]) for (const nn of [nLo, nHi]) all.push([ee, 0, nn], [ee, hStub, nn]);
  const order = out.map((_, j) => (s === 1 ? j : steps - 1 - j));
  return { steps: out, order, lines: [L0, sk.lines.count - L0], faces: [F0, sk.faces.vertexCount - F0], stub, can, near, all };
}

/**
 * Show a bank's steps as the solution has them: `inService` of them in (their
 * switches closed), in the bank's order, the rest out (switches open, drawn light).
 */
export function setShuntSteps(sk: Sketch, d: ShuntBankDraw, inService: number): void {
  d.order.forEach((j, rank) => {
    const st = d.steps[j]!;
    const on = rank < inService;
    for (let i = st.lines[0]; i < st.lines[0] + st.lines[1]; i++) sk.lines.setAlpha(i, on ? 1 : 0.35);
    for (const c of st.closed) sk.lines.setAlpha(c, on ? 1 : 0);
    for (const o of st.open) sk.lines.setAlpha(o, on ? 0 : 1);
  });
}
