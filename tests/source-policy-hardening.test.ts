import { describe, expect, it } from 'vitest';
import { publicSource, sourceGate } from '../src/main/source-policy';
import type { RepairStep, SourceAssessment } from '../src/shared/contracts';

const step: RepairStep = {
  id: 'one',
  operation: 'windows.clearUserProxy',
  title: 'Restore direct connection',
  targetId: 'windows',
  params: {},
  requiresAdmin: false,
  reversible: true,
  impact: 'Update user proxy',
  verification: 'Direct route works',
};
const source = (url: string, corroboratedBy: string[]): SourceAssessment => ({
  url,
  title: 'Fix',
  kind: 'community',
  supports: 'windows.clearUserProxy',
  applicable: true,
  concerns: [],
  corroboratedBy,
});

describe('source policy hardening', () => {
  it('rejects URLs a parser would silently repair', () => {
    for (const url of [
      'https://vendor.example/a b',
      'https://vendor.example\\fix',
      'https://vendor.example/\nfix',
      ' https://vendor.example/fix',
      'https://vendor.example/fix ',
    ]) {
      expect(() => publicSource(url), JSON.stringify(url)).toThrow();
    }
    expect(publicSource('https://vendor.example/a%20b').href).toBe('https://vendor.example/a%20b');
  });

  it('groups trailing-dot hosts with their publisher for corroboration', () => {
    const a = source('https://www.reddit.com./r/windows/a', ['https://old.reddit.com/r/windows/b']);
    const b = source('https://old.reddit.com/r/windows/b', ['https://www.reddit.com./r/windows/a']);
    // Same publisher behind a trailing dot must never count as independent.
    expect(sourceGate([step], [a, b])).toHaveLength(1);
  });
});
