/**
 * 14 Cherry Lane as a building with things bolted to it.
 *
 * The service view had the same problem the plant view had, in miniature: flat
 * screen-aligned symbols floating inside a ghost outline of a house, joined by
 * lines. Everything in it was correct and nothing in it was anywhere. A meter
 * is screwed to an outside wall at eye height; a panel hangs on an inside wall
 * two metres round the corner from it; a grounding electrode is a rod in the
 * dirt beside the foundation. Those facts are most of what a reader needs to
 * understand about a service, and none of them survive being drawn as icons.
 *
 * So the house is built — slab, four walls at real thickness, the roof frame
 * lifted off — and the equipment is built on its surfaces at real size.
 *
 * WHY THE ROOF COMES OFF AND THE WALLS DO NOT. The camera looks down from
 * thirty-five degrees. A wall 2.7 m high hides a strip of floor about 2.7 m
 * deep behind it and nothing further in, so with the roof removed every wall
 * can stay standing and the whole interior is still in view — which is why the
 * panel sits two metres inside the near wall rather than against it. That is
 * a cutaway that removes one plane instead of three, and it is the reason the
 * house still reads as a solid object rather than as three flats on a stage.
 *
 * WHAT THE READER CAN SEE IS A DESIGN CONSTRAINT, NOT AN ACCIDENT. Everything
 * in `SERVICE_NODES` is placed so that the camera can see it: the meter on the
 * outside of the wall that faces the viewer, the panel on the inside of the
 * wall that faces away, the receptacle on the far wall of the kitchen. Move
 * one of them to the wrong wall and it vanishes behind the wash, correctly.
 */

import { Vector3 } from 'three';
import {
  Edge, Quad, v, boxEdges, boxQuads, drumEdges, gableEdges, gableQuads,
} from './volumes.js';
import { ServiceNode } from '../data/california/service.js';

/**
 * The house, in metres east and north of the transformer pad.
 *
 * An ordinary 11 m square single-storey house with a gable running east–west.
 * The numbers are here rather than in the data file because this is scenery:
 * no calculation depends on any of it.
 */
export const HOUSE = {
  east: [10.4, 21.8] as [number, number],
  north: [3.0, 14.6] as [number, number],
  /** Top of the wall plate. */
  wallM: 2.7,
  /** Ridge, above grade. A 6-in-12 pitch, which is what a house has. */
  ridgeM: 5.3,
  /** How far the roof oversails the wall. Without it a roof is a lid. */
  eaveM: 0.45,
  /** Wall thickness — a 2×6 wall with its sheathing and cladding. */
  thickM: 0.22,
  /** The slab, which is what the whole thing stands on. */
  slabM: 0.25,
};

/** Outer face of the wall the service arrives at, metres north of the pad. */
export const SOUTH_WALL_N = HOUSE.north[0];
/** Inner face of the wall the panel hangs on, metres east of the pad. */
export const WEST_WALL_E = HOUSE.east[0] + HOUSE.thickM;
/** Inner face of the wall the kitchen receptacle is on. */
export const NORTH_WALL_N = HOUSE.north[1] - HOUSE.thickM;

/**
 * How big each built device actually is, in metres across.
 *
 * Used to decide when the drawing has to ALSO say what a thing is with its
 * standard symbol. A receptacle is ninety millimetres wide: there is a scale
 * at which drawing it at its real size is the truthful thing to do and no
 * scale at which four pixels of true size tells a reader it is a socket.
 */
export const DEVICE_SIZE_M: Record<string, number> = {
  PAD: 1.5,
  METER: 0.5,
  PANEL: 1.1,
  GROUND_ROD: 0.7,
  BRK_KITCHEN: 0.05,
  OUTLET: 0.12,
};

/** World point from metres east and north of the pad, at height `y`. */
const at = (o: Vector3, east: number, y: number, north: number): Vector3 =>
  v(o.x + east, y, o.z - north);

interface WallBox {
  /** Base centre. */ c: Vector3;
  wx: number; h: number; wz: number;
}

/** The four walls and the slab, as boxes, in world coordinates. */
function houseBoxes(o: Vector3): WallBox[] {
  const [e0, e1] = HOUSE.east;
  const [n0, n1] = HOUSE.north;
  const t = HOUSE.thickM;
  const h = HOUSE.wallM;
  const eMid = (e0 + e1) / 2;
  const nMid = (n0 + n1) / 2;
  const width = e1 - e0;
  const depth = n1 - n0;
  return [
    // The slab. Its top face is grade, which is what makes the floor opaque.
    { c: at(o, eMid, -HOUSE.slabM, nMid), wx: width + 0.3, h: HOUSE.slabM, wz: depth + 0.3 },
    // South and north walls run the full width; east and west fill between
    // them, so the corners meet instead of overlapping.
    { c: at(o, eMid, 0, n0 + t / 2), wx: width, h, wz: t },
    { c: at(o, eMid, 0, n1 - t / 2), wx: width, h, wz: t },
    { c: at(o, e0 + t / 2, 0, nMid), wx: t, h, wz: depth - 2 * t },
    { c: at(o, e1 - t / 2, 0, nMid), wx: t, h, wz: depth - 2 * t },
  ];
}

