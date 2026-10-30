import * as React from 'react';
import { Button, SearchBox, Textarea } from '@fluentui/react-components';
import { SearchRegular } from '@fluentui/react-icons';
import type { AppTarget } from '../../shared/contracts';
import { findPlan, latestRunForPlan, type ViewProps } from '../types';
import { PlanDetail } from '../components/PlanDetail';

export function AppsView(props: ViewProps): React.ReactElement {
  const { state, busy, selectedPlanId } = props;
  const apps = state.snapshot?.apps ?? [];
  const [query, setQuery] = React.useState('');
  const [selectedAppId, setSelectedAppId] = React.useState<string | null>(null);
  const [symptom, setSymptom] = React.useState('');

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return apps;
    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(needle) ||
        app.publisher.toLowerCase().includes(needle) ||
        app.version.toLowerCase().includes(needle) ||
        app.id.toLowerCase().includes(needle),
    );
  }, [apps, query]);

  React.useEffect(() => {
    if (selectedAppId && !apps.some((app) => app.id === selectedAppId)) {
      setSelectedAppId(null);
    }
  }, [apps, selectedAppId]);

  const selectedApp: AppTarget | undefined = selectedAppId
    ? apps.find((app) => app.id === selectedAppId)
    : undefined;
  const selectedPlan = findPlan(state, selectedPlanId);
  const appPlans = selectedApp
    ? state.plans.filter((plan) => plan.target.kind === 'app' && plan.target.id === selectedApp.id)
    : [];

  return (
    <div>
      <section className="pb-section" aria-labelledby="apps-inventory">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="apps-inventory">
            Installed applications
          </h2>
          <div className="pb-section-action">
            <SearchBox
              placeholder="Search name, publisher, version"
              value={query}
              onChange={(_, data) => setQuery(data.value ?? '')}
              aria-label="Search installed applications"
            />
            <Button
              appearance="secondary"
              icon={<SearchRegular />}
              disabled={busy.scan}
              onClick={() => {
                void props.onScan();
              }}
            >
              {busy.scan ? 'Scanning…' : 'Rescan'}
            </Button>
          </div>
        </div>

        {!state.snapshot ? (
          <div className="pb-empty">
            <h3>No inventory yet</h3>
            <p>
              The full application inventory appears here after a scan, with version and publisher for every
              discovered entry. Run a scan to populate it.
            </p>
          </div>
        ) : apps.length === 0 ? (
          <p className="pb-note">The latest scan discovered no installed applications.</p>
        ) : filtered.length === 0 ? (
          <p className="pb-note">No applications match “{query.trim()}”.</p>
        ) : (
          <div className="pb-split">
            <ul className="pb-list" aria-label="Application inventory">
              {filtered.map((app) => (
                <li key={app.id} className="pb-row">
                  <div className="pb-row-main">
                    <div className="pb-row-title">{app.name}</div>
                    <div className="pb-row-sub">
                      {app.version} · {app.publisher}
                    </div>
                    {app.installLocation && <div className="pb-row-sub pb-mono">{app.installLocation}</div>}
                  </div>
                  <div className="pb-row-side">
                    <Button
                      appearance={selectedAppId === app.id ? 'primary' : 'secondary'}
                      size="small"
                      aria-pressed={selectedAppId === app.id}
                      onClick={() => {
                        setSelectedAppId(app.id);
                        setSymptom('');
                      }}
                    >
                      Inspect
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <div>
              {!selectedApp ? (
                <div className="pb-empty">
                  <h3>Select an application</h3>
                  <p>Choose Inspect on any inventory entry to see capabilities and describe a symptom.</p>
                </div>
              ) : (
                <section className="pb-section" aria-labelledby="apps-inspect">
                  <div className="pb-section-head">
                    <h2 className="pb-section-title" id="apps-inspect">
                      {selectedApp.name}
                    </h2>
                  </div>
                  <dl className="pb-kv">
                    <dt>Version</dt>
                    <dd>{selectedApp.version}</dd>
                    <dt>Publisher</dt>
                    <dd>{selectedApp.publisher}</dd>
                    {selectedApp.installLocation && (
                      <>
                        <dt>Install location</dt>
                        <dd className="pb-mono">{selectedApp.installLocation}</dd>
                      </>
                    )}
                    {selectedApp.executable && (
                      <>
                        <dt>Executable</dt>
                        <dd className="pb-mono">{selectedApp.executable}</dd>
                      </>
                    )}
                    {selectedApp.packageId && (
                      <>
                        <dt>Package</dt>
                        <dd className="pb-mono">{selectedApp.packageId}</dd>
                      </>
                    )}
                    <dt>Supported operations</dt>
                    <dd className="pb-mono">
                      {selectedApp.capabilities.length === 0
                        ? 'None reported'
                        : selectedApp.capabilities.join(', ')}
                    </dd>
                  </dl>

                  <form
                    className="pb-form"
                    style={{ marginTop: '0.875rem' }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const trimmed = symptom.trim();
                      if (trimmed.length === 0 || !selectedApp) return;
                      setSymptom('');
                      void props.onInvestigate({ appId: selectedApp.id, symptom: trimmed });
                    }}
                  >
                    <label className="pb-note" htmlFor="apps-symptom">
                      Describe the symptom for {selectedApp.name}
                    </label>
                    <Textarea
                      id="apps-symptom"
                      value={symptom}
                      onChange={(_, data) => setSymptom(data.value)}
                      placeholder="Example: launches, then closes after two seconds"
                      rows={3}
                    />
                    <div className="pb-form-row">
                      <Button
                        type="submit"
                        appearance="primary"
                        disabled={busy.investigating || symptom.trim().length === 0}
                      >
                        {busy.investigating ? 'Researching…' : 'Research repair'}
                      </Button>
                    </div>
                    <p className="pb-note">
                      {selectedApp.capabilities.length === 0
                        ? 'This app reports no supported repair operations. Research may still document the issue, but Apply fix stays unavailable.'
                        : 'Research is limited to supported local operations for this app.'}
                    </p>
                  </form>

                  {appPlans.length > 0 && (
                    <div style={{ marginTop: '0.875rem' }}>
                      <h3 className="pb-section-title">Plans for this app</h3>
                      <ul className="pb-list" style={{ marginTop: '0.5rem' }}>
                        {appPlans
                          .slice()
                          .reverse()
                          .map((plan) => (
                            <li key={plan.id} className="pb-row">
                              <div className="pb-row-main">
                                <div className="pb-row-title">{plan.title}</div>
                                <div className="pb-row-sub">
                                  {plan.status} · {plan.steps.length} steps
                                </div>
                              </div>
                              <div className="pb-row-side">
                                <Button
                                  appearance="secondary"
                                  size="small"
                                  onClick={() => props.onSelectPlan(plan.id)}
                                >
                                  Open plan
                                </Button>
                              </div>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        )}

        {apps.length > 0 && (
          <p className="pb-note" style={{ marginTop: '0.75rem' }}>
            Showing {filtered.length} of {apps.length} inventoried applications.
          </p>
        )}
      </section>

      {selectedPlan && (
        <PlanDetail
          plan={selectedPlan}
          busy={busy}
          latestRun={latestRunForPlan(state, selectedPlan.id)}
          onApply={props.onApply}
          onOpenExternal={props.onOpenExternal}
        />
      )}
    </div>
  );
}
