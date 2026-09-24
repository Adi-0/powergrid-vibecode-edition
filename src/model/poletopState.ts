import type { Snapshot } from './snapshot';
import type { Feeder } from './feeder';
import { nodeIndex } from './feeder';

/**
 * A pole-top transformer's state in a solved interval, from the distribution sweep:
 * the primary's voltage and current (one phase to neutral), and each secondary leg's
 * voltage and current as phasors — what the level, its inspector and its math panel
 * show. Phasors are [re, im], RMS, volts and amperes; powers in W and var.
 */
export interface PoleTopState {
  t: number;
  on: boolean;
  kva: number;
  /** Primary line-to-neutral voltage, and as a share of its rating. */
  vP: number;
  vPpu: number;
  vPc: [number, number];
  /** Leg-to-neutral voltages (leg 2 is the negative of leg 1, ideally), and leg to leg. */
  v1c: [number, number];
  v2c: [number, number];
  v1: number;
  v2: number;
  v12: number;
  /** Currents out of each leg, into the primary, and back on the neutral (|I1 + I2|). */
  i1c: [number, number];
  i2c: [number, number];
  ipc: [number, number];
  i1: number;
  i2: number;
  ip: number;
  iN: number;
  /** Power into the primary, out of each leg, and lost. */
  p: number;
  q: number;
  p1: number;
  p2: number;
  loss: number;
  prov: { vP: string; vS: string; I: string; pf: string; qf: string; pt: string };
}

export const PRIMARY_LN_V = 7200;
export const HALF_V = 120;

export function poletopState(s: Snapshot, fd: Feeder, id: string): PoleTopState | null {
  const f = s.feeder;
  if (s.outcome === 'none' || !f || !f.I) return null;
  const t = s.t;
  const tr = fd.layout.transformers.find((x) => x.id === id)!;
  const k = fd.base.branches.findIndex((b) => b.id === id);
  const idx = nodeIndex(fd);
  const ip = idx.get(tr.primary)!;
  const is = idx.get(tr.secondary)!;
  const ph = tr.phase;
  const vPc: [number, number] = [f.V[ip * 6 + 2 * ph]!, f.V[ip * 6 + 2 * ph + 1]!];
  const v1c: [number, number] = [f.V[is * 6]!, f.V[is * 6 + 1]!];
  const v2c: [number, number] = [f.V[is * 6 + 2]!, f.V[is * 6 + 3]!];
  const ipc: [number, number] = [f.I[k * 12 + 2 * ph]!, f.I[k * 12 + 2 * ph + 1]!];
  const i1c: [number, number] = [f.I[k * 12 + 6]!, f.I[k * 12 + 7]!];
  const i2c: [number, number] = [f.I[k * 12 + 8]!, f.I[k * 12 + 9]!];
  const mag = (c: [number, number]) => Math.hypot(c[0], c[1]);
  const vP = mag(vPc);
  const on = vP > 1;
  return {
    t,
    on,
    kva: tr.kva,
    vP,
    vPpu: vP / PRIMARY_LN_V,
    vPc,
    v1c,
    v2c,
    v1: mag(v1c),
    v2: mag(v2c),
    v12: Math.hypot(v1c[0] - v2c[0], v1c[1] - v2c[1]),
    i1c,
    i2c,
    ipc,
    i1: mag(i1c),
    i2: mag(i2c),
    ip: mag(ipc),
    iN: Math.hypot(i1c[0] + i2c[0], i1c[1] + i2c[1]),
    p: f.flows[k * 4]!,
    q: f.flows[k * 4 + 1]!,
    p1: v1c[0] * i1c[0] + v1c[1] * i1c[1],
    p2: v2c[0] * i2c[0] + v2c[1] * i2c[1],
    loss: f.flows[k * 4]! - f.flows[k * 4 + 2]!,
    prov: {
      vP: `solver:t${t}.feeder.V.${tr.primary}`,
      vS: `solver:t${t}.feeder.V.${tr.secondary}`,
      I: `solver:t${t}.feeder.I.${id}`,
      pf: `solver:t${t}.feeder.${id}.pf`,
      qf: `solver:t${t}.feeder.${id}.qf`,
      pt: `solver:t${t}.feeder.${id}.pt`,
    },
  };
}
