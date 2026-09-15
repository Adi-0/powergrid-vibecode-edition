/** Walk every step of the guided path and report what the app ends up showing. */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
mkdirSync('screenshots/guide', { recursive: true });
const server = await createServer({ server: { port: 5216, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5216/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.evaluate(() => document.querySelector('[data-action="guide"]').click());
await page.waitForTimeout(1600);
const n = await page.evaluate(() => document.querySelectorAll('.guide__dot').length);
for (let i = 0; i < n; i++) {
  await page.evaluate((i) => document.querySelectorAll('.guide__dot')[i].click(), i);
  await page.waitForTimeout(2100);
  const s = await page.evaluate(() => ({
    title: document.querySelector('.panel--guide [data-role="title"]').textContent,
    crumb: (document.querySelector('.crumb.is-here')?.textContent ?? '?').trim(),
    panel: (document.querySelector('.panel--level [data-role="title"]')?.textContent ?? '—').trim(),
    panelShown: document.querySelector('.panel--level')?.style.display !== 'none',
    segs: window.gridAtlas.lastFrame?.segments.length ?? 0,
  }));
  console.log(`${String(i + 1).padStart(2)} ${s.title.padEnd(30)} [${s.crumb.padEnd(10)}] ${(s.panelShown ? s.panel : '(hidden)').padEnd(22)} segs=${s.segs}`);
  await page.screenshot({ path: `screenshots/guide/${String(i + 1).padStart(2, '0')}.png` });
}
if (errors.length) { console.error('ERRORS:'); for (const e of errors.slice(0, 10)) console.error('  ' + e); }
await browser.close(); await server.close();
