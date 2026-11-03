import * as React from 'react';
import { Button, SearchBox } from '@fluentui/react-components';
import { AppsRegular, ChevronRightRegular, CheckmarkCircleRegular, SearchRegular, WrenchRegular } from '@fluentui/react-icons';
import type { AppTarget, OperationId } from '../../shared/contracts';
import { isBusy, type ViewProps } from '../types';
import { SymptomForm } from '../components/SymptomForm';
import { searchApps } from '../search';
import { ProgramIcon } from '../components/ProgramIcon';

const OPERATION_LABELS: Partial<Record<OperationId, string>> = {
  'app.updatePackage': 'Package update',
  'app.patchConfig': 'Supported settings',
  'app.quarantineCache': 'Cache repair',
  'app.restart': 'App restart',
};
const SELECTED_APP_KEY = 'pocketbench:selected-app';

function publisher(app: AppTarget): string {
  if (!app.publisher.startsWith('CN=')) return app.publisher || 'Publisher unavailable';
  return app.publisher.match(/(?:^|,\s*)O=([^,]+)/)?.[1] || 'Windows package';
}

/** AppsView unmounts while a repair is focused; keep the selection in this tab. */
function readStoredApp(): string | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(SELECTED_APP_KEY);
  } catch {
    return null;
  }
}

