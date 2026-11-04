import { createHash } from 'node:crypto'
import type { DiagnosticEvidence, JsonValue, RepairPlan, RepairStep } from '../shared/contracts'
import {
  ALLOWED_HOSTS,
  APP_FAMILIES,
  ALL_DIAGNOSTIC_TOOL_DEFINITIONS,
  minimizeDiagnosticText,
  type AllowedHost,
  type AppFamily,
  type DiagnosticResult,
  type DiagnosticToolName,
} from './diagnostics'
import { isSelectedService, OPERATION_META } from './windows/policy'
import { classifySymptomCategory } from '../shared/investigation'

export const INVESTIGATION_CATEGORIES = ['performance', 'network', 'updates', 'app'] as const
export type InvestigationCategory = (typeof INVESTIGATION_CATEGORIES)[number]

export const DEFAULT_INVESTIGATION_CACHE_TTL_MS = 60_000
export const OFFLINE_OBSERVATION_MAX_AGE_MS = 120_000

export interface DiagnosticCall {
  name: DiagnosticToolName
  args: Record<string, JsonValue>
}

export interface InvestigationRoute {
  category: InvestigationCategory
  calls: DiagnosticCall[]
}

export interface RouteOptions {
  /**
   * Known family for the app category. Only a known family is ever probed.
   * Unknown (`undefined`) or unsupported (`null`) probes nothing, so no
   * unrelated family is inspected.
   */
  appFamily?: AppFamily | null
  /** Fixed allow-listed host for the network category. */
  hostname?: AllowedHost
}

const TOOL_NAMES = new Set<string>(ALL_DIAGNOSTIC_TOOL_DEFINITIONS.map(tool => tool.name))
const SUPPORTED_HOST = 'www.microsoft.com'

function assertCategory(value: unknown): asserts value is InvestigationCategory {
  if (typeof value !== 'string' || !(INVESTIGATION_CATEGORIES as readonly string[]).includes(value)) {
    throw new Error('Unsupported investigation category.')
  }
}

function call(name: DiagnosticToolName, args: Record<string, JsonValue>): DiagnosticCall {
  return { name, args }
}

/**
 * Deterministic category routing. Same inputs always produce the same ordered calls;
 * only fixed tools, fixed allow-listed hosts, and bounded numeric parameters are used.
 */
export function routeInvestigation(category: InvestigationCategory, options: RouteOptions = {}): InvestigationRoute {
  assertCategory(category)
  const calls: DiagnosticCall[] = []
  if (category === 'performance') {
    calls.push(
      call('windows_resource_pressure', { durationSeconds: 2, sampleCount: 3 }),
      call('windows_storage', { maxEntries: 25 }),
      call('windows_startup', { maxEntries: 25 }),
    )
  } else if (category === 'network') {
    const hostname = options.hostname && (ALLOWED_HOSTS as readonly string[]).includes(options.hostname)
      ? options.hostname
      : SUPPORTED_HOST
    calls.push(
      call('windows_network', { hostname }),
      call('windows_service', { serviceName: 'Dnscache', hours: 2, maxEvents: 3 }),
    )
  } else if (category === 'updates') {
    calls.push(
      call('windows_update_readiness', { hours: 24, maxEvents: 5 }),
      call('windows_service', { serviceName: 'wuauserv', hours: 2, maxEvents: 3 }),
      call('windows_service', { serviceName: 'BITS', hours: 2, maxEvents: 3 }),
    )
  } else if (options.appFamily !== null) {
    const requested = options.appFamily
    // Unknown or unsupported families probe nothing: never inspect unrelated profiles.
    if (!requested || !(APP_FAMILIES as readonly string[]).includes(requested)) return { category, calls }
    calls.push(call('app_health', { app: requested }))
  }
  for (const entry of calls) {
    if (!TOOL_NAMES.has(entry.name)) throw new Error('Internal routing error: unsupported diagnostic tool.')
  }
  return { category, calls }
}

/** Shares the renderer's deterministic keyword policy; only the local name differs. */
export function classifyInvestigationCategory(symptom: string, appId?: string): InvestigationCategory {
  const category = classifySymptomCategory(symptom, appId)
  return category === 'connectivity' ? 'network' : category
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}'
}

