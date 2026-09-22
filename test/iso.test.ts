import { describe, expect, it } from 'vitest';
import { ISO_ELEVATION_RAD, isoViewOffset, projectedLength } from '../src/render/iso';

describe('isometric projection', () => {
  it('uses the true isometric elevation atan(1/√2) ≈ 35.264°', () => {
    expect((ISO_ELEVATION_RAD * 180) / Math.PI).toBeCloseTo(35.2644, 4);
  });
  it('puts the camera on the (−1, 1, 1) diagonal: south-west and above', () => {
    const v = isoViewOffset();
    expect(v.x).toBeCloseTo(-1 / Math.sqrt(3), 12);
    expect(v.y).toBeCloseTo(1 / Math.sqrt(3), 12);
    expect(v.z).toBeCloseTo(1 / Math.sqrt(3), 12);
  });
  it('foreshortens all three world axes equally (the definition of isometric)', () => {
    const lx = projectedLength(1, 0, 0);
    const ly = projectedLength(0, 1, 0);
    const lz = projectedLength(0, 0, 1);
    expect(lx).toBeCloseTo(Math.sqrt(2 / 3), 12);
    expect(ly).toBeCloseTo(lx, 12);
    expect(lz).toBeCloseTo(lx, 12);
  });
});
