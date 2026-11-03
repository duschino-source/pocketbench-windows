import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPERATIONS } from '../src/main/research';
import { OPERATION_META } from '../src/main/windows/policy';

/**
 * The preload is the renderer's only bridge to the main process. Pin its
 * channel surface and the operation vocabulary so a new IPC channel or
 * operation can never ship by accident (IMPLEMENTATION.md contract).
 */
const preload = readFileSync('src/preload/index.ts', 'utf8');
const channels = [...preload.matchAll(/ipcRenderer\.invoke\('pocketbench:([a-z-]+)'/g)].map(
  (match) => match[1],
);
const listeners = [...preload.matchAll(/ipcRenderer\.on\('pocketbench:([a-z-]+)'/g)].map(
  (match) => match[1],
);

describe('IPC contract', () => {
  it('exposes exactly the reviewed invoke channels', () => {
    expect(channels.sort()).toEqual(
      [
        'app-icon',
        'apply',
        'cancel',
        'clear-key',
        'investigate',
        'open-external',
        'save-key',
        'scan',
        'state',
        'undo',
        'update-check',
        'update-install',
        'update-state',
      ].sort(),
    );
  });

  it('exposes exactly the two push listeners', () => {
    expect(listeners.sort()).toEqual(['progress', 'update']);
  });

  it('never bridges generic IPC, shell, or filesystem access', () => {
    expect(preload).not.toMatch(/send\(|invoke\(ch|shell|node:fs|require\(/);
    expect(preload).toContain('contextBridge.exposeInMainWorld');
  });
});

describe('operation vocabulary contract', () => {
  it('keeps research, policy, and contracts operation lists identical', () => {
    expect([...OPERATIONS].sort()).toEqual(Object.keys(OPERATION_META).sort());
    expect(OPERATIONS).toHaveLength(10);
  });

  it('derives admin/reversibility metadata locally for every operation', () => {
    for (const [operation, meta] of Object.entries(OPERATION_META)) {
      expect(typeof meta.requiresAdmin, operation).toBe('boolean');
      expect(typeof meta.reversible, operation).toBe('boolean');
      expect(meta.description.length, operation).toBeGreaterThan(10);
      expect(meta.verification.length, operation).toBeGreaterThan(10);
    }
  });
});
