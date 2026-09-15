/**
 * The app in the states a reader can put it in, rather than at rest.
 *
 * `audit.mjs` captures every view with nothing wrong. That is half the app: the
 * other half is what happens when a circuit is out, a bus is over its limit or
 * a fault is on the feeder — which is where the one signal colour earns its
 * place, and where a drawing is most likely to be quietly wrong.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

mkdirSync('screenshots/states', { recursive: true });
const server = await createServer({ server: { port: 5230, strictPort: true }, logLevel: 'error' });
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
await page.goto('http://localhost:5230/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);

const states = [
  ['01-trip-the-backbone', async () => {
    await page.evaluate(() => window.gridAtlas.goTo('system'));
    await page.waitForTimeout(2200);
    await page.evaluate(() => {
      const g = window.gridAtlas;
      // The heaviest 500 kV circuit there is: taking it out is the one
      // perturbation guaranteed to move something everywhere else.
      // Not one circuit but the three heaviest: a meshed system shrugs off a
      // single outage, which is the point of meshing it, and a capture of
      // nothing happening says nothing about how an overload is drawn.
      const worst = [...g.state.current.solved.branchById.values()]
        .sort((a, b) => Math.abs(b.pFromMW) - Math.abs(a.pFromMW))
        .slice(0, 3);
      for (const b of worst) g.state.toggleTrip(b.branchId);
    });
  }],
  ['02-fault-on-the-busbar', async () => {
    await page.evaluate(() => {
      const g = window.gridAtlas;
      g.state.restoreAll();
      g.goTo('substation');
    });
    await page.waitForTimeout(2200);
    await page.evaluate(() => {
      const g = window.gridAtlas;
      g.state.setFault('EDENVALE_12', 'three-phase');
      g.levelBar.setFault('EDENVALE_12', 'three-phase');
    });
  }],
  ['03-a-car-charger-at-one-house', async () => {
    await page.evaluate(() => {
      const g = window.gridAtlas;
      g.state.setFault(null, 'three-phase');
      g.levelBar.setFault(null, 'three-phase');
      g.goTo('service');
    });
    await page.waitForTimeout(2200);
    await page.evaluate(() => window.gridAtlas.state.setAppliance('ev'));
  }],
  ['04-motor-at-the-far-end', async () => {
    await page.evaluate(() => {
      const g = window.gridAtlas;
      g.state.setAppliance(null);
      g.goTo('feeder');
    });
    await page.waitForTimeout(2200);
    await page.evaluate(() =>
      window.gridAtlas.state.setMotor('starting', 'across-the-line', 'far-end'));
  }],
];

for (const [name, fn] of states) {
  await fn();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `screenshots/states/${name}.png` });
  const s = await page.evaluate(() => {
    const f = window.gridAtlas.lastFrame;
    const alarm = f ? f.segments.filter((x) => x.color === '#C4341B').length : 0;
    return {
      segs: f ? f.segments.length : 0, alarm,
      stats: [...document.querySelectorAll('.stat')]
        .map((e) => e.textContent.trim().replace(/\s+/g, ' ')).join(' | '),
      crumb: (document.querySelector('.crumb.is-here')?.textContent ?? '?').trim(),
    };
  });
  console.log(`${name.padEnd(28)} segs=${String(s.segs).padStart(5)} in-alarm=${String(s.alarm).padStart(4)}  [${s.crumb}]  ${s.stats}`);
}

if (errors.length) {
  console.error('\nCONSOLE ERRORS:');
  for (const e of errors.slice(0, 10)) console.error('  ' + e);
}
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
