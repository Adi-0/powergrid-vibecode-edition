import { describe, expect, it } from 'vitest';
import { numberText, siQty, solver } from '../src/ui/quantity';
import { SegmentIndex, outlines } from '../src/model/outline';
import { project } from '../src/model/geo';
import { SITES } from '../src/data/ca/network';

describe('SI-prefixed quantities', () => {
  const show = (v: number) => {
    const q = siQty(v, 'W', solver('x'));
    return `${numberText(q.value, q.digits!)} ${q.unit}`;
  };
  it('picks the prefix that puts the value between 1 and 1000, to two figures', () => {
    expect(show(2.4e-5)).toBe('24 µW');
    expect(show(0.00012)).toBe('120 µW');
    expect(show(0.0031)).toBe('3.1 mW');
    expect(show(7)).toBe('7.0 W');
    expect(show(0)).toBe('0 W');
  });
});

describe('segment index', () => {
  it('finds points near a ring edge and not away from it', () => {
    const idx = new SegmentIndex([[[0, 0], [100, 0], [100, 100], [0, 100]]], true);
    expect(idx.near(50, 1, 2)).toBe(true);
    expect(idx.near(1, 50, 2)).toBe(true); // closing edge
    expect(idx.near(50, 50, 2)).toBe(false);
  });
  it('treats open polylines as open', () => {
    const idx = new SegmentIndex([[[0, 0], [100, 0], [100, 100]]], false);
    expect(idx.near(1, 50, 2)).toBe(false);
  });
});

describe('outlines', () => {
  it('put Malin (Oregon, just over the border) outside California and inside Oregon’s drawn band', () => {
    const g = outlines();
    const inside = (ring: ReadonlyArray<readonly [number, number]>, x: number, z: number) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, zi] = ring[i]!;
        const [xj, zj] = ring[j]!;
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
      }
      return c;
    };
    const malin = SITES.find((s) => s.id === 'MALIN')!;
    const [x, z] = project(malin.lat, malin.lon);
    expect(g.california.some((r) => inside(r, x, z))).toBe(false);
    expect(g.neighbours.find((n) => n.id === 'OR')!.rings.some((r) => inside(r, x, z))).toBe(true);
  });
});
