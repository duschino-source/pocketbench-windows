import * as React from 'react';
import { Badge, Button } from '@fluentui/react-components';
import { ArrowUndoRegular } from '@fluentui/react-icons';
import { formatDateTime, runStatusLabel } from '../format';
import { findPlan, latestRunForPlan, type ViewProps } from '../types';
import { PlanDetail } from '../components/PlanDetail';

function statusColor(
  status: 'running' | 'fixed' | 'failed' | 'pending-verification' | 'undone',
): 'informative' | 'success' | 'danger' | 'warning' | 'subtle' {
  switch (status) {
    case 'running':
      return 'informative';
    case 'fixed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'pending-verification':
      return 'warning';
    case 'undone':
      return 'subtle';
  }
}

export function ActivityView(props: ViewProps): React.ReactElement {
  const { state, busy, selectedPlanId } = props;
  const history = state.history;
  const selectedPlan = findPlan(state, selectedPlanId);

  return (
    <div>
      <section className="pb-section" aria-labelledby="activity-history">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="activity-history">
            Operation history
          </h2>
        </div>

        {history.length === 0 ? (
          <div className="pb-empty">
            <h3>No operations yet</h3>
            <p>
              Applied repairs, verification results, and undo actions appear here. PocketBench records only real
              history; this list stays empty until you apply a ready plan.
            </p>
          </div>
        ) : (
          <ul className="pb-list">
            {history.map((run) => {
              const undoing = busy.undoingRunId === run.id;
              const pendingReboot = run.verification.some((result) => result.pendingReboot);
              return (
                <li key={run.id} className="pb-row">
                  <div className="pb-row-main">
                    <div className="pb-row-title">{run.title}</div>
                    <div className="pb-row-sub">
                      Started {formatDateTime(run.createdAt)}
                      {run.finishedAt ? ` · finished ${formatDateTime(run.finishedAt)}` : ' · not finished'} ·{' '}
                      {run.executions.length} step execution{run.executions.length === 1 ? '' : 's'}
                    </div>
                    {run.error && <div className="pb-row-sub">Error: {run.error}</div>}
                    {run.executions.map((execution) => (
                      <div key={execution.step.id} className="pb-row-sub">
                        {execution.success ? 'Succeeded' : 'Failed'}: {execution.step.title}
                        {execution.backupId ? ` (backup ${execution.backupId})` : ''}
                      </div>
                    ))}
                    {run.verification.map((result, index) => (
                      <div key={`${run.id}-verification-${index}`} className="pb-row-sub">
                        Verification: {result.summary} —{' '}
                        {result.checks.map((check) => check.name).join(', ') || 'no checks recorded'}
                      </div>
                    ))}
                    {pendingReboot && (
                      <div className="pb-pending-reboot" role="status">
                        Pending reboot: verification remains incomplete until Windows restarts.
                      </div>
                    )}
                  </div>
                  <div className="pb-row-side">
                    <Badge appearance="tint" color={statusColor(run.status)}>
                      {runStatusLabel(run.status)}
                    </Badge>
                    {run.canUndo ? (
                      <Button
                        appearance="secondary"
                        size="small"
                        icon={<ArrowUndoRegular />}
                        disabled={undoing || busy.undoingRunId !== null}
                        onClick={() => {
                          void props.onUndo(run.id);
                        }}
                        title="Undo uses the stored backup for the last supported reversible operation"
                      >
                        {undoing ? 'Undoing…' : 'Undo'}
                      </Button>
                    ) : (
                      <Badge appearance="outline" color="subtle" title="Only supported reversible operations can be undone">
                        Undo unavailable
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selectedPlan ? (
        <PlanDetail
          plan={selectedPlan}
          busy={busy}
          latestRun={latestRunForPlan(state, selectedPlan.id)}
          onApply={props.onApply}
          onOpenExternal={props.onOpenExternal}
        />
      ) : (
        state.plans.length > 0 && (
          <section className="pb-section" aria-labelledby="activity-plans">
            <div className="pb-section-head">
              <h2 className="pb-section-title" id="activity-plans">
                Repair plans
              </h2>
            </div>
            <ul className="pb-list">
              {state.plans
                .slice()
                .map((plan) => (
                  <li key={plan.id} className="pb-row">
                    <div className="pb-row-main">
                      <div className="pb-row-title">{plan.title}</div>
                      <div className="pb-row-sub">
                        {plan.target.name} · {plan.status}
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
