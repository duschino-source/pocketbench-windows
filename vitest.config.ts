import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Unit coverage governs logic layers. React views/components are
      // gated instead by tools/check-ui.cjs (real Electron, fixtures) and
      // tests/e2e (Playwright Electron), so they are excluded here rather
      // than diluting the threshold. gateway.mjs is verified by
      // `node --test tools/gateway.test.mjs`.
      exclude: [
        'src/main/gateway.mjs',
        'src/renderer/app.tsx',
        'src/renderer/main.tsx',
        'src/renderer/views/**',
        'src/renderer/components/**',
      ],
      thresholds: { statements: 62, branches: 50, functions: 65, lines: 68 },
    },
  },
})
