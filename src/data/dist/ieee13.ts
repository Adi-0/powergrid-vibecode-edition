import { Complex } from '../../physics/complex';
import { CMatrix } from '../../physics/linalg';
import type { DBranch, DCapacitor, DLoad, DNode, DistNetwork, Phase } from '../../physics/dist/network';
import { network } from '../../physics/dist/network';

/**
 * The IEEE 13-node test feeder (IEEE PES Distribution Test Feeders), as published:
 * a short, heavily loaded 4.16 kV feeder with unbalanced loads of every connection
 * and voltage model, single- and two-phase laterals, an underground cable, a
 * regulator bank, an in-line transformer, and shunt capacitors. Line data are the
 * published phase impedance matrices (Ω/mile) and shunt susceptances (µS/mile).
 */

const MI_PER_FT = 1 / 5280;

/** Symmetric 3×3 from upper-triangle rows of (R, X) pairs in Ω/mile, and B in µS/mile. */
function config(phases: Phase[], R: number[][], X: number[][], B: number[][]) {
  const Z = new CMatrix(3, 3);
  const Y = new CMatrix(3, 3);
  phases.forEach((p, i) =>
    phases.forEach((q, j) => {
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      Z.set(p, q, new Complex(R[a]![b - a]!, X[a]![b - a]!));
      Y.set(p, q, new Complex(0, B[a]![b - a]! * 1e-6));
    }),
  );
  return { Z, Y, phases };
}

export const IEEE13_CONFIGS = {
  '601': config(
    [0, 1, 2],
    [[0.3465, 0.156, 0.158], [0.3375, 0.1535], [0.3414]],
    [[1.0179, 0.5017, 0.4236], [1.0478, 0.3849], [1.0348]],
    [[6.2998, -1.9958, -1.2595], [5.9597, -0.7417], [5.6386]],
  ),
  '602': config(
    [0, 1, 2],
    [[0.7526, 0.158, 0.156], [0.7475, 0.1535], [0.7436]],
    [[1.1814, 0.4236, 0.5017], [1.1983, 0.3849], [1.2112]],
    [[5.699, -1.0817, -1.6905], [5.1795, -0.6588], [5.4246]],
  ),
  // 603: phases b, c
  '603': config([1, 2], [[1.3294, 0.2066], [1.3238]], [[1.3471, 0.4591], [1.3569]], [[4.7097, -0.8999], [4.6658]]),
  // 604: phases a, c
  '604': config([0, 2], [[1.3238, 0.2066], [1.3294]], [[1.3569, 0.4591], [1.3471]], [[4.6658, -0.8999], [4.7097]]),
  // 605: phase c
  '605': config([2], [[1.3292]], [[1.3475]], [[4.5193]]),
  // 606: 250 kcmil AA concentric-neutral cable, three phase (original published data)
  '606': config(
    [0, 1, 2],
    [[0.7982, 0.3192, 0.2849], [0.7891, 0.3192], [0.7982]],
    [[0.4463, 0.0328, -0.0143], [0.4041, 0.0328], [0.4463]],
    [[96.8897, 0, 0], [96.8897, 0], [96.8897]],
  ),
  // 607: 1/0 AA tape-shielded cable, phase a
  '607': config([0], [[1.3425]], [[0.5124]], [[88.9912]]),
} as const;

type ConfigId = keyof typeof IEEE13_CONFIGS;

export const IEEE13_V_LN = 4160 / Math.sqrt(3);

export interface Ieee13Options {
  /**
   * How the uniformly distributed load on 632–671 is lumped:
   *  'third'  — all of it at a node 1/3 of the way from 632 (OpenDSS's IEEE 13 model);
   *  'exact'  — Kersting's "exact lumped load" model: 2/3 at 1/4 of the way and 1/3 at
   *             the far end, which reproduces both the voltage drop and the losses.
   */
  distributed: 'third' | 'exact';
  /** Regulator taps (a, b, c); the published solution's are 10, 8, 11. */
  taps: [number, number, number];
}

