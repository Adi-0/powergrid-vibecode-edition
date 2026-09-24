import type * as THREE from 'three';
import type { Vec3 } from '../render/lines';
import { INK, INK_35, INK_60, PEN, voltageClassFor, generatorClass, type VoltageClass } from '../render/style';
import type { IsoCamera } from '../render/iso';
import type { Grid } from '../model/grid';
import type { Snapshot } from '../model/snapshot';
import { machineOf } from '../model/machine';
import { CCGT } from '../model/ccgt';
import type { MachineRecord } from '../data/machines';
import { FLOW_SCALES, chevronSizeFor, chevronSpeedFor, type FrameInfo, type LabelSpec, type Level, type Selection } from './level';
import { NORTH_ISO, Sketch, enIso as en } from './sketch';

/**
 * The Machine level: one turbine generator, cut open, in metres.
 *
 * The turbine's shaft turns the rotor, whose field winding (fed by the exciter at the
 * far end) makes a magnetic field that sweeps the stator's three-phase winding and
 * induces the voltage E_f; the stator's terminals feed the isolated-phase bus to the
 * step-up transformer, and its neutral goes to ground through a grounding transformer
 * and resistor. Chevrons: mechanical power along the shaft in, electrical power out of
 * the terminals — the difference is the generator's own loss.
 */
const AX = 2.8; // shaft height
const STATOR = { e0: -4, e1: 4, r: 2.0, bore: 0.95 };
const ROTOR = { e0: -3.7, e1: 3.7, r: 0.75 };

export class MachineLevel implements Level {
  readonly kind = 'machine' as const;
  readonly unitKm = 0.001;
  readonly needsDetail = false;
  readonly flowScale = FLOW_SCALES.machine;
  readonly north = NORTH_ISO;
  readonly labels: LabelSpec[] = [];
  readonly sk = new Sketch(en);
  readonly rec: MachineRecord;
  /** The generator's centre: what the Plant level's generator unfolds into. */
  readonly origin: Vec3 = en(0, AX, 0);
  /** The ground under it: where this level sits in the plant. */
  readonly seat: Vec3 = en(0, 0, 0);
  private morphValue = 1;
  private genIndex: number;
  private shaftFlow = -1;
  private outFlows: number[] = [];
  private live: number[] = [];

