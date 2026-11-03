import Fuse from 'fuse.js';
import type { AppState, AppTarget, DiagnosticEvidence } from '../shared/contracts';

/** Pure search layer for the renderer: catalog, findings, and palette share
 * one ranking contract (name/title weighted first, typo-tolerant, stable). */

export interface TextSegment {
  text: string;
  highlight: boolean;
}

export interface AppSearchHit {
  app: AppTarget;
  score: number;
  nameSegments: TextSegment[];
}

const isIdentifierName = (name: string) => /^[0-9a-f]{8}-[0-9a-f-]+$/i.test(name);

const appFuse = (apps: readonly AppTarget[]) =>
  new Fuse<AppTarget>([...apps], {
    keys: [
      { name: 'name', weight: 2 },
      { name: 'publisher', weight: 1 },
      { name: 'version', weight: 0.5 },
      { name: 'id', weight: 0.25 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    includeScore: true,
    includeMatches: true,
    minMatchCharLength: 2,
  });

/** Converts Fuse match ranges for one field into renderable segments. */
export function highlightSegments(
  text: string,
  matches: readonly { key?: string | null; indices?: readonly (readonly [number, number])[] }[] | undefined,
  key: string,
): TextSegment[] {
  const indices = (matches ?? [])
    .filter((match) => match.key === key)
    .flatMap((match) => [...(match.indices ?? [])])
    .sort((a, b) => a[0] - b[0]);
  if (!indices.length) return [{ text, highlight: false }];
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const [start, end] of indices) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), highlight: false });
    const from = Math.max(start, cursor);
    if (end >= from) segments.push({ text: text.slice(from, end + 1), highlight: true });
    cursor = Math.max(cursor, end + 1);
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlight: false });
  return segments.filter((segment) => segment.text.length > 0);
}

export function searchApps(
  apps: readonly AppTarget[],
  query: string,
  repairOnly: boolean,
): AppSearchHit[] {
  const pool = repairOnly ? apps.filter((app) => app.capabilities.length > 0) : [...apps];
  const needle = query.trim();
  if (!needle) {
    return pool
      .slice()
      .sort(
        (a, b) =>
          Number(isIdentifierName(a.name)) - Number(isIdentifierName(b.name)) ||
          a.name.localeCompare(b.name),
      )
      .map((app) => ({ app, score: 0, nameSegments: [{ text: app.name, highlight: false }] }));
  }
  return appFuse(pool)
    .search(needle)
    .map((result) => ({
      app: result.item,
      score: result.score ?? 1,
      nameSegments: highlightSegments(result.item.name, result.matches, 'name'),
    }))
    .sort(
      (a, b) =>
        Number(isIdentifierName(a.app.name)) - Number(isIdentifierName(b.app.name)) ||
        a.score - b.score ||
        a.app.name.localeCompare(b.app.name),
    );
}

export function searchFindings(
  diagnostics: readonly DiagnosticEvidence[],
  query: string,
): DiagnosticEvidence[] {
  const needle = query.trim();
  if (!needle) return [...diagnostics];
  const fuse = new Fuse<DiagnosticEvidence>([...diagnostics], {
    keys: [
      { name: 'title', weight: 2 },
      { name: 'observed', weight: 1 },
      { name: 'details', weight: 1 },
      { name: 'category', weight: 0.5 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
  });
  return fuse.search(needle).map((result) => result.item);
}

/** Wrap-around keyboard movement; -1 means "no selection yet". */
export function moveIndex(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return (current + delta + count) % count;
}

export type PaletteItemKind = 'nav' | 'app' | 'finding' | 'plan' | 'run' | 'action';

export interface PaletteItem {
  id: string;
  kind: PaletteItemKind;
  title: string;
  hint: string;
  keywords: string;
}

/**
 * Palette index built only from data the views already display (names,
 * titles, statuses). Settings values, keys, and raw payloads never enter
 * the index, so search can never surface a secret.
 */
export function buildPaletteItems(state: AppState): PaletteItem[] {
  const items: PaletteItem[] = [
    { id: 'nav:overview', kind: 'nav', title: 'Overview', hint: 'Go to view', keywords: 'home start' },
    { id: 'nav:windows', kind: 'nav', title: 'Windows', hint: 'Go to view', keywords: 'diagnostics operating system' },
    { id: 'nav:apps', kind: 'nav', title: 'Apps', hint: 'Go to view', keywords: 'applications installed programs' },
    { id: 'nav:activity', kind: 'nav', title: 'Activity', hint: 'Go to view', keywords: 'history repairs undo' },
    { id: 'nav:settings', kind: 'nav', title: 'Settings', hint: 'Go to view', keywords: 'connection updates preferences' },
    { id: 'action:scan', kind: 'action', title: 'Scan this PC', hint: 'Action', keywords: 'refresh rescan collect diagnostics' },
  ];
  const snapshot = state.snapshot;
  if (snapshot) {
    for (const app of snapshot.apps.slice(0, 200)) {
      items.push({
        id: `app:${app.id}`,
        kind: 'app',
        title: app.name,
        hint: app.capabilities.length ? `App · ${app.capabilities.length} repair tools` : 'App',
        keywords: `${app.publisher} ${app.version}`,
      });
    }
    for (const finding of snapshot.diagnostics.slice(0, 100)) {
      items.push({
        id: `finding:${finding.id}`,
        kind: 'finding',
        title: finding.title,
        hint: `Finding · ${finding.severity}`,
        keywords: `${finding.category} ${finding.observed}`,
      });
    }
  }
  for (const plan of state.plans.slice(0, 50)) {
    items.push({
      id: `plan:${plan.id}`,
      kind: 'plan',
      title: plan.title,
      hint: `Repair plan · ${plan.status}`,
      keywords: plan.target.name,
    });
  }
  for (const run of state.history.slice(0, 50)) {
    items.push({
      id: `run:${run.id}`,
      kind: 'run',
      title: run.title,
      hint: `Activity · ${run.status}`,
      keywords: run.planId,
    });
  }
  return items;
}

export function searchPalette(items: readonly PaletteItem[], query: string, limit = 12): PaletteItem[] {
  const needle = query.trim();
  if (!needle) return items.slice(0, limit);
  const fuse = new Fuse<PaletteItem>([...items], {
    keys: [
      { name: 'title', weight: 2 },
      { name: 'keywords', weight: 1 },
      { name: 'hint', weight: 0.5 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
  });
  return fuse
    .search(needle)
    .slice(0, limit)
    .map((result) => result.item);
}