export function ieee13(opts: Partial<Ieee13Options> = {}): DistNetwork {
  const o: Ieee13Options = { distributed: 'exact', taps: [10, 8, 11], ...opts };
  const P3: Phase[] = [0, 1, 2];
  const node = (id: string, phases: Phase[], vbase = IEEE13_V_LN): DNode => ({ id, kind: 'primary', phases, vbaseLN: vbase });
  const nodes: DNode[] = [
    node('650', P3),
    node('RG60', P3),
    node('632', P3),
    node('670', P3),
    node('671', P3),
    node('680', P3),
    node('633', P3),
    node('634', P3, 480 / Math.sqrt(3)),
    node('645', [1, 2]),
    node('646', [1, 2]),
    node('692', P3),
    node('675', P3),
    node('684', [0, 2]),
    node('611', [2]),
    node('652', [0]),
  ];
  const line = (from: string, to: string, cfg: ConfigId, ft: number): DBranch => {
    const c = IEEE13_CONFIGS[cfg];
    const L = ft * MI_PER_FT;
    return {
      kind: 'line',
      id: `${from}-${to}`,
      from,
      to,
      phases: [...c.phases],
      Z: c.Z.scale(new Complex(L, 0)),
      Y: c.Y.scale(new Complex(L, 0)),
      lengthFt: ft,
      config: cfg,
    };
  };
  const midFt = o.distributed === 'third' ? 667 : 500;
  const branches: DBranch[] = [
    {
      kind: 'regulator',
      id: 'REG',
      from: '650',
      to: 'RG60',
      phases: P3,
      taps: [...o.taps],
      control: { vset: 122, band: 2, ptRatio: 20, ctPrimary: 700, r: 3, x: 9 },
    },
    line('RG60', '632', '601', 2000),
    line('632', '670', '601', midFt),
    line('670', '671', '601', 2000 - midFt),
    line('671', '680', '601', 1000),
    line('632', '633', '602', 500),
    {
      kind: 'transformer',
      id: 'XFM-1',
      from: '633',
      to: '634',
      conn: 'YgYg',
      kva: 500,
      kvHighLL: 4.16,
      kvLowLL: 0.48,
      zpu: new Complex(0.011, 0.02),
    },
    line('632', '645', '603', 500),
    line('645', '646', '603', 300),
    { kind: 'switch', id: 'SW-671-692', from: '671', to: '692', phases: P3, closed: true },
    line('692', '675', '606', 500),
    line('671', '684', '604', 300),
    line('684', '611', '605', 300),
    line('684', '652', '607', 800),
  ];
  const Y = (id: string, n: string, p: Phase, kw: number, kvar: number, model: DLoad['model'], v = 2400): DLoad => ({
    id,
    node: n,
    conn: 'Y',
    phases: [p],
    kw,
    kvar,
    model,
    vRated: v,
  });
  const D = (id: string, n: string, p: Phase, q: Phase, kw: number, kvar: number, model: DLoad['model']): DLoad => ({
    id,
    node: n,
    conn: 'D',
    phases: [p, q],
    kw,
    kvar,
    model,
    vRated: 4160,
  });
  const loads: DLoad[] = [
    Y('634a', '634', 0, 160, 110, 'PQ', 277),
    Y('634b', '634', 1, 120, 90, 'PQ', 277),
    Y('634c', '634', 2, 120, 90, 'PQ', 277),
    Y('645b', '645', 1, 170, 125, 'PQ'),
    D('646bc', '646', 1, 2, 230, 132, 'Z'),
    Y('652a', '652', 0, 128, 86, 'Z'),
    D('671ab', '671', 0, 1, 385, 220, 'PQ'),
    D('671bc', '671', 1, 2, 385, 220, 'PQ'),
    D('671ca', '671', 2, 0, 385, 220, 'PQ'),
    Y('675a', '675', 0, 485, 190, 'PQ'),
    Y('675b', '675', 1, 68, 60, 'PQ'),
    Y('675c', '675', 2, 290, 212, 'PQ'),
    D('692ca', '692', 2, 0, 170, 151, 'I'),
    Y('611c', '611', 2, 170, 80, 'I'),
  ];
  // Distributed load 632–671 (Y, constant PQ): a 17+j10, b 66+j38, c 117+j68 kW+jkvar
  const dist: Array<[Phase, number, number]> = [
    [0, 17, 10],
    [1, 66, 38],
    [2, 117, 68],
  ];
  for (const [p, kw, kvar] of dist) {
    if (o.distributed === 'third') loads.push(Y(`dist${p}`, '670', p, kw, kvar, 'PQ'));
    else {
      loads.push(Y(`dist${p}-mid`, '670', p, (2 / 3) * kw, (2 / 3) * kvar, 'PQ'));
      loads.push(Y(`dist${p}-end`, '671', p, (1 / 3) * kw, (1 / 3) * kvar, 'PQ'));
    }
  }
  const caps: DCapacitor[] = [
    { id: 'C675', node: '675', phases: P3, kvarPerPhase: 200, vRatedLN: 2400, closed: true },
    { id: 'C611', node: '611', phases: [2], kvarPerPhase: 100, vRatedLN: 2400, closed: true },
  ];
  return network('650', nodes, branches, loads, caps);
}

/**
 * The published node voltages (per unit, degrees), printed to four and two decimals.
 * Node 634's base is 277 V (480 V line to line); all others 2401.78 V.
 */
export const IEEE13_PUBLISHED: Record<string, Partial<Record<'a' | 'b' | 'c', [number, number]>>> = {
  '650': { a: [1.0, 0.0], b: [1.0, -120.0], c: [1.0, 120.0] },
  RG60: { a: [1.0625, 0.0], b: [1.05, -120.0], c: [1.0687, 120.0] },
  '632': { a: [1.021, -2.49], b: [1.042, -121.72], c: [1.0174, 117.83] },
  '633': { a: [1.018, -2.56], b: [1.0401, -121.77], c: [1.0148, 117.82] },
  '634': { a: [0.994, -3.23], b: [1.0218, -122.22], c: [0.996, 117.34] },
  '645': { b: [1.0329, -121.9], c: [1.0155, 117.86] },
  '646': { b: [1.0311, -121.98], c: [1.0134, 117.9] },
  '671': { a: [0.99, -5.3], b: [1.0529, -122.34], c: [0.9778, 116.02] },
  '680': { a: [0.99, -5.3], b: [1.0529, -122.34], c: [0.9778, 116.02] },
  '684': { a: [0.9881, -5.32], c: [0.9758, 115.92] },
  '611': { c: [0.9738, 115.78] },
  '652': { a: [0.9825, -5.25] },
  '692': { a: [0.99, -5.31], b: [1.0529, -122.34], c: [0.9777, 116.02] },
  '675': { a: [0.9835, -5.56], b: [1.0553, -122.52], c: [0.9758, 116.03] },
};
