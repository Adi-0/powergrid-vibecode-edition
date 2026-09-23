import { beforeAll, describe, expect, it } from 'vitest';
import { Grid } from '../src/model/grid';
import { runDay, type DayRun } from '../src/model/day';
import { snapshot } from '../src/model/snapshot';
import { busFaultLevel, faultStudy } from '../src/model/faultStudy';

/**
 * Fault levels on the synthetic network at 19:00: physically sized for their voltage
 * class, single line-to-ground in proportion to three-phase where the zero-sequence
 * network is stiff, and none at a bus with no zero-sequence path.
 */
describe('fault levels on the California network', () => {
  let g: Grid;
  let day: DayRun;
  beforeAll(() => {
    g = new Grid();
    day = runDay(g);
  }, 120_000);

  it('every energised bus: three-phase and line-to-ground currents in their class’s range', () => {
    const s = snapshot(g, day.points[76]!);
    const t0 = performance.now();
    const fs = faultStudy(g, s);
    const build = performance.now() - t0;
    const rows: Array<[string, number, number, number]> = [];
    for (const b of g.buses) {
      if (!s.energized[b.index]) continue;
      const f = busFaultLevel(g, fs, b.index);
      rows.push([b.id, b.kv, f.i3kA, f.i1kA]);
      expect(f.i3kA, b.id).toBeGreaterThan(0.5);
      if (b.kv >= 345) expect(f.i3kA, b.id).toBeLessThan(80);
      if (b.terminalOf) expect(f.i1kA, `${b.id}: behind a delta, no ground path`).toBeLessThan(1e-3);
      else if (b.kv >= 200) {
        expect(f.i1kA / f.i3kA, b.id).toBeGreaterThan(0.3);
        expect(f.i1kA / f.i3kA, b.id).toBeLessThan(1.6);
      }
      expect(f.xr, b.id).toBeGreaterThan(2);
    }
    expect(rows.length).toBeGreaterThan(60);
    expect(build).toBeLessThan(2000);
    const mean500 = rows.filter((r) => r[1] === 500).map((r) => r[2]);
    expect(Math.max(...mean500)).toBeGreaterThan(10);
  });
});
