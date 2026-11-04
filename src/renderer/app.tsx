import * as React from 'react';
import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';
import {
  AppsRegular,
  ArrowClockwiseRegular,
  ArrowLeftRegular,
  BeakerRegular,
  DesktopPulseRegular,
  DismissRegular,
  HistoryRegular,
  HomeRegular,
  SearchRegular,
  SettingsRegular,
} from '@fluentui/react-icons';
import type {
  AppState,
  InvestigateRequest,
  ProgressEvent,
  UpdateState,
} from '../shared/contracts';
import { getApi, readApiAvailability, readUpdateState, toMessage } from './api';
import { formatDateTime } from './format';
import { findPlan, idleBusy, isBusy, latestRunForPlan, titleFor, type NavKey } from './types';
import { PlanDetail } from './components/PlanDetail';
import { StartupScreen } from './components/StartupScreen';
import { OperationProgress } from './components/OperationProgress';
import { CommandPalette } from './components/CommandPalette';
import { buildPaletteItems, type PaletteItem } from './search';
import { OverviewView } from './views/OverviewView';
const WindowsView = React.lazy(() => import('./views/WindowsView').then((m) => ({ default: m.WindowsView })));
const AppsView = React.lazy(() => import('./views/AppsView').then((m) => ({ default: m.AppsView })));
const ActivityView = React.lazy(() => import('./views/ActivityView').then((m) => ({ default: m.ActivityView })));
const SettingsView = React.lazy(() => import('./views/SettingsView').then((m) => ({ default: m.SettingsView })));

const brandMark = new URL('../../resources/brand/mark.svg', import.meta.url).href;

const NAV: Array<{ key: NavKey; label: string; icon: React.ReactElement }> = [
  { key: 'overview', label: 'Overview', icon: <HomeRegular /> },
  { key: 'windows', label: 'Windows', icon: <DesktopPulseRegular /> },
  { key: 'apps', label: 'Apps', icon: <AppsRegular /> },
  { key: 'activity', label: 'Activity', icon: <HistoryRegular /> },
  { key: 'settings', label: 'Settings', icon: <SettingsRegular /> },
];

