/**
 * Screenshot the app for visual review.
 *
 * The brief requires screenshotting your own renders and critiquing them
 * against the visual direction before advancing a phase. This is that tool.
 *
 *   node tools/screenshot.mjs [name] [--width 1600] [--height 1000] [--script file.js]
 *
 * Writes to screenshots/<name>.png.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--')) ?? 'system';
const get = (flag, dflt) => {
  const i = args.indexOf(`--${flag}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const width = Number(get('width', 1600));
const height = Number(get('height', 1000));
const scriptFile = get('script', null);
const settleMs = Number(get('settle', 2200));

mkdirSync('screenshots', { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();

// The environment ships a Chromium build that this Playwright version does not
// expect, so point at it explicitly. WebGL in headless Chromium needs a
// software rasteriser: SwiftShader via ANGLE, which renders exactly what a GPU
// would, only slower.
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--force-device-scale-factor=1',
  ],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text());
  else if (m.text().startsWith('PROBE')) console.log(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(settleMs);

if (scriptFile && existsSync(scriptFile)) {
  await page.evaluate(readFileSync(scriptFile, 'utf8'));
  await page.waitForTimeout(Number(get('after', 1400)));
}

await page.screenshot({ path: `screenshots/${name}.png` });

if (errors.length) {
  console.error(`\n${errors.length} console error(s):`);
  for (const e of errors.slice(0, 12)) console.error('  ' + e);
}
console.log(`screenshots/${name}.png  (${width}x${height} @2x)`);

await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
