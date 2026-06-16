import { defineConfig } from 'vite';

// Relative base ('./') makes the built site work at any GitHub Pages sub-path
// (https://<user>.github.io/<repo>/) without hard-coding the repo name.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0, // keep the .wasm as a real file, never inlined
  },
});
