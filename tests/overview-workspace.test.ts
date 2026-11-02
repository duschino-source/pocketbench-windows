import { describe, expect, it } from 'vitest';
import { categoryFromEvidence, classifySymptomCategory } from '../src/shared/investigation';
import { GENERAL_PRESETS, idleBusy, isBusy, sortFindingsByUrgency, titleFor } from '../src/renderer/types';

describe('overview workspace behavior', () => {
  it('orders critical findings before warnings while leaving equal ranks stable', () => {
    const findings = [
      { id: 'warning-a', severity: 'warning' as const },
      { id: 'critical-a', severity: 'critical' as const },
      { id: 'warning-b', severity: 'warning' as const },
      { id: 'critical-b', severity: 'critical' as const },
    ];
    expect(sortFindingsByUrgency(findings).map((item) => item.id)).toEqual([
      'critical-a',
      'critical-b',
      'warning-a',
      'warning-b',
    ]);
    expect(findings.map((item) => item.id)).toEqual(['warning-a', 'critical-a', 'warning-b', 'critical-b']);
  });

  it('routes general presets through a real category so investigate enables', () => {
    expect(GENERAL_PRESETS.length).toBeGreaterThan(0);
    for (const preset of GENERAL_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.symptom.length).toBeGreaterThan(2);
      expect(['performance', 'connectivity', 'updates', 'app']).toContain(preset.category);
    }
  });

  it('classifies free text without forcing an irrelevant guided category', () => {
    expect(classifySymptomCategory('Wi-Fi connects but websites won’t load')).toBe('connectivity');
    expect(classifySymptomCategory('Slow startup after reboot')).toBe('performance');
    expect(categoryFromEvidence('DNS resolution', 'windows')).toBe('connectivity');
    expect(categoryFromEvidence('Unrecognized area', 'windows')).toBeUndefined();
  });

  it('guards every conflicting action through one busy check', () => {
    expect(isBusy(idleBusy)).toBe(false);
    expect(isBusy({ ...idleBusy, scan: true })).toBe(true);
    expect(isBusy({ ...idleBusy, investigating: true })).toBe(true);
    expect(isBusy({ ...idleBusy, applyingPlanId: 'p1' })).toBe(true);
    expect(isBusy({ ...idleBusy, undoingRunId: 'r1' })).toBe(true);
    expect(isBusy({ ...idleBusy, savingKey: true })).toBe(true);
    expect(isBusy({ ...idleBusy, clearingKey: true })).toBe(true);
    expect(isBusy({ ...idleBusy, cancelling: true })).toBe(true);
  });

  it('retains accessible navigation titles', () => {
    expect(titleFor('overview')).toBe('Overview');
    expect(titleFor('windows')).toBe('Windows diagnostics');
    expect(titleFor('apps')).toBe('Applications');
    expect(titleFor('activity')).toBe('Activity');
    expect(titleFor('settings')).toBe('Settings');
  });
});
