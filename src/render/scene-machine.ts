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
import { INK, LAYOUT } from './style.js';
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
  // --- the stator core, in section -----------------------------------------
  //
  // WHAT WAS WRONG WITH THE OLD DRAWING. Six concentric circles of the same
  // weight with eighteen little crosses floating between them: a target, not a
  // machine. Nothing was filled, so nothing was solid; the coil sides sat in
  // the middle of the iron rather than in slots; and the one part that moves
  // was a blue line, in an app where colour is reserved for something being
  // wrong.
  //
  // A machine section is one of the most standardised drawings in engineering
  // and it has a settled vocabulary: iron is hatched, slots are cut into the
  // bore, conductors are marked for which way the current goes, and axes are
  // chain lines. Using it costs nothing and is worth more than any amount of
  // invention, because a reader who has ever seen one recognises this at once
  // and a reader who has not is learning the real one.
  const FRAME_R = 1.0;
  const CORE_R = 0.92;
  const SLOT_BOTTOM_R = 0.74;
  const BORE_R = 0.62;
  const ROTOR_R = 0.56;
  const SHAFT_R = 0.10;

  const circle = (
    r: number, widthPx: number, color: string, dash?: [number, number]
  ): void => {
    const steps = 72;
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      line([r * Math.cos(a0), r * Math.sin(a0)],
        [r * Math.cos(a1), r * Math.sin(a1)], widthPx, color, dash);
    }
  };
  const polar = (deg: number, r: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  };
  const radial = (
    deg: number, r0: number, r1: number, widthPx: number, color: string,
    dash?: [number, number]
  ): void => line(polar(deg, r0), polar(deg, r1), widthPx, color, dash);

  // The casing, and the back of the core inside it.
  circle(FRAME_R, 1.6, INK.ink);
  circle(CORE_R, 1.2, INK.ink);

  // IRON IS HATCHED. Parallel lines at 45°, clipped to the annulus of the
  // core, which is how every sectional drawing since the nineteenth century
  // says "you are looking at a cut through solid metal".
  {
    const step = 0.052;
    const n = Math.ceil((CORE_R * 2) / step);
    for (let i = -n; i <= n; i++) {
      // A line at 45°: points where u is the offset along the perpendicular.
      const u = i * step;
      // Intersections of that line with a circle of radius r, in the rotated
      // frame where the line is horizontal.
      const cut = (r: number): number | null =>
        r * r - u * u > 0 ? Math.sqrt(r * r - u * u) : null;
      const outer = cut(CORE_R);
      if (outer === null) continue;
      const inner = cut(SLOT_BOTTOM_R);
      // Rotate (v, u) by 45° to get back to drawing coordinates.
      const c = Math.SQRT1_2;
      const pt = (v: number): [number, number] => [c * (v - u), c * (v + u)];
      const spans: [number, number][] = inner === null
        ? [[-outer, outer]]
        : [[-outer, -inner], [inner, outer]];
      for (const [v0, v1] of spans) {
        line(pt(v0), pt(v1), 0.55, INK.inkFaint);
      }
    }
  }

  // --- the slots, and the three phase windings in them ----------------------
  //
  // TWELVE SLOTS, TWO POLES, THREE PHASES, which divides exactly: each phase
  // gets two slots under each pole. That is the smallest winding that is a
  // real one rather than a diagram of one, and the arithmetic is the whole
  // lesson — three windings 120° apart in SPACE, fed by three currents 120°
  // apart in TIME, make a field of constant size going round at synchronous
  // speed. Run it backwards and the same arrangement makes the three voltages.
  const SLOTS = 12;
  const SLOT_HALF_DEG = 7;
  const PHASES: { name: string; deg: number }[] = [
    { name: 'A', deg: 90 },
    { name: 'B', deg: 210 },
    { name: 'C', deg: 330 },
  ];

  /** Which phase a slot belongs to, and which way its current runs. */
  const slotPhase = (deg: number): { name: string; into: boolean } => {
    for (const p of PHASES) {
      const d = (((deg - p.deg) % 360) + 360) % 360;
      if (d < 25 || d > 335) return { name: p.name, into: true };
      if (Math.abs(d - 180) < 25) return { name: p.name, into: false };
    }
    return { name: '?', into: true };
  };

  for (let i = 0; i < SLOTS; i++) {
    const deg = 15 + i * (360 / SLOTS);
    // The slot: two sides and a bottom, open to the bore.
    radial(deg - SLOT_HALF_DEG, BORE_R, SLOT_BOTTOM_R, 1.0, INK.ink);
    radial(deg + SLOT_HALF_DEG, BORE_R, SLOT_BOTTOM_R, 1.0, INK.ink);
    for (let k = 0; k < 6; k++) {
      const a0 = deg - SLOT_HALF_DEG + (2 * SLOT_HALF_DEG * k) / 6;
      const a1 = deg - SLOT_HALF_DEG + (2 * SLOT_HALF_DEG * (k + 1)) / 6;
      line(polar(a0, SLOT_BOTTOM_R), polar(a1, SLOT_BOTTOM_R), 1.0, INK.ink);
    }

    // THE CONDUCTOR IN IT, marked the way every winding diagram marks one: a
    // cross for current going into the page, a dot for current coming out.
    // Those two symbols are the reason the drawing can show a winding at all
    // — a coil is a loop, and a section through a loop is two conductors with
    // the current going opposite ways.
    const { into } = slotPhase(deg);
    const [cx, cy] = polar(deg, (BORE_R + SLOT_BOTTOM_R) / 2);
    const rad = 0.036;
    for (let k = 0; k < 14; k++) {
      const a0 = (k / 14) * Math.PI * 2;
      const a1 = ((k + 1) / 14) * Math.PI * 2;
      line([cx + rad * Math.cos(a0), cy + rad * Math.sin(a0)],
        [cx + rad * Math.cos(a1), cy + rad * Math.sin(a1)], 1.0, INK.ink);
    }
    if (into) {
      const d = rad * Math.SQRT1_2;
      line([cx - d, cy - d], [cx + d, cy + d], 1.0, INK.ink);
      line([cx - d, cy + d], [cx + d, cy - d], 1.0, INK.ink);
    } else {
      line([cx - 0.004, cy], [cx + 0.004, cy], 3.2, INK.ink);
    }
  }

  // The bore, and the rotor face across the air gap. Two circles close
  // together with nothing between them IS the air gap, and the gap is where
  // every watt the machine makes is transferred.
  circle(BORE_R, 1.2, INK.ink);
  circle(ROTOR_R, 1.4, INK.ink);

  // --- the rotor, turned to the load angle ----------------------------------
  //
  // A two-pole round rotor: a forging with the field winding in slots over
  // part of its circumference and two unslotted POLE FACES opposite each
  // other. The pole faces are heavier, because that is where the flux leaves
  // and enters, and they are what the load angle is measured to.
  //
  // δ is the angle between the rotor's field axis and the terminal voltage
  // phasor. Drawing the rotor at that angle is not an illustration of the
  // load angle; it IS the load angle.
  const delta = op.deltaDeg;
  const dAxis = 90 + delta;

  for (const pole of [0, 180]) {
    // The pole face: a heavier arc centred on the direct axis.
    const from = dAxis + pole - 38;
    const to = dAxis + pole + 38;
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const a0 = from + ((to - from) * i) / steps;
      const a1 = from + ((to - from) * (i + 1)) / steps;
      line(polar(a0, ROTOR_R), polar(a1, ROTOR_R), 2.6, INK.ink);
    }
    // The field winding: three slots each side of the pole face, with the
    // current going in on one side of the rotor and out on the other, which is
    // what makes one end of it north and the other south.
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const deg = dAxis + pole + s * (48 + k * 13);
        const [fx, fy] = polar(deg, ROTOR_R - 0.075);
        const rad = 0.026;
        for (let j = 0; j < 10; j++) {
          const a0 = (j / 10) * Math.PI * 2;
          const a1 = ((j + 1) / 10) * Math.PI * 2;
          line([fx + rad * Math.cos(a0), fy + rad * Math.sin(a0)],
            [fx + rad * Math.cos(a1), fy + rad * Math.sin(a1)], 0.9, INK.ink);
        }
        // WHICH SIDE OF THE DIRECT AXIS, not which pole. The field is one
        // coil: the current goes down every conductor on one side of the
        // rotor and back up every conductor on the other, and that is the
        // whole of why one end is north and the other south. Splitting it by
        // pole instead put crosses on both sides of the same pole, which is a
        // coil that cannot exist.
        const into = Math.sin(((deg - dAxis) * Math.PI) / 180) > 0;
        if (into) {
          const d = rad * Math.SQRT1_2;
          line([fx - d, fy - d], [fx + d, fy + d], 0.9, INK.ink);
          line([fx - d, fy + d], [fx + d, fy - d], 0.9, INK.ink);
        } else {
          line([fx - 0.003, fy], [fx + 0.003, fy], 2.4, INK.ink);
        }
      }
    }
  }

  // The shaft, and the direct axis through it.
  circle(SHAFT_R, 1.2, INK.ink);

  // AXES ARE CHAIN LINES. A long dash is what a drawing office uses for a
  // centre line, and using it here means the two lines that are not parts of
  // the machine cannot be mistaken for parts of the machine.
  const CHAIN: [number, number] = [11, 5];
  radial(dAxis, 0, FRAME_R + 0.34, 1.4, INK.ink, CHAIN);
  radial(dAxis + 180, 0, ROTOR_R + 0.12, 1.4, INK.ink, CHAIN);

  // --- the reference: where the terminal voltage phasor points --------------
  //
  // Straight up, by definition — V is the reference and δ is measured from it.
  radial(90, 0, FRAME_R + 0.34, 1.0, INK.inkFaint, CHAIN);
  labels.push({
    id: 'machine:reference',
    world: new Vector3(...at(0.02, FRAME_R + 0.42)),
    text: 'Terminal voltage V∠0',
    value: 'the reference the angle is measured from',
    priority: 820,
    tone: 'muted',
  });

  // --- δ, drawn as a dimension ---------------------------------------------
  //
  // An arc between the two axes with a tick on each end, which is how an angle
  // is dimensioned on any drawing. The old version was a bare 16° smear of
  // colour on the outside of the frame and read as a stray mark.
  if (Math.abs(delta) > 0.4) {
    // OUTSIDE THE IRON. Drawn across the hatched core the arc read as a part
    // of the machine; outside everything it reads as what it is, a dimension
    // between two axes.
    const rArc = FRAME_R + 0.26;
    const from = Math.min(90, dAxis);
    const to = Math.max(90, dAxis);
    const steps = 28;
    for (let i = 0; i < steps; i++) {
      const a0 = from + ((to - from) * i) / steps;
      const a1 = from + ((to - from) * (i + 1)) / steps;
      line(polar(a0, rArc), polar(a1, rArc), 1.3, INK.ink);
    }
    for (const end of [from, to]) {
      line(polar(end, rArc - 0.035), polar(end, rArc + 0.035), 1.3, INK.ink);
    }
    const mid = 90 + delta / 2;
    labels.push({
      id: 'machine:delta',
      world: new Vector3(...at(...polar(mid, rArc + 0.14))),
      text: 'Load angle δ',
      value: `${delta.toFixed(2)}° — how far the rotor leads`,
      priority: 940,
      tone: 'normal',
    });
  }

  // The phase names, outside the casing so they are never written on it.
  for (const phase of PHASES) {
    labels.push({
      id: `machine:phase${phase.name}`,
      world: new Vector3(...at(...polar(phase.deg, FRAME_R + 0.16))),
      text: `Phase ${phase.name}`,
      value: `${phase.deg}° around the stator`,
      priority: 500,
      tone: 'muted',
    });
  }

  // --- the direction of rotation -------------------------------------------
  //
  // Anticlockwise, which is the convention for a phasor and therefore for the
  // machine that produces one. The arrowhead is built from the TANGENT at the
  // end of the arc rather than from a fixed offset, or it points somewhere else
  // as soon as the arc moves.
  const rotationArrow = 152;
  const rotR = FRAME_R + 0.10;
  {
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const a0 = rotationArrow - 20 + (40 * i) / steps;
      const a1 = rotationArrow - 20 + (40 * (i + 1)) / steps;
      line(polar(a0, rotR), polar(a1, rotR), 1.0, INK.inkFaint);
    }
    const a = ((rotationArrow + 20) * Math.PI) / 180;
    const tip: [number, number] = [rotR * Math.cos(a), rotR * Math.sin(a)];
    const tx = -Math.sin(a);
    const ty = Math.cos(a);
    const h = 0.075;
    for (const spread of [-0.45, 0.45]) {
      const bx = tx * Math.cos(spread) - ty * Math.sin(spread);
      const by = tx * Math.sin(spread) + ty * Math.cos(spread);
      line(tip, [tip[0] - h * bx, tip[1] - h * by], 1.0, INK.inkFaint);
    }
  }
  labels.push({
    id: 'machine:speed',
    world: new Vector3(...at(...polar(rotationArrow, rotR + 0.16))),
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
