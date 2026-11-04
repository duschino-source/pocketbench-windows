import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAppearance, APPEARANCE_KEY } from '../src/renderer/appearance';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VerificationChecks } from '../src/renderer/components/VerificationChecks';
import { OperationProgress } from '../src/renderer/components/OperationProgress';

afterEach(() => vi.unstubAllGlobals());

describe('appearance preferences', () => {
  it.each(['system', 'light', 'dark'] as const)('restores %s', (value) => {
    const getItem = vi.fn(() => value);
    vi.stubGlobal('localStorage', { getItem });
    expect(readAppearance()).toBe(value);
    expect(getItem).toHaveBeenCalledWith(APPEARANCE_KEY);
  });

  it.each([null, '', 'unknown'])('falls back to System for %s', (value) => {
    vi.stubGlobal('localStorage', { getItem: () => value });
    expect(readAppearance()).toBe('system');
  });

  it('falls back to System when storage access is denied', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Denied'); } });
    expect(readAppearance()).toBe('system');
  });
});

describe('readable verification and progress', () => {
  it('labels before and after values without fabricating missing observations', () => {
    const html = renderToStaticMarkup(React.createElement(VerificationChecks, { checks: [
      { name: 'Service state', passed: true, before: 'Stopped', after: 'Running' },
      { name: 'DNS resolution', passed: false, after: '  ' },
    ] }));
    expect(html).toContain('<dt>Before</dt><dd>Stopped</dd>');
    expect(html).toContain('<dt>After</dt><dd>Running</dd>');
    expect(html.match(/Not recorded/g)).toHaveLength(2);
    expect(html).toContain('Failed');
  });

  it.each([undefined, Number.NaN, -1, 101])('shows indeterminate progress for %s', (percent) => {
    const html = renderToStaticMarkup(React.createElement(OperationProgress, {
      progress: { phase: 'scan', message: 'Reading Windows', percent },
      canCancel: false, cancelling: false, onCancel: () => {},
    }));
    expect(html).toContain('role="progressbar"');
    expect(html).not.toContain('aria-valuenow');
    expect(html).not.toContain('pb-progress-percent');
  });

  it('renders a measured percentage exactly', () => {
    const html = renderToStaticMarkup(React.createElement(OperationProgress, {
      progress: { phase: 'scan', message: 'Reading Windows', percent: 40 },
      canCancel: true, cancelling: false, onCancel: () => {},
    }));
    expect(html).toContain('aria-valuenow="0.4"');
    expect(html).toContain('40');
    expect(html).toContain('Cancel');
  });
});
