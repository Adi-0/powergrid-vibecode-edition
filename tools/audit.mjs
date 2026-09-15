/**
 * Capture every view the app can show, at the scale it is meant to be seen.
 *
 * The brief asks for screenshots critiqued against the visual direction before
 * a phase advances. This is that, made systematic: one run produces the whole
 * set, so a regression in a view nobody happened to look at cannot hide.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const only = process.argv.slice(2);
mkdirSync('screenshots/audit', { recursive: true });

const server = await createServer({ server: { port: 5210, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5210/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);

/** Wait until the camera has stopped moving, so nothing is captured mid-flight. */
async function settle() {
  let last = null;
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate(() => {
      const c = window.gridAtlas.viewport.camera;
      return `${c.metresPerPixel.toFixed(5)}|${c.target.x.toFixed(2)}|${c.target.z.toFixed(2)}`;
    });
    if (now === last) return;
    last = now;
    await page.waitForTimeout(140);
  }
}

const go = async (id) => {
  await page.evaluate((id) => window.gridAtlas.goTo(id), id);
  // The flight is 900 ms and eases, so its last frames move too little for a
  // change-detector to notice. Wait it out before watching for stillness.
  await page.waitForTimeout(1100);
  await settle();
};

/** Put the camera somewhere exactly, with no flight to fight against. */
const place = async (siteMatch, mpp) => {
  await page.evaluate(({ siteMatch, mpp }) => {
    const g = window.gridAtlas;
    if (siteMatch) {
      for (const [id, s] of g.geometry.sites) {
        if (new RegExp(siteMatch).test(id)) g.viewport.camera.target.copy(s.ground);
      }
    }
    g.viewport.camera.floorScale = 0.0001;
    // Fly rather than teleport, so the real camera-change path runs and the
    // breadcrumb and panels are exercised exactly as a reader would.
    g.viewport.flyTo(g.viewport.camera.target.clone(), mpp, 240);
  }, { siteMatch, mpp });
  await page.waitForTimeout(700);
  await settle();
};
const evalIn = (fn, arg) => page.evaluate(fn, arg);

const shots = [
  ['01-system', async () => { await go('system'); }],
  ['02-region', async () => { await place('edenvale', 140); }],
  ['03-approach', async () => { await place('edenvale', 24); }],
  ['04-feeder', async () => { await go('feeder'); }],
  ['05-feeder-close', async () => { await place(null, 1.6); }],
  ['06-substation-diagram', async () => {
    await go('substation');
    await evalIn(() => {
      window.gridAtlas.view.substationMorph = 0;
      window.gridAtlas.levelBar.setMorph(0);
      window.gridAtlas.viewport.invalidate();
    });
  }],
  ['07-substation-yard', async () => {
    await evalIn(() => {
      window.gridAtlas.view.substationMorph = 1;
      window.gridAtlas.levelBar.setMorph(1);
      window.gridAtlas.viewport.invalidate();
    });
  }],
  ['08-service', async () => { await go('service'); }],
  ['09-plant', async () => { await go('plant'); }],
  ['10-machine', async () => { await go('machine'); }],
  ['11-inspect-circuit', async () => {
    await go('system');
    await page.evaluate(() => {
      const g = window.gridAtlas;
      const busiest = [...g.state.current.solved.branchById.values()]
        .filter((b) => Math.abs(b.pFromMW) > 300)
        .sort((a, b) => Math.abs(b.pFromMW) - Math.abs(a.pFromMW))[0];
      if (busiest) g.state.select('circuit', busiest.branchId);
    });
  }],
  ['12-math', async () => {
    await page.evaluate(() => {
      const g = window.gridAtlas;
      const sel = g.state.current.selection;
      if (sel.id) g.openMath(sel.kind, sel.id);
    });
  }],
  ['13-honesty', async () => {
    await page.evaluate(() => {
      window.gridAtlas.math.close();
      document.querySelector('[data-panel="honesty"]').click();
    });
  }],
  ['14-glossary', async () => {
    await page.evaluate(() => {
      document.querySelector('[data-panel="glossary"]').click();
    });
  }],
];

for (const [name, fn] of shots) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  await fn();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `screenshots/audit/${name}.png` });
  const stats = await page.evaluate(() => {
    const f = window.gridAtlas.lastFrame;
    return { segs: f ? f.segments.length : 0, labels: f ? f.labels.length : 0,
      mpp: +window.gridAtlas.viewport.camera.metresPerPixel.toFixed(4),
      crumb: (document.querySelector('.crumb.is-here')?.textContent ?? '?').trim(),
      panel: (document.querySelector('.panel--level [data-role=\"title\"]')?.textContent ?? '—').trim(),
      active: f ? f.active.map((a) => `${a.scene}:${a.alpha.toFixed(2)}`).join(' ') : '' };
  });
  console.log(`${name.padEnd(22)} segs=${String(stats.segs).padStart(5)} labels=${String(stats.labels).padStart(3)} mpp=${String(stats.mpp).padStart(9)}  [${stats.crumb}] ${stats.panel.padEnd(18)} ${stats.active}`);
}

if (errors.length) { console.error('\nCONSOLE ERRORS:'); for (const e of errors.slice(0, 15)) console.error('  ' + e); }
await browser.close();
await server.close();
