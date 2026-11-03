import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import golden from './fixtures/golden.json';
import {
  defaultAddonPath,
  loadRustEngine,
  resetEngineCache,
  resolveEngineBackend,
  RUST_ENGINE_ID,
} from '../src/main/engine-bridge';
import { parseWingetListTable, parseWingetRows } from '../src/main/windows';

describe('engine backend resolution', () => {
  afterEach(() => {
    delete process.env.POCKETBENCH_ENGINE;
    resetEngineCache();
  });

  it('keeps TypeScript authoritative by default and on every failure', () => {
    expect(resolveEngineBackend({ addonPresent: true })).toBe('typescript');
    expect(resolveEngineBackend({ env: 'typescript', addonPresent: true })).toBe('typescript');
    expect(resolveEngineBackend({ env: 'rust', addonPresent: false })).toBe('typescript');
    expect(resolveEngineBackend({ env: 'bogus', addonPresent: true })).toBe('typescript');
  });

  it('opts into Rust only when explicitly requested with an addon present', () => {
    expect(resolveEngineBackend({ env: 'rust', addonPresent: true })).toBe('rust');
  });

  it('refuses a missing addon without throwing', () => {
    expect(loadRustEngine('Z:/definitely/missing/pocketbench-engine.node')).toBeNull();
  });

  it('falls back to identical TypeScript parsing when Rust is not active', () => {
    delete process.env.POCKETBENCH_ENGINE;
    resetEngineCache();
    for (const fixture of golden.winget) {
      expect(parseWingetRows(fixture.input)).toEqual(parseWingetListTable(fixture.input, 'winget'));
    }
  });

  it('serves identical rows from the real addon when one is built', () => {
    const addonPath = defaultAddonPath();
    if (!existsSync(addonPath)) {
      // Fresh clones have no addon; the null path above is the contract.
      expect(loadRustEngine(addonPath)).toBeNull();
      return;
    }
    const engine = loadRustEngine(addonPath);
    expect(engine, `addon at ${addonPath} must identify as ${RUST_ENGINE_ID}`).not.toBeNull();
    for (const fixture of golden.winget) {
      expect(engine!.parseWingetTable(fixture.input, 'winget')).toEqual(fixture.expected);
    }
    expect(engine!.validateSourceUrl('https://vendor.example/fix#section')).toBe(
      'https://vendor.example/fix',
    );
    expect(engine!.validateSourceUrl('http://vendor.example/fix')).toBe('');
  });
});
