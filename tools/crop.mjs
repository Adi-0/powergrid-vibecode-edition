/**
 * Look closely at one part of one view.
 *
 * `tools/audit.mjs` captures every view at window size, which is right for
 * checking that a view is composed and wrong for judging line weights, dash
 * patterns or whether a transformer reads as a transformer. This renders at
 * three times the device scale and cuts out a rectangle, so a detail can be
 * looked at the way it would be printed.
 *
 *   node tools/crop.mjs <level> <morph|-> <x> <y> <w> <h> <name>
 *
 * The rectangle is in CSS pixels of a 1440 × 900 window. `morph` is the
 * substation's diagram-to-yard slider, or `-` to leave it alone.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const [view, morph, x, y, w, h, out] = process.argv.slice(2);
if (!out) {
  console.error('usage: node tools/crop.mjs <level> <morph|-> <x> <y> <w> <h> <name>');
  process.exit(1);
}
mkdirSync('screenshots/crop', { recursive: true });

const server = await createServer({ server: { port: 5222, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e)));
await page.goto('http://localhost:5222/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);
await page.evaluate((v) => window.gridAtlas.goTo(v), view);
await page.waitForTimeout(2400);
if (morph !== '-') {
  await page.evaluate((m) => {
    window.gridAtlas.view.substationMorph = +m;
    window.gridAtlas.levelBar.setMorph(+m);
    window.gridAtlas.viewport.invalidate();
  }, morph);
  await page.waitForTimeout(900);
}
await page.screenshot({
  path: `screenshots/crop/${out}.png`,
  clip: { x: +x, y: +y, width: +w, height: +h },
});
console.log(`screenshots/crop/${out}.png`);
await browser.close();
await server.close();
