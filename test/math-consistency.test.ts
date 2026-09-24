import { beforeAll, describe, expect, it } from 'vitest';
import { Grid } from '../src/model/grid';
import { runDay, type DayRun } from '../src/model/day';
import { snapshot, type Snapshot } from '../src/model/snapshot';
import { coupledSolve } from '../src/model/coupling';
import { makeFeeder, type Feeder } from '../src/model/feeder';
import { feederSnap } from '../src/model/feederSnapshot';
import { numberText } from '../src/ui/quantity';
import { parseDisplayed, type Expr, type Panel } from '../src/math/expr';
import { branchPanel, busFaultPanel, busPanel, feederFaultPanel, feederPanel, frequencyPanel, machinePanel, meterPanel, outletPanel, plantPanel, regionPanel, substationPanel, transformerPanel, breakerPanel, poletopPanel, spanPanel, capBankPanel, canPanel, regPanel, invPanel } from '../src/math/panels';
import { capBankState } from '../src/model/capState';
import { regState } from '../src/model/regState';
import { invState } from '../src/model/invState';
import { spanState } from '../src/model/spanState';
import { poletopState } from '../src/model/poletopState';
import { breakerState } from '../src/model/breakerState';
import { evergreenPlate, evergreenXfmrState, gridPlate, gridXfmrState } from '../src/model/xfmrState';
import { S_BASE } from '../src/model/grid';
import { EVERGREEN } from '../src/data/dist/evergreen';
import { faultStudy } from '../src/model/faultStudy';
import { faultOnFeeder, feederSource } from '../src/model/feederFault';
import { simulateProtection } from '../src/model/protection';
import { tripResponse } from '../src/model/frequency';

/**
 * Phase 6's done-condition: every math panel's displayed arithmetic reproduces its
 * displayed result. Checked the way a reader would: take the numbers as they are
 * printed (strings), redo the arithmetic, round as the result is printed, compare the
 * strings. And the printed precision must be enough for that result to agree with the
 * solver's own value (to two units in the last printed place, or the stated tolerance
 * of a step marked as an approximation).
 */
const DEG = Math.PI / 180;

function redo(e: Expr, printed: string[]): number {
  switch (e.k) {
    case 'num':
      return parseDisplayed(numberText(e.value, e.digits));
    case 'ref':
      return parseDisplayed(printed[e.step]!);
    case 'neg':
      return -redo(e.a, printed);
    case 'paren':
      return redo(e.a, printed);
    case 'sq':
      return redo(e.a, printed) ** 2;
    case 'pow':
      return redo(e.a, printed) ** e.p;
    case 'fn': {
      const v = redo(e.a, printed);
      return e.fn === 'cos' ? Math.cos(v * DEG) : e.fn === 'sin' ? Math.sin(v * DEG) : e.fn === 'atan' ? Math.atan(v) / DEG : e.fn === 'ln' ? Math.log(v) : Math.sqrt(v);
    }
    case 'op': {
      const a = redo(e.a, printed);
      const b = redo(e.b, printed);
      return e.op === '+' ? a + b : e.op === '−' ? a - b : e.op === '×' ? a * b : a / b;
    }
  }
}

function check(p: Panel, where: string): number {
  const printed: string[] = [];
  let n = 0;
  for (const st of p.steps) {
    const v = redo(st.expr, printed);
    const out = numberText(v, st.digits);
    printed.push(out);
    n++;
    if (st.solver !== undefined) {
      const tol = st.approx ? st.approx.tol : 2 * 10 ** -st.digits;
      const diff = Math.abs(parseDisplayed(out) - st.solver);
      expect(diff, `${where} · ${st.label}: printed ${out} vs solver ${st.solver}`).toBeLessThanOrEqual(tol + 1e-12);
    }
  }
  return n;
}