function cacheKey(category: InvestigationCategory, entry: DiagnosticCall): string {
  return category + '|' + entry.name + '|' + canonicalJson(entry.args)
}

interface CacheEntry {
  result: DiagnosticResult
  storedAt: number
}

export interface InvestigationCacheOptions {
  ttlMs?: number
  now?: () => number
  maxEntries?: number
}

export interface InvestigationCache {
  key(category: InvestigationCategory, entry: DiagnosticCall): string
  get(category: InvestigationCategory, entry: DiagnosticCall): DiagnosticResult | undefined
  set(category: InvestigationCategory, entry: DiagnosticCall, result: DiagnosticResult): void
  /** Returns a fresh cached result, joins an in-flight identical call, or runs the loader once. */
  run(category: InvestigationCategory, entry: DiagnosticCall, loader: () => Promise<DiagnosticResult>): Promise<DiagnosticResult>
  clear(): void
  readonly size: number
}

/**
 * Per-investigation dedup/freshness cache. A result is reused only inside its TTL,
 * concurrent identical calls share one loader, and stale entries are discarded.
 */
export function createInvestigationCache(options: InvestigationCacheOptions = {}): InvestigationCache {
  const clock = options.now ?? (() => Date.now())
  const ttlMs = Math.max(0, Math.min(options.ttlMs ?? DEFAULT_INVESTIGATION_CACHE_TTL_MS, 5 * 60_000))
  const maxEntries = Math.max(1, Math.min(options.maxEntries ?? 64, 256))
  const entries = new Map<string, CacheEntry>()
  const inFlight = new Map<string, Promise<DiagnosticResult>>()

  function fresh(entry: CacheEntry): boolean {
    const age = clock() - entry.storedAt
    return age >= 0 && age <= ttlMs
  }

  function get(category: InvestigationCategory, entry: DiagnosticCall): DiagnosticResult | undefined {
    const id = cacheKey(category, entry)
    const cached = entries.get(id)
    if (!cached) return undefined
    if (!fresh(cached)) {
      entries.delete(id)
      return undefined
    }
    return cached.result
  }

  function set(category: InvestigationCategory, entry: DiagnosticCall, result: DiagnosticResult): void {
    const id = cacheKey(category, entry)
    entries.delete(id)
    entries.set(id, { result, storedAt: clock() })
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      entries.delete(oldest)
    }
  }

  return {
    key: cacheKey,
    get,
    set,
    run(category, entry, loader) {
      const cached = get(category, entry)
      if (cached) return Promise.resolve(cached)
      const id = cacheKey(category, entry)
      const pending = inFlight.get(id)
      if (pending) return pending
      const work = loader()
        .then(result => {
          set(category, entry, result)
          return result
        })
        .finally(() => {
          inFlight.delete(id)
        })
      inFlight.set(id, work)
      return work
    },
    clear() {
      entries.clear()
      inFlight.clear()
    },
    get size() {
      return entries.size
    },
  }
}

const TOOL_EVIDENCE: Record<string, { category: string; title: string; area: 'windows' | 'app' }> = {
  windows_network: { category: 'network', title: 'Read-only network observations', area: 'windows' },
  windows_service: { category: 'service', title: 'Read-only service observations', area: 'windows' },
  windows_events: { category: 'events', title: 'Recent Windows error observations', area: 'windows' },
  windows_update_readiness: { category: 'updates', title: 'Read-only Windows Update readiness observations', area: 'windows' },
  windows_resource_pressure: { category: 'performance', title: 'Read-only resource pressure observations', area: 'windows' },
  windows_storage: { category: 'storage', title: 'Read-only volume and cache storage observations', area: 'windows' },
  windows_startup: { category: 'startup', title: 'Read-only startup inventory observations', area: 'windows' },
  app_health: { category: 'app', title: 'Read-only application health observations', area: 'app' },
}

const VALID_STATUS = ['ok', 'partial', 'unavailable', 'error'] as const

function stableId(prefix: string, parts: string[]): string {
  return prefix + createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24)
}

