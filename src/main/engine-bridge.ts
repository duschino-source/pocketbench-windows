import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WingetRow } from './windows';

export type EngineBackend = 'rust' | 'typescript';

export const RUST_ENGINE_ID = 'pocketbench-engine/1';

interface NativeModule {
  engineInfo?: () => string;
  parseWingetTable?: (text: string, scope?: string) => string;
  validateSourceUrl?: (value: string) => string;
  readUserProxyJson?: () => string;
}

export interface RustEngine {
  parseWingetTable(text: string, sourceScope?: 'winget'): WingetRow[];
  validateSourceUrl(value: string): string;
  /** Direct registry read; null means use the PowerShell fallback. */
  readUserProxy(): { enable: number; server: string } | null;
}

/** Default addon location: native/engine inside the repo or app payload. */
export function defaultAddonPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../../native/engine/pocketbench-engine.node'),
    join(process.cwd(), 'native', 'engine', 'pocketbench-engine.node'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

/**
 * Backend selection (plan Step 2): TypeScript stays authoritative until a
 * shipped build has proven the Rust path. POCKETBENCH_ENGINE=rust opts in
 * when the addon is present; every failure resolves to TypeScript.
 */
export function resolveEngineBackend(input: {
  env?: string;
  addonPresent: boolean;
}): EngineBackend {
  if (input.env === 'typescript') return 'typescript';
  if (input.env === 'rust') return input.addonPresent ? 'rust' : 'typescript';
  return 'typescript';
}

function isWingetRow(value: unknown): value is WingetRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.name === 'string' &&
    typeof row.id === 'string' &&
    typeof row.version === 'string' &&
    typeof row.source === 'string'
  );
}

/**
 * Loads and validates the native addon. Returns null on any failure —
 * missing file, wrong identity, malformed exports — so callers fall back
 * to TypeScript and the main process never crashes on addon problems.
 */
export function loadRustEngine(addonPath: string = defaultAddonPath()): RustEngine | null {
  try {
    if (!existsSync(addonPath)) return null;
    const require = createRequire(import.meta.url);
    const native = require(addonPath) as NativeModule;
    if (typeof native.engineInfo !== 'function' || native.engineInfo() !== RUST_ENGINE_ID) {
      return null;
    }
    if (typeof native.parseWingetTable !== 'function' || typeof native.validateSourceUrl !== 'function') {
      return null;
    }
    return {
      parseWingetTable(text: string, sourceScope?: 'winget'): WingetRow[] {
        const raw = native.parseWingetTable!(text, sourceScope);
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.every(isWingetRow)) {
          throw new Error('Native engine returned a malformed winget table.');
        }
        return parsed;
      },
      validateSourceUrl(value: string): string {
        const href = native.validateSourceUrl!(value);
        return typeof href === 'string' ? href : '';
      },
      readUserProxy(): { enable: number; server: string } | null {
        if (typeof native.readUserProxyJson !== 'function') return null;
        const raw = native.readUserProxyJson();
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return null;
        const state = parsed as Record<string, unknown>;
        if (typeof state.enable !== 'number' || typeof state.server !== 'string') return null;
        return { enable: state.enable, server: state.server };
      },
    };
  } catch {
    return null;
  }
}

let cached: RustEngine | null | undefined;

/** Process-wide engine handle for the scan path; null means TypeScript. */
export function activeRustEngine(): RustEngine | null {
  if (cached !== undefined) return cached;
  const addonPath = defaultAddonPath();
  const backend = resolveEngineBackend({
    env: process.env.POCKETBENCH_ENGINE,
    addonPresent: existsSync(addonPath),
  });
  cached = backend === 'rust' ? loadRustEngine(addonPath) : null;
  return cached;
}

/** Test hook: forget the cached engine so env/addon changes are re-read. */
export function resetEngineCache(): void {
  cached = undefined;
}
