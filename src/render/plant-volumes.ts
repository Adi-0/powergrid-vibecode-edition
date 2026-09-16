/**
 * The power station as buildings, not as icons on a plan.
 *
 * The plant view was a site plan with flat screen-aligned glyphs pinned over
 * it: a trapezoid for a gas turbine, a striped rectangle for a boiler that is
 * twenty-six metres tall, four circles for a cooling tower. Functionally
 * correct and visually confusing, because nothing in it occupied any space —
 * the widths of the energy streams were doing all the work and the equipment
 * they ran between read as annotation.
 *
 * So each item is a VOLUME at its real size, built out of the primitives in
 * `volumes.ts`, the same way the substation yard is. What that buys is not
 * decoration: a combined-cycle station is a small number of very large objects
 * in a particular arrangement, and once they have size the arrangement becomes
 * the thing you can see — the turbine sitting between two boilers, the stacks
 * twice the height of anything else, the cooling tower off to one side because
 * it is the only part that has to be in open air.
 *
 * SIZES ARE THE ORDINARY ONES for a 600 MW combined-cycle plant. Where the data
 * gives a footprint it is used; where it gives a height it is the height at
 * which that item's energy stream connects, so the body is built around it and
 * the ducts meet the buildings where they should.
 */

import { Vector3 } from 'three';
import {
  Edge, Quad, v, boxEdges, post, gableEdges, prismEdges, ringEdges, drumEdges,
  louvreEdges, insulatorEdges, boxQuads, gableQuads, prismQuads,
} from './volumes.js';
import { PlantItem } from '../data/california/plant.js';

/**
 * The structure for one item, standing on the ground under `p`.
 *
 * `p.y` is where the item's energy stream connects — the flank of a turbine
 * enclosure, the side of a boiler, the top of a stack — so the streams land on
 * the buildings rather than passing through the air beside them.
 */
