/**
 * Are the map's names on the map?
 *
 * Preferring the least ink sends a caption to the emptiest paper within reach,
 * and on a map the emptiest paper is off the edge of the subject. This counts
 * the labels whose site is inside California and whose own text is not, which
 * is a thing a screenshot shows only if you already suspect it.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5240, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5240/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);

const r = await page.evaluate(async () => {
  const g = window.gridAtlas;
  const { CALIFORNIA_OUTLINE } = await import('/src/data/california/outline.ts');
  const { project } = await import('/src/data/california/geography.ts');
  const { toWorld } = await import('/src/render/world.ts');
  const cam = g.viewport.camera;
  const scratch = g.geometry.sites.values().next().value.ground.clone();
  const out = scratch.clone();
  const poly = CALIFORNIA_OUTLINE.map(([lon, lat]) => {
    const w = toWorld(project(lat, lon), 0);
    scratch.set(w.x, 0, w.z);
    cam.worldToScreen(scratch, out);
    return [out.x, out.y];
  });
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const stray = [];
  let placed = 0;
  for (const p of g.viewport.labels.placed) {
    placed++;
    if (!inside(p.anchorX, p.anchorY)) continue;   // genuinely out of state
    const corners = [[p.x, p.y], [p.x + p.w, p.y], [p.x, p.y + p.h], [p.x + p.w, p.y + p.h]]
      .filter(([x, y]) => inside(x, y)).length;
    if (corners === 0) stray.push(p.spec.text);
  }
  return { placed, stray };
});

console.log(`${r.placed} labels placed; ${r.stray.length} entirely off the subject`);
for (const s of r.stray) console.log('  ' + s);
await browser.close();
await server.close();
// Three is the floor rather than zero: San Diego, Martin and Morro Bay sit on
// a coast with the sea on one side and a dense cluster of names on the other,
// and a leader into open water is what a printed map does there too.
process.exit(r.stray.length > 3 ? 1 : 0);
