/**
 * One synchronous generator, in cross-section.
 *
 * The deepest object on the generation branch, and the point of it is to make
 * one idea physical: the rotor's magnetic field sweeps past three stator
 * windings spaced 120° apart, and that is the entire reason the system is
 * three-phase, the entire reason frequency exists, and the entire reason the
 * load angle δ means what it means.
 *
 * WHY THIS ONE IS DRAWN SCREEN-ALIGNED. Everything else in the app is a place
 * with coordinates, so it is drawn in the isometric world. A machine
 * cross-section is not a place — it is a SECTION, a cut through something,
 * and every machine drawing ever made presents it square to the page. Laid
 * flat on the isometric ground plane it would shear into an ellipse, and a
 * sheared cross-section of a round machine is simply wrong. So it is built from
 * the camera's ground basis, the same device the substation's single-line
 * diagram uses, which keeps it square while leaving it in the world so that the
 * continuous zoom still works.
 *
 * WHAT MOVES. The rotor's angular position on the page is the LOAD ANGLE δ,
 * read out of the solved case. Load the machine harder and the rotor visibly
 * advances against the terminal voltage phasor, which is the thing that is hard
 * to believe until it is drawn.
 */

import { Vector3 } from 'three';
import { SolvedCase } from '../core/results.js';
import { Generator } from '../core/network.js';
import { operatingPoint, solvedOutput, MachineOperatingPoint } from '../core/machine.js';
import { plantGenerator, plantItemPosition } from './scene-plant.js';
import { plantItemById } from '../data/california/plant.js';
import { LineSegment } from './line-batch.js';
import { LabelSpec } from './labels.js';
import { IsoCamera } from './iso.js';
import { INK, SELECTION, LAYOUT } from './style.js';
import { PickTarget } from './scene-system.js';

/**
 * Where the machine is drawn: on the steam turbine generator's plinth.
 *
 * WHAT IT REPRESENTS IS THE WHOLE STATION. The network case carries one
 * generator for Metcalf, not three, because that is how a transmission model
 * treats a plant: from the system's point of view the station is a single
 * injection at a single bus, and its three machines are behind a switchyard
 * that the power flow never sees inside. So this drawing is the plant's
 * EQUIVALENT MACHINE — the parameters are the station's, and the cross-section
 * is what any one of its three generators looks like.
 *
 * That is a real modelling choice rather than a shortcut, and it is in the
 * honesty register as `plant-as-one-machine`.
 */
export const MACHINE_ITEM_ID = 'GEN_ST';

/** Where the machine sits in the world. */
export function machineCentre(): Vector3 {
  const item = plantItemById.get(MACHINE_ITEM_ID);
  return item ? plantItemPosition(item) : new Vector3();
}

/**
 * The radius of the drawing, in metres of on-screen length.
 *
 * A large turbogenerator's stator bore is about a metre and a quarter, and the
 * machine including its casing is three or four metres across. Drawing it at
 * eleven metres is an exaggeration, and it is the one place in the app where
 * that is the right thing to do: the subject here is the ARRANGEMENT of the
 * windings, not the size of the machine, and at true scale the air gap would be
 * a hairline nobody could see.
 */
const DRAWING_RADIUS_M = 11;

export interface MachineDrawOptions {
  selectedId?: string | null;
  hoveredId?: string | null;
  opacity?: number;
}

export interface MachineDrawResult {
  segments: LineSegment[];
  labels: LabelSpec[];
  picks: PickTarget[];
  /** The operating point the drawing was made from, for the panels. */
  operating: MachineOperatingPoint | null;
  generator: Generator | undefined;
}

interface Mark { seg: LineSegment; depth: number }

