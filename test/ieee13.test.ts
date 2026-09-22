import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ieee13, IEEE13_PUBLISHED, IEEE13_V_LN } from '../src/data/dist/ieee13';
import { solveSweep } from '../src/physics/dist/sweep';
import { balancedSource } from '../src/physics/dist/network';
import { Complex } from '../src/physics/complex';

const IDX = { a: 0, b: 1, c: 2 } as const;
const ods = JSON.parse(readFileSync(new URL('./fixtures/ieee13-opendss.json', import.meta.url), 'utf8'));

function compare(net: ReturnType<typeof ieee13>, r: ReturnType<typeof solveSweep>, ref: (n: string, p: 'a' | 'b' | 'c') => [number, number] | undefined) {
  let dv = 0;
  let da = 0;
  for (const [n, ph] of Object.entries(IEEE13_PUBLISHED)) {
    const base = net.nodes.get(n)!.vbaseLN;
    for (const p of Object.keys(ph) as Array<'a' | 'b' | 'c'>) {
      const want = ref(n, p);
      if (!want) continue;
      const v = r.V.get(n)![IDX[p]]!;
      dv = Math.max(dv, Math.abs(v.abs() / base - want[0]));
      da = Math.max(da, Math.abs(v.argDeg() - want[1]));
    }
  }
  return { dv, da };
}

describe('IEEE 13-node test feeder (unbalanced backward/forward sweep)', () => {
  it('reproduces the published node voltages', () => {
    // Published |V| to 4 decimals and angles to 2: agreement within 3e-4 pu / 0.02°.
    // The distributed load uses Kersting's exact lumped-load model (2/3 at 1/4 length,
    // 1/3 at the end), which is what the published solution corresponds to.
    const net = ieee13({ distributed: 'exact' });
    const r = solveSweep(net, balancedSource(IEEE13_V_LN));
    expect(r.converged).toBe(true);
    const { dv, da } = compare(net, r, (n, p) => IEEE13_PUBLISHED[n]![p]);
    expect(dv).toBeLessThan(3e-4);
    expect(da).toBeLessThan(0.02);
  });

  it('agrees with OpenDSS when lumped the way OpenDSS lumps it', () => {
    // OpenDSS's IEEE13Nodeckt puts the whole distributed load at 1/3 of 632–671 and
    // gives lines 601–605 no charging capacitance; agreement within 5e-4 pu / 0.03°.
    const net = ieee13({ distributed: 'third' });
    const r = solveSweep(net, balancedSource(IEEE13_V_LN));
    const { dv, da } = compare(net, r, (n, p) => {
      const o = ods.nodes[n.toLowerCase()]?.phases[p];
      return o ? [o.pu, o.deg] : undefined;
    });
    expect(dv).toBeLessThan(5e-4);
    expect(da).toBeLessThan(0.03);
  });

  it('finds the published regulator taps with line-drop compensation', () => {
    const r = solveSweep(ieee13({ taps: [0, 0, 0] }), balancedSource(IEEE13_V_LN), { regulate: true });
    expect([...r.taps.get('REG')!]).toEqual([10, 8, 11]);
  });

  it('conserves energy: source = loads + losses − capacitor output', () => {
    const net = ieee13();
    const r = solveSweep(net, balancedSource(IEEE13_V_LN));
    let loads = Complex.ZERO;
    for (const s of r.loadS.values()) loads = loads.add(s);
    let capQ = 0;
    for (const q of r.capQ.values()) capQ += q;
    const rhs = loads.add(r.losses).sub(new Complex(0, capQ));
    expect(Math.abs(r.headS.re - rhs.re)).toBeLessThan(1e-3); // W
    expect(Math.abs(r.headS.im - rhs.im)).toBeLessThan(1e-3); // var
    // and the totals are the published feeder's magnitude: ~3.58 MW, ~1.72 Mvar, ~111 kW losses
    expect(r.headS.re / 1000).toBeCloseTo(3577.5, 0);
    expect(r.losses.re / 1000).toBeGreaterThan(105);
    expect(r.losses.re / 1000).toBeLessThan(115);
  });
});