function cleanText(value: unknown, limit = 350): string {
  return minimizeDiagnosticText(typeof value === 'string' ? value : '', limit)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface EvidenceConversionOptions {
  category?: InvestigationCategory
  appId?: string
  maxDetails?: number
}

/**
 * Compact conversion: only sanitized scope/observations/timestamps leave the boundary.
 * The tool payload (`data`) and any unknown fields are never copied into evidence.
 */
export function toDiagnosticEvidence(result: DiagnosticResult, options: EvidenceConversionOptions = {}): DiagnosticEvidence {
  const info = TOOL_EVIDENCE[result?.tool] ?? { category: 'diagnostics', title: 'Read-only diagnostic observations', area: 'windows' as const }
  const status = (VALID_STATUS as readonly string[]).includes(result?.status) ? result.status : 'unavailable'
  const timestamp = typeof result?.timestamp === 'string' && Number.isFinite(Date.parse(result.timestamp))
    ? new Date(result.timestamp).toISOString()
    : 'unknown'
  const scope = cleanText(result?.scope, 180) || result?.tool || 'diagnostic'
  const tool = cleanText(result?.tool, 64) || 'diagnostic'
  const observations = Array.isArray(result?.observations)
    ? result.observations.slice(0, 12).map(line => cleanText(line, 350)).filter(Boolean)
    : []
  const observed = observations[0] || `Diagnostic status: ${status}. No successful observation was returned.`
  const maxDetails = Math.max(1, Math.min(options.maxDetails ?? 4, 8))
  const details = [`Scope: ${scope}`, `Collected: ${timestamp}; status: ${status}.`, ...observations.slice(1, 1 + maxDetails)]
  const context: Record<string, JsonValue> = {
    source: 'local-read-only-tool',
    tool,
    timestamp,
    scope,
    status,
    readOnly: true,
  }
  if (options.category) context.category = options.category
  const appId = typeof options.appId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(options.appId) ? options.appId : undefined
  return {
    id: stableId('diagnostic-', [tool, scope, timestamp]),
    area: info.area,
    category: options.category ?? info.category,
    title: info.title,
    severity: 'info',
    observed,
    details,
    ...(appId ? { appId } : {}),
    context,
    ...(timestamp!=='unknown'?{observedAt:timestamp,expiresAt:new Date(Date.parse(timestamp)+60000).toISOString()}:{}),
  }
}

const OFFLINE_SERVICE_CATEGORIES: Partial<Record<InvestigationCategory, readonly string[]>> = {
  network: ['Dnscache', 'Dhcp', 'NlaSvc', 'W32Time'],
  updates: ['wuauserv', 'BITS', 'Winmgmt', 'W32Time'],
}

export interface ServiceCandidateOptions {
  /** Maximum accepted age of the service observation. Omit to accept any timestamp. */
  maxAgeMs?: number
  nowMs?: number
}

function isFreshResult(result: DiagnosticResult, options: ServiceCandidateOptions = {}): boolean {
  if (options.maxAgeMs === undefined) return true
  const observedAt = Date.parse(result.timestamp)
  const nowMs = options.nowMs ?? Date.now()
  return Number.isFinite(observedAt) && Number.isFinite(nowMs) && nowMs - observedAt <= options.maxAgeMs && observedAt <= nowMs
}

function serviceCandidate(results: DiagnosticResult[], category: InvestigationCategory, options: ServiceCandidateOptions = {}): { serviceName: string; startMode: string } | null {
  const allowed = OFFLINE_SERVICE_CATEGORIES[category]
  if (!allowed) return null
  for (const result of results) {
    if (!result || result.tool !== 'windows_service') continue
    // An unavailable, partial, stale or failed observation is not sufficient authority.
    if (result.status !== 'ok') continue
    if (!isFreshResult(result, options)) continue
    const data = result.data as Record<string, JsonValue> | undefined
    if (!data) continue
    const name = data.serviceName
    if (!isSelectedService(name) || !allowed.includes(name)) continue
    if (typeof data.status !== 'string' || data.status.toLowerCase() !== 'stopped') continue
    const startMode = typeof data.startMode === 'string' ? data.startMode : ''
    // Only automatic services are narrow enough for an offline candidate.
    if (!/^(auto|automatic)$/i.test(startMode)) continue
    // Trigger-start (or manual) services that are stopped are expected, not broken.
    if (data.triggerStart === true) continue
    return { serviceName: name, startMode }
  }
  return null
}

export interface OfflinePlanInput {
  category: InvestigationCategory
  results?: DiagnosticResult[]
  evidence?: DiagnosticEvidence[]
  appId?: string
  now?: () => string
  /** Optional freshness bound for the service observation (for example 120000 ms). */
  maxAgeMs?: number
}

/**
 * Optional offline candidate builder. It supports exactly one known repair shape:
 * starting a fixed, selected, stopped, automatic, non-trigger Windows service
 * observed by a successful read-only probe. Unavailable, partial, stale,
 * trigger-start, or failed probe results are rejected. Plans are never ready
 * and never approved; no command is executed or accepted from input.
 */
export function buildOfflineRepairPlan(input: OfflinePlanInput): RepairPlan | null {
  try {
    assertCategory(input?.category)
  } catch {
    return null
  }
  const results = Array.isArray(input.results) ? input.results : []
  const now = input.now ?? (() => new Date().toISOString())
  const nowMs = Date.parse(now())
  const service = serviceCandidate(results, input.category, { maxAgeMs: input.maxAgeMs, nowMs })
  const safeAppId = typeof input.appId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(input.appId) ? input.appId : undefined
  const proxy = !service && input.category === 'network' && results.some(r => r && r.tool === 'windows_network' && (r.status === 'ok' || r.status === 'partial') && isFreshResult(r, { maxAgeMs: input.maxAgeMs, nowMs }) && (r.data as Record<string, JsonValue> | undefined)?.proxyEnabled === true)
  const appConfig = !service && !proxy && input.category === 'app' && safeAppId
    ? (() => {
        for (const r of results) {
          if (!r || r.tool !== 'app_health' || r.status !== 'ok' || !isFreshResult(r, { maxAgeMs: input.maxAgeMs, nowMs })) continue
          const data = r.data as Record<string, JsonValue> | undefined
          if (!data || data.profileState !== 'single' || data.ambiguous === true || data.profileCount === 0) continue
          if (data.app === 'firefox') return { app: 'firefox' as const, label: 'Firefox', setting: 'network.proxy.type', value: 0 as JsonValue }
          if (data.app === 'obsidian') return { app: 'obsidian' as const, label: 'Obsidian', setting: 'cssTheme', value: '' as JsonValue }
        }
        return null
      })()
    : null
  if (!service && !proxy && !appConfig) return null
  const operation = service ? 'windows.startService' : proxy ? 'windows.clearUserProxy' : 'app.patchConfig'
  const meta = OPERATION_META[operation]
  const step: RepairStep = service
    ? {
        id: stableId('offline-step-', ['windows.startService', service.serviceName]),
        operation: 'windows.startService',
        title: `${meta.description} ${service.serviceName}`,
        targetId: service.serviceName,
        params: { serviceName: service.serviceName },
        requiresAdmin: meta.requiresAdmin,
        reversible: meta.reversible,
        impact: meta.impact,
        verification: meta.verification,
      }
    : proxy
      ? {
          id: stableId('offline-step-', ['windows.clearUserProxy', 'windows']),
          operation: 'windows.clearUserProxy',
          title: meta.description,
          targetId: 'windows',
          params: {},
          requiresAdmin: meta.requiresAdmin,
          reversible: meta.reversible,
          impact: meta.impact,
          verification: meta.verification,
        }
      : {
          id: stableId('offline-step-', ['app.patchConfig', safeAppId!, appConfig!.setting]),
          operation: 'app.patchConfig',
          title: `${meta.description} ${appConfig!.label}`,
          targetId: safeAppId!,
          params: { appId: safeAppId!, setting: appConfig!.setting, value: appConfig!.value },
          requiresAdmin: meta.requiresAdmin,
          reversible: meta.reversible,
          impact: meta.impact,
          verification: meta.verification,
        }
  const planTitle = service
    ? `Offline candidate: start ${service.serviceName}`
    : proxy
      ? 'Offline candidate: clear manual user proxy'
      : `Offline candidate: reset ${appConfig!.label} ${appConfig!.setting}`
  const planSummary = service
    ? `A read-only probe observed ${service.serviceName} stopped with an automatic start mode. This is an unexecuted candidate plan, not proof of a root cause.`
    : proxy
      ? 'A read-only network probe observed an active manual user proxy. This is an unexecuted candidate plan, not proof of a root cause.'
      : `A read-only application probe observed a single ${appConfig!.label} profile location eligible for a backed-up setting reset. This is an unexecuted candidate plan, not proof of a root cause.`
  const planTarget: RepairPlan['target'] = appConfig && safeAppId
    ? { kind: 'app', id: safeAppId, name: appConfig.label }
    : { kind: 'windows', name: 'Windows' }
  const providedEvidence = Array.isArray(input.evidence)
    ? input.evidence.slice(0, 6).map(item => ({ ...item, details: item.details.slice(0, 6) }))
    : []
  const evidence = providedEvidence.length
    ? providedEvidence
    : results.slice(0, 6).map(result => toDiagnosticEvidence(result, { category: input.category, appId: input.appId }))
  return {
    id: stableId('offline-plan-', [input.category, step.operation, canonicalJson(step.params)]),
    createdAt: now(),
    title: planTitle,
    summary: planSummary,
    target: planTarget,
    status: 'needs-validation',
    reason: 'Offline candidate only. A fresh scan and the normal controller validation are required before any repair; nothing was executed.',
    evidence,
    sources: [],
    steps: [step],
    review: {
      approved: false,
      rationale: 'Offline candidates are never pre-approved and never bypass the normal review flow.',
      concerns: [
        'The current service state was not re-read after this plan was built.',
        'Starting a service changes host state and must be reviewed by the user.',
      ],
    },
  }
}

export interface LocalInvestigationTools {
  invoke(name: string, args: unknown): Promise<DiagnosticResult>
}

export interface LocalInvestigationOptions {
  tools: LocalInvestigationTools
  now?: () => string
  cacheTtlMs?: number
  appId?: string
  appFamily?: AppFamily | null
}

export interface LocalInvestigationInput {
  category: InvestigationCategory
  symptom?: string
  appId?: string
  appFamily?: AppFamily | null
}

export interface LocalInvestigationResult {
  category: InvestigationCategory
  route: InvestigationRoute
  results: DiagnosticResult[]
  evidence: DiagnosticEvidence[]
  unavailable: string[]
  cacheHits: number
  plan: RepairPlan | null
}

/**
 * Bounded orchestration over the fixed routes. Each instance owns its own cache,
 * so dedup/freshness is scoped to one investigation.
 */
export function createLocalInvestigation(options: LocalInvestigationOptions): {
  cache: InvestigationCache
  investigate(input: LocalInvestigationInput): Promise<LocalInvestigationResult>
} {
  const clock = options.now ?? (() => new Date().toISOString())
  const cache = createInvestigationCache({
    ttlMs: options.cacheTtlMs,
    now: () => {
      const parsed = Date.parse(clock())
      return Number.isFinite(parsed) ? parsed : Date.now()
    },
  })

  return {
    cache,
    async investigate(input: LocalInvestigationInput): Promise<LocalInvestigationResult> {
      assertCategory(input?.category)
      const appFamily = input.appFamily === null ? null : input.appFamily !== undefined ? input.appFamily : options.appFamily
      const route = routeInvestigation(input.category, { appFamily })
      const results: DiagnosticResult[] = []
      const evidence: DiagnosticEvidence[] = []
      const unavailable: string[] = []
      let cacheHits = 0
      const appId = input.appId ?? options.appId
      for (const entry of route.calls) {
        if (cache.get(input.category, entry)) cacheHits++
        let result: DiagnosticResult
        try {
          result = await cache.run(input.category, entry, () => options.tools.invoke(entry.name, entry.args))
        } catch (error) {
          result = {
            tool: entry.name,
            timestamp: clock(),
            scope: entry.name,
            status: 'unavailable',
            observations: ['Local diagnostic unavailable: ' + cleanText((error as Error)?.message ?? error, 200)],
            data: {},
          }
        }
        results.push(result)
        if (result.status === 'unavailable') unavailable.push(entry.name)
        evidence.push(toDiagnosticEvidence(result, { category: input.category, appId }))
      }
      return {
        category: input.category,
        route,
        results,
        evidence,
        unavailable,
        cacheHits,
        plan: buildOfflineRepairPlan({ category: input.category, results, evidence, appId, now: clock, maxAgeMs: OFFLINE_OBSERVATION_MAX_AGE_MS }),
      }
    },
  }
}
