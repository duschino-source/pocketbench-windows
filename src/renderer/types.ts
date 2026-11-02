import type {
  AppState,
  DiagnosticEvidence,
  InvestigateRequest,
  ProgressEvent,
  RepairPlan,
  RepairRun,
  SymptomCategory,
  UpdateState,
} from '../shared/contracts';

export type NavKey = 'overview' | 'windows' | 'apps' | 'activity' | 'settings';

export function titleFor(nav: NavKey): string {
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

const SEVERITY_ORDER: Record<DiagnosticEvidence['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Present the most urgent finding first whenever the UI says "most urgent first". */
export function sortFindingsByUrgency<T extends Pick<DiagnosticEvidence, 'severity'>>(items: readonly T[]): T[] {
  return items.slice().sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]);
}

export interface PresetChoice {
  label: string;
  symptom: string;
  category: SymptomCategory;
}

/** General presets carry their category so picking one enables investigate. */
export const GENERAL_PRESETS: readonly PresetChoice[] = [
  { label: 'Internet connection', symptom: 'Wi-Fi connects but websites won’t load', category: 'connectivity' },
  { label: 'Slow startup', symptom: 'Slow startup', category: 'performance' },
  { label: 'Windows Update', symptom: 'Windows Update fails', category: 'updates' },
];

export interface BusyState {
  scan: boolean;
  investigating: boolean;
  applyingPlanId: string | null;
  undoingRunId: string | null;
  savingKey: boolean;
  clearingKey: boolean;
  cancelling: boolean;
}

export const idleBusy: BusyState = {
  scan: false,
  investigating: false,
  applyingPlanId: null,
  undoingRunId: null,
  savingKey: false,
  clearingKey: false,
  cancelling: false,
};

export interface UpdateViewProps {
  state: UpdateState | null;
  error: string | null;
  action: 'refresh' | 'check' | 'install' | null;
  canCheck: boolean;
  canInstall: boolean;
  canRefresh: boolean;
  refresh: () => Promise<void>;
  check: () => Promise<void>;
  install: () => Promise<void>;
}

export function isBusy(busy: BusyState): boolean {
  return (
    busy.scan ||
    busy.investigating ||
    busy.applyingPlanId !== null ||
    busy.undoingRunId !== null ||
    busy.savingKey ||
    busy.clearingKey ||
    busy.cancelling
  );
}

export interface ViewProps {
  state: AppState;
  busy: BusyState;
  progress: ProgressEvent | null;
  selectedPlanId: string | null;
  updates: UpdateViewProps;
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
  return state.history.find((run) => run.planId === planId);
}
