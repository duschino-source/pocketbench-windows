import { defineConfig } from 'playwright/test';

// Electron end-to-end against the production build (out/). Isolated data
// directory under .local/ (gitignored); no host repair is ever invoked —
// the suite navigates and searches only. Run `npm run build` first.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
})
