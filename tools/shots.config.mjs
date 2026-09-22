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
  { name: 'system-mobile', url: '', width: 390, height: 844, dpr: 2, timeout: 90000, settle: 800, before: waitSnap, probe: provenance },
];