export default function App(): React.ReactElement {
  const [state, setState] = React.useState<AppState | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [nav, setNav] = React.useState<NavKey>('overview');
  const [busy, setBusy] = React.useState(idleBusy);
  const [progress, setProgress] = React.useState<ProgressEvent | null>(null);
  const [selectedPlanId, setSelectedPlanId] = React.useState<string | null>(null);
  const [updateState, setUpdateState] = React.useState<UpdateState | null>(null);
  const [updateError, setUpdateError] = React.useState<string | null>(null);
  const [updateAction, setUpdateAction] = React.useState<'refresh' | 'check' | 'install' | null>(null);
  const [cancelPending, setCancelPending] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const capabilities = React.useMemo(() => readApiAvailability(), []);
  const cancelRequested = React.useRef(false);
  const lastPhase = React.useRef<ProgressEvent['phase'] | null>(null);
  const loadId = React.useRef(0);
  const contentRef = React.useRef<HTMLElement | null>(null);
  const pageHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const planHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const planOrigin = React.useRef<{ element: HTMLElement | null; nav: NavKey; scrollTop: number } | null>(null);
  const previousPlanId = React.useRef<string | null>(null);
  const selectedPlan = state && nav !== 'settings' ? findPlan(state, selectedPlanId) : undefined;

  const rememberPlanOrigin = React.useCallback(() => {
    const active = document.activeElement;
    planOrigin.current = {
      element: active instanceof HTMLElement && active !== document.body ? active : null,
      nav,
      scrollTop: contentRef.current?.scrollTop ?? 0,
    };
  }, [nav]);

  const selectPlan = React.useCallback(
    (id: string | null) => {
      if (id) rememberPlanOrigin();
      setSelectedPlanId(id);
    },
    [rememberPlanOrigin],
  );

  const closePlan = React.useCallback(() => setSelectedPlanId(null), []);

  const loadState = React.useCallback(async () => {
    const requestId = ++loadId.current;
    setLoadError(null);
    try {
      const [next] = await Promise.all([getApi().getState(), requestId === 1 ? new Promise((resolve) => setTimeout(resolve, 650)) : Promise.resolve()]);
      if (requestId === loadId.current) setState(next);
    } catch (error: unknown) {
      if (requestId === loadId.current) setLoadError(toMessage(error));
    }
  }, []);

  const refreshState = React.useCallback(async () => {
    const next = await getApi().getState();
    setState(next);
    return next;
  }, []);

  React.useEffect(() => {
    void loadState();
  }, [loadState]);

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
    if (!capabilities.onUpdate) return;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = getApi().onUpdate((next) => {
        const parsed = readUpdateState(next);
        if (parsed) setUpdateState(parsed);
      });
    } catch (error: unknown) {
      setUpdateError(toMessage(error));
    }
    return () => {
      unsubscribe?.();
    };
  }, [capabilities.onUpdate]);

  React.useEffect(() => {
    if (!state || !selectedPlanId) return;
    if (!state.plans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(null);
    }
  }, [state, selectedPlanId]);

  /**
   * Each new stage refreshes the snapshot so progress is described against the
   * current machine state. A stage-provided snapshot is used directly.
   */
  React.useEffect(() => {
    if (!progress) {
      lastPhase.current = null;
      cancelRequested.current = false;
      setCancelPending(false);
      return;
    }
    if (lastPhase.current === progress.phase) return;
    lastPhase.current = progress.phase;
    const snapshot = progress.snapshot;
    if (snapshot) {
      setState((previous) => (previous ? { ...previous, snapshot } : previous));
      return;
    }
    void getApi()
      .getState()
      .then((next) => setState(next))
      .catch(() => {
        // The running operation remains authoritative if a refresh races it.
      });
  }, [progress]);

  const fail = React.useCallback((error: unknown) => {
    setActionError(toMessage(error));
  }, []);

  const handleScan = React.useCallback(async () => {
    setActionError(null);
    setNotice(null);
    setBusy((prev) => ({ ...prev, scan: true }));
    setProgress({
      phase: 'scan',
      message: 'Scanning Windows and installed apps…',
      startedAt: new Date().toISOString(),
      cancellable: false,
    });
    try {
      const snapshot = await getApi().scan();
      await refreshState();
      setNotice(
        `Scan finished at ${formatDateTime(snapshot.scannedAt)}: ${snapshot.diagnostics.length} diagnostics, ${snapshot.apps.length} apps.`,
      );
    } catch (error: unknown) {
      if (cancelRequested.current) {
        setNotice('Scan stopped at your request. No settings were changed.');
      } else {
        fail(error);
      }
    } finally {
      cancelRequested.current = false;
      setBusy((prev) => ({ ...prev, scan: false }));
      setProgress(null);
    }
  }, [fail, refreshState]);

  const handleCancel = React.useCallback(async () => {
    if (!progress?.cancellable || !capabilities.cancelOperation) return;
    setActionError(null);
    cancelRequested.current = true;
    setBusy((prev) => ({ ...prev, cancelling: true }));
    try {
      await getApi().cancelOperation();
      setCancelPending(true);
      setNotice('Cancellation requested. The operation will stop after the current step.');
    } catch (error: unknown) {
      cancelRequested.current = false;
      setCancelPending(false);
      fail(error);
    } finally {
      setBusy((prev) => ({ ...prev, cancelling: false }));
    }
  }, [capabilities.cancelOperation, fail, progress?.cancellable]);

  const handleInvestigate = React.useCallback(
    async (request: InvestigateRequest) => {
      rememberPlanOrigin();
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
    [fail, refreshState, rememberPlanOrigin],
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
    [fail, refreshState],
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
        // The controller persists each restoration outcome before reporting a
        // failure, so refresh even on error to show truthful partial progress.
        await refreshState().catch(() => undefined);
        fail(error);
      } finally {
        setBusy((prev) => ({ ...prev, undoingRunId: null }));
        setProgress(null);
      }
    },
    [fail, refreshState],
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
  }, [fail]);

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
    [fail, refreshState],
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
  }, [fail, refreshState]);

  const refreshUpdateState = React.useCallback(async () => {
    if (!capabilities.getUpdateState) return;
    setUpdateAction('refresh');
    setUpdateError(null);
    try {
      const next = readUpdateState(await getApi().getUpdateState());
      if (next) setUpdateState(next);
      else setUpdateError('The update service returned an unrecognized status.');
    } catch (error: unknown) {
      setUpdateError(toMessage(error));
    } finally {
      setUpdateAction(null);
    }
  }, [capabilities.getUpdateState]);

  const handleCheckUpdates = React.useCallback(async () => {
    if (!capabilities.checkForUpdates) {
      setUpdateError('Update checks are not available in this build.');
      return;
    }
    setUpdateAction('check');
    setUpdateError(null);
    try {
      const next = readUpdateState(await getApi().checkForUpdates());
      if (next) setUpdateState(next);
      else setUpdateError('The update service returned an unrecognized status.');
    } catch (error: unknown) {
      setUpdateError(toMessage(error));
    } finally {
      setUpdateAction(null);
    }
  }, [capabilities.checkForUpdates]);

  const handleInstallUpdate = React.useCallback(async () => {
    if (!capabilities.installUpdate) {
      setUpdateError('Installing an update is not available in this build.');
      return;
    }
    setUpdateAction('install');
    setUpdateError(null);
    setNotice('Restart requested. PocketBench will close to install the verified update.');
    try {
      await getApi().installUpdate();
    } catch (error: unknown) {
      setNotice(null);
      setUpdateError(toMessage(error));
    } finally {
      setUpdateAction(null);
    }
  }, [capabilities.installUpdate]);

  const navigate = React.useCallback((next: NavKey) => {
    planOrigin.current = null;
    setSelectedPlanId(null);
    if (contentRef.current) contentRef.current.scrollTop = 0;
    setNav(next);
    setActionError(null);
  }, []);
  const paletteItems = React.useMemo(() => (state ? buildPaletteItems(state) : []), [state]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handlePaletteAction = React.useCallback(
    (item: PaletteItem) => {
      if (item.kind === 'nav') {
        navigate(item.id.slice('nav:'.length) as NavKey);
      } else if (item.id === 'action:scan') {
        void handleScan();
      } else if (item.kind === 'app') {
        const appId = item.id.slice('app:'.length);
        try {
          sessionStorage.setItem('pocketbench:selected-app', appId);
        } catch { /* selection still dispatches below */ }
        window.dispatchEvent(new CustomEvent('pocketbench:focus-app', { detail: appId }));
        navigate('apps');
      } else if (item.kind === 'finding') {
        const findingId = item.id.slice('finding:'.length);
        const title =
          state?.snapshot?.diagnostics.find((entry) => entry.id === findingId)?.title ?? item.title;
        try {
          sessionStorage.setItem('pocketbench:findings-query', title);
        } catch { /* query still dispatches below */ }
        window.dispatchEvent(new CustomEvent('pocketbench:search-findings', { detail: title }));
        navigate('windows');
      } else if (item.kind === 'plan') {
        if (nav === 'settings') navigate('overview');
        selectPlan(item.id.slice('plan:'.length));
      } else if (item.kind === 'run') {
        navigate('activity');
      }
    },
    [handleScan, nav, navigate, selectPlan, state],
  );


  React.useLayoutEffect(() => {
    const previous = previousPlanId.current;
    previousPlanId.current = selectedPlan?.id ?? null;

    if (selectedPlan) {
      if (contentRef.current) contentRef.current.scrollTop = 0;
      planHeadingRef.current?.focus();
      return;
    }
    if (!previous) return;

    const origin = planOrigin.current;
    planOrigin.current = null;
    if (!origin || origin.nav !== nav) return;
    if (contentRef.current) contentRef.current.scrollTop = origin.scrollTop;
    if (origin.element?.isConnected) origin.element.focus({ preventScroll: true });
    else pageHeadingRef.current?.focus();
  }, [nav, selectedPlan?.id]);

  if (!state) {
    return (
      <StartupScreen
        error={loadError}
        onRetry={() => {
          void loadState();
        }}
      />
    );
  }

  const viewProps = {
    state,
    busy,
    progress,
    selectedPlanId,
    updates: {
      state: updateState,
      error: updateError,
      action: updateAction,
      canCheck: capabilities.checkForUpdates,
      canInstall: capabilities.installUpdate,
      canRefresh: capabilities.getUpdateState,
      refresh: refreshUpdateState,
      check: handleCheckUpdates,
      install: handleInstallUpdate,
    },
    onNavigate: navigate,
    onScan: handleScan,
    onSelectPlan: selectPlan,
    onInvestigate: handleInvestigate,
    onApply: handleApply,
    onUndo: handleUndo,
    onOpenExternal: handleOpenExternal,
    onSaveKey: handleSaveKey,
    onClearKey: handleClearKey,
  };

  const snapshot = state.snapshot;
  const active = isBusy(busy);
  const canCancel = Boolean(progress?.cancellable && capabilities.cancelOperation);

  return (
    <div className="pb-app">
      <nav className="pb-sidebar" aria-label="Primary">
        <div className="pb-brand">
          <div className="pb-brand-mark" aria-hidden="true">
            <img src={brandMark} alt="" />
          </div>
          <div className="pb-brand-text">
            <div className="pb-brand-name">PocketBench</div>
            <div className="pb-brand-sub">Repair workspace</div>
          </div>
        </div>

        <div className="pb-nav">
          {NAV.map((item) => (
            <Button
              key={item.key}
              aria-label={item.label}
              className="pb-nav-button"
              appearance="subtle"
              icon={item.icon}
              aria-current={nav === item.key ? 'page' : undefined}
              onClick={() => navigate(item.key)}
            >
              <span className="pb-nav-text">{item.label}</span>
            </Button>
          ))}
        </div>
      </nav>

      <div className="pb-main">
        <header className="pb-header">
          <div className="pb-header-spacer" />
          <div className="pb-header-meta">
            {snapshot?.labMode && (
              <Badge appearance="tint" color="subtle" icon={<BeakerRegular />}>
                Lab mode
              </Badge>
            )}
            <Button className="pb-header-search" appearance="subtle" size="small" icon={<SearchRegular />} aria-label="Search (Ctrl+K)" onClick={() => setPaletteOpen(true)}>Search <span className="pb-header-kbd" aria-hidden="true">Ctrl+K</span></Button>
            <Button className="pb-connection" appearance="subtle" size="small" onClick={() => navigate('settings')}><span className={'pb-status-dot' + (state.settings.hasApiKey ? '' : ' pb-status-dot-off')} />{state.settings.hasApiKey ? 'Meta connected' : 'Meta not connected'}</Button>
            {active && (
              <span className="pb-working" aria-live="polite">
                <ArrowClockwiseRegular aria-hidden="true" />
                Working…
              </span>
            )}
            {snapshot && (
              <Button
                appearance="secondary"
                icon={<ArrowClockwiseRegular />}
                disabled={active}
                onClick={() => {
                  void handleScan();
                }}
              >
                {busy.scan ? 'Scanning…' : 'Scan again'}
              </Button>
            )}
          </div>
        </header>

        <main className="pb-content" aria-live="off" ref={contentRef}>
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
                      void loadState();
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
              <OperationProgress
                progress={progress}
                cancelling={busy.cancelling || cancelPending}
                canCancel={canCancel}
                onCancel={() => {
                  void handleCancel();
                }}
              />
            )}
          </div>

          <div
            className="pb-page-shell"
            hidden={Boolean(selectedPlan)}
            inert={selectedPlan ? true : undefined}
          >
            <div className="pb-page-intro">
              <div>
                <h1 ref={pageHeadingRef} tabIndex={-1}>
                  {titleFor(nav)}
                </h1>
                <p>
                  {
                    {
                      overview: 'Find what’s wrong. Review every repair before it applies.',
                      windows: 'Diagnostics and repairs for your operating system.',
                      apps: 'Find an app. Describe the problem. Review the repair.',
                      activity: 'Every change, its result, and the way back.',
                      settings: 'Model connection, updates, usage, and local preferences.',
                    }[nav]
                  }
                </p>
              </div>
              {nav === 'apps' && snapshot && (
                <span className="pb-page-context">{snapshot.apps.length} installed</span>
              )}
            </div>

            <div className="pb-page-view">
              <React.Suspense fallback={<div className="pb-section" role="status"><span className="pb-note">Loading view…</span></div>}>
                {nav === 'overview' && <OverviewView {...viewProps} />}
                {nav === 'windows' && <WindowsView {...viewProps} />}
                {nav === 'apps' && <AppsView {...viewProps} />}
                {nav === 'activity' && <ActivityView {...viewProps} />}
                {nav === 'settings' && <SettingsView {...viewProps} />}
              </React.Suspense>
            </div>
          </div>

          {selectedPlan && (
            <div className="pb-plan-focus">
              <div className="pb-plan-focus-bar">
                <Button appearance="subtle" size="small" icon={<ArrowLeftRegular />} onClick={closePlan}>
                  Back to {titleFor(nav)}
                </Button>
                <span className="pb-plan-focus-crumb">Repair review</span>
              </div>
              <PlanDetail
                plan={selectedPlan}
                busy={busy}
                latestRun={latestRunForPlan(state, selectedPlan.id)}
                headingRef={planHeadingRef}
                onApply={handleApply}
                onOpenExternal={handleOpenExternal}
              />
            </div>
          )}
        </main>

        <CommandPalette
          open={paletteOpen}
          items={paletteItems}
          onClose={() => setPaletteOpen(false)}
          onAction={handlePaletteAction}
        />
      </div>
    </div>
  );
}
