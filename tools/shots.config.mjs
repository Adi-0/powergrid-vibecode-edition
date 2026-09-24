// Views the screenshot harness captures. `probe` runs in Node against the page and
// returns { ok, value }; a failing probe fails the run. `before` sets the view up.
const waitSnap = async (page) => page.waitForFunction(() => window.__app && window.__app.snaps.size > 0, null, { timeout: 90000 });

/**
 * The provenance invariant, checked on the rendered page: every visible text node
 * that contains a digit sits inside an element carrying data-prov (a solver output,
 * a data table entry, a user input, a derived value, or notation such as a formula's
 * exponent or a sheet zone number). Returns the offending strings.
 */
const provenance = async (page) => {
  const bad = await page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.getElementById('app') ?? document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!/[0-9⁰¹²³⁴⁵⁶⁷⁸⁹₀-₉½¼¾]/.test(n.textContent ?? '')) continue;
      const e = n.parentElement;
      if (!e || e.closest('[data-prov]')) continue;
      const st = getComputedStyle(e);
      if (st.visibility === 'hidden' || st.display === 'none' || !e.getClientRects().length) continue;
      out.push(n.textContent.trim().slice(0, 60));
    }
    return out;
  });
  return { ok: bad.length === 0, value: bad.length ? bad : 'every digit has provenance' };
};

/**
 * Frame cost with the full network on screen while the camera moves (so labels are
 * laid out every frame). Headless Chromium rasterises in software (SwiftShader), so
 * its frame rate says little about a GPU; the budget checked is the main-thread cost
 * per frame against 16.7 ms, and the GPU workload is reported alongside.
 */