/** The edges of the slab and the four walls. */
export function houseShellEdges(o: Vector3): Edge[] {
  const out: Edge[] = [];
  for (const b of houseBoxes(o)) out.push(...boxEdges(b.c, b.wx, b.h, b.wz));
  return out;
}

/**
 * The floor, which is washed a shade darker than the paper.
 *
 * Every other solid in the atlas is filled with the ground colour, because the
 * fill is there to hide what is behind it and not to be seen. The floor of a
 * house is the exception worth making: a faint tone inside the walls is what
 * separates in from out at a glance, and without it a cutaway with its roof
 * off is four walls standing on the same blank paper as the lawn.
 */
export function houseFloorSolids(o: Vector3): Quad[] {
  const b = houseBoxes(o)[0];
  return boxQuads(b.c, b.wx, b.h, b.wz);
}

/** The walls, which are filled with the paper so that they hide things. */
export function houseWallSolids(o: Vector3): Quad[] {
  const out: Quad[] = [];
  for (const b of houseBoxes(o).slice(1)) out.push(...boxQuads(b.c, b.wx, b.h, b.wz));
  return out;
}

/**
 * The roof, lifted off: ridge, rafters, gable outlines, ceiling joists.
 *
 * Drawn as a frame and never filled, because a filled roof is an opaque lid
 * over the entire subject. A frame says the same thing — this is a house with
 * a pitched roof, and the cable in the ceiling runs between those joists — and
 * says it without hiding anything.
 */
export function houseRoofEdges(o: Vector3): Edge[] {
  const [e0, e1] = HOUSE.east;
  const [n0, n1] = HOUSE.north;
  const ov = HOUSE.eaveM;
  // The eave line: below the wall plate and outside it, which is the whole of
  // what makes a roof look like a roof rather than a lid on a box.
  const ye = HOUSE.wallM - 0.12;
  const yr = HOUSE.ridgeM;
  const nMid = (n0 + n1) / 2;
  const [w0, w1] = [e0 - ov, e1 + ov];
  const [s0, s1] = [n0 - ov, n1 + ov];
  const out: Edge[] = [[at(o, w0, yr, nMid), at(o, w1, yr, nMid)]];

  // The four eaves, as a rectangle hanging outside the walls.
  const eave: Vector3[] = [
    at(o, w0, ye, s0), at(o, w1, ye, s0), at(o, w1, ye, s1), at(o, w0, ye, s1),
  ];
  for (let i = 0; i < 4; i++) out.push([eave[i], eave[(i + 1) % 4]]);

  // The gable ends: the outline of the roof, seen end on.
  for (const [e, idx] of [[w0, 0], [w1, 1]] as [number, number][]) {
    const apex = at(o, e, yr, nMid);
    out.push([apex, eave[idx === 0 ? 0 : 1]]);
    out.push([apex, eave[idx === 0 ? 3 : 2]]);
  }
  return out;
}

/**
 * A door and two windows on the wall that faces the reader.
 *
 * Six rectangles. They carry no current and they are the difference between a
 * box with a roof on it and somebody's house — which matters here more than
 * anywhere else in the atlas, because the whole four-hundred-kilometre chain
 * exists to arrive at one of these.
 */
export function houseOpeningEdges(o: Vector3): Edge[] {
  const [, e1] = HOUSE.east;
  const n = HOUSE.north[0];
  const out: Edge[] = [];
  const onWall = (eA: number, eB: number, yA: number, yB: number): void => {
    const c = [
      at(o, eA, yA, n), at(o, eB, yA, n), at(o, eB, yB, n), at(o, eA, yB, n),
    ];
    for (let i = 0; i < 4; i++) out.push([c[i], c[(i + 1) % 4]]);
  };
  // The front door, at the end of the wall away from the meter, and its step.
  onWall(e1 - 2.5, e1 - 1.6, 0, 2.05);
  out.push([at(o, e1 - 2.7, 0.0, n - 0.6), at(o, e1 - 1.4, 0.0, n - 0.6)]);
  // Two windows, at the height windows are at.
  onWall(e1 - 5.6, e1 - 4.2, 0.95, 2.05);
  onWall(e1 - 8.2, e1 - 6.8, 0.95, 2.05);
  return out;
}

