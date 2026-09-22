// Views the screenshot harness captures. `probe` runs in Node against the page and
// returns { ok, value }; a failing probe fails the run.
export default [
  {
    name: 'test-scene',
    url: '?scene=test',
    width: 1200,
    height: 800,
    probe: async (page) => {
      const ink = await page.evaluate(() => window.__probe());
      // a blank WebGL canvas has 0 ink pixels; the test scene has tens of thousands
      return { ok: ink > 5000, value: ink };
    },
  },
];
