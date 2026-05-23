/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Guarantee a single React instance — a 2nd copy makes hooks crash with a
    // null dispatcher ("Cannot read properties of null (reading 'use')").
    dedupe: ['react', 'react-dom'],
  },
  // Pre-bundle the heavy deps used only by the lazy-loaded MindMap artifact, so
  // opening it doesn't trigger a runtime re-optimization that spawns a 2nd React.
  optimizeDeps: {
    include: ['@xyflow/react', 'dagre'],
  },
  server: {
    port: 5173,
    // proxy: {
    //   '/api': {
    //     target: 'http://localhost:8000',
    //     changeOrigin: true,
    //   },
    // },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', '**/tests/e2e/**'],
    env: {
      VITE_API_BASE: '',
    },
  },
})
