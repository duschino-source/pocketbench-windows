import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { sourcemap: false, minify: true, reportCompressedSize: false, rollupOptions: { input: resolve('src/main/index.ts') } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { sourcemap: false, minify: true, reportCompressedSize: false, rollupOptions: { input: resolve('src/preload/index.ts'), output: { format: 'cjs', entryFileNames: 'index.cjs' } } } },
  renderer: { root: 'src/renderer', plugins: [react()], build: { sourcemap: false, minify: true, cssMinify: true, reportCompressedSize: false, chunkSizeWarningLimit: 1200, rollupOptions: { input: resolve('src/renderer/index.html') } } }
})
