import { defineConfig } from 'vitest/config';

// Developer probes (print-outs used while tuning the model); not part of `npm test`.
export default defineConfig({
  test: { include: ['tools/dev/**/*.test.ts'], environment: 'node', testTimeout: 600_000 },
});