  constructor(
    readonly grid: Grid,
    readonly genId: string,
  ) {
    const sk = this.sk;
    sk.anchor = this.origin;
    this.rec = machineOf(genId)!;
    this.genIndex = grid.gens.find((g) => g.id === genId)!.index;
    const thin = { width: PEN.thin, color: INK };

    // ---- foundation and pedestals
    sk.stagger = 0;
    sk.box(0, 0, 0, 16, 0.6, 5.5);
    for (const e of [-5, 5]) sk.box(e, 0.6, 0, 0.9, AX - 0.9, 1.4);

    // ---- the turbine end, broken off (it continues out of the sheet)
    sk.stagger = 0.05;
    sk.box(-12, 0.6, 0, 5, 4.2, 4.2);
    sk.poly([en(-14.5, 0.6, -2.1), en(-14.1, 2.7, -1.2), en(-14.7, 3.4, 0.4), en(-14.3, 4.8, 2.1)], { width: PEN.fine, color: INK_60 });
    this.labels.push({ id: 'eq:turbine', text: 'From the gas turbine', anchor: en(-12, 4.8, -2.1), priority: 6, minZoom: 0, kind: 'equip' });

    // ---- shaft, coupling
    sk.stagger = 0.12;
    const shaft = sk.cylinder(-9.5, 6.8, AX, 0, 0.22, thin);
    sk.cylinder(-7.4, -7.0, AX, 0, 0.6, thin);
    this.shaftFlow = sk.flowSeg(en(-9.4, AX + 0.23, 0), en(-4.1, AX + 0.23, 0));
    sk.target({ kind: 'equip', what: 'rotor', id: genId }, shaft);
    this.labels.push({ id: 'eq:shaft', text: 'Shaft and coupling', anchor: en(-7.2, AX + 0.6, 0), priority: 5, minZoom: 0, kind: 'equip' });

    // ---- rotor inside the stator; the stator cut open over the top toward the viewer
    sk.stagger = 0.2;
    const rot = sk.cylinder(ROTOR.e0, ROTOR.e1, AX, 0, ROTOR.r, { width: PEN.outline, color: INK });
    // the field winding's slots, along the rotor
    for (let k = 0; k < 6; k++) {
      const t = -Math.PI / 2 + (k * Math.PI) / 5;
      sk.seg(en(ROTOR.e0 + 0.3, AX + ROTOR.r * Math.cos(t), ROTOR.r * Math.sin(t)), en(ROTOR.e1 - 0.3, AX + ROTOR.r * Math.cos(t), ROTOR.r * Math.sin(t)), { width: PEN.hairline, color: INK_60 });
    }
    sk.target({ kind: 'equip', what: 'rotor', id: genId }, rot);
    this.labels.push({ id: 'eq:rotor', text: 'Rotor (field winding)', anchor: en(-1, AX + ROTOR.r, -0.3), priority: 8, minZoom: 0, kind: 'equip' });
    sk.stagger = 0.28;
    const stator = sk.cylinder(STATOR.e0, STATOR.e1, AX, 0, STATOR.r, { width: PEN.outline, color: INK }, { cut: [-Math.PI / 2 - 0.05, -0.08], inner: STATOR.bore });
    // stator winding's end turns, just beyond the core at each end
    for (const e of [STATOR.e0 - 0.25, STATOR.e1 + 0.25]) {
      const pts: Vec3[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = -0.08 + ((2 * Math.PI - Math.PI / 2 + 0.03) * i) / 24;
        pts.push(en(e, AX + 1.25 * Math.cos(t), 1.25 * Math.sin(t)));
      }
      sk.poly(pts, { width: PEN.fine, color: INK });
    }
    sk.target({ kind: 'equip', what: 'stator', id: genId }, stator);
    this.labels.push({ id: 'eq:stator', text: 'Stator (three-phase winding)', anchor: en(2.5, AX + STATOR.r, 1.2), priority: 8, minZoom: 0, kind: 'equip' });

    // ---- exciter at the far end
    sk.stagger = 0.34;
    const ex = sk.cylinder(5.3, 6.6, AX, 0, 0.95, thin);
    sk.target({ kind: 'equip', what: 'exciter', id: genId }, ex);
    this.labels.push({ id: 'eq:exciter', text: 'Exciter', anchor: en(6, AX + 0.95, 0.4), priority: 6, minZoom: 0, kind: 'equip' });

    // ---- terminals: three phase leads up into the isolated-phase bus, on to the GSU
    sk.stagger = 0.4;
    const ipb = { e0: 3, e1: 16, h: 6.2 };
    // the leads leave the top of the frame on its north side (the south-top quarter is cut away)
    const phases = [0.35, 0.95, 1.5];
    const top = (dn: number) => AX + Math.sqrt(STATOR.r * STATOR.r - dn * dn);
    phases.forEach((dn) => {
      sk.seg(en(3.2, top(dn), dn), en(3.2, ipb.h - 0.6, dn), { width: PEN.medium, color: INK });
    });
    sk.box((ipb.e0 + ipb.e1) / 2 + 1.6, ipb.h - 0.6, 0.95, ipb.e1 - ipb.e0 - 3.2, 1.2, 2.6);
    this.outFlows.push(sk.flowSeg(en(4.8, ipb.h + 0.61, 0.95), en(ipb.e1, ipb.h + 0.61, 0.95)));
    sk.target({ kind: 'equip', what: 'terminals', id: genId }, [en(3.2, AX, 0), en(3.2, ipb.h, 0), en(ipb.e1, ipb.h, 0)]);
    this.labels.push({ id: 'eq:ipb', text: 'Isolated-phase bus, to the step-up transformer', anchor: en(ipb.e1, ipb.h + 0.6, 0), priority: 7, minZoom: 0, kind: 'equip' });

    // ---- neutral: the three phases' star point to ground through a grounding transformer and resistor
    sk.stagger = 0.46;
    phases.forEach((dn) => sk.seg(en(-3.2, top(dn), dn), en(-3.2, 5.6, dn), { width: PEN.thin, color: INK }));
    sk.seg(en(-3.2, 5.6, phases[0]!), en(-3.2, 5.6, 4.4), { width: PEN.thin, color: INK });
    sk.seg(en(-3.2, 5.6, 4.4), en(-3.2, 1.9, 4.4), { width: PEN.thin, color: INK });
    const ng = sk.box(-3.2, 0.6, 4.4, 1.4, 1.3, 1.4);
    sk.target({ kind: 'equip', what: 'neutral', id: genId }, ng, true);
    this.labels.push({ id: 'eq:neutral', text: 'Neutral grounding', anchor: en(-3.2, 1.9, 5.1), priority: 5, minZoom: 0, kind: 'equip' });
    sk.stagger = 0;
    this.live = [];
    sk.commit();
  }

  get name(): string {
    return this.rec.name;
  }

  get group(): THREE.Group {
    return this.sk.group;
  }

  get classes(): VoltageClass[] {
    return [generatorClass(this.rec.kv)];
  }

  applySnapshot(s: Snapshot): void {
    const sk = this.sk;
    const none = s.outcome === 'none';
    const sc = this.flowScale;
    const on = !none && s.genOnline[this.genIndex] === 1;
    const P = on ? s.pg[this.genIndex]! : 0;
    const set = (f: number, mw: number) =>
      sk.flow.set(f, { sizePx: chevronSizeFor(mw, sc), speed: chevronSpeedFor(mw, sc) * Math.sign(mw), side: 0, color: INK, alpha: on && Math.abs(mw) > 1e-3 ? 1 : 0 });
    set(this.shaftFlow, P / CCGT.etaGen); // shaft power: what the terminals deliver plus the generator's loss
    for (const f of this.outFlows) set(f, P);
    for (const seg of this.live) sk.lines.setColor(seg, on ? INK : INK_35, 1);
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
    return [en(-15, 0, -3), en(17, 0, -3), en(17, 0, 5.5), en(-15, 0, 5.5), en(-15, 7, -3), en(17, 7, 5.5)];
  }
}
