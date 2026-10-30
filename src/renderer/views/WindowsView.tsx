import * as React from 'react';
import { Badge, Button, Input, Textarea } from '@fluentui/react-components';
import { SearchRegular } from '@fluentui/react-icons';
import type { DiagnosticEvidence } from '../../shared/contracts';
import { findPlan, type ViewProps } from '../types';
import { PlanDetail } from '../components/PlanDetail';

const CATEGORIES = ['all', 'network', 'performance', 'startup', 'storage', 'integrity', 'services', 'other'] as const;

function categoryOf(item: DiagnosticEvidence): string {
  const normalized = item.category.toLowerCase();
  if (normalized.includes('network') || normalized.includes('dns') || normalized.includes('proxy')) return 'network';
  if (normalized.includes('startup')) return 'startup';
  if (normalized.includes('storage') || normalized.includes('disk')) return 'storage';
  if (normalized.includes('integrity') || normalized.includes('system file')) return 'integrity';
  if (normalized.includes('service')) return 'services';
  if (normalized.includes('memory') || normalized.includes('cpu') || normalized.includes('perform')) {
    return 'performance';
  }
  return 'other';
}

function severityColor(severity: DiagnosticEvidence['severity']): 'informative' | 'warning' | 'severe' {
  switch (severity) {
    case 'critical':
      return 'severe';
    case 'warning':
      return 'warning';
    case 'info':
      return 'informative';
  }
}

export function WindowsView(props: ViewProps): React.ReactElement {
  const { state, busy, selectedPlanId } = props;
  const snapshot = state.snapshot;
  const diagnostics = snapshot?.diagnostics ?? [];
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]>('all');
  const [evidenceId, setEvidenceId] = React.useState('');
  const [symptom, setSymptom] = React.useState('');

  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const item of diagnostics) {
      const key = categoryOf(item);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [diagnostics]);

  const visible = diagnostics.filter((item) => category === 'all' || categoryOf(item) === category);
  const selectedPlan = findPlan(state, selectedPlanId);

  const investigateEvidence = (item: DiagnosticEvidence) => {
    void props.onInvestigate({ evidenceId: item.id, symptom: item.title });
  };

  return (
    <div>
      <section className="pb-section" aria-labelledby="windows-diagnostics">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="windows-diagnostics">
            Windows diagnostics
          </h2>
          <div className="pb-section-action">
            <Button
              appearance="primary"
              icon={<SearchRegular />}
              disabled={busy.scan}
              onClick={() => {
                void props.onScan();
              }}
            >
              {busy.scan ? 'Scanning…' : 'Run scan'}
            </Button>
          </div>
        </div>

        {!snapshot ? (
          <div className="pb-empty">
            <h3>No diagnostics yet</h3>
            <p>
              Run a scan to populate Windows diagnostic categories. PocketBench never invents problems: this list
              stays empty until real evidence is collected.
            </p>
          </div>
        ) : (
          <div>
            <div className="pb-category-bar" role="group" aria-label="Diagnostic categories">
              {CATEGORIES.map((key) => (
                <Button
                  key={key}
                  size="small"
                  appearance={category === key ? 'primary' : 'secondary'}
                  aria-pressed={category === key}
                  onClick={() => setCategory(key)}
                >
                  {key === 'all' ? `All (${diagnostics.length})` : `${key} (${counts.get(key) ?? 0})`}
                </Button>
              ))}
            </div>

            {visible.length === 0 ? (
              <p className="pb-note">No diagnostics in this category from the latest scan.</p>
            ) : (
              <ul className="pb-list">
                {visible.map((item) => (
                  <li key={item.id} className="pb-row">
                    <div className="pb-row-main">
                      <div className="pb-row-title">{item.title}</div>
                      <div className="pb-row-sub">
                        {item.category} · {item.observed}
                      </div>
                      {item.details.length > 0 && (
                        <ul className="pb-detail-list">
                          {item.details.slice(0, 3).map((detail, index) => (
                            <li key={`${item.id}-detail-${index}`}>{detail}</li>
                          ))}
                        </ul>
                      )}
                      {item.suggestedOperation && (
                        <div className="pb-row-sub pb-mono">Suggested: {item.suggestedOperation}</div>
                      )}
                    </div>
                    <div className="pb-row-side">
                      <Badge appearance="tint" color={severityColor(item.severity)}>
                        {item.severity}
                      </Badge>
                      <Button
                        appearance="secondary"
                        size="small"
                        disabled={busy.investigating}
                        onClick={() => investigateEvidence(item)}
                      >
                        Investigate
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="pb-section" aria-labelledby="windows-manual">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="windows-manual">
            Investigate a symptom
          </h2>
        </div>
        <form
          className="pb-form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = symptom.trim();
            if (trimmed.length === 0) return;
            const request = evidenceId.trim().length > 0
              ? { symptom: trimmed, evidenceId: evidenceId.trim() }
              : { symptom: trimmed };
            setSymptom('');
            void props.onInvestigate(request);
          }}
        >
          <label className="pb-note" htmlFor="windows-evidence-id">
            Evidence ID (optional, from the diagnostic above)
          </label>
          <Input
            id="windows-evidence-id"
            value={evidenceId}
            onChange={(_, data) => setEvidenceId(data.value)}
            placeholder="e.g. diag-network-01"
          />
          <label className="pb-note" htmlFor="windows-symptom">
            Describe what you observe in your own words
          </label>
          <Textarea
            id="windows-symptom"
            value={symptom}
            onChange={(_, data) => setSymptom(data.value)}
            placeholder="Example: VPN connects, but intranet pages time out"
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
            Research uses your saved API key and the latest snapshot. If no snapshot exists, run a scan first.
          </p>
        </form>
      </section>

      {selectedPlan ? (
        <PlanDetail
          plan={selectedPlan}
          busy={busy}
          latestRun={state.history.filter((run) => run.planId === selectedPlan.id).slice(-1)[0]}
          onApply={props.onApply}
          onOpenExternal={props.onOpenExternal}
        />
      ) : (
        state.plans.length > 0 && (
          <section className="pb-section" aria-labelledby="windows-plans">
            <div className="pb-section-head">
              <h2 className="pb-section-title" id="windows-plans">
                Repair plans
              </h2>
            </div>
            <ul className="pb-list">
              {state.plans
                .slice()
                .reverse()
                .map((plan) => (
                  <li key={plan.id} className="pb-row">
                    <div className="pb-row-main">
                      <div className="pb-row-title">{plan.title}</div>
                      <div className="pb-row-sub">
                        {plan.target.name} · {plan.status} · {plan.steps.length} steps
                      </div>
                    </div>
                    <div className="pb-row-side">
                      <Button appearance="secondary" size="small" onClick={() => props.onSelectPlan(plan.id)}>
                        Open plan
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        )
      )}
    </div>
  );
}
