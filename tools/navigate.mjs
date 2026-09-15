/**
 * Every journey between every two levels, checked for arriving where it said.
 *
 * Travelling is most of what a reader does here, and it used to be where the
 * app broke: the scale a flight was allowed to reach was clamped by a floor
 * recomputed each frame from whatever happened to be UNDER the camera, so
 * crossing the state on the way to one house could strand the camera at the
 * scale of a street. It looked exactly like the zoom being broken.
 *
 * A bug like that hides from a screenshot of any single view, so this walks all
 * of the ordered pairs and fails if a destination is reached at a different
 * scale depending on where the journey started.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const LEVELS = ['system', 'region', 'substation', 'feeder', 'service', 'plant', 'machine'];

const server = await createServer({ server: { port: 5224, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5224/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);

const arrive = async (id) => {
  await page.evaluate((x) => window.gridAtlas.goTo(x), id);
  await page.waitForTimeout(1600);
  return page.evaluate(() => {
    const g = window.gridAtlas;
    const f = g.lastFrame;
    return {
      mpp: +g.viewport.camera.metresPerPixel.toFixed(4),
      level: g.viewport.level,
      segs: f ? f.segments.length : 0,
      crumb: (document.querySelector('.crumb.is-here')?.textContent ?? '?').trim(),
    };
  });
};

const seen = new Map();
const bad = [];
for (const from of LEVELS) {
  await arrive(from);
  for (const to of LEVELS) {
    if (to === from) continue;
    const got = await arrive(to);
    const first = seen.get(to);
    if (!first) seen.set(to, { ...got, from });
    else if (Math.abs(Math.log(got.mpp / first.mpp)) > 0.02) {
      bad.push(`${to}: ${got.mpp} coming from ${from}, but ${first.mpp} from ${first.from}`);
    }
    if (got.segs === 0) bad.push(`${to}: nothing drawn coming from ${from}`);
    if (got.crumb.toLowerCase() === '?') bad.push(`${to}: no breadcrumb from ${from}`);
    await arrive(from);
  }
}

for (const [level, r] of seen) {
  console.log(`${level.padEnd(11)} mpp=${String(r.mpp).padStart(9)}  segs=${String(r.segs).padStart(5)}  [${r.crumb}]`);
}
if (bad.length) {
  console.error('\nJOURNEYS THAT DID NOT ARRIVE:');
  for (const b of bad) console.error('  ' + b);
}
if (errors.length) {
  console.error('\nCONSOLE ERRORS:');
  for (const e of errors.slice(0, 10)) console.error('  ' + e);
}
await browser.close();
await server.close();
process.exit(bad.length || errors.length ? 1 : 0);