export function AppsView(props: ViewProps): React.ReactElement {
  const { state, busy } = props;
  const active = isBusy(busy);
  const apps = state.snapshot?.apps ?? [];
  const [query, setQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(readStoredApp);
  const [repairOnly, setRepairOnly] = React.useState(false);

  React.useEffect(() => {
    try {
      if (selectedId) sessionStorage.setItem(SELECTED_APP_KEY, selectedId);
      else sessionStorage.removeItem(SELECTED_APP_KEY);
    } catch {
      // Session storage is an enhancement; selection still works in memory.
    }
  }, [selectedId]);

  // Palette (and any future deep link) focuses an app without remounting.
  React.useEffect(() => {
    const onFocusApp = (event: Event) => {
      const appId = (event as CustomEvent<string>).detail;
      if (typeof appId === 'string' && appId) setSelectedId(appId);
    };
    window.addEventListener('pocketbench:focus-app', onFocusApp);
    return () => window.removeEventListener('pocketbench:focus-app', onFocusApp);
  }, []);

  // Scans can drop an app from inventory. Never keep a stale inspector target.
  React.useEffect(() => {
    if (!state.snapshot) return;
    if (selectedId && !state.snapshot.apps.some((app) => app.id === selectedId)) setSelectedId(null);
  }, [selectedId, state.snapshot]);

  const hits = React.useMemo(() => searchApps(apps, query, repairOnly), [apps, query, repairOnly]);
  const filtered = hits.map((hit) => hit.app);

  const selectedApp = apps.find((app) => app.id === selectedId);
  const repairCount = apps.filter((app) => app.capabilities.length > 0).length;
  const filtersActive = query.trim().length > 0 || repairOnly;
  const hasInventory = Boolean(state.snapshot);

  const clearFilters = () => {
    setQuery('');
    setRepairOnly(false);
  };

  return (
    <div>
      <section className="pb-section pb-apps-workspace" aria-label="Application workspace">
        <div className="pb-apps-catalog">
          <div className="pb-apps-toolbar">
            <SearchBox
              placeholder="Search applications…"
              aria-label="Search installed applications"
              value={query}
              onChange={(_, data) => setQuery(data.value ?? '')}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowDown') return;
                event.preventDefault();
                (event.currentTarget as HTMLElement)
                  .closest('.pb-apps-catalog')
                  ?.querySelector<HTMLButtonElement>('.pb-app-entry')
                  ?.focus();
              }}
            />
            <div className="pb-app-filters" role="group" aria-label="Application filters">
              <Button size="small" appearance="subtle" aria-pressed={!repairOnly} onClick={() => setRepairOnly(false)}>
                All apps <span>{apps.length}</span>
              </Button>
              <Button size="small" appearance="subtle" aria-pressed={repairOnly} onClick={() => setRepairOnly(true)}>
                Repair tools <span>{repairCount}</span>
              </Button>
            </div>
          </div>

          <ul
            className="pb-app-list"
            aria-label="Application inventory"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
              const entries = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.pb-app-entry')];
              const current = entries.indexOf(document.activeElement as HTMLButtonElement);
              if (current < 0) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : current + (event.key === 'ArrowDown' ? 1 : -1);
              entries[Math.max(0, Math.min(entries.length - 1, next))]?.focus();
            }}
          >
            {hits.map((hit, index) => {
              const app = hit.app;
              return (
              <li key={app.id}>
                <button
                  type="button"
                  className="pb-app-entry"
                  aria-pressed={selectedId === app.id}
                  onClick={() => setSelectedId(app.id)}
                >
                  <ProgramIcon app={app} eager={index < 12} />
                  <span className="pb-app-copy">
                    <span className="pb-app-name">
                      {hit.nameSegments.map((segment, segmentIndex) =>
                        segment.highlight ? (
                          <mark className="pb-match" key={segmentIndex}>{segment.text}</mark>
                        ) : (
                          <span key={segmentIndex}>{segment.text}</span>
                        ),
                      )}
                    </span>
                    <span className="pb-app-meta">
                      {publisher(app)}
                      {app.version ? ' · ' + app.version : ''}
                    </span>
                  </span>
                  {app.capabilities.length > 0 && (
                    <span
                      className="pb-capability-tag"
                      title={`${app.capabilities.length} repair tool${app.capabilities.length === 1 ? '' : 's'} available`}
                    >
                      <WrenchRegular aria-hidden="true" />
                      Tools {app.capabilities.length}
                    </span>
                  )}
                  <ChevronRightRegular className="pb-app-chevron" />
                </button>
              </li>
              );
            })}
          </ul>

          {!filtered.length && (
            <div className="pb-empty pb-empty-compact">
              {!hasInventory ? (
                <>
                  <SearchRegular />
                  <h3>No inventory yet</h3>
                  <p>Scan this PC to discover installed applications and the repair tools each one supports.</p>
                  <Button appearance="primary" disabled={active} onClick={() => void props.onScan()}>
                    {busy.scan ? 'Scanning…' : 'Scan this PC'}
                  </Button>
                </>
              ) : apps.length === 0 ? (
                <>
                  <AppsRegular />
                  <h3>No applications found</h3>
                  <p>The last scan did not return an application inventory. Scan again after checking local permissions.</p>
                  <Button appearance="secondary" disabled={active} onClick={() => void props.onScan()}>
                    {busy.scan ? 'Scanning…' : 'Scan again'}
                  </Button>
                </>
              ) : (
                <>
                  <AppsRegular />
                  <h3>No matching apps</h3>
                  <p>
                    {filtersActive
                      ? 'Clear the search or switch back to All apps to see the full inventory.'
                      : 'The inventory is empty for this filter.'}
                  </p>
                  {filtersActive ? (
                    <Button appearance="secondary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button appearance="secondary" disabled={active} onClick={() => void props.onScan()}>
                      {busy.scan ? 'Scanning…' : 'Scan again'}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="pb-catalog-foot">
            {filtered.length} of {apps.length} applications
          </div>
        </div>

        <div className="pb-app-inspector">
          {!selectedApp ? (
            <div className="pb-inspector-empty">
              <div className="pb-inspector-graphic">
                <AppsRegular />
              </div>
              <h2>Let’s look at an app</h2>
              <p>Select an application to see available repair tools and investigate a problem.</p>
              <span>{hasInventory ? 'Installed version · Supported repairs · Sources' : 'Scan first to list installed apps'}</span>
            </div>
          ) : (
            <div className="pb-inspector-content" key={selectedApp.id}>
              <div className="pb-inspector-heading">
                <ProgramIcon app={selectedApp} large />
                <div>
                  <h2>{selectedApp.name}</h2>
                  <p>
                    {publisher(selectedApp)} · {selectedApp.version || 'Version unavailable'}
                  </p>
                </div>
              </div>
              <div className="pb-app-tools">
                <span className="pb-eyebrow">AVAILABLE TOOLS</span>
                <div>
                  {selectedApp.capabilities.length ? (
                    selectedApp.capabilities.map((operation) => (
                      <span className="pb-tool-tag" key={operation}>
                        <CheckmarkCircleRegular />
                        {OPERATION_LABELS[operation] || operation}
                      </span>
                    ))
                  ) : (
                    <span className="pb-note">Research available. No automatic repair tools detected.</span>
                  )}
                </div>
              </div>
              <SymptomForm {...props} app={selectedApp} />
              <details className="pb-technical">
                <summary>Installation details</summary>
                <dl className="pb-kv">
                  <dt>Identifier</dt>
                  <dd>{selectedApp.id}</dd>
                  {selectedApp.installLocation && (
                    <>
                      <dt>Location</dt>
                      <dd>{selectedApp.installLocation}</dd>
                    </>
                  )}
                  {selectedApp.executable && (
                    <>
                      <dt>Executable</dt>
                      <dd>{selectedApp.executable}</dd>
                    </>
                  )}
                  {selectedApp.packageId && (
                    <>
                      <dt>Package</dt>
                      <dd>{selectedApp.packageId}</dd>
                    </>
                  )}
                </dl>
              </details>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