describe('math panels', () => {
  let g: Grid;
  let day: DayRun;
  let fd: Feeder;
  beforeAll(() => {
    g = new Grid();
    day = runDay(g);
    fd = makeFeeder();
  }, 120_000);

  for (const t of [76, 50]) {
    it(`every branch and every bus at interval ${t}`, () => {
      const s = snapshot(g, day.points[t]!);
      let steps = 0;
      let panels = 0;
      g.branches.forEach((br, k) => {
        const p = branchPanel(g, s, k);
        if (p) {
          steps += check(p, br.id);
          panels++;
        }
      });
      g.buses.forEach((b) => {
        const p = busPanel(g, s, b.index);
        if (p) {
          steps += check(p, b.id);
          panels++;
        }
      });
      for (const r of ['bay', 'la', 'central', 'north', 'coast', 'inland', 'sd']) {
        const ids = g.sites.filter((x) => x.region === r && !x.outOfState).map((x) => x.id);
        const p = regionPanel(g, s, ids, r);
        if (p) steps += check(p, r);
      }
      expect(panels).toBeGreaterThan(250);
      expect(steps).toBeGreaterThan(1500);
    });

    it(`plant, machines and the frequency response at interval ${t}`, () => {
      const s = snapshot(g, day.points[t]!);
      const p = plantPanel(g, s, 'ML1');
      expect(p).not.toBeNull();
      check(p!, p!.title);
      for (const id of ['ML1-GT1', 'ML1-GT2', 'ML1-ST']) {
        const m = machinePanel(g, s, id);
        expect(m).not.toBeNull();
        check(m!, id);
      }
      check(frequencyPanel(tripResponse(g, s, 'ML1')), 'trip ML1');
      check(frequencyPanel(tripResponse(g, s, 'DIABLO')), 'trip DIABLO');
    });

    it(`fault levels at every bus, and feeder faults, at interval ${t}`, () => {
      const w = day.points[t]!;
      const cp = coupledSolve(g, w.step, g.baseCase(), fd, { participation: 'agc', warm: w.result, shuntSteps: w.shuntSteps });
      const s: Snapshot = { ...snapshot(g, cp.op), feeder: feederSnap(cp) };
      const fs = faultStudy(g, s);
      let n = 0;
      for (const b of g.buses) {
        if (!s.energized[b.index] || b.terminalOf) continue;
        const p = busFaultPanel(g, s, fs, b.index);
        if (p) (check(p, `fault ${b.id}`), n++);
      }
      expect(n).toBeGreaterThan(60);
      const src = feederSource(g, fs);
      for (const [node, kind] of [['F4', 'slg'], ['F4', '3ph'], ['F4', 'll'], ['F1', 'slg'], [fd.layout.laterals[9]!.nodes.at(-1)!, 'slg'], [fd.layout.laterals[0]!.nodes[0]!, 'slg']] as const) {
        const res = faultOnFeeder(fd, s, src, node, kind)!;
        const mags = res.I.map((x) => x.abs());
        const lat = fd.layout.laterals.find((l) => l.nodes.includes(node));
        const prot = simulateProtection({ devices: res.devices, Iph: Math.max(...mags), Ires: res.residual.abs(), Ifuse: lat ? mags[lat.phase]! : 0, permanent: true });
        check(feederFaultPanel(s, { node, permanent: true, res, prot, outHomes: 0, momentaryHomes: 0 }), `feeder fault ${node} ${kind}`);
      }
    });

    it(`substation, feeder, meters and the outlet at interval ${t}`, () => {
      const w = day.points[t]!;
      const cp = coupledSolve(g, w.step, g.baseCase(), fd, { participation: 'agc', warm: w.result, shuntSteps: w.shuntSteps });
      const s: Snapshot = { ...snapshot(g, cp.op), feeder: feederSnap(cp) };
      for (const p of [substationPanel(s), feederPanel(s, fd), outletPanel(s, fd)]) {
        expect(p).not.toBeNull();
        check(p!, p!.title);
      }
      for (const h of fd.layout.homes) {
        const p = meterPanel(s, fd, h.id);
        if (p) check(p, h.id);
      }
      // the Evergreen bank, opened up
      const B = EVERGREEN.bank;
      const ev = transformerPanel(evergreenPlate('xf:EV-BANK'), evergreenXfmrState(g, s, fd), { r: B.zpu.re, rProv: 'data:evergreen.bank.zpu.re', vBase: B.kvLowLL, vProv: 'data:evergreen.bank.kvLowLL', sBase: B.kva / 1000, sProv: 'data:evergreen.bank.kva', side: 'L' });
      expect(ev).not.toBeNull();
      check(ev!, 'Evergreen bank');
      // every pole-top transformer, opened up
      let n = 0;
      for (const tr of fd.layout.transformers) {
        const p = poletopPanel(poletopState(s, fd, tr.id), tr.id);
        if (p) (check(p, tr.id), n++);
      }
      expect(n).toBe(fd.layout.transformers.length);
      // the feeder's regulator, each phase
      const rs = regState(s, fd, null);
      expect(rs).not.toBeNull();
      for (const p of [0, 1, 2]) check(regPanel(rs, p)!, `regulator phase ${p}`);
      // every home's solar inverter (by day)
      for (const h of fd.layout.homes) {
        if (h.pvKW <= 0) continue;
        const ip = invPanel(invState(s, fd, h.id));
        if (ip) check(ip, `inverter ${h.id}`);
      }
    });

    it(`every transmission transformer, opened up, at interval ${t}`, () => {
      const s = snapshot(g, day.points[t]!);
      let n = 0;
      g.branches.forEach((br, k) => {
        if (br.kind !== 'transformer' || br.id.endsWith('GSU')) return;
        const p = transformerPanel(gridPlate(g, k, br.id), gridXfmrState(g, s, k), { r: br.r, rProv: 'r', vBase: br.from.kv, vProv: 'v', sBase: S_BASE, sProv: 's', side: 'H' });
        if (p) (check(p, br.id), n++);
      });
      expect(n).toBeGreaterThan(30);
    });

    it(`every line's span out of every yard, in every wind, at interval ${t}`, () => {
      const s = snapshot(g, day.points[t]!);
      let n = 0;
      g.branches.forEach((br, k) => {
        if (br.kind !== 'line') return;
        for (const site of [br.from, br.to])
          for (const wind of ['still', 'rating', 'breeze'] as const) {
            const st = spanState(g, s, site.site.id, [k], 300, 45, wind);
            const p = spanPanel(st, 0, `span:${site.site.id}`);
            if (p) (check(p, `${br.id} at ${site.site.id}, ${wind}`), n++);
          }
      });
      expect(n).toBeGreaterThan(300);
    });

    it(`every line's breaker at both ends, opened, at interval ${t}`, () => {
      const s = snapshot(g, day.points[t]!);
      let n = 0;
      g.branches.forEach((br, k) => {
        if (br.kind !== 'line') return;
        for (const site of [br.from, br.to]) {
          const p = breakerPanel(breakerState(g, s, k, site.site.id), `cb:${site.site.id}:${br.id}`, site.kv, `data:network.bus.${site.id}.baseKV`);
          if (p) (check(p, `${br.id} at ${site.site.id}`), n++);
        }
      });
      expect(n).toBeGreaterThan(150);
    });

    it(`every capacitor bank and one of its cans, at interval ${t}`, () => {
      const s = snapshot(g, day.points[t]!);
      let n = 0;
      g.shunts.forEach((sh, k) => {
        if (sh.stepMVAr <= 0) return;
        const st = capBankState(g, s, k, false, null);
        const key = `cap:${sh.bus.site.id}:${k}`;
        const p = capBankPanel(st, key);
        if (p) (check(p, `${sh.bus.id} bank`), n++);
        const c = canPanel(st, `can:${sh.bus.site.id}:${k}`, key);
        if (c) (check(c, `${sh.bus.id} can`), n++);
      });
      expect(n).toBeGreaterThan(80);
    });
  }
});
