import { defineConfig } from 'vite';

export default defineConfig({
  // Served from the root of loom.robertfarrelly.com
  base: '/',
  build: {
    target: 'es2020',
  },
});
