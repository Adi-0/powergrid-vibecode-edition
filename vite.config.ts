import { defineConfig } from 'vite';

// Static build: every asset is bundled; the app makes no runtime network requests.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
  worker: { format: 'es' },
});
