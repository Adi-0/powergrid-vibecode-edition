import type { WirePosition } from '../physics/lineconstants';
import type { SourceId } from './sources';

/**
 * Overhead line constructions: where the conductors hang. Heights are average
 * heights above ground over the span (attachment height minus about two-thirds of
 * the sag), which is what the line-constant equations want. Geometry is typical
 * of each voltage class (estimate); conductor data comes from conductors.ts.
 */
export interface Construction {
  id: string;
  kv: number;
  label: string;
  wires: readonly WirePosition[];
  /** Structure drawing hints (m): overall height, crossarm half-width. */
  structure: { kind: 'lattice' | 'H-frame' | 'pole'; height: number; halfWidth: number };
  src: SourceId;
}

export const CONSTRUCTIONS = {
  EHV500: {
    id: 'EHV500',
    kv: 500,
    label: '500 kV lattice, horizontal, 3 × 1272 kcmil ACSR "Bittern" per phase, two shield wires',
    wires: [
      { x: -10.7, y: 21, conductor: 'ACSR_1272_BITTERN', role: 'phase', label: 'a', bundle: { n: 3, spacing: 0.457 } },
      { x: 0, y: 21, conductor: 'ACSR_1272_BITTERN', role: 'phase', label: 'b', bundle: { n: 3, spacing: 0.457 } },
      { x: 10.7, y: 21, conductor: 'ACSR_1272_BITTERN', role: 'phase', label: 'c', bundle: { n: 3, spacing: 0.457 } },
      { x: -7.3, y: 32, conductor: 'ALUMOWELD_7_8', role: 'shield', label: 'g1' },
      { x: 7.3, y: 32, conductor: 'ALUMOWELD_7_8', role: 'shield', label: 'g2' },
    ],
    structure: { kind: 'lattice', height: 36, halfWidth: 12.5 },
    src: 'estimate',
  },
  HV230_2B: {
    id: 'HV230_2B',
    kv: 230,
    label: '230 kV steel, horizontal, 2 × 795 kcmil ACSR "Drake" per phase, one shield wire',
    wires: [
      { x: -7, y: 17, conductor: 'ACSR_795_DRAKE', role: 'phase', label: 'a', bundle: { n: 2, spacing: 0.457 } },
      { x: 0, y: 17, conductor: 'ACSR_795_DRAKE', role: 'phase', label: 'b', bundle: { n: 2, spacing: 0.457 } },
      { x: 7, y: 17, conductor: 'ACSR_795_DRAKE', role: 'phase', label: 'c', bundle: { n: 2, spacing: 0.457 } },
      { x: 0, y: 25, conductor: 'ALUMOWELD_7_8', role: 'shield', label: 'g' },
    ],
    structure: { kind: 'lattice', height: 28, halfWidth: 8.5 },
    src: 'estimate',
  },
  HV230_1: {
    id: 'HV230_1',
    kv: 230,
    label: '230 kV steel, horizontal, 1 × 795 kcmil ACSR "Drake" per phase, one shield wire',
    wires: [
      { x: -7, y: 17, conductor: 'ACSR_795_DRAKE', role: 'phase', label: 'a' },
      { x: 0, y: 17, conductor: 'ACSR_795_DRAKE', role: 'phase', label: 'b' },
      { x: 7, y: 17, conductor: 'ACSR_795_DRAKE', role: 'phase', label: 'c' },
      { x: 0, y: 25, conductor: 'ALUMOWELD_7_8', role: 'shield', label: 'g' },
    ],
    structure: { kind: 'lattice', height: 28, halfWidth: 8.5 },
    src: 'estimate',
  },
  HV115: {
    id: 'HV115',
    kv: 115,
    label: '115 kV wood H-frame, 477 kcmil ACSR "Hawk", one shield wire',
    wires: [
      { x: -4, y: 13, conductor: 'ACSR_477_HAWK', role: 'phase', label: 'a' },
      { x: 0, y: 13, conductor: 'ACSR_477_HAWK', role: 'phase', label: 'b' },
      { x: 4, y: 13, conductor: 'ACSR_477_HAWK', role: 'phase', label: 'c' },
      { x: 0, y: 18, conductor: 'ALUMOWELD_7_8', role: 'shield', label: 'g' },
    ],
    structure: { kind: 'H-frame', height: 19, halfWidth: 5 },
    src: 'estimate',
  },
  SUB60: {
    id: 'SUB60',
    kv: 60,
    label: '60 kV wood pole crossarm, 556.5 kcmil ACSR "Dove", three-wire',
    wires: [
      { x: -1.8, y: 12.5, conductor: 'ACSR_556_DOVE', role: 'phase', label: 'a' },
      { x: 0, y: 13.5, conductor: 'ACSR_556_DOVE', role: 'phase', label: 'b' },
      { x: 1.8, y: 12.5, conductor: 'ACSR_556_DOVE', role: 'phase', label: 'c' },
    ],
    structure: { kind: 'pole', height: 15, halfWidth: 2.2 },
    src: 'estimate',
  },
} as const satisfies Record<string, Construction>;

export type ConstructionId = keyof typeof CONSTRUCTIONS;
