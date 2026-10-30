import * as React from 'react';
import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  ProgressBar,
  Spinner,
} from '@fluentui/react-components';
import {
  AppsRegular,
  ArrowClockwiseRegular,
  BeakerRegular,
  DesktopPulseRegular,
  DismissRegular,
  ErrorCircleRegular,
  HistoryRegular,
  HomeRegular,
  SettingsRegular,
  ShieldCheckmarkRegular,
} from '@fluentui/react-icons';
import type {
  AppState,
  InvestigateRequest,
  ProgressEvent,
} from '../shared/contracts';
import { getApi, toMessage } from './api';
import { formatDateTime } from './format';
import { idleBusy, isBusy, type NavKey } from './types';
import { OverviewView } from './views/OverviewView';
import { WindowsView } from './views/WindowsView';
import { AppsView } from './views/AppsView';
import { ActivityView } from './views/ActivityView';
import { SettingsView } from './views/SettingsView';

const NAV: Array<{ key: NavKey; label: string; icon: React.ReactElement }> = [
  { key: 'overview', label: 'Overview', icon: <HomeRegular /> },
  { key: 'windows', label: 'Windows', icon: <DesktopPulseRegular /> },
  { key: 'apps', label: 'Apps', icon: <AppsRegular /> },
  { key: 'activity', label: 'Activity', icon: <HistoryRegular /> },
  { key: 'settings', label: 'Settings', icon: <SettingsRegular /> },
];

function titleFor(nav: NavKey): string {
  switch (nav) {
    case 'overview':
      return 'Overview';
    case 'windows':
      return 'Windows diagnostics';
    case 'apps':
      return 'Applications';
    case 'activity':
      return 'Activity';
    case 'settings':
      return 'Settings';
  }
}

