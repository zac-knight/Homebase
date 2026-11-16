import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The demo library lives in ../sample-data, shared with the backend's evaluation script.
  server: { fs: { allow: ['..'] } },
  build: {
    target: 'chrome120',
    rollupOptions: {
      // Two entry points: the new tab page and the Manifest V3 service worker.
      input: { newtab: resolve(root, 'newtab.html'), background: resolve(root, 'src/background/index.ts') },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
})