const perf = async (page) => {
  const s = await page.evaluate(async () => {
    const app = window.__app;
    app.resetStats();
    const t0 = performance.now();
    let k = 0;
    await new Promise((resolve) => {
      const step = () => {
        app.pan(Math.sin(k / 9) * 6, Math.cos(k / 13) * 4);
        k++;
        if (performance.now() - t0 < 4000) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    return app.stats();
  });
  const r = (x) => Math.round(x * 100) / 100;
  return {
    ok: s.cpuMsP95 < 16.7,
    value: { cpuMsAvg: r(s.cpuMsAvg), cpuMsP95: r(s.cpuMsP95), cpuMsMax: r(s.cpuMsMax), softwareFps: r(s.fps), drawCalls: s.drawCalls, triangles: s.triangles, instances: s.instances },
  };
};

/** Wait until the sheet shows the answer to the reader's latest request. */
const waitSolved = async (page) =>
  page.waitForFunction(() => {
    const a = window.__app;
    return a.current && a.current.seq > 0 && a.current.seq === a.seq && !a.inFlight;
  }, null, { timeout: 90000 });

const tripByName = (names) => async (page) => {
  await waitSnap(page);
  await page.evaluate((names) => {
    const app = window.__app;
    for (const n of names) app.trip(app.grid.branches.findIndex((b) => b.id === n));
    app.select({ kind: 'branch', index: app.grid.branches.findIndex((b) => b.id === names[0]) });
  }, names);
  await waitSolved(page);
};

/** A math panel is on screen, with at least a few steps. */
const mathShown = async (page) => {
  const n = await page.evaluate(() => document.querySelectorAll('.inspector .mathpanel .step').length);
  return { ok: n >= 3, value: `${n} steps shown` };
};

/**
 * The displayed arithmetic, re-done from the page's own text: each step's substituted
 * line is read back as printed (thin spaces, minus signs, ×, ÷, √, °, superscript 2),
 * evaluated, rounded to the printed result's decimals and compared with that result.
 * Earlier results are used as printed, as a reader would.
 */
const mathArithmetic = async (page) => {
  const bad = await page.evaluate(() => {
    const out = [];
    let checked = 0;
    for (const step of document.querySelectorAll('.inspector .mathpanel .step')) {
      const sub = step.querySelector('.subst');
      const res = step.querySelector('.result');
      if (!sub || !res) continue;
      const text = (el) => {
        let t = '';
        for (const n of el.childNodes) {
          if (n.nodeType === 3) t += n.textContent;
          else if (n.tagName === 'SUP') t += `**${n.textContent}`;
          else if (n.classList?.contains('solver') || n.classList?.contains('u')) continue;
          else t += text(n);
        }
        return t;
      };
      const js = text(sub)
        .replace(/^\s*=\s*/, '')
        .replace(/(\d)[\u2009\u202f\u00a0 ](?=\d)/g, '$1')
        .replace(/−/g, '-')
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/√\(/g, 'Math.sqrt(')
        .replace(/(cos|sin) \(([^()]*?)°\)/g, (_, f, a) => `Math.${f}((${a})*Math.PI/180)`)
        .replace(/atan \(/g, '(180/Math.PI)*Math.atan(');
      const shownText = text(res.cloneNode(true)).replace(/^\s*=\s*/, '');
      const m = shownText.replace(/[\u2009\u202f\u00a0 ]/g, '').replace('−', '-').match(/^-?[0-9.]+/);
      if (!m) {
        out.push(`unreadable result: ${shownText}`);
        continue;
      }
      const decimals = (m[0].split('.')[1] ?? '').length;
      let v;
      try {
        v = Function(`return (${js});`)();
      } catch (e) {
        out.push(`unparseable: ${js}`);
        continue;
      }
      const want = Number(m[0]);
      checked++;
      if (Math.abs(v - want) > 0.5 * 10 ** -decimals * 1.0001 + 1e-12) out.push(`${js} = ${v}, shown ${m[0]}`);
    }
    return { out, checked };
  });
  const ok = bad.out.length === 0 && bad.checked > 0;
  return { ok, value: bad.out.length ? bad.out.slice(0, 5) : `${bad.checked} displayed steps re-evaluate to their displayed results` };
};

const both = (...probes) => async (page) => {
  const rs = [];
  for (const p of probes) rs.push(await p(page));
  return { ok: rs.every((r) => r.ok), value: rs.map((r) => r.value) };
};

export default [
  {
    name: 'test-scene',
    url: '?scene=test',
    width: 1200,
    height: 800,
    probe: async (page) => {
      const ink = await page.evaluate(() => window.__probe());
      return { ok: ink > 5000, value: ink };
    },
  },
  { name: 'system', url: '', width: 1440, height: 900, timeout: 90000, settle: 800, before: waitSnap, probe: both(provenance, perf) },
  {
    name: 'system-line',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => {
        const app = window.__app;
        const k = app.grid.branches.findIndex((b) => b.id === 'MIDWAY–VINCENT 500 #1');
        app.select({ kind: 'branch', index: k });
      });
    },
    probe: provenance,
  },
  {
    name: 'system-site',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.select({ kind: 'site', id: 'MOSS_LANDING' }));
    },
    probe: provenance,
  },
  {
    name: 'system-bay',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.focusSite('TESLA', 5));
    },
    probe: provenance,
  },
  {
    name: 'system-noon',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 600,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.setTime(50));
      await waitSolved(page);
    },
    probe: provenance,
  },
  {
    name: 'system-play',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 200,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => document.querySelector('.scrubber .play').click());
      await page.waitForTimeout(5000);
    },
    // playback advances only through intervals that were solved when shown
    probe: async (page) => {
      const r = await page.evaluate(() => ({ seq: window.__app.seq, shown: window.__app.current.t, asked: window.__app.t }));
      return { ok: r.seq >= 3 && Math.abs(r.asked - r.shown) <= 1, value: r };
    },
  },
  { name: 'system-trip', url: '', width: 1440, height: 900, timeout: 90000, settle: 600, before: tripByName(['SANTIAGO–SAN_ONOFRE 230 #1']), probe: provenance },
  {
    name: 'system-trip-show',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 1200,
    before: async (page) => {
      await tripByName(['SANTIAGO–SAN_ONOFRE 230 #1'])(page);
      await page.evaluate(() => document.querySelector('.notice .list button').click());
    },
    probe: provenance,
  },
  { name: 'system-nosol', url: '', width: 1440, height: 900, timeout: 90000, settle: 600, before: tripByName(['PALO_VERDE–IMPERIAL_VALLEY 500 #1']), probe: provenance },
  {
    name: 'region-bay',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.enterRegion('bay'));
      await page.waitForFunction(() => window.__app.level === 'region' && !window.__app.transitioning, null, { timeout: 30000 });
    },
    probe: provenance,
  },
  {
    name: 'region-bay-xfmr',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.enterRegion('bay'));
      await page.waitForFunction(() => window.__app.level === 'region' && !window.__app.transitioning, null, { timeout: 30000 });
      await page.evaluate(() => {
        const app = window.__app;
        const k = app.grid.branches.findIndex((b) => b.kind === 'transformer' && b.from.site.id === 'METCALF' && b.to.kv === 60);
        app.select({ kind: 'branch', index: k });
      });
    },
    probe: provenance,
  },
  {
    name: 'region-exit',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.enterRegion('bay'));
      await page.waitForFunction(() => window.__app.level === 'region' && !window.__app.transitioning, null, { timeout: 30000 });
      await page.evaluate(() => window.__app.exitRegion());
      await page.waitForFunction(() => window.__app.level === 'system' && !window.__app.transitioning, null, { timeout: 30000 });
    },
    probe: provenance,
  },
  {
    name: 'region-bay-dark',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.enterRegion('bay'));
      await page.waitForFunction(() => window.__app.level === 'region' && !window.__app.transitioning, null, { timeout: 30000 });
      await page.evaluate(() => {
        const app = window.__app;
        app.grid.branches.forEach((b, k) => {
          if (b.from.site.id === 'EVERGREEN' || b.to.site.id === 'EVERGREEN') app.trip(k);
        });
        app.select({ kind: 'site', id: 'EVERGREEN' });
      });
      await waitSolved(page);
    },
    probe: provenance,
  },
  {
    name: 'substation',
    url: '',
    width: 1440,
    height: 900,
    timeout: 120000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['substation']));
      await page.waitForFunction(() => window.__app.level === 'substation' && !window.__app.transitioning && window.__app.current && window.__app.current.feeder, null, { timeout: 60000 });
    },
    probe: provenance,
  },
  {
    name: 'feeder',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      const go = async (fn, level) => {
        await page.evaluate(fn);
        await page.waitForFunction((lv) => window.__app.level === lv && !window.__app.transitioning, level, { timeout: 60000 });
      };
      await go(() => window.__app.navigate(['feeder']), 'feeder');
      await page.waitForFunction(() => window.__app.current && window.__app.current.feeder, null, { timeout: 60000 });
    },
    probe: provenance,
  },
  {
    name: 'feeder-home',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      const go = async (fn, level) => {
        await page.evaluate(fn);
        await page.waitForFunction((lv) => window.__app.level === lv && !window.__app.transitioning, level, { timeout: 60000 });
      };
      await go(() => window.__app.navigate(['feeder']), 'feeder');
      await page.waitForFunction(() => window.__app.current && window.__app.current.feeder, null, { timeout: 60000 });
      await page.evaluate(() => {
        const app = window.__app;
        app.select({ kind: 'dist', what: 'home', id: app.feederModel().layout.outlet.home });
      });
    },
    probe: provenance,
  },
  {
    name: 'feeder-fault-mid',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      const go = async (fn, level) => {
        await page.evaluate(fn);
        await page.waitForFunction((lv) => window.__app.level === lv && !window.__app.transitioning, level, { timeout: 60000 });
      };
      await go(() => window.__app.navigate(['feeder']), 'feeder');
      await page.waitForFunction(() => window.__app.current && window.__app.current.feeder, null, { timeout: 60000 });
      // a permanent fault on the trunk beyond the recloser, held during the second fast shot
      await page.evaluate(() => {
        window.__app.freezeFault = 2.07;
        window.__app.faultFeeder('F4', true);
      });
    },
    probe: async (page) => {
      const r = await provenance(page);
      const f = await page.evaluate(() => {
        const e = window.__app.feederEvent;
        return { open: e.prot.open, trips: e.prot.events.filter((x) => x.what === 'trip').map((x) => x.device + ':' + (x.how ?? '')) };
      });
      return { ok: r.ok && f.open.join() === 'RCL-1', value: [r.value, f] };
    },
  },
  {
    name: 'feeder-fault-lateral',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      const go = async (fn, level) => {
        await page.evaluate(fn);
        await page.waitForFunction((lv) => window.__app.level === lv && !window.__app.transitioning, level, { timeout: 60000 });
      };
      await go(() => window.__app.navigate(['feeder']), 'feeder');
      await page.waitForFunction(() => window.__app.current && window.__app.current.feeder, null, { timeout: 60000 });
      // a permanent fault at the far end of lateral L10: the fuse clears it; hold the view after the sequence
      await page.evaluate(() => {
        const app = window.__app;
        const lat = app.feederModel().layout.laterals.find((l) => l.id === 'L10');
        app.freezeFault = 1e9;
        app.faultFeeder(lat.nodes[lat.nodes.length - 1], true);
      });
      await page.waitForFunction(() => window.__app.current && window.__app.current.feederOpen.length > 0 && !window.__app.inFlight, null, { timeout: 60000 });
    },
    probe: async (page) => {
      const r = await provenance(page);
      const f = await page.evaluate(() => {
        const app = window.__app;
        const s = app.current;
        const lat = app.feederModel().layout.laterals.find((l) => l.id === 'L10');
        return { open: s.feederOpen, out: app.feederEvent.outHomes, headKW: s.feeder.headP / 1000 };
      });
      return { ok: r.ok && f.open.join() === 'FU-L10' && f.out > 0, value: [r.value, f] };
    },
  },
  {
    name: 'feeder-fault-math',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      const go = async (fn, level) => {
        await page.evaluate(fn);
        await page.waitForFunction((lv) => window.__app.level === lv && !window.__app.transitioning, level, { timeout: 60000 });
      };
      await go(() => window.__app.navigate(['feeder']), 'feeder');
      await page.waitForFunction(() => window.__app.current && window.__app.current.feeder, null, { timeout: 60000 });
      await page.evaluate(() => {
        const app = window.__app;
        const lat = app.feederModel().layout.laterals.find((l) => l.id === 'L7');
        app.freezeFault = 1e9;
        app.faultFeeder(lat.nodes[lat.nodes.length - 1], true);
        app.inspector.toggleWorking(true);
      });
      await page.waitForFunction(() => window.__app.current && window.__app.current.feederOpen.length > 0 && !window.__app.inFlight, null, { timeout: 60000 });
    },
    probe: both(provenance, mathShown, mathArithmetic),
  },
  {
    name: 'service-outlet',
    url: '',
    width: 1440,
    height: 900,
    timeout: 180000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      const go = async (fn, level) => {
        await page.evaluate(fn);
        await page.waitForFunction((lv) => window.__app.level === lv && !window.__app.transitioning, level, { timeout: 60000 });
      };
      await go(() => window.__app.navigate(['service']), 'service');
      await page.waitForFunction(() => window.__app.current && window.__app.current.feeder, null, { timeout: 60000 });
      await page.evaluate(() => window.__app.select({ kind: 'dist', what: 'outlet', id: 'OUTLET' }));
    },
    probe: provenance,
  },
  {
    name: 'site-unfold',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 600,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.holdBand('site:TESLA', 0.55));
      await page.waitForTimeout(800);
    },
    probe: provenance,
  },
  {
    name: 'site',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['site']));
      await page.waitForFunction(() => window.__app.level === 'site' && !window.__app.transitioning, null, { timeout: 60000 });
    },
    probe: provenance,
  },
  {
    name: 'site-math',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['site']));
      await page.waitForFunction(() => window.__app.level === 'site' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => window.__app.inspector.toggleWorking(true));
    },
    probe: both(provenance, mathShown, mathArithmetic),
  },
  {
    name: 'feeder-unfold',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 600,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.holdBand('site:EVERGREEN', 0.6));
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'substation-unfold',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 600,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['feeder']));
      await page.waitForFunction(() => window.__app.level === 'feeder' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => {
        window.__app.inspector.hide();
        window.__app.holdBand('substation', 0.55);
      });
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'plant-unfold',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 600,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.goTo(['site:MOSS_LANDING']));
      await page.waitForFunction(() => window.__app.level === 'site' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => {
        window.__app.inspector.hide();
        window.__app.holdBand('plant:ML1', 0.55);
      });
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'machine-unfold',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 600,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['plant']));
      await page.waitForFunction(() => window.__app.level === 'plant' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => {
        window.__app.inspector.hide();
        window.__app.holdBand('machine:GT1', 0.55);
      });
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'xfmr-unfold',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 600,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['site']));
      await page.waitForFunction(() => window.__app.level === 'site' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => {
        window.__app.inspector.hide();
        window.__app.holdBand('xf:TESLA 500/230 #1', 0.5);
      });
      await page.waitForTimeout(800);
    },
    probe: provenance,
  },
  {
    name: 'xfmr',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1200,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['transformer']));
      await page.waitForFunction(() => window.__app.level === 'transformer' && !window.__app.transitioning, null, { timeout: 60000 });
    },
    probe: provenance,
  },
  {
    name: 'xfmr-math',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['transformer']));
      await page.waitForFunction(() => window.__app.level === 'transformer' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => window.__app.inspector.toggleWorking(true));
    },
    probe: both(provenance, mathShown, mathArithmetic),
  },
  {
    name: 'xfmr-part',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['transformer']));
      await page.waitForFunction(() => window.__app.level === 'transformer' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => window.__app.select({ kind: 'part', id: 'xf:TESLA 500/230 #1', what: 'winding', sub: 'common' }));
    },
    probe: provenance,
  },
  {
    name: 'bank',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1200,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['bank']));
      await page.waitForFunction(() => window.__app.level === 'transformer' && !window.__app.transitioning, null, { timeout: 90000 });
      await waitSolved(page);
    },
    probe: provenance,
  },
  {
    name: 'bank-math',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1200,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['bank']));
      await page.waitForFunction(() => window.__app.level === 'transformer' && !window.__app.transitioning, null, { timeout: 90000 });
      await waitSolved(page);
      await page.evaluate(() => window.__app.inspector.toggleWorking(true));
    },
    probe: both(provenance, mathShown, mathArithmetic),
  },
  {
    name: 'cb-unfold',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 600,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['site']));
      await page.waitForFunction(() => window.__app.level === 'site' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => {
        const a = window.__app;
        a.inspector.hide();
        const keys = a.keysFor('breaker');
        a.holdBand(keys[keys.length - 1], 0.5);
      });
      await page.waitForTimeout(800);
    },
    probe: provenance,
  },
  {
    name: 'cb',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['breaker']));
      await page.waitForFunction(() => window.__app.level === 'breaker' && !window.__app.transitioning, null, { timeout: 60000 });
    },
    probe: provenance,
  },
  {
    name: 'cb-opening',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 0,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['breaker']));
      await page.waitForFunction(() => window.__app.level === 'breaker' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => {
        const a = window.__app;
        const l = a.top;
        a.operateBreaker(l, a.levelPortal.get(l).sel.index, 'open');
      });
      // the contacts have parted and the arcs burn (about 28 ms into the sequence, shown slowed)
      await page.waitForFunction(() => (window.__app.top.sequenceMs ?? 0) > 27.5, null, { timeout: 30000 });
    },
    probe: provenance,
  },
  {
    name: 'cb-math',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['breaker']));
      await page.waitForFunction(() => window.__app.level === 'breaker' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => window.__app.inspector.toggleWorking(true));
    },
    probe: both(provenance, mathShown, mathArithmetic),
  },
  {
    name: 'cb60',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1200,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['breaker60']));
      await page.waitForFunction(() => window.__app.level === 'breaker' && !window.__app.transitioning, null, { timeout: 90000 });
      await waitSolved(page);
    },
    probe: provenance,
  },
  {
    name: 'region-bay-fold',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 300,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => {
        window.__app.freezeMorph = 0.5;
        window.__app.enterRegion('bay');
      });
      await page.waitForFunction(() => window.__app.level === 'region', null, { timeout: 30000 });
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'system-close',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.focusSite('METCALF', 30));
    },
    probe: provenance,
  },
  {
    name: 'math-line',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => {
        const app = window.__app;
        app.select({ kind: 'branch', index: app.grid.branches.findIndex((b) => b.id === 'MIDWAY–VINCENT 500 #1') });
        app.inspector.toggleWorking(true);
      });
    },
    probe: both(provenance, mathShown, mathArithmetic),
  },
  {
    name: 'math-site',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => {
        window.__app.select({ kind: 'site', id: 'MOSS_LANDING' });
        window.__app.inspector.toggleWorking(true);
      });
    },
    probe: both(provenance, mathShown, mathArithmetic),
  },
  {
    name: 'math-region',
    url: '',
    width: 1440,
    height: 900,
    timeout: 120000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.enterRegion('bay'));
      await page.waitForFunction(() => window.__app.level === 'region' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => window.__app.inspector.toggleWorking(true));
    },
    probe: both(provenance, mathShown, mathArithmetic),
  },
  {
    name: 'math-outlet',
    url: '',
    width: 1440,
    height: 900,
    timeout: 180000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      const go = async (fn, level) => {
        await page.evaluate(fn);
        await page.waitForFunction((lv) => window.__app.level === lv && !window.__app.transitioning, level, { timeout: 60000 });
      };
      await go(() => window.__app.navigate(['service']), 'service');
      await page.waitForFunction(() => window.__app.current && window.__app.current.feeder, null, { timeout: 60000 });
      await page.evaluate(() => {
        window.__app.select({ kind: 'dist', what: 'outlet', id: 'OUTLET' });
        window.__app.inspector.toggleWorking(true);
      });
    },
    probe: both(provenance, mathShown, mathArithmetic),
  },
  {
    name: 'plant',
    url: '',
    width: 1440,
    height: 900,
    timeout: 120000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['plant']));
      await page.waitForFunction(() => window.__app.level === 'plant' && !window.__app.transitioning, null, { timeout: 60000 });
      await waitSolved(page);
    },
    probe: provenance,
  },
  {
    name: 'plant-trip',
    url: '',
    width: 1440,
    height: 900,
    timeout: 120000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['plant']));
      await page.waitForFunction(() => window.__app.level === 'plant' && !window.__app.transitioning, null, { timeout: 60000 });
      await waitSolved(page);
      await page.evaluate(() => window.__app.tripPlant('ML1'));
      await waitSolved(page);
    },
    probe: async (page) => {
      const r = await provenance(page);
      const f = await page.evaluate(() => {
        const e = window.__app.tripEvent;
        const s = window.__app.current;
        return { nadir: e && e.nadirHz, settled: e && e.settledHz, outcome: s.outcome, tripped: s.plantOutages };
      });
      return { ok: r.ok && f.nadir < 60 && f.outcome !== 'none' && f.tripped.includes('ML1'), value: [r.value, f] };
    },
  },
  {
    name: 'plant-math',
    url: '',
    width: 1440,
    height: 900,
    timeout: 120000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['plant']));
      await page.waitForFunction(() => window.__app.level === 'plant' && !window.__app.transitioning, null, { timeout: 60000 });
      await waitSolved(page);
      await page.evaluate(() => window.__app.inspector.toggleWorking(true));
    },
    probe: both(provenance, mathShown, mathArithmetic),
  },
  {
    name: 'machine',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['plant']));
      await page.waitForFunction(() => window.__app.level === 'plant' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => window.__app.navigate(['machine']));
      await page.waitForFunction(() => window.__app.level === 'machine' && !window.__app.transitioning, null, { timeout: 60000 });
      await waitSolved(page);
    },
    probe: provenance,
  },
  {
    name: 'machine-hi',
    url: '',
    width: 1440,
    dpr: 2,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['plant']));
      await page.waitForFunction(() => window.__app.level === 'plant' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => window.__app.navigate(['machine']));
      await page.waitForFunction(() => window.__app.level === 'machine' && !window.__app.transitioning, null, { timeout: 60000 });
      await waitSolved(page);
    },
    probe: provenance,
  },
  {
    name: 'machine-excite',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['plant']));
      await page.waitForFunction(() => window.__app.level === 'plant' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => window.__app.navigate(['machine']));
      await page.waitForFunction(() => window.__app.level === 'machine' && !window.__app.transitioning, null, { timeout: 60000 });
      await waitSolved(page);
      const q0 = await page.evaluate(() => window.__app.current.qg[window.__app.grid.gens.find((g) => g.id === 'ML1-GT1').index]);
      await page.evaluate(() => {
        const app = window.__app;
        const g = app.grid.gens.find((x) => x.id === 'ML1-GT1');
        app.setExcitation(g.index, g.vset + 0.02);
      });
      await waitSolved(page);
      await page.evaluate((q0) => (window.__q0 = q0), q0);
      // bring the capability chart into view
      await page.evaluate(() => {
        const c = document.querySelectorAll('.inspector .chart')[1];
        c?.scrollIntoView({ block: 'center' });
      });
    },
    probe: async (page) => {
      const r = await provenance(page);
      const q = await page.evaluate(() => ({ before: window.__q0, after: window.__app.current.qg[window.__app.grid.gens.find((g) => g.id === 'ML1-GT1').index] }));
      return { ok: r.ok && q.after > q.before, value: [r.value, q] };
    },
  },
  {
    name: 'machine-math',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 1000,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['plant']));
      await page.waitForFunction(() => window.__app.level === 'plant' && !window.__app.transitioning, null, { timeout: 60000 });
      await page.evaluate(() => window.__app.navigate(['machine']));
      await page.waitForFunction(() => window.__app.level === 'machine' && !window.__app.transitioning, null, { timeout: 60000 });
      await waitSolved(page);
      await page.evaluate(() => window.__app.inspector.toggleWorking(true));
    },
    probe: both(provenance, mathShown, mathArithmetic),
  },
  {
    name: 'honesty-feeder',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.navigate(['feeder']));
      await page.evaluate(() => window.__app.openHonesty());
    },
    probe: async (page) => {
      const r = await provenance(page);
      const n = await page.evaluate(() => document.querySelectorAll('.honesty .item').length);
      return { ok: r.ok && n >= 5, value: [r.value, `${n} items shown`] };
    },
  },
  {
    name: 'glossary',
    url: '',
    width: 1440,
    height: 900,
    timeout: 90000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.openGlossary('inertia'));
    },
    probe: async (page) => {
      const r = await provenance(page);
      const n = await page.evaluate(() => [...document.querySelectorAll('.glossary dt')].filter((e) => !e.hidden).length);
      return { ok: r.ok && n > 100, value: [r.value, `${n} terms`] };
    },
  },
  {
    name: 'tour-stop',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.tour.goTo(2));
    },
    probe: provenance,
  },
  {
    name: 'tour-run',
    url: '',
    width: 1440,
    height: 900,
    timeout: 480000,
    settle: 800,
    before: async (page) => {
      await waitSnap(page);
      const report = [];
      const n = await page.evaluate(() => window.__app.tour.stops);
      for (let i = 0; i < n; i++) {
        const t0 = Date.now();
        await page.evaluate((i) => window.__app.tour.goTo(i), i);
        await page.waitForTimeout(300);
        const bad = await page.evaluate(() => {
          const out = [];
          const walk = document.createTreeWalker(document.getElementById('app') ?? document.body, NodeFilter.SHOW_TEXT);
          for (let x = walk.nextNode(); x; x = walk.nextNode()) {
            if (!/[0-9]/.test(x.textContent ?? '')) continue;
            const e = x.parentElement;
            if (!e || e.closest('[data-prov]')) continue;
            const st = getComputedStyle(e);
            if (st.visibility === 'hidden' || st.display === 'none' || !e.getClientRects().length) continue;
            out.push(x.textContent.trim().slice(0, 40));
          }
          return { level: window.__app.level, bad: out, busy: window.__app.tour.busy };
        });
        report.push({ i, ms: Date.now() - t0, ...bad });
      }
      await page.evaluate((r) => (window.__tourReport = r), report);
    },
    probe: async (page) => {
      const r = await page.evaluate(() => window.__tourReport);
      const ok = r.length >= 13 && r.every((x) => x.bad.length === 0 && !x.busy);
      return { ok, value: r.map((x) => `${x.i}:${x.level}:${(x.ms / 1000).toFixed(1)}s${x.bad.length ? ' BAD ' + x.bad.join('|') : ''}`) };
    },
  },
  { name: 'system-mobile', url: '', width: 390, height: 844, dpr: 2, timeout: 90000, settle: 800, before: waitSnap, probe: provenance },
];
