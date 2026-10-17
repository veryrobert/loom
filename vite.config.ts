import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // GitHub Pages serves the site from /loom/; the dev server stays at /
  base: command === 'build' ? '/loom/' : '/',
  build: {
    target: 'es2020',
  },
}))
