import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site from /loom/; the dev server stays at /
  base: command === 'build' ? '/loom/' : '/',
  build: {
    target: 'es2020',
  },
}));
