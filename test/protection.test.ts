import { beforeAll, describe, expect, it } from 'vitest';
import { Grid } from '../src/model/grid';
import { runDay } from '../src/model/day';
import { snapshot, type Snapshot } from '../src/model/snapshot';
import { coupledSolve } from '../src/model/coupling';
import { makeFeeder, type Feeder } from '../src/model/feeder';
import { feederSnap } from '../src/model/feederSnapshot';
import { faultStudy } from '../src/model/faultStudy';
import { faultOnFeeder, feederSource, type FeederSource } from '../src/model/feederFault';
import { breakerTime, fuseClear, fuseMelt, recloserSlow, simulateProtection, tocTime } from '../src/model/protection';
import { PROTECTION } from '../src/data/dist/protection';
import type { FeederFaultKind } from '../src/physics/dist/fault';

/**
 * Phase 8's done-condition: feeder 1105's protection is coordinated, and every fault
 * is cleared by the device nearest to it, in a real sequence.
 */
describe('protection on feeder 1105', () => {
  let fd: Feeder;
  let s: Snapshot;
  let src: FeederSource;
  beforeAll(() => {
    const g = new Grid();
    const day = runDay(g);
    fd = makeFeeder();
    const w = day.points[76]!;
    const cp = coupledSolve(g, w.step, g.baseCase(), fd, { participation: 'agc', warm: w.result, shuntSteps: w.shuntSteps });
    s = { ...snapshot(g, cp.op), feeder: feederSnap(cp) };
    src = feederSource(g, faultStudy(g, s));
  }, 120_000);

  const run = (node: string, kind: FeederFaultKind, permanent: boolean) => {
    const f = faultOnFeeder(fd, s, src, node, kind)!;
    const mags = f.I.map((x) => x.abs());
    const Iph = Math.max(...mags);
    const lat = fd.layout.laterals.find((l) => l.nodes.includes(node));
    const Ifuse = lat ? mags[lat.phase]! : 0;
    return { f, r: simulateProtection({ devices: f.devices, Iph, Ires: f.residual.abs(), Ifuse, permanent }) };
  };

  it('C37.112 very-inverse curve: t = TDS (19.61/(M² − 1) + 0.491)', () => {
    expect(tocTime({ curve: 'VI', pickup: 100, tds: 1 }, 500)).toBeCloseTo(19.61 / 24 + 0.491, 12);
    expect(tocTime({ curve: 'VI', pickup: 100, tds: 1 }, 100)).toBe(Infinity);
    expect(fuseClear(3000)).toBeGreaterThan(fuseMelt(3000));
  });

  it('a permanent fault on any lateral: only its fuse opens', () => {
    for (const l of fd.layout.laterals)
      for (const node of [l.nodes[0]!, l.nodes[l.nodes.length - 1]!]) {
        const { r } = run(node, 'slg', true);
        expect(r.open, `${node}: ${JSON.stringify(r.events)}`).toEqual([l.fuse]);
      }
  });

  it('a permanent fault on the trunk beyond the recloser: the recloser locks out after four trips; the breaker holds', () => {
    for (const node of ['F2R', 'F3', 'F4', 'F5', 'F6'])
      for (const kind of ['slg', '3ph', 'll'] as const) {
        const { r } = run(node, kind, true);
        expect(r.open, `${node} ${kind}`).toEqual(['RCL-1']);
        expect(r.events.filter((e) => e.device === 'RCL-1' && e.what === 'trip').map((e) => e.how)).toEqual(['fast', 'fast', 'delayed', 'delayed']);
        expect(r.events.some((e) => e.what === 'lockout')).toBe(true);
      }
  });

  it('a fault between the breaker and the recloser: the breaker opens', () => {
    for (const node of ['F0', 'F1', 'F2'])
      for (const kind of ['slg', '3ph'] as const) {
        const { r } = run(node, kind, true);
        expect(r.open, `${node} ${kind}`).toEqual(['CB-1105']);
      }
  });

  it('temporary faults: the recloser saves the fuse where the current allows; nearer the substation the fuse blows', () => {
    const far = fd.layout.laterals.find((l) => l.id === 'L10')!;
    const saved = run(far.nodes[far.nodes.length - 1]!, 'slg', false).r;
    expect(saved.open).toEqual([]);
    expect(saved.momentary).toEqual(['RCL-1']);
    const near = fd.layout.laterals.find((l) => l.id === 'L4')!;
    const blown = run(near.nodes[0]!, 'slg', false).r;
    expect(blown.open).toEqual([near.fuse]);
  });

  it('coordination time interval: the breaker waits at least the CTI behind the recloser’s delayed curve', () => {
    let worst = Infinity;
    for (const node of ['F2R', 'F3', 'F4', 'F5', 'F6', ...fd.layout.laterals.filter((l) => run(l.nodes[0]!, 'slg', true).f.devices.includes('RCL-1')).map((l) => l.nodes[0]!)])
      for (const kind of ['slg', '3ph', 'll'] as const) {
        const f = faultOnFeeder(fd, s, src, node, kind);
        if (!f) continue;
        const Iph = Math.max(...f.I.map((x) => x.abs()));
        const margin = breakerTime(Iph, f.residual.abs()).t - recloserSlow(Iph, f.residual.abs());
        worst = Math.min(worst, margin);
      }
    expect(worst).toBeGreaterThanOrEqual(PROTECTION.cti);
  });
});
