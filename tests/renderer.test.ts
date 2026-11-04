import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDateTime,
  formatElapsed,
  formatUptime,
  formatUSD,
  isHttpsUrl,
  planStatusLabel,
  runStatusLabel,
  updateStatusLabel,
} from '../src/renderer/format';
import { readUpdateState } from '../src/renderer/api';
import { findPlan, latestRunForPlan } from '../src/renderer/types';
import type { AppState } from '../src/shared/contracts';

describe('renderer formatting helpers', () => {
  it('formats byte counts', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
    expect(formatBytes(-1)).toBe('Unknown');
  });

  it('formats uptime', () => {
    expect(formatUptime(45)).toBe('45s');
    expect(formatUptime(90)).toBe('1m');
    expect(formatUptime(3700)).toBe('1h 1m');
    expect(formatUptime(90000)).toBe('1d 1h');
  });

  it('formats currency and datetimes without fabricating values', () => {
    expect(formatUSD(12.5)).toBe('$12.50');
    expect(formatUSD(Number.NaN)).toBe('Unknown');
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
    expect(formatDateTime('2026-01-01T00:00:00.000Z')).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('labels plan and run statuses', () => {
    expect(planStatusLabel('ready')).toBe('Ready');
    expect(planStatusLabel('needs-validation')).toBe('Needs validation');
    expect(planStatusLabel('blocked')).toBe('Blocked');
    expect(runStatusLabel('pending-verification')).toBe('Pending verification');
    expect(runStatusLabel('undone')).toBe('Undone');
    expect(runStatusLabel('partially-undone')).toBe('Partially undone');
  });

  it('finds plans and the latest run for a plan', () => {    const state = {
      plans: [
        {
          id: 'p1', createdAt: '', title: 't', summary: 's',
          target: { kind: 'windows', name: 'Windows' }, status: 'ready', reason: 'r',
          evidence: [], sources: [], steps: [], review: { approved: true, rationale: 'r', concerns: [] },
        },
      ],
      history: [
        { id: 'r2', planId: 'p1', title: 't', createdAt: '', status: 'pending-verification', executions: [], verification: [], canUndo: false },
        { id: 'r1', planId: 'p1', title: 't', createdAt: '', status: 'fixed', executions: [], verification: [], canUndo: false },
      ],
    } as unknown as AppState;
    expect(findPlan(state, 'p1')?.id).toBe('p1');
    expect(findPlan(state, 'missing')).toBeUndefined();
    expect(findPlan(state, null)).toBeUndefined();
    expect(latestRunForPlan(state, 'p1')?.id).toBe('r2');
    expect(latestRunForPlan(state, 'missing')).toBeUndefined();
  });

  it('measures wall-clock elapsed time without estimates', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(61000)).toBe('1:01');
    expect(formatElapsed(3723000)).toBe('1:02:03');
    expect(formatElapsed(-5)).toBe('0:00');
  });

  it('accepts only public HTTPS release links', () => {
    expect(isHttpsUrl('https://github.com/duschino-source/pocketbench-windows/releases/latest')).toBe(true);
    expect(isHttpsUrl('http://example.com/x')).toBe(false);
    expect(isHttpsUrl('not-a-url')).toBe(false);
  });

  it('labels update states deterministically', () => {
    expect(updateStatusLabel('checking')).toBe('Checking');
    expect(updateStatusLabel('downloaded')).toBe('Ready to restart');
    expect(updateStatusLabel('manual')).toBe('Manual update');
  });

  it('narrows update IPC payloads and drops untrusted percent values', () => {
    expect(readUpdateState({ status: 'manual', releaseUrl: 'https://github.com/x/releases/latest' })?.supported).toBe(false);
    expect(readUpdateState({ status: 'downloading', percent: 38.2 })?.percent).toBe(38.2);
    expect(readUpdateState({ status: 'downloading', percent: 140 })?.percent).toBeUndefined();
    expect(readUpdateState({ status: 'downloading', percent: '38' })?.percent).toBeUndefined();
    expect(readUpdateState({ status: 'bogus' })).toBeNull();
  });
});