export function plantVolumeFor(item: PlantItem, p: Vector3): Edge[] {
  const [w, d] = item.sizeM ?? [10, 10];
  const g = (y: number): Vector3 => v(p.x, y, p.z);

  switch (item.kind) {
    case 'fuel': {
      // A metering and compression skid: a low building with two receivers
      // beside it and the pipe rack that feeds them.
      const out = boxEdges(g(0), w * 0.55, 5, d * 0.6);
      for (const dx of [-w * 0.34, -w * 0.18]) {
        out.push(...prismEdges(v(p.x + dx, 0, p.z + d * 0.42), 1.5, 7, 8));
      }
      for (const dz of [-d * 0.3, d * 0.3]) {
        out.push([v(p.x - w / 2, 3.4, p.z + dz), v(p.x + w / 2, 3.4, p.z + dz)]);
      }
      for (let i = -2; i <= 2; i++) {
        out.push(post(v(p.x + (i * w) / 5, 0, p.z - d * 0.3), 3.4));
      }
      return out;
    }

    case 'gas-turbine': {
      // The enclosure, the filter house that feeds it, and the exhaust it
      // leaves by. A gas turbine is never seen; what is seen is the acoustic
      // box round it and the enormous air intake on the end.
      const hallH = 11;
      const out = gableEdges(g(0), w * 0.66, hallH, d, 2.2);
      // Air intake: the filter house on the upstream end, taller than the
      // hall and sitting on the same slab. On legs it read as scaffolding.
      const fx = p.x - w * 0.42;
      out.push(...boxEdges(v(fx, 0, p.z), w * 0.2, 15, d * 0.8));
      out.push(...louvreEdges(v(fx, 8.5, p.z), w * 0.2, 6, d * 0.8, 3, 'z'));
      // The exhaust leaves the far end at the height its stream is drawn at.
      out.push(...boxEdges(
        v(p.x + w * 0.4, Math.max(1, p.y - 2.5), p.z), w * 0.16, 5, d * 0.55));
      return out;
    }

    case 'hrsg': {
      // A heat-recovery steam generator is a box of tube bundles two storeys
      // taller than the turbine hall beside it, with the horizontal banding of
      // its casing panels and the drum along the top.
      const h = Math.max(24, p.y + 10);
      const out = boxEdges(g(0), w, h, d);
      for (let i = 1; i <= 4; i++) {
        const y = (h * i) / 5;
        out.push([v(p.x - w / 2, y, p.z - d / 2), v(p.x + w / 2, y, p.z - d / 2)]);
        out.push([v(p.x - w / 2, y, p.z + d / 2), v(p.x + w / 2, y, p.z + d / 2)]);
      }
      // The steam drum along the top, which is what makes it a boiler.
      out.push(...drumEdges(v(p.x, h + 1.6, p.z), w * 0.8, 1.4));
      return out;
    }

    case 'stack': {
      // The tallest thing on the site, and the only one visible from the
      // motorway. Banded, because a steel stack is built in cans.
      const h = Math.max(30, p.y);
      const out = prismEdges(g(0), 2.6, h, 8, 2.2);
      for (const f of [0.35, 0.62, 0.85]) {
        out.push(...ringEdges(g(h * f), 2.6 - 0.4 * f, 8));
      }
      out.push(...ringEdges(g(h), 2.6, 8));
      return out;
    }

    case 'steam-turbine': {
      // A turbine hall: a long building with a gantry crane rail running its
      // length, because that crane is why the building is that shape.
      const hallH = 14;
      const out = gableEdges(g(0), w, hallH, d, 3);
      for (const dz of [-d / 2 + 1.2, d / 2 - 1.2]) {
        out.push([v(p.x - w / 2, hallH - 2.4, p.z + dz),
          v(p.x + w / 2, hallH - 2.4, p.z + dz)]);
      }
      return out;
    }

    case 'condenser': {
      // Under the turbine, and mostly under grade. Drawn as the shell it is,
      // sitting in its pit: the one piece of the cycle a visitor never sees
      // and the one that throws away half the fuel.
      // Just the shell and the lip of its pit. Posts down to the pit floor
      // were tried and read as four stray poles under the turbine hall.
      const out = drumEdges(v(p.x, -3.2, p.z), w * 0.8, 3.0);
      out.push(...boxEdges(v(p.x, -0.2, p.z), w, 0.2, d));
      return out;
    }

    case 'cooling-tower': {
      // A mechanical-draught cell bank: louvred air intakes all down the long
      // faces, a fan deck on top, one fan per cell. The most recognisable
      // object in a power station and the one the old drawing rendered as a
      // rectangle with four circles in it — which is exactly what it is, seen
      // from directly above and from nowhere else.
      const h = 15;
      const cells = 4;
      const out = boxEdges(g(0), w, h, d);
      out.push(...louvreEdges(g(1.5), w, h * 0.55, d, 5, 'x'));
      // The fan deck: one rail round the top and a fan ring per cell. A box
      // per cell was tried and came out as a stack of crates on a shed.
      out.push(...boxEdges(g(h), w, 1.6, d));
      for (let i = 0; i < cells; i++) {
        const x = p.x - w / 2 + (w * (i + 0.5)) / cells;
        out.push(...ringEdges(v(x, h + 1.6, p.z), d * 0.32, 10));
        out.push(...ringEdges(v(x, h + 1.6, p.z), d * 0.12, 6));
      }
      // The basin the water falls back into.
      out.push(...boxEdges(v(p.x, 0, p.z), w + 3, 1.2, d + 3));
      return out;
    }

    case 'generator': {
      // A horizontal cylinder on a plinth, in line with the turbine driving
      // it, with the exciter on the outboard end. Nothing else in a power
      // station looks remotely like this.
      const out = drumEdges(v(p.x, 3.4, p.z), 11, 2.2);
      out.push(...boxEdges(v(p.x, 0, p.z), 13, 1.2, 5.2));
      out.push(...drumEdges(v(p.x + 7.2, 3.4, p.z), 3, 1.1));
      return out;
    }

    case 'transformer': {
      // The same object the substation yard draws, drawn the same way: a tank
      // with a radiator bank down one side and bushings on the lid. A reader
      // who has been inside Eden Vale should recognise it here.
      const tankH = 4.2;
      const out = boxEdges(v(p.x, 0.5, p.z), 7.0, tankH, 3.8);
      out.push(...boxEdges(v(p.x, 1.1, p.z + 2.6), 5.6, 2.8, 0.6));
      for (let i = -2; i <= 2; i++) {
        out.push([v(p.x + i * 1.2, 1.2, p.z + 2.4), v(p.x + i * 1.2, 3.9, p.z + 2.4)]);
      }
      out.push(...insulatorEdges(v(p.x - 2.0, 0.5 + tankH, p.z), 3.4, 5));
      out.push(...insulatorEdges(v(p.x + 2.0, 0.5 + tankH, p.z), 1.6, 3));
      out.push(...boxEdges(v(p.x, 0, p.z), 7.8, 0.5, 4.6));
      return out;
    }

    case 'switchyard': {
      // Where the station stops and the grid starts: a fence, and three
      // take-off portals with the bus strung between them.
      const out: Edge[] = [];
      const busY = Math.max(7, p.y);
      const zs = [-d * 0.3, 0, d * 0.3];
      for (const dz of zs) {
        for (const dx of [-4, 4]) out.push(post(v(p.x + dx, 0, p.z + dz), busY));
        out.push([v(p.x - 4, busY, p.z + dz), v(p.x + 4, busY, p.z + dz)]);
        for (const dx of [-2, 0, 2]) {
          out.push(...insulatorEdges(v(p.x + dx, busY - 1.6, p.z + dz), 1.6, 3));
        }
      }
      // The bus itself, running the length of the yard at the top.
      for (const dx of [-2, 0, 2]) {
        out.push([v(p.x + dx, busY, p.z + zs[0]), v(p.x + dx, busY, p.z + zs[2])]);
      }
      return out;
    }

    default:
      return [];
  }
}


/**
 * The MASSES of an item — the faces that make it solid rather than wireframe.
 *
 * Only the primary body of each thing: the hall, the boiler, the tower, the
 * stack. The detail hung on it — drums, fan rings, louvres, bushings — stays
 * transparent, because at any scale where the detail is legible it is small
 * enough that seeing through it costs nothing, and washing every small part
 * would double the strokes to say the same thing.
 */
export function plantSolidsFor(item: PlantItem, p: Vector3): Quad[] {
  const [w, d] = item.sizeM ?? [10, 10];
  const g = (y: number): Vector3 => v(p.x, y, p.z);

  switch (item.kind) {
    case 'fuel':
      return boxQuads(g(0), w * 0.55, 5, d * 0.6);
    case 'gas-turbine':
      return [
        ...gableQuads(g(0), w * 0.66, 11, d, 2.2),
        ...boxQuads(v(p.x - w * 0.42, 0, p.z), w * 0.2, 15, d * 0.8),
      ];
    case 'hrsg':
      return boxQuads(g(0), w, Math.max(24, p.y + 10), d);
    case 'stack':
      return prismQuads(g(0), 2.6, Math.max(30, p.y), 8, 2.2);
    case 'steam-turbine':
      return gableQuads(g(0), w, 14, d, 3);
    case 'cooling-tower':
      return [
        ...boxQuads(g(0), w, 15, d),
        ...boxQuads(g(15), w, 1.6, d),
      ];
    case 'transformer':
      return boxQuads(v(p.x, 0.5, p.z), 7.0, 4.2, 3.8);
    default:
      return [];
  }
}
