// Headless screenshot harness.
//
//   node tools/shots.mjs [name ...] [--out dir]
//
// Starts a Vite dev server, opens each registered view in headless Chromium with
// software WebGL (SwiftShader via ANGLE — headless Chromium otherwise often hands
// back a blank WebGL canvas), waits for the app to say a frame is ready, and saves a
// PNG. Each view may also run a probe in the page; a probe that fails exits non-zero,
// so a blank or broken render is caught, not just photographed.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = path.resolve(root, outIdx >= 0 ? args[outIdx + 1] : 'screenshots');
const only = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1));

const views = (await import(path.join(root, 'tools', 'shots.config.mjs'))).default;

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(base)) return undefined;
  for (const d of fs.readdirSync(base).sort().reverse()) {
    const p = path.join(base, d, 'chrome-linux', 'chrome');
    if (d.startsWith('chromium-') && fs.existsSync(p)) return p;
  }
  return undefined;
}

const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const addr = server.httpServer.address();
const baseUrl = `http://127.0.0.1:${addr.port}/`;

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

fs.mkdirSync(outDir, { recursive: true });
let failed = 0;
for (const v of views) {
  if (only.length && !only.includes(v.name)) continue;
  const page = await browser.newPage({
    viewport: { width: v.width ?? 1440, height: v.height ?? 900 },
    deviceScaleFactor: v.dpr ?? 1,
  });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const t0 = Date.now();
  await page.goto(baseUrl + (v.url ?? ''), { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: v.timeout ?? 60000 });
    if (v.before) await v.before(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(v.settle ?? 150);
    const file = path.join(outDir, `${v.name}.png`);
    await page.screenshot({ path: file });
    let verdict = '';
    if (v.probe) {
      const res = await v.probe(page);
      verdict = ` probe=${JSON.stringify(res.value)} ${res.ok ? 'OK' : 'FAIL'}`;
      if (!res.ok) failed++;
    }
    console.log(`${v.name}: ${path.relative(root, file)} (${Date.now() - t0} ms)${verdict}`);
  } catch (e) {
    failed++;
    console.log(`${v.name}: ERROR ${e.message}`);
  }
  const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
  if (errs.length) {
    console.log(errs.join('\n'));
    if (!v.allowErrors) failed++;
  }
  await page.close();
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
