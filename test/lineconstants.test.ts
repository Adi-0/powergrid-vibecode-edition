import { describe, expect, it } from 'vitest';
import { lineConstants, type WirePosition } from '../src/physics/lineconstants';
import type { ConductorId } from '../src/data/conductors';

/**
 * IEEE 13-node feeder overhead configurations 601–605, computed from conductor data
 * and pole-top geometry with modified Carson's equations and Kron reduction, must
 * reproduce the phase impedance matrices published with the feeder (Ω/mile, printed
 * to 4 decimals — also the linecodes in OpenDSS's IEEE13Nodeckt.dss, kept in
 * tools/ref/ieee13/). Shunt susceptances are the published µS/mile values.
 * Tolerance 1.5e-4 covers 4-decimal rounding.
 */
const FT = 0.3048;
const wire = (xft: number, yft: number, conductor: ConductorId, role: 'phase' | 'neutral', label: string): WirePosition => ({
  x: xft * FT,
  y: yft * FT,
  conductor,
  role,
  label,
});

// Spacing 500: phase positions x = 0, 2.5, 7 ft at 28 ft; neutral at x = 4 ft, 24 ft.
// Spacing 505: phases at x = 0 and 7 ft, 28 ft; neutral at x = 4 ft, 24 ft.
// Spacing 510: phase at x = 0.5 ft, 29 ft; neutral at x = 0, 24 ft.
const cases: Array<{ id: string; wires: WirePosition[]; order: string[]; R: number[][]; X: number[][]; B?: number[][] }> = [
  {
    id: '601 (phasing B A C N, 556,500 ACSR / 4/0 ACSR)',
    wires: [
      wire(0, 28, 'ACSR_556_DOVE', 'phase', 'b'),
      wire(2.5, 28, 'ACSR_556_DOVE', 'phase', 'a'),
      wire(7, 28, 'ACSR_556_DOVE', 'phase', 'c'),
      wire(4, 24, 'ACSR_4_0_PENGUIN', 'neutral', 'n'),
    ],
    order: ['a', 'b', 'c'],
    R: [[0.3465, 0.156, 0.158], [0.156, 0.3375, 0.1535], [0.158, 0.1535, 0.3414]],
    X: [[1.0179, 0.5017, 0.4236], [0.5017, 1.0478, 0.3849], [0.4236, 0.3849, 1.0348]],
    B: [[6.2998, -1.9958, -1.2595], [-1.9958, 5.9597, -0.7417], [-1.2595, -0.7417, 5.6386]],
  },
  {
    id: '602 (phasing C A B N, 4/0 ACSR / 4/0 ACSR)',
    wires: [
      wire(0, 28, 'ACSR_4_0_PENGUIN', 'phase', 'c'),
      wire(2.5, 28, 'ACSR_4_0_PENGUIN', 'phase', 'a'),
      wire(7, 28, 'ACSR_4_0_PENGUIN', 'phase', 'b'),
      wire(4, 24, 'ACSR_4_0_PENGUIN', 'neutral', 'n'),
    ],
    order: ['a', 'b', 'c'],
    R: [[0.7526, 0.158, 0.156], [0.158, 0.7475, 0.1535], [0.156, 0.1535, 0.7436]],
    X: [[1.1814, 0.4236, 0.5017], [0.4236, 1.1983, 0.3849], [0.5017, 0.3849, 1.2112]],
    B: [[5.699, -1.0817, -1.6905], [-1.0817, 5.1795, -0.6588], [-1.6905, -0.6588, 5.4246]],
  },
  {
    id: '603 (phasing C B N, 1/0 ACSR)',
    wires: [
      wire(0, 28, 'ACSR_1_0_RAVEN', 'phase', 'c'),
      wire(7, 28, 'ACSR_1_0_RAVEN', 'phase', 'b'),
      wire(4, 24, 'ACSR_1_0_RAVEN', 'neutral', 'n'),
    ],
    order: ['b', 'c'],
    R: [[1.3294, 0.2066], [0.2066, 1.3238]],
    X: [[1.3471, 0.4591], [0.4591, 1.3569]],
    B: [[4.7097, -0.8999], [-0.8999, 4.6658]],
  },
  {
    id: '604 (phasing A C N, 1/0 ACSR)',
    wires: [
      wire(0, 28, 'ACSR_1_0_RAVEN', 'phase', 'a'),
      wire(7, 28, 'ACSR_1_0_RAVEN', 'phase', 'c'),
      wire(4, 24, 'ACSR_1_0_RAVEN', 'neutral', 'n'),
    ],
    order: ['a', 'c'],
    R: [[1.3238, 0.2066], [0.2066, 1.3294]],
    X: [[1.3569, 0.4591], [0.4591, 1.3471]],
    B: [[4.6658, -0.8999], [-0.8999, 4.7097]],
  },
  {
    id: '605 (phasing C N, 1/0 ACSR)',
    wires: [wire(0.5, 29, 'ACSR_1_0_RAVEN', 'phase', 'c'), wire(0, 24, 'ACSR_1_0_RAVEN', 'neutral', 'n')],
    order: ['c'],
    R: [[1.3292]],
    X: [[1.3475]],
    B: [[4.5193]],
  },
];

describe("modified Carson's equations + Kron reduction reproduce IEEE 13-node line configurations", () => {
  for (const cs of cases) {
    it(cs.id, () => {
      const lc = lineConstants(cs.wires, 100, 60);
      const idx = cs.order.map((p) => lc.phases.indexOf(p));
      cs.order.forEach((_, i) =>
        cs.order.forEach((__, j) => {
          const z = lc.zabcPerMile.get(idx[i]!, idx[j]!);
          expect(Math.abs(z.re - cs.R[i]![j]!)).toBeLessThan(1.5e-4);
          expect(Math.abs(z.im - cs.X[i]![j]!)).toBeLessThan(1.5e-4);
          if (cs.B) {
            const y = lc.yabcPerMile_uS.get(idx[i]!, idx[j]!);
            expect(Math.abs(y.im - cs.B[i]![j]!)).toBeLessThan(1.5e-4);
          }
        }),
      );
    });
  }
});