/**
 * The eleven other houses on this transformer, as one of them.
 *
 * A pad-mounted transformer is not a house's transformer; it is a street's.
 * The drawing said so in prose and showed a single lateral leaving a green
 * box into empty paper. One neighbour in outline and two more laterals
 * running off the edge of the page say it instead, and they fill the quarter
 * of the site that was blank lawn.
 */
export function neighbourEdges(o: Vector3): Edge[] {
  const [e0, e1] = NEIGHBOUR.east;
  const [n0, n1] = NEIGHBOUR.north;
  return gableEdges(
    at(o, (e0 + e1) / 2, 0, (n0 + n1) / 2),
    e1 - e0, NEIGHBOUR.wallM, n1 - n0, NEIGHBOUR.ridgeM - NEIGHBOUR.wallM);
}

const NEIGHBOUR = {
  east: [-1.2, 6.4] as [number, number],
  north: [9.4, 16.6] as [number, number],
  wallM: 2.6,
  ridgeM: 4.6,
};

/** The neighbour, filled, so it reads as a house and not as a cage. */
export function neighbourSolids(o: Vector3): Quad[] {
  const [e0, e1] = NEIGHBOUR.east;
  const [n0, n1] = NEIGHBOUR.north;
  return gableQuads(
    at(o, (e0 + e1) / 2, 0, (n0 + n1) / 2),
    e1 - e0, NEIGHBOUR.wallM, n1 - n0, NEIGHBOUR.ridgeM - NEIGHBOUR.wallM);
}

/** The laterals to the rest of the street, leaving the pad and running off. */
export function otherLateralEdges(o: Vector3): Edge[] {
  return [
    [at(o, 0, -0.55, 0), at(o, 3.2, -0.6, 8.6)],
    [at(o, 0, -0.55, 0), at(o, -3.8, -0.6, 2.6)],
  ];
}

/**
 * The street the pad-mounted transformer stands on the verge of.
 *
 * Two lines. It is here because a green box in an unbounded field of paper has
 * no scale and no reason to be where it is, and a kerb gives it both.
 */
