/** Report, for a sweep of scales, what is drawn and how big it is on screen. */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5202, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e)));
await page.goto('http://localhost:5202/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const target = await page.evaluate(() => {
  for (const [id, site] of window.gridAtlas.geometry.sites) {
    if (/edenvale/i.test(id)) return { x: site.ground.x, y: site.ground.y, z: site.ground.z };
  }
  return null;
});

const scales = [2000, 1150, 600, 300, 165, 90, 50, 30, 20, 14, 9, 6, 4, 2.7, 1.6, 1.0,
  0.6, 0.4, 0.25, 0.15, 0.115, 0.08, 0.055, 0.042, 0.03, 0.02, 0.012];
const rows = [];
for (const mpp of scales) {
  const r = await page.evaluate(({ t, mpp }) => {
    const g = window.gridAtlas;
    g.viewport.camera.target.set(t.x, t.y, t.z);
    g.viewport.camera.floorScale = 0.0001;
    g.viewport.camera.setZoom(mpp);
    g.viewport.invalidate();
    g.viewport.render ? g.viewport.render() : null;
    return null;
  }, { t: target, mpp });
  await page.waitForTimeout(160);
  const info = await page.evaluate(() => {
    const g = window.gridAtlas;
    const f = g.lastFrame;
    return {
      active: f ? f.active.map((a) => ({ s: a.scene, a: +a.alpha.toFixed(2), f: +a.fit.toFixed(3) })) : [],
      segs: f ? f.segments.length : 0,
      labels: f ? f.labels.length : 0,
      floor: f ? +f.floorScale.toFixed(4) : null,
      panel: document.querySelector('.panel--level [data-role="title"]')?.textContent ?? '(none)',
    };
  });
  rows.push({ mpp, ...info });
}
for (const r of rows) {
  const act = r.active.map((a) => `${a.s} a${a.a} f${a.f} =${(a.a * a.f).toFixed(3)}`).join(' | ');
  console.log(String(r.mpp).padStart(7), '| segs', String(r.segs).padStart(5),
    '| lbl', String(r.labels).padStart(3), '| floor', String(r.floor).padStart(7), '|', r.panel.padEnd(20), '|', act);
}
await browser.close();
await server.close();
