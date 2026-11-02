import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanDetail } from '../src/renderer/components/PlanDetail';
import { idleBusy } from '../src/renderer/types';
import type { RepairPlan } from '../src/shared/contracts';

function readyPlan(): RepairPlan {
  return {
    id: 'plan-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    title: 'Fix DNS',
    summary: 'Summary',
    target: { kind: 'windows', name: 'Windows' },
    status: 'ready',
    reason: 'Validated',
    evidence: [],
    sources: [],
    steps: [
      {
        id: 's1', operation: 'windows.flushDns', title: 'Flush DNS', targetId: 'windows',
        params: {}, requiresAdmin: false, reversible: true,
        impact: 'Clears cache', verification: 'Resolves',
      },
    ],
    review: { approved: true, rationale: 'ok', concerns: [] },
  };
}

const noop = async () => {};

describe('PlanDetail Apply gating', () => {
  it('disables Apply while the SAME plan is applying', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanDetail, {
        plan: readyPlan(),
        busy: { ...idleBusy, applyingPlanId: 'plan-1' },
        onApply: noop,
        onOpenExternal: noop,
      }),
    );
    expect(html).toContain('Applying…');
    // Fluent Button nests spans/icons, so match the button open tag preceding the label.
    const idx = html.indexOf('Applying…');
    const openStart = html.lastIndexOf('<button', idx);
    const openEnd = html.indexOf('>', idx);
    expect(openStart).toBeGreaterThanOrEqual(0);
    const openTag = html.slice(openStart, html.indexOf('>', openStart) + 1);
    expect(openTag).toMatch(/disabled/);
    void openEnd;
  });

  it('keeps Apply enabled for a ready approved plan with steps and no run', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanDetail, {
        plan: readyPlan(),
        busy: idleBusy,
        onApply: noop,
        onOpenExternal: noop,
      }),
    );
    const idx = html.indexOf('Apply fix');
    expect(idx).toBeGreaterThan(0);
    const openStart = html.lastIndexOf('<button', idx);
    const openTag = html.slice(openStart, html.indexOf('>', openStart) + 1);
    expect(openTag).not.toMatch(/disabled/);
  });
});
