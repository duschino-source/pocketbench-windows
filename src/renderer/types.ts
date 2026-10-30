import type {
  AppState,
  InvestigateRequest,
  ProgressEvent,
  RepairPlan,
  RepairRun,
} from '../shared/contracts';

export type NavKey = 'overview' | 'windows' | 'apps' | 'activity' | 'settings';

export interface BusyState {
  scan: boolean;
  investigating: boolean;
  applyingPlanId: string | null;
  undoingRunId: string | null;
  savingKey: boolean;
  clearingKey: boolean;
}

export const idleBusy: BusyState = {
  scan: false,
  investigating: false,
  applyingPlanId: null,
  undoingRunId: null,
  savingKey: false,
  clearingKey: false,
};

export function isBusy(busy: BusyState): boolean {
  return (
    busy.scan ||
    busy.investigating ||
    busy.applyingPlanId !== null ||
    busy.undoingRunId !== null ||
    busy.savingKey ||
    busy.clearingKey
  );
}

export interface ViewProps {
  state: AppState;
  busy: BusyState;
  progress: ProgressEvent | null;
  selectedPlanId: string | null;
  onNavigate: (nav: NavKey) => void;
  onScan: () => Promise<void>;
  onSelectPlan: (id: string | null) => void;
  onInvestigate: (request: InvestigateRequest) => Promise<void>;
  onApply: (planId: string) => Promise<void>;
  onUndo: (runId: string) => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
  onSaveKey: (key: string) => Promise<void>;
  onClearKey: () => Promise<void>;
}

export function findPlan(state: AppState, id: string | null): RepairPlan | undefined {
  if (!id) return undefined;
  return state.plans.find((plan) => plan.id === id);
}

/** Latest run recorded for a plan, if any. */
export function latestRunForPlan(state: AppState, planId: string): RepairRun | undefined {
  const matches = state.history.filter((run) => run.planId === planId);
  return matches.length > 0 ? matches[matches.length - 1] : undefined;
}