export function drawMachine(
  solved: SolvedCase,
  camera: IsoCamera,
  options: MachineDrawOptions = {}
): MachineDrawResult {
  const g = plantGenerator(solved);
  const alpha = options.opacity ?? 1;
  const marks: Mark[] = [];
  const labels: LabelSpec[] = [];
  const picks: PickTarget[] = [];

  if (!g) {
    return { segments: [], labels, picks, operating: null, generator: undefined };
  }

  const bus = solved.busById.get(g.bus);
  const out = solvedOutput(
    g, bus, solved.net.generators.filter((x) => x.bus === g.bus));
  const op = operatingPoint(g, bus?.vpu ?? 1, out.pMW, out.qMVAr);

  const centre = machineCentre();
  const basis = camera.groundBasis();
  const unitPx = DRAWING_RADIUS_M / camera.metresPerPixel;
  const dir = camera.direction;
  const depth = -(centre.x * dir.x + centre.z * dir.z) - 1e4;

  /** A point in the section, in units of the drawing radius, placed in the world. */
  const at = (x: number, y: number): [number, number, number] => {
    const sx = x * unitPx;
    const sy = -y * unitPx;      // section y is up; screen y is down
    return [
      centre.x + basis.rightX * sx + basis.downX * sy,
      0,
      centre.z + basis.rightZ * sx + basis.downZ * sy,
    ];
  };

  const fade = (s: LineSegment): LineSegment =>
    alpha >= 1 ? s : { ...s, opacity: (s.opacity ?? 1) * alpha };
  const line = (
    a: [number, number], b: [number, number], widthPx: number, color: string,
    dash?: [number, number]
  ) => {
    marks.push({
      seg: fade({
        a: at(a[0], a[1]), b: at(b[0], b[1]), widthPx, color,
        ...(dash ? { dash } : {}),
      }),
      depth,
    });
  };
  const arc = (
    r: number, fromDeg: number, toDeg: number, widthPx: number, color: string,
    steps = 48
  ) => {
    for (let i = 0; i < steps; i++) {
      const a0 = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
      const a1 = ((fromDeg + ((toDeg - fromDeg) * (i + 1)) / steps) * Math.PI) / 180;
      line(
        [r * Math.cos(a0), r * Math.sin(a0)],
        [r * Math.cos(a1), r * Math.sin(a1)],
        widthPx, color
      );
    }
  };

  // --- the stator -----------------------------------------------------------
  arc(1.0, 0, 360, 1.5, INK.ink);          // outside of the frame
  arc(0.80, 0, 360, 1.2, INK.ink);         // back of the core
  arc(0.52, 0, 360, 1.2, INK.ink);         // the bore
  arc(0.48, 0, 360, 1.0, INK.inkFaint);    // the air gap, drawn as a gap

  // --- the three phase windings, 120° apart ---------------------------------
  //
  // The spacing is the whole point. Three windings at 120° in space, fed by
  // three currents at 120° in time, produce a magnetic field of constant
  // magnitude rotating at synchronous speed — and run backwards, a rotating
  // field produces three voltages 120° apart. Everything else follows.
  const PHASES: { name: string; deg: number }[] = [
    { name: 'A', deg: 90 },
    { name: 'B', deg: 210 },
    { name: 'C', deg: 330 },
  ];
  for (const phase of PHASES) {
    for (const side of [-1, 1]) {
      // Each phase occupies a band of slots either side of its axis; a real
      // machine distributes them further still, which is in the honesty note.
      const a = ((phase.deg + side * 14) * Math.PI) / 180;
      for (const r of [0.56, 0.64, 0.72]) {
        const cx = r * Math.cos(a);
        const cy = r * Math.sin(a);
        const s = 0.035;
        line([cx - s, cy - s], [cx + s, cy + s], 1.1, INK.ink);
        line([cx - s, cy + s], [cx + s, cy - s], 1.1, INK.ink);
      }
    }
    const lx = 0.9 * Math.cos((phase.deg * Math.PI) / 180);
    const ly = 0.9 * Math.sin((phase.deg * Math.PI) / 180);
    labels.push({
      id: `machine:phase${phase.name}`,
      world: new Vector3(...at(lx, ly)),
      text: `Phase ${phase.name}`,
      value: `${phase.deg}° around the stator`,
      priority: 500,
      tone: 'muted',
    });
  }

  // --- the rotor, turned to the load angle ----------------------------------
  //
  // δ is the angle between the rotor's field axis and the terminal voltage
  // phasor. Drawing the rotor at that angle is not an illustration of the load
  // angle; it IS the load angle.
  const delta = op.deltaDeg;
  arc(0.44, 0, 360, 1.4, INK.ink);
  const rotorAxis = (deg: number, r0: number, r1: number, w: number, c: string) => {
    const a = (deg * Math.PI) / 180;
    line([r0 * Math.cos(a), r0 * Math.sin(a)], [r1 * Math.cos(a), r1 * Math.sin(a)], w, c);
  };
  // The field winding, as two coil sides on the direct axis.
  for (const side of [0, 180]) {
    for (const off of [-10, 10]) {
      rotorAxis(delta + 90 + side + off, 0.18, 0.40, 1.2, INK.ink);
    }
  }
  // The direct axis itself — the north–south line of the rotor's field.
  rotorAxis(delta + 90, 0, 0.44, 1.8, SELECTION.stroke);
  rotorAxis(delta - 90, 0, 0.44, 1.8, SELECTION.stroke);
  // The shaft.
  arc(0.07, 0, 360, 1.2, INK.ink);

  // --- the reference: where the terminal voltage phasor points --------------
  //
  // Straight up, by definition — V is the reference and δ is measured from it.
  rotorAxis(90, 0, 1.18, 1.0, INK.inkFaint);
  labels.push({
    id: 'machine:reference',
    world: new Vector3(...at(0, 1.24)),
    text: 'Terminal voltage V∠0',
    value: 'the reference the angle is measured from',
    priority: 820,
    tone: 'muted',
  });

  // The angle between them, drawn as an arc with the number on it.
  if (Math.abs(delta) > 0.5) {
    arc(1.06, Math.min(90, 90 + delta), Math.max(90, 90 + delta), 1.2, SELECTION.stroke, 24);
    const mid = ((90 + delta / 2) * Math.PI) / 180;
    labels.push({
      id: 'machine:delta',
      world: new Vector3(...at(1.14 * Math.cos(mid), 1.14 * Math.sin(mid))),
      text: 'Load angle δ',
      value: `${delta.toFixed(2)}° — how far the rotor leads`,
      priority: 940,
      tone: 'selected',
    });
  }

  // --- the direction of rotation -------------------------------------------
  //
  // Anticlockwise, which is the convention for a phasor and therefore for the
  // machine that produces one. The arrowhead is built from the TANGENT at the
  // end of the arc rather than from a fixed offset, or it points somewhere else
  // as soon as the arc moves.
  const rotationArrow = 150;
  const rotR = 1.22;
  arc(rotR, rotationArrow - 22, rotationArrow + 22, 1.0, INK.inkFaint, 16);
  {
    const a = ((rotationArrow + 22) * Math.PI) / 180;
    const tip: [number, number] = [rotR * Math.cos(a), rotR * Math.sin(a)];
    // The tangent to a circle at angle a, travelling anticlockwise.
    const tx = -Math.sin(a);
    const ty = Math.cos(a);
    const h = 0.09;
    for (const spread of [-0.45, 0.45]) {
      const bx = tx * Math.cos(spread) - ty * Math.sin(spread);
      const by = tx * Math.sin(spread) + ty * Math.cos(spread);
      line(tip, [tip[0] - h * bx, tip[1] - h * by], 1.0, INK.inkFaint);
    }
  }
  labels.push({
    id: 'machine:speed',
    world: new Vector3(...at(1.34 * Math.cos((rotationArrow * Math.PI) / 180),
      1.34 * Math.sin((rotationArrow * Math.PI) / 180))),
    text: '3,600 rev/min',
    value: 'two poles at 60 Hz — the rotor IS the frequency',
    priority: 900,
    tone: 'muted',
  });

  // --- what it is doing right now -------------------------------------------
  labels.push({
    id: `machine:${MACHINE_ITEM_ID}`,
    world: new Vector3(...at(0, -1.32)),
    text: `${g.name} — the station as one machine`,
    value:
      `${op.pMW.toFixed(0)} MW · ${op.qMVAr.toFixed(0)} MVAr · ` +
      `E = ${op.ePU.toFixed(3)} pu · δ = ${op.deltaDeg.toFixed(2)}°`,
    priority: 970,
    tone: 'normal',
  });

  picks.push({
    id: MACHINE_ITEM_ID, kind: 'site', world: centre.clone(),
    radiusPx: LAYOUT.pickRadiusPx * 3,
  });

  return {
    segments: marks.map((m) => m.seg),
    labels,
    picks,
    operating: op,
    generator: g,
  };
}

/** Bounds of the machine drawing, for culling. */
export function machineBounds(): {
  min: { x: number; z: number }; max: { x: number; z: number };
} {
  const c = machineCentre();
  const r = DRAWING_RADIUS_M * 2;
  return {
    min: { x: c.x - r, z: c.z - r },
    max: { x: c.x + r, z: c.z + r },
  };
}
