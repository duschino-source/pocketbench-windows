export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type OperationId = 'windows.flushDns' | 'windows.clearUserProxy' | 'windows.startService' | 'windows.integrityRepair' | 'windows.disableStartup' | 'app.repairPackage' | 'app.updatePackage' | 'app.quarantineCache' | 'app.patchConfig' | 'app.restart'
export interface DiagnosticEvidence {
  id: string; area: 'windows' | 'app'; category: string; title: string
  severity: 'info' | 'warning' | 'critical'; observed: string; details: string[]
  appId?: string; suggestedOperation?: OperationId; context?: Record<string, JsonValue>
  observedAt?: string; expiresAt?: string
}
export interface AppTarget {
  id: string; name: string; version: string; publisher: string; installLocation?: string
  executable?: string; packageId?: string; family?: 'firefox' | 'steam' | 'obsidian' | 'other'
  capabilities: OperationId[]
}
export interface StartupEntry { id: string; name: string; command: string; location: string; enabled: boolean }
export interface ServiceInfo { name: string; displayName: string; status: string; startType: string; triggerStart?: boolean }
export interface SystemSnapshot {
  scannedAt: string; platform: string; machine: { name: string; os: string; memoryTotal: number; memoryFree: number; uptime: number; cpuCount: number }
  metrics: { diskFree: number; diskTotal: number; cpuPercent: number | null }
  diagnostics: DiagnosticEvidence[]; apps: AppTarget[]; startup: StartupEntry[]; services: ServiceInfo[]
  labMode: boolean
}
export interface SourceAssessment {
  url: string; title: string; kind: 'official' | 'community'; supports: string
  applicable: boolean; concerns: string[]; corroboratedBy: string[]
}
export interface RepairStep {
  id: string; operation: OperationId; title: string; targetId: string
  params: Record<string, JsonValue>; requiresAdmin: boolean; reversible: boolean
  impact: string; verification: string
}
export interface RepairCapability { operation: OperationId; description: string; targetId: string; constraints: string }
export interface RepairPlan {
  id: string; createdAt: string; title: string; summary: string
  target: { kind: 'windows' | 'app'; id?: string; name: string }
  status: 'ready' | 'needs-validation' | 'blocked'; reason: string
  evidence: DiagnosticEvidence[]; sources: SourceAssessment[]; steps: RepairStep[]
  review: { approved: boolean; rationale: string; concerns: string[] }
}
export interface VerificationResult {
  passed: boolean; pendingReboot?: boolean; summary: string
  checks: { name: string; passed: boolean; before?: string; after?: string }[]
}
export interface StepExecution {
  step: RepairStep; startedAt: string; finishedAt: string; success: boolean
  output: string; backupId?: string; data: Record<string, JsonValue>
}
export interface RepairRun {
  id: string; planId: string; title: string; createdAt: string; finishedAt?: string
  status: 'running' | 'fixed' | 'failed' | 'pending-verification' | 'undone'
  executions: StepExecution[]; verification: VerificationResult[]; error?: string; canUndo: boolean
}
export type SymptomCategory = 'performance' | 'connectivity' | 'updates' | 'app'
export interface InvestigateRequest { symptom: string; appId?: string; evidenceId?: string; category?: SymptomCategory }
export interface BudgetState { limit: number; spent: number; reserved: number; remaining: number; requests: number }
export interface AppSettings { hasApiKey: boolean; budgetLimit: number; model: string; labMode: boolean; dataDirectory: string }
export interface AppState { snapshot: SystemSnapshot | null; plans: RepairPlan[]; history: RepairRun[]; settings: AppSettings; budget: BudgetState }
export interface ProgressEvent { phase: 'scan' | 'research' | 'review' | 'apply' | 'verify' | 'undo'; message: string; planId?: string; startedAt?: string; percent?: number; cancellable?: boolean; cancellationReason?: string; snapshot?: SystemSnapshot }
export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'manual'
  supported: boolean; trustedPublisher: boolean; version?: string; percent?: number; message?: string; releaseUrl?: string
}
export interface PocketBenchAPI {
  getState(): Promise<AppState>; scan(): Promise<SystemSnapshot>
  getAppIcon(appId: string): Promise<string | null>
  investigate(request: InvestigateRequest): Promise<RepairPlan>; apply(planId: string): Promise<RepairRun>
  undo(runId: string): Promise<RepairRun>; saveApiKey(key: string): Promise<AppSettings>
  clearApiKey(): Promise<AppSettings>; openExternal(url: string): Promise<void>
  onProgress(callback: (event: ProgressEvent) => void): () => void
  cancelOperation(): Promise<void>
  getUpdateState(): Promise<UpdateState>; checkForUpdates(): Promise<UpdateState>; installUpdate(): Promise<void>
  onUpdate(callback: (state: UpdateState) => void): () => void
}
declare global { interface Window { pocketbench: PocketBenchAPI } }
