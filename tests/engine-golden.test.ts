import { describe, expect, it } from 'vitest';
import golden from './fixtures/golden.json';
import { parseWingetListTable } from '../src/main/windows';
import { isSelectedService, isWingetId, SECURITY_STARTUP_PATTERN } from '../src/main/windows/policy';
import { dangerousPlan, publicSource, sourceGate, sourceKind } from '../src/main/source-policy';
import { LabGuard } from '../src/main/windows/lab';
import type { RepairStep, SourceAssessment } from '../src/shared/contracts';

/**
 * Characterization net for the Rust migration (plan Steps 1+3).
 * Every case here is mirrored by native/engine/tests/parity.rs reading the
 * same tests/fixtures/golden.json. A slice may flip to Rust only while both
 * suites agree on every fixture.
 */
const step = (operation: string): RepairStep => ({
  id: 'golden-step',
  operation: operation as RepairStep['operation'],
  title: 'Golden step',
  targetId: 'windows',
  params: {},
  requiresAdmin: false,
  reversible: true,
  impact: 'Golden impact',
  verification: 'Golden verification',
});

describe('golden fixtures: winget table parsing', () => {
  for (const fixture of golden.winget) {
    it(fixture.name, () => {
      const scope = fixture.sourceScope === 'winget' ? ('winget' as const) : undefined;
      expect(parseWingetListTable(fixture.input, scope)).toEqual(fixture.expected);
    });
  }
});

describe('golden fixtures: fixed allow-lists', () => {
  it('pins winget package ID validation', () => {
    for (const fixture of golden.wingetIds) {
      expect(isWingetId(fixture.input), fixture.input).toBe(fixture.expected);
    }
  });

  it('pins the selected-service allow-list (case-sensitive)', () => {
    for (const fixture of golden.services) {
      expect(isSelectedService(fixture.input), fixture.input).toBe(fixture.expected);
    }
  });

  it('pins protected startup entries, including the avg word boundary', () => {
    for (const fixture of golden.startupBlocked) {
      expect(SECURITY_STARTUP_PATTERN.test(fixture.input), fixture.input).toBe(fixture.expected);
    }
  });
});

describe('golden fixtures: source policy', () => {
  it('pins public URL validation and fragment stripping', () => {
    for (const fixture of golden.sourceUrls) {
      if (fixture.expected === 'error') {
        expect(() => publicSource(fixture.input), fixture.input).toThrow();
      } else {
        expect(publicSource(fixture.input).href, fixture.input).toBe(fixture.expected);
      }
    }
  });

  it('pins official/community classification by exact host', () => {
    for (const fixture of golden.sourceKinds) {
      expect(sourceKind(fixture.url, fixture.target), fixture.url).toBe(fixture.expected);
    }
  });

  it('pins the corroboration gate, counting publishers not posts', () => {
    for (const fixture of golden.gates) {
      const sources: SourceAssessment[] = fixture.sources.map((source) => ({
        url: source.url,
        title: 'Golden source',
        kind: sourceKind(source.url, 'Windows'),
        supports: source.supports,
        applicable: true,
        concerns: [],
        corroboratedBy: source.corroboratedBy,
      }));
      const blocked = sourceGate([step(fixture.operation)], sources).length > 0;
      expect(blocked, fixture.name).toBe(fixture.expectedBlocked);
    }
  });

  it('pins destructive-plan detection', () => {
    for (const fixture of golden.dangerous) {
      const verdict = dangerousPlan({ steps: [{ ...step('windows.flushDns'), title: fixture.title }] });
      if (fixture.expected === null) expect(verdict, fixture.title).toBeNull();
      else expect(verdict, fixture.title).toContain(fixture.expected);
    }
  });
});

describe('golden fixtures: lab confinement scenarios', () => {
  it('accepts paths inside the root and rejects escapes, UNC, and empty paths', () => {
    const root = LabGuard.tempLab('pocketbench-golden-');
    const guard = new LabGuard(root, root);
    expect(guard.confine('nested/file.txt', root, 'Golden')).toContain('nested');
    expect(() => guard.confine('../escape.txt', root, 'Golden')).toThrow(/escapes/);
    expect(() => guard.confine('\\\\server\\share\\file.txt', root, 'Golden')).toThrow(/network/);
    expect(() => guard.confine('', root, 'Golden')).toThrow(/non-empty/);
  });
});
