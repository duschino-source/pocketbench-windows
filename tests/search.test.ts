import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildPaletteItems,
  highlightSegments,
  moveIndex,
  searchApps,
  searchFindings,
  searchPalette,
} from '../src/renderer/search';
import type { AppState, AppTarget, DiagnosticEvidence } from '../src/shared/contracts';

const app = (partial: Partial<AppTarget> & { name: string }): AppTarget => ({
  id: `app-${partial.name}`,
  version: '1.0',
  publisher: 'Contoso',
  capabilities: [],
  ...partial,
});

const APPS: AppTarget[] = [
  app({ name: 'Mozilla Firefox', publisher: 'Mozilla', version: '128.0', capabilities: ['app.restart'] }),
  app({ name: 'Firefox Developer Edition', publisher: 'Mozilla', version: '129.0' }),
  app({ name: 'Steam', publisher: 'Valve', version: '2.10', capabilities: ['app.restart'] }),
  app({ name: '9f2c1a44-1234-4abc-9def-0123456789ab', publisher: 'Unknown', version: '' }),
];

const finding = (partial: Partial<DiagnosticEvidence> & { title: string }): DiagnosticEvidence => ({
  id: `f-${partial.title}`,
  area: 'windows',
  category: 'network',
  severity: 'warning',
  observed: '',
  details: [],
  ...partial,
});

describe('ranked app search', () => {
  it('tolerates typos and ranks exact names first', () => {
    expect(searchApps(APPS, 'firefx', false)[0]?.app.name).toBe('Mozilla Firefox');
    expect(searchApps(APPS, 'Steam', false)[0]?.app.name).toBe('Steam');
    expect(searchApps(APPS, 'mozilla', false).map((hit) => hit.app.name)).toContain('Mozilla Firefox');
  });

  it('keeps identifier-named apps last and honours the repair filter', () => {
    const all = searchApps(APPS, '', false);
    expect(all[all.length - 1]?.app.name).toMatch(/^[0-9a-f-]{36}$/);
    expect(searchApps(APPS, '', true).map((hit) => hit.app.name)).toEqual([
      'Mozilla Firefox',
      'Steam',
    ]);
    expect(searchApps(APPS, 'firefox', true).map((hit) => hit.app.name)).toEqual(['Mozilla Firefox']);
  });

  it('produces highlight segments covering the full name', () => {
    const [hit] = searchApps(APPS, 'firefox', false);
    const joined = hit?.nameSegments.map((segment) => segment.text).join('');
    expect(joined).toBe(hit?.app.name);
    expect(hit?.nameSegments.some((segment) => segment.highlight)).toBe(true);
    expect(highlightSegments('Steam', undefined, 'name')).toEqual([{ text: 'Steam', highlight: false }]);
  });

  it('never invents results for unrelated queries (property)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 3, maxLength: 12 }), (query) => {
        for (const hit of searchApps(APPS, query, false)) {
          expect(APPS).toContain(hit.app);
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe('findings search', () => {
  const findings = [
    finding({ title: 'DNS cache stale', observed: 'Resolver cache holds old records', category: 'network' }),
    finding({ title: 'Disk almost full', observed: '2 GB free', category: 'storage' }),
  ];

  it('matches title, observed text, and category', () => {
    expect(searchFindings(findings, 'dns').map((f) => f.title)).toEqual(['DNS cache stale']);
    expect(searchFindings(findings, 'resolver').map((f) => f.title)).toEqual(['DNS cache stale']);
    expect(searchFindings(findings, 'storage').map((f) => f.title)).toEqual(['Disk almost full']);
    expect(searchFindings(findings, '')).toHaveLength(2);
  });
});

describe('keyboard movement', () => {
  it('wraps in both directions and handles empty lists', () => {
    expect(moveIndex(-1, 1, 3)).toBe(0);
    expect(moveIndex(-1, -1, 3)).toBe(2);
    expect(moveIndex(2, 1, 3)).toBe(0);
    expect(moveIndex(0, -1, 3)).toBe(2);
    expect(moveIndex(0, 1, 0)).toBe(-1);
  });

  it('always lands in bounds (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -2, max: 20 }),
        fc.constantFrom<1 | -1>(1, -1),
        fc.integer({ min: 0, max: 12 }),
        (current, delta, count) => {
          const next = moveIndex(current, delta, count);
          if (count === 0) expect(next).toBe(-1);
          else expect(next).toBeGreaterThanOrEqual(0), expect(next).toBeLessThan(count);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('palette index', () => {
  const state = {
    snapshot: {
      apps: APPS,
      diagnostics: [finding({ title: 'DNS cache stale', observed: 'old records' })],
    },
    plans: [
      {
        id: 'p1',
        title: 'Fix DNS',
        status: 'ready',
        target: { kind: 'windows', name: 'Windows' },
      },
    ],
    history: [{ id: 'r1', planId: 'p1', title: 'Fix DNS', status: 'fixed' }],
    settings: { hasApiKey: true },
  } as unknown as AppState;

  it('indexes navigation, apps, findings, plans, and runs', () => {
    const items = buildPaletteItems(state);
    expect(items.some((item) => item.id === 'nav:apps')).toBe(true);
    expect(items.some((item) => item.id.startsWith('app:'))).toBe(true);
    expect(items.some((item) => item.kind === 'finding')).toBe(true);
    expect(items.some((item) => item.id === 'plan:p1')).toBe(true);
    expect(items.some((item) => item.id === 'run:r1')).toBe(true);
  });

  it('never indexes settings values or secrets', () => {
    const serialized = JSON.stringify(buildPaletteItems(state)).toLowerCase();
    expect(serialized).not.toContain('hasapikey');
    expect(serialized).not.toContain('apikey');
    expect(serialized).not.toContain('api key');
  });

  it('ranks by title and respects the limit', () => {
    const items = buildPaletteItems(state);
    expect(searchPalette(items, 'steam')[0]?.title).toBe('Steam');
    expect(searchPalette(items, '', 3)).toHaveLength(3);
    expect(searchPalette(items, 'fix dns').length).toBeGreaterThan(0);
  });
});
