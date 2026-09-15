/** Capture a zoom sequence toward Eden Vale, to see every intermediate state. */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

mkdirSync('screenshots/zoom', { recursive: true });
const server = await createServer({ server: { port: 5201, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5201/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// Where Eden Vale is, in world metres.
const target = await page.evaluate(() => {
  const g = window.gridAtlas;
  for (const [id, site] of g.geometry.sites) {
    if (/eden/i.test(id)) {
      const p = site.ground;
      return { x: p.x, y: p.y ?? 0, z: p.z };
    }
  }
  return null;
});
console.log('target', target);

const scales = [1150, 600, 300, 165, 80, 40, 20, 10, 5, 2.7, 1.2, 0.5, 0.25, 0.115, 0.06, 0.042];
for (const [i, mpp] of scales.entries()) {
  await page.evaluate(({ t, mpp }) => {
    const g = window.gridAtlas;
    g.viewport.camera.target.set(t.x, t.y, t.z);
    g.viewport.camera.setZoom(mpp);
    g.viewport.invalidate();
  }, { t: target, mpp });
  await page.waitForTimeout(700);
  const name = `screenshots/zoom/${String(i).padStart(2, '0')}-${mpp}.png`;
  await page.screenshot({ path: name });
  console.log(name);
}
if (errors.length) { console.error('ERRORS:'); for (const e of errors.slice(0, 15)) console.error(' ', e); }
await browser.close();
await server.close();
