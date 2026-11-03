import { _electron as electron, expect, test } from 'playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import electronPath from 'electron';

/**
 * Real-app walk: launch the built Electron shell with an isolated data
 * directory, render the workspace from fixture-free startup, and drive
 * the global palette by keyboard. No scan or repair is triggered against
 * the host; closing the app ends the walk.
 */
test('launches, shows the workspace, and opens the palette with Ctrl+K', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'pocketbench-e2e-'));
  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: ['.', `--data-dir=${dataDir}`],
    env: { ...process.env, POCKETBENCH_E2E: '1' },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('h1')).toHaveText('Overview', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Search (Ctrl+K)' })).toBeVisible();

    await page.keyboard.press('Control+k');
    const palette = page.locator('.pb-palette');
    await expect(palette).toBeVisible();
    await expect(palette.getByRole('option').first()).toBeVisible();

    await page.keyboard.type('settings');
    await expect(palette.locator('.pb-palette-title', { hasText: 'Settings' }).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('h1')).toHaveText('Settings');
    await expect(palette).toBeHidden();

    // Navigation stays instant: route headings swap without replay cost.
    await page.getByRole('button', { name: 'Apps' }).click();
    await expect(page.locator('h1')).toHaveText('Applications');
  } finally {
    await app.close();
  }
});