export default function App(): React.ReactElement {
  const [state, setState] = React.useState<AppState | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [nav, setNav] = React.useState<NavKey>('overview');
  const [busy, setBusy] = React.useState(idleBusy);
  const [progress, setProgress] = React.useState<ProgressEvent | null>(null);
  const [selectedPlanId, setSelectedPlanId] = React.useState<string | null>(null);

  const refreshState = React.useCallback(async () => {
    const next = await getApi().getState();
    setState(next);
    return next;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    getApi()
      .getState()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(toMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = getApi().onProgress((event) => {
        setProgress(event);
      });
    } catch (error: unknown) {
      setActionError(toMessage(error));
    }
    return () => {
      unsubscribe?.();
    };
  }, []);

  React.useEffect(() => {
    if (!state || !selectedPlanId) return;
    if (!state.plans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(null);
    }
  }, [state, selectedPlanId]);

  const fail = (error: unknown) => {
    setActionError(toMessage(error));
  };

  const handleScan = React.useCallback(async () => {
    setActionError(null);
    setNotice(null);
    setBusy((prev) => ({ ...prev, scan: true }));
    setProgress({ phase: 'scan', message: 'Scanning Windows and installed apps…' });
    try {
      const snapshot = await getApi().scan();
      await refreshState();
      setNotice(
        `Scan finished at ${formatDateTime(snapshot.scannedAt)}: ${snapshot.diagnostics.length} diagnostics, ${snapshot.apps.length} apps.`,
      );
    } catch (error: unknown) {
      fail(error);
    } finally {
      setBusy((prev) => ({ ...prev, scan: false }));
      setProgress(null);
    }
  }, [refreshState]);

  const handleInvestigate = React.useCallback(
    async (request: InvestigateRequest) => {
      setActionError(null);
      setNotice(null);
      setBusy((prev) => ({ ...prev, investigating: true }));
      try {
        const plan = await getApi().investigate(request);
        await refreshState();
        setSelectedPlanId(plan.id);
        setNotice(`Research produced plan “${plan.title}” (${plan.status}). Review it before applying.`);
      } catch (error: unknown) {
        fail(error);
      } finally {
        setBusy((prev) => ({ ...prev, investigating: false }));
        setProgress(null);
      }
    },
    [refreshState],
  );

  const handleApply = React.useCallback(
    async (planId: string) => {
      setActionError(null);
      setNotice(null);
      setBusy((prev) => ({ ...prev, applyingPlanId: planId }));
      try {
        const run = await getApi().apply(planId);
        const next = await refreshState();
        const plan = next.plans.find((item) => item.id === planId);
        setNotice(
          `Apply finished with status ${run.status}. ${run.verification.length} verification result${run.verification.length === 1 ? '' : 's'} recorded${plan ? ` for “${plan.title}”` : ''}.`,
        );
      } catch (error: unknown) {
        fail(error);
      } finally {
        setBusy((prev) => ({ ...prev, applyingPlanId: null }));
        setProgress(null);
      }
    },
    [refreshState],
  );

  const handleUndo = React.useCallback(
    async (runId: string) => {
      setActionError(null);
      setNotice(null);
      setBusy((prev) => ({ ...prev, undoingRunId: runId }));
      try {
        const run = await getApi().undo(runId);
        await refreshState();
        setNotice(`Undo finished for “${run.title}”: ${run.status}.`);
      } catch (error: unknown) {
        fail(error);
      } finally {
        setBusy((prev) => ({ ...prev, undoingRunId: null }));
        setProgress(null);
      }
    },
    [refreshState],
  );

  const handleOpenExternal = React.useCallback(async (url: string) => {
    if (!/^https?:\/\//i.test(url.trim())) {
      setActionError(`Refused to open a non-web URL: ${url}`);
      return;
    }
    setActionError(null);
    try {
      await getApi().openExternal(url);
    } catch (error: unknown) {
      fail(error);
    }
  }, []);

  const handleSaveKey = React.useCallback(
    async (key: string) => {
      setActionError(null);
      setNotice(null);
      setBusy((prev) => ({ ...prev, savingKey: true }));
      try {
        await getApi().saveApiKey(key);
        await refreshState();
        setNotice('API key saved. The stored value is never displayed.');
      } catch (error: unknown) {
        fail(error);
      } finally {
        setBusy((prev) => ({ ...prev, savingKey: false }));
      }
    },
    [refreshState],
  );

  const handleClearKey = React.useCallback(async () => {
    setActionError(null);
    setNotice(null);
    setBusy((prev) => ({ ...prev, clearingKey: true }));
    try {
      await getApi().clearApiKey();
      await refreshState();
      setNotice('Saved API key cleared.');
    } catch (error: unknown) {
      fail(error);
    } finally {
      setBusy((prev) => ({ ...prev, clearingKey: false }));
    }
  }, [refreshState]);

  const navigate = React.useCallback((next: NavKey) => {
    setNav(next);
    setActionError(null);
  }, []);

  const viewProps = state
    ? {
        state,
        busy,
        progress,
        selectedPlanId,
        onNavigate: navigate,
        onScan: handleScan,
        onSelectPlan: setSelectedPlanId,
        onInvestigate: handleInvestigate,
        onApply: handleApply,
        onUndo: handleUndo,
        onOpenExternal: handleOpenExternal,
        onSaveKey: handleSaveKey,
        onClearKey: handleClearKey,
      }
    : null;

  const scanning = busy.scan;
  const snapshot = state?.snapshot ?? null;
  const active = isBusy(busy);

  return (
    <div className="pb-app">
      <nav className="pb-sidebar" aria-label="Primary">
        <div className="pb-brand">
          <div className="pb-brand-mark" aria-hidden="true">
            <ShieldCheckmarkRegular />
          </div>
          <div className="pb-brand-text">
            <div className="pb-brand-name">PocketBench</div>
            <div className="pb-brand-sub">Repair desktop</div>
          </div>
        </div>

        <div className="pb-nav-label">Workspace</div>
        <div className="pb-nav">
          {NAV.map((item) => (
            <Button
              key={item.key}
              aria-label={item.label}
              className={'pb-nav-button' + (item.key === 'settings' ? ' pb-nav-settings' : '')}
              appearance="subtle"
              icon={item.icon}
              aria-current={nav === item.key ? 'page' : undefined}
              onClick={() => navigate(item.key)}
            >
              <span className="pb-nav-text">{item.label}</span>
            </Button>
          ))}
        </div>

        <div className="pb-sidebar-foot">
          <ShieldCheckmarkRegular />
          <div><strong>Changes you control</strong><span>Review before applying</span></div>
        </div>
      </nav>

      <div className="pb-main">
        <header className="pb-header">
          <div className="pb-breadcrumb"><DesktopPulseRegular /><span>This PC</span><span className="pb-breadcrumb-divider">/</span><span>{titleFor(nav)}</span></div>
          <div className="pb-header-spacer" />
          <div className="pb-header-meta">
            {snapshot?.labMode && (
              <Badge appearance="tint" color="warning" icon={<BeakerRegular />}>
                Lab mode
              </Badge>
            )}
            <Button className="pb-connection" appearance="subtle" size="small" onClick={() => navigate('settings')}><span className={'pb-status-dot' + (state?.settings.hasApiKey ? '' : ' pb-status-dot-off')} />{state?.settings.hasApiKey ? 'Meta connected' : 'Connect Meta'}</Button>
            {active && (
              <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                <Spinner size="extra-tiny" aria-label="Working" />
                Working…
              </span>
            )}
            <Button
              appearance="primary"
              icon={<ArrowClockwiseRegular />}
              disabled={!state || scanning}
              onClick={() => {
                void handleScan();
              }}
            >
              {scanning ? 'Scanning…' : 'Scan PC'}
            </Button>
          </div>
        </header>

        <main className="pb-content" aria-live="off">
          <div className="pb-banners" aria-live="polite">
            {loadError && (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>Backend unavailable. </MessageBarTitle>
                  {loadError}{' '}
                  <Button
                    appearance="transparent"
                    size="small"
                    icon={<ArrowClockwiseRegular />}
                    onClick={() => {
                      setLoadError(null);
                      getApi()
                        .getState()
                        .then((next) => setState(next))
                        .catch((error: unknown) => setLoadError(toMessage(error)));
                    }}
                  >
                    Retry
                  </Button>
                </MessageBarBody>
              </MessageBar>
            )}

            {actionError && (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>Action failed. </MessageBarTitle>
                  {actionError}
                </MessageBarBody>
                <Button
                  appearance="transparent"
                  size="small"
                  icon={<DismissRegular />}
                  aria-label="Dismiss error"
                  onClick={() => setActionError(null)}
                />
              </MessageBar>
            )}

            {notice && (
              <div className="pb-notice" role="status">
                <span>{notice}</span>
                <Button
                  appearance="transparent"
                  size="small"
                  icon={<DismissRegular />}
                  aria-label="Dismiss notice"
                  onClick={() => setNotice(null)}
                />
              </div>
            )}

            {progress && (
              <div className="pb-progress" role="status">
                <Spinner size="extra-tiny" aria-label={`${progress.phase} in progress`} />
                <span>
                  <strong>{progress.phase}:</strong> {progress.message}
                </span>
                <span style={{ flex: 1 }} />
                <ProgressBar value={undefined} thickness="large" style={{ width: '12rem' }} aria-label={`${progress.phase} progress`} />
              </div>
            )}

          </div>

          <div className="pb-page-intro"><div><h1>{titleFor(nav)}</h1><p>{{overview:'Investigate a problem. Apply a reviewed fix.',windows:'Diagnostics and repairs for your operating system.',apps:'Find an app. Describe the problem. Review the repair.',activity:'Every change, its result, and the way back.',settings:'Model connection, usage, and local preferences.'}[nav]}</p></div><span className="pb-page-context">{nav === 'apps' && snapshot ? `${snapshot.apps.length} installed` : nav === 'overview' ? 'Windows + applications' : ''}</span></div>

          {!state ? (
            <section className="pb-section" aria-label="Loading">
              {!loadError ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Spinner aria-label="Loading application state" />
                  <span className="pb-note">Loading application state…</span>
                </div>
              ) : (
                <p className="pb-note">
                  <ErrorCircleRegular /> Could not load state. Use Retry above.
                </p>
              )}
            </section>
          ) : (
            viewProps && (
              <React.Fragment>
                {selectedPlanId && nav !== 'settings' && (
                  <div className="pb-selected-plan">
                      <span>Repair plan open below</span>
                      <Button
                        appearance="transparent"
                        size="small"
                        icon={<DismissRegular />}
                        aria-label="Close selected plan"
                        onClick={() => setSelectedPlanId(null)}
                      />
                  </div>
                )}
                <div className="pb-page-view" key={nav}>
                  {nav === 'overview' && <OverviewView {...viewProps} />}
                  {nav === 'windows' && <WindowsView {...viewProps} />}
                  {nav === 'apps' && <AppsView {...viewProps} />}
                  {nav === 'activity' && <ActivityView {...viewProps} />}
                  {nav === 'settings' && <SettingsView {...viewProps} />}
                </div>
                <p className="pb-footer-note">
                  <ShieldCheckmarkRegular /> Changes are recorded. Results are verified. Supported changes can be undone.
                </p>
              </React.Fragment>
            )
          )}
        </main>
      </div>
    </div>
  );
}