export function vergeEdges(o: Vector3): Edge[] {
  const out: Edge[] = [];
  for (const n of [-1.1, -1.45]) {
    out.push([at(o, -4.5, 0, n), at(o, 25.5, 0, n)]);
  }
  // The path from the kerb to the front door, which is also the only thing on
  // the page that says which side of the house the front of it is.
  const e = HOUSE.east[1] - 2.05;
  for (const dx of [-0.55, 0.55]) {
    out.push([at(o, e + dx, 0, -1.1), at(o, e + dx, 0, HOUSE.north[0] - 0.6)]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

/**
 * The structure for one node of the service, at its world position `p`.
 *
 * `p` is the point the conductors land on — the transformer's secondary
 * terminals, the face of the meter, the front of the panel — so the wiring
 * meets the equipment rather than passing through the air near it.
 */
export function serviceVolumeFor(n: ServiceNode, p: Vector3, o: Vector3): Edge[] {
  switch (n.id) {
    case 'PAD': {
      // A 50 kVA pad-mount: a concrete plinth, a steel cabinet with two doors,
      // and the lid overhanging it. Chest height, and the size of a chest
      // freezer, which is the fact a reader takes away — the last transformer
      // in the chain is a piece of street furniture.
      const out = boxEdges(v(p.x, 0, p.z), 2.1, 0.22, 1.9);
      // NO TOP RING ON THE CABINET. Painter's order cannot separate two
      // surfaces eighty millimetres apart when the upper one also sticks out
      // sixty millimetres further, so the lid's fill kept losing to the rim
      // under it and the transformer read as an open crate. The lid supplies
      // that line, and it is thick enough to win everywhere.
      out.push(...boxEdges(v(p.x, 0.22, p.z), 1.5, 1.45, 1.15)
        .filter((_, i) => i < 4 || i >= 8));
      out.push(...boxEdges(v(p.x, 1.67, p.z), 1.62, 0.16, 1.27));
      // The doors, on the face that is toward the reader.
      const zf = p.z + 1.15 / 2;
      const d: [number, number][] = [[-0.65, 0.34], [0.65, 0.34], [0.65, 1.55], [-0.65, 1.55]];
      for (let i = 0; i < 4; i++) {
        const a = d[i];
        const b = d[(i + 1) % 4];
        out.push([v(p.x + a[0], a[1], zf), v(p.x + b[0], b[1], zf)]);
      }
      out.push([v(p.x, 0.34, zf), v(p.x, 1.55, zf)]);
      out.push([v(p.x - 0.14, 0.95, zf), v(p.x + 0.14, 0.95, zf)]);
      return out;
    }

    case 'LATERAL_MID': {
      // Not a thing but a depth. A trench drawn as a box read as a crate
      // buried in the lawn; what the drawing has to say here is six hundred
      // millimetres, so it says it with a dimension tick from grade down to
      // the cable and a short bar for grade itself.
      const out: Edge[] = [[v(p.x, 0, p.z), v(p.x, p.y, p.z)]];
      out.push([v(p.x - 0.45, 0, p.z), v(p.x + 0.45, 0, p.z)]);
      out.push([v(p.x - 0.22, p.y, p.z), v(p.x + 0.22, p.y, p.z)]);
      return out;
    }

    case 'METER': {
      // A form 2S socket on the outside wall, with the glass over the register.
      // It stands 0.28 m off the wall, which is why its own shadowless volume
      // reads as attached rather than as floating in front.
      const zw = o.z - SOUTH_WALL_N;
      const out = boxEdges(v(p.x, p.y - 0.26, zw + 0.09), 0.42, 0.52, 0.18);
      out.push(...drumEdges(v(p.x, p.y, zw + 0.30), 0.24, 0.16, 10, 'z'));
      // The register behind the glass.
      for (const dy of [-0.055, 0.055]) {
        out.push([v(p.x - 0.09, p.y + dy, zw + 0.42), v(p.x + 0.09, p.y + dy, zw + 0.42)]);
      }
      // The conduit the lateral rises in, from the trench to the socket.
      for (const dx of [-0.045, 0.045]) {
        out.push([v(p.x + dx, 0, zw + 0.09), v(p.x + dx, p.y - 0.26, zw + 0.09)]);
      }
      return out;
    }

    case 'PANEL': {
      // The load centre: an enclosure on the inside wall with its deadfront
      // cut away round two columns of breaker handles. Drawn at the size it
      // is — a bit over a metre tall — which is most of the reason the house
      // around it had to be built at the size it is.
      const xw = o.x + WEST_WALL_E;
      const out = boxEdges(v(xw + 0.07, p.y - 0.55, p.z), 0.14, 1.10, 0.42);
      const xf = xw + 0.14;
      const face: [number, number][] = [
        [-0.17, 0.87], [0.17, 0.87], [0.17, 1.83], [-0.17, 1.83],
      ];
      for (let i = 0; i < 4; i++) {
        const a = face[i];
        const b = face[(i + 1) % 4];
        out.push([v(xf, a[1], p.z + a[0]), v(xf, b[1], p.z + b[0])]);
      }
      // Two columns of handles, one per bus bar: the arrangement that makes a
      // breaker across both columns a 240 V circuit.
      for (let r = 0; r < 5; r++) {
        const y = 1.02 + r * 0.16;
        for (const s of [-1, 1]) {
          out.push([v(xf, y, p.z + s * 0.03), v(xf, y, p.z + s * 0.15)]);
        }
      }
      return out;
    }

    case 'GROUND_ROD': {
      // Two and a half metres of copper-clad steel, almost all of it in the
      // earth, with the clamp where the electrode conductor lands on it.
      const out: Edge[] = [];
      for (const dx of [-0.02, 0.02]) {
        out.push([v(p.x + dx, 0.10, p.z), v(p.x + dx, -2.30, p.z)]);
      }
      out.push(...boxEdges(v(p.x, -0.02, p.z), 0.10, 0.12, 0.10));
      return out;
    }

    case 'OUTLET': {
      // A device box in the wall and the plate over it. Nine centimetres
      // across: at this scale it is four pixels, which is exactly why the
      // NEMA face is also drawn beside it at a size a reader can read.
      const zw = o.z - NORTH_WALL_N;
      const out = boxEdges(v(p.x, p.y - 0.07, zw + 0.04), 0.09, 0.14, 0.08);
      out.push(...boxEdges(v(p.x, p.y - 0.095, zw + 0.085), 0.12, 0.19, 0.01));
      return out;
    }

    default:
      return [];
  }
}

/** The masses of the service equipment — what has to be opaque. */
export function serviceSolidsFor(n: ServiceNode, p: Vector3, o: Vector3): Quad[] {
  switch (n.id) {
    case 'PAD':
      return [
        ...boxQuads(v(p.x, 0, p.z), 2.1, 0.22, 1.9),
        ...boxQuads(v(p.x, 0.22, p.z), 1.5, 1.45, 1.15),
        ...boxQuads(v(p.x, 1.67, p.z), 1.62, 0.16, 1.27),
      ];
    case 'METER':
      return boxQuads(v(p.x, p.y - 0.26, o.z - SOUTH_WALL_N + 0.09), 0.42, 0.52, 0.18);
    case 'PANEL':
      return boxQuads(
        v(o.x + WEST_WALL_E + 0.07, p.y - 0.55, p.z), 0.14, 1.10, 0.42);
    default:
      return [];
  }
}
