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
      await page.evaluate(() => window.__app.enterRegion('bay'));
      await page.waitForFunction(() => window.__app.level === 'region' && !window.__app.transitioning, null, { timeout: 30000 });
      await page.evaluate(() => window.__app.enterSubstation());
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
      await go(() => window.__app.enterRegion('bay'), 'region');
      await go(() => window.__app.enterSubstation(), 'substation');
      await go(() => window.__app.enterFeeder(), 'feeder');
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
      await go(() => window.__app.enterRegion('bay'), 'region');
      await go(() => window.__app.enterSubstation(), 'substation');
      await go(() => window.__app.enterFeeder(), 'feeder');
      await page.waitForFunction(() => window.__app.current && window.__app.current.feeder, null, { timeout: 60000 });
      await page.evaluate(() => {
        const app = window.__app;
        app.select({ kind: 'dist', what: 'home', id: app.feederModel().layout.outlet.home });
      });
    },
    probe: provenance,
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
      await go(() => window.__app.enterRegion('bay'), 'region');
      await go(() => window.__app.enterSubstation(), 'substation');
      await go(() => window.__app.enterFeeder(), 'feeder');
      await go(() => {
        const app = window.__app;
        const h = app.feederModel().layout.homes.find((x) => x.id === app.feederModel().layout.outlet.home);
        app.enterService(h.transformer);
      }, 'service');
      await page.waitForFunction(() => window.__app.current && window.__app.current.feeder, null, { timeout: 60000 });
      await page.evaluate(() => window.__app.select({ kind: 'dist', what: 'outlet', id: 'OUTLET' }));
    },
    probe: provenance,
  },
  {
    name: 'substation-unfold',
    url: '',
    width: 1440,
    height: 900,
    timeout: 150000,
    settle: 300,
    before: async (page) => {
      await waitSnap(page);
      await page.evaluate(() => window.__app.enterRegion('bay'));
      await page.waitForFunction(() => window.__app.level === 'region' && !window.__app.transitioning, null, { timeout: 30000 });
      await page.evaluate(() => {
        window.__app.freezeMorph = 0.6;
        window.__app.enterSubstation();
      });
      await page.waitForFunction(() => window.__app.level === 'substation', null, { timeout: 30000 });
      await page.waitForTimeout(3000);
    },
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
  { name: 'system-mobile', url: '', width: 390, height: 844, dpr: 2, timeout: 90000, settle: 800, before: waitSnap, probe: provenance },
];
