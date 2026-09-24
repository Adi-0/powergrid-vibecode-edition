import type * as THREE from 'three';
import type { IsoCamera } from '../render/iso';
import type { Vec3 } from '../render/lines';
import type { VoltageClass } from '../render/style';
import type { Snapshot } from '../model/snapshot';

/**
 * What every level of the zoom tree provides. Each level draws in its own frame
 * (kilometres for System and Region, metres below), and the app hands the camera from
 * one frame to the next during a transition.
 */
export type LevelKind = 'system' | 'region' | 'site' | 'substation' | 'feeder' | 'service' | 'plant' | 'machine' | 'transformer' | 'breaker' | 'poletop' | 'span' | 'capacitor' | 'capunit' | 'regulator' | 'inverter';

export type Selection =
  | { kind: 'site'; id: string }
  | { kind: 'branch'; index: number }
  | { kind: 'plant'; id: string }
  /**
   * Something below the transmission system, by its id in the distribution model: a
   * substation's equipment, a feeder's branch or node, a pole-top transformer, a home,
   * the outlet.
   */
  | { kind: 'dist'; id: string; what: DistWhat }
  /** Plant and machine equipment: by generator id (plant-unit) or plant id. */
  | { kind: 'equip'; id: string; what: EquipWhat }
  /** A part of a component opened up (a transformer's core, a winding…): by the component's key. */
  | { kind: 'part'; id: string; what: PartWhat; sub?: string };

export type PartWhat = 'core' | 'winding' | 'bushing' | 'tapchanger' | 'radiator' | 'conservator' | 'tank' | 'fixed' | 'moving' | 'rod' | 'ct' | 'mechanism' | 'conductor' | 'tower' | 'stack' | 'switch' | 'bus' | 'case' | 'element' | 'resistor' | 'plate' | 'film' | 'unit' | 'dial' | 'shunt' | 'series' | 'selector' | 'reversing' | 'preventive' | 'control' | 'bypass' | 'dcin' | 'dclink' | 'bridge' | 'filter' | 'relay';

export type EquipWhat = 'bus' | 'gsu' | 'generator' | 'turbine' | 'hrsg' | 'stack' | 'condenser' | 'fuel' | 'stator' | 'rotor' | 'exciter' | 'neutral' | 'terminals';

export type DistWhat = 'bank' | 'bus60' | 'bus12' | 'breaker' | 'feeder' | 'line' | 'device' | 'transformer' | 'home' | 'outlet' | 'node';

export interface LabelSpec {
  id: string;
  text: string;
  anchor: Vec3;
  priority: number;
  /** Minimum zoom (px per frame unit) at which the label may show. */
  minZoom: number;
  kind: 'site' | 'plant' | 'region' | 'sea' | 'layer' | 'exit' | 'equip' | 'street';
  /** Provenance of any figures in the text (e.g. "500 kV" on a layer). */
  prov?: string;
}

export interface FrameInfo {
  width: number;
  height: number;
  pixelRatio: number;
  pxPerUnit: number;
  time: number;
}

/** How chevrons are scaled on a level: `perPx` of `unit` per pixel of chevron. */
export interface FlowScale {
  unit: 'MW' | 'kW' | 'W';
  perPx: number;
  /** Speed: `unit` per (px/s). */
  perSpeed: number;
  /** Flows the key draws samples for. */
  samples: number[];
}

export interface Level {
  readonly kind: LevelKind;
  readonly name: string;
  readonly group: THREE.Group;
  readonly labels: LabelSpec[];
  /** Kilometres per unit of this level's frame (1 for km, 0.001 for metres). */
  readonly unitKm: number;
  /** Whether this level draws the Evergreen substation and feeder (a coupled solve). */
  readonly needsDetail: boolean;
  readonly flowScale: FlowScale;
  /** North as a unit vector in the frame's ground plane (x, z) — for the north arrow. */
  readonly north: [number, number];
  applySnapshot(s: Snapshot): void;
  /** Focus and context; returns the site or element ids that stay (for labels). */
  highlight(sel: Selection | null): Set<string> | null;
  pick(sx: number, sy: number, cam: IsoCamera): Selection | null;
  frame(o: FrameInfo): void;
  /** 0: folded into the node it occupies above; 1: unfolded. */
  morph: number;
  /** Points in this level's frame the camera fits on arrival. */
  fitPoints(): Vec3[];
  /** Voltage classes drawn (for the key). */
  readonly classes: VoltageClass[];
  /**
   * The ground point (y = 0) of this frame that sits on the node it unfolds from, one
   * level up. (Its drawing folds toward its own collapse point, near it.)
   */
  readonly seat: Vec3;
  /**
   * Circuits of the System that end inside this level's drawing: where each leaves it,
   * on its true bearing (a ground point in this frame), and when that stroke unfolds.
   * The System's own stroke gives way to it there.
   */
  exits?(): Array<{ branch: number; at: Vec3; stagger: number }>;
  /**
   * A level below is unfolding in place of something this one draws (its footprint):
   * `m` from 0 (not open: draw it) to 1 (fully unfolded: the level below draws it).
   */
  yieldTo?(key: string, m: number): void;
}

/** Flow scales, one per kind of level, so a chevron's size always means the same per level. */
export const FLOW_SCALES: Record<LevelKind, FlowScale> = {
  system: { unit: 'MW', perPx: 120, perSpeed: 40, samples: [500, 2000] },
  region: { unit: 'MW', perPx: 120, perSpeed: 40, samples: [500, 2000] },
  // the System's own scale: a circuit's chevrons keep their size as its yard unfolds
  site: { unit: 'MW', perPx: 120, perSpeed: 40, samples: [500, 2000] },
  substation: { unit: 'MW', perPx: 1.5, perSpeed: 0.5, samples: [5, 20] },
  feeder: { unit: 'kW', perPx: 150, perSpeed: 50, samples: [200, 2000] },
  service: { unit: 'kW', perPx: 2.5, perSpeed: 0.8, samples: [5, 25] },
  plant: { unit: 'MW', perPx: 25, perSpeed: 8, samples: [100, 400] },
  machine: { unit: 'MW', perPx: 10, perSpeed: 3, samples: [50, 150] },
  // heat carried by a transformer's oil
  transformer: { unit: 'kW', perPx: 40, perSpeed: 12, samples: [100, 500] },
  // real power through one pole (one phase of three)
  breaker: { unit: 'MW', perPx: 12, perSpeed: 4, samples: [30, 150] },
  // a service's scale: each leg's power out of a pole-top transformer
  poletop: { unit: 'kW', perPx: 2.5, perSpeed: 0.8, samples: [5, 25] },
  // the System's own scale: a circuit's chevrons keep their size out of the yard and along its span
  span: { unit: 'MW', perPx: 120, perSpeed: 40, samples: [500, 2000] },
  // energy into and out of one phase of a capacitor bank (instantaneous power, slowed)
  capacitor: { unit: 'MW', perPx: 2, perSpeed: 0.8, samples: [10, 40] },
  // …and of one can
  capunit: { unit: 'kW', perPx: 60, perSpeed: 25, samples: [200, 800] },
  // real power through each phase's regulator
  regulator: { unit: 'kW', perPx: 100, perSpeed: 35, samples: [500, 2000] },
  // a home's solar power: steady down from the panels, pulsing out to the meter
  inverter: { unit: 'kW', perPx: 0.4, perSpeed: 0.15, samples: [2, 6] },
};

export const FLOW_MIN_PX = 5;
export const FLOW_MAX_PX = 22;

export function chevronSizeFor(v: number, s: FlowScale): number {
  return Math.min(FLOW_MAX_PX, Math.max(FLOW_MIN_PX, Math.abs(v) / s.perPx));
}

export function chevronSpeedFor(v: number, s: FlowScale): number {
  return Math.abs(v) / s.perSpeed;
}
