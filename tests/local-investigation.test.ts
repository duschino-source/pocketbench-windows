import { describe, expect, it } from 'vitest'
import {
  ALL_DIAGNOSTIC_TOOL_DEFINITIONS,
  type DiagnosticResult,
} from '../src/main/diagnostics'
import {
  buildOfflineRepairPlan,
  classifyInvestigationCategory,
  createInvestigationCache,
  createLocalInvestigation,
  routeInvestigation,
  toDiagnosticEvidence,
  type DiagnosticCall,
} from '../src/main/local-investigation'

const toolNames = new Set(ALL_DIAGNOSTIC_TOOL_DEFINITIONS.map(definition => definition.name))

function result(overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    tool: 'windows_service',
    timestamp: '2026-01-01T00:00:00.000Z',
    scope: 'service:Dnscache',
    status: 'ok',
    observations: ['Observed.'],
    data: {},
    ...overrides,
  }
}

describe('deterministic investigation routing', () => {
  it('routes each category to fixed, allow-listed tools and bounded arguments', () => {
    for (const category of ['performance', 'network', 'updates'] as const) {
      const first = routeInvestigation(category)
      const second = routeInvestigation(category)
      expect(first).toEqual(second)
      expect(first.category).toBe(category)
      expect(first.calls.length).toBeGreaterThan(0)
      for (const entry of first.calls) {
        expect(toolNames.has(entry.name), entry.name).toBe(true)
        expect(entry.args).not.toHaveProperty('path')
        expect(entry.args).not.toHaveProperty('command')
      }
    }
    const network = routeInvestigation('network')
    expect(network.calls[0]).toEqual({ name: 'windows_network', args: { hostname: 'www.microsoft.com' } })
    expect(network.calls.map(entry => entry.name)).toEqual(['windows_network', 'windows_service'])
    const updates = routeInvestigation('updates')
    expect(updates.calls[0].name).toBe('windows_update_readiness')
    expect(updates.calls.map(entry => entry.args.serviceName).filter(Boolean)).toEqual(['wuauserv', 'BITS'])
    const performance = routeInvestigation('performance')
    expect(performance.calls.map(entry => entry.name)).toEqual([
      'windows_resource_pressure',
      'windows_storage',
      'windows_startup',
    ])
    expect(performance.calls[1].args).toEqual({ maxEntries: 25 })
  })

  it('inspects one known app family, and probes nothing when unknown', () => {
    const firefox = routeInvestigation('app', { appFamily: 'firefox' })
    expect(firefox.calls).toEqual([{ name: 'app_health', args: { app: 'firefox' } }])
    const unknown = routeInvestigation('app')
    expect(unknown.calls).toEqual([])
    expect(routeInvestigation('app', { appFamily: null }).calls).toEqual([])
    expect(routeInvestigation('app', { appFamily: undefined }).calls).toEqual([])
  })

  it('rejects unsupported categories and classifies symptoms deterministically', () => {
    expect(() => routeInvestigation('security' as never)).toThrow(/Unsupported investigation category/)
    expect(classifyInvestigationCategory('Firefox is slow and uses memory')).toBe('performance')
    expect(classifyInvestigationCategory('DNS and proxy connection fails')).toBe('network')
    expect(classifyInvestigationCategory('Windows update needs a restart')).toBe('updates')
    expect(classifyInvestigationCategory('Nothing works')).toBe('network')
    expect(classifyInvestigationCategory('Nothing works', 'app-123')).toBe('app')
  })
})

describe('per-investigation dedup and freshness cache', () => {
  it('dedups repeated and concurrent identical calls, and expires stale results', async () => {
    let now = 1_000
    let loads = 0
    const cache = createInvestigationCache({ ttlMs: 100, now: () => now })
    const entry: DiagnosticCall = { name: 'windows_events', args: { channel: 'system', hours: 1, maxEvents: 1 } }
    const loader = async () => {
      loads++
      return result({ tool: 'windows_events', observations: ['load ' + loads] })
    }
    const first = await cache.run('performance', entry, loader)
    const second = await cache.run('performance', entry, loader)
    expect(loads).toBe(1)
    expect(second).toBe(first)
    now = 1_101
    const third = await cache.run('performance', entry, loader)
    expect(loads).toBe(2)
    expect(third).not.toBe(first)
  })

  it('shares one in-flight loader across concurrent callers', async () => {
    let loads = 0
    const cache = createInvestigationCache()
    const entry: DiagnosticCall = { name: 'windows_startup', args: { maxEntries: 5 } }
    let release: (value: DiagnosticResult) => void = () => {}
    const loader = () => {
      loads++
      return new Promise<DiagnosticResult>(resolve => {
        release = resolve
      })
    }
    const first = cache.run('app', entry, loader)
    const second = cache.run('app', entry, loader)
    release(result({ tool: 'windows_startup' }))
    await Promise.all([first, second])
    expect(loads).toBe(1)
    expect(cache.size).toBe(1)
  })

  it('keys on both category and exact arguments', async () => {
    const cache = createInvestigationCache()
    let loads = 0
    const loader = async () => {
      loads++
      return result()
    }
    await cache.run('network', { name: 'windows_service', args: { serviceName: 'Dnscache', hours: 1, maxEvents: 1 } }, loader)
    await cache.run('updates', { name: 'windows_service', args: { serviceName: 'Dnscache', hours: 1, maxEvents: 1 } }, loader)
    await cache.run('network', { name: 'windows_service', args: { serviceName: 'Dnscache', hours: 2, maxEvents: 1 } }, loader)
    expect(loads).toBe(3)
    expect(cache.get('network', { name: 'windows_service', args: { serviceName: 'Dnscache', hours: 1, maxEvents: 1 } })).toBeDefined()
  })
})

describe('compact evidence conversion', () => {
  it('never exports the raw workflow payload, identifiers, or path and host details', () => {
    const source = result({
      tool: 'windows_resource_pressure',
      scope: 'performance:C:\\Users\\alice\\secret',
      observations: [
        'CPU 41% while C:\\Users\\alice\\app.exe ran',
        'Contact alice@example.com from 10.1.2.3 and 2001:db8::1',
        'Bearer abc.def.ghi',
        'extra one',
        'extra two',
        'extra three',
        'extra four',
        'extra five',
      ],
      data: { rawWorkflow: 'must-not-leave', secret: 'never transmit', path: 'C:\\Users\\alice' },
    })
    const first = toDiagnosticEvidence(source, { category: 'performance' })
    const second = toDiagnosticEvidence(source, { category: 'performance' })
    expect(first.id).toBe(second.id)
    expect(first).toMatchObject({ area: 'windows', category: 'performance', severity: 'info', context: { source: 'local-read-only-tool', readOnly: true, status: 'ok' } })
    expect(first.details.length).toBeLessThanOrEqual(6)
    expect(first.observed.length).toBeLessThanOrEqual(350)
    const text = JSON.stringify(first)
    for (const secret of ['alice', 'alice@example.com', '10.1.2.3', '2001:db8::1', 'abc.def.ghi', 'rawWorkflow', 'must-not-leave', 'never transmit', 'app.exe']) {
      expect(text).not.toContain(secret)
    }
    expect(first.suggestedOperation).toBeUndefined()
    expect((first.context as Record<string, unknown>).data).toBeUndefined()
  })

  it('uses the app area only for app health and accepts only safe app ids', () => {
    const evidence = toDiagnosticEvidence(result({
      tool: 'app_health',
      scope: 'app:firefox',
      observations: ['Firefox is running.'],
    }), { category: 'app', appId: 'app-abc123' })
    expect(evidence.area).toBe('app')
    expect(evidence.appId).toBe('app-abc123')
    const unsafe = toDiagnosticEvidence(result({ tool: 'app_health' }), { category: 'app', appId: 'C:\\Users\\alice' })
    expect(unsafe.appId).toBeUndefined()
  })
})

describe('narrow offline repair candidate', () => {
  const stoppedDnscache = result({
    data: { serviceName: 'Dnscache', status: 'Stopped', startMode: 'Auto' },
    observations: ['Service Dnscache status: Stopped (start mode Auto).'],
  })

  it('builds one deterministic, unapproved, needs-validation startService step from sufficient evidence', () => {
    const first = buildOfflineRepairPlan({ category: 'network', results: [stoppedDnscache], now: () => '2026-01-01T00:00:00.000Z' })
    expect(first).not.toBeNull()
    expect(first!.status).toBe('needs-validation')
    expect(first!.review.approved).toBe(false)
    expect(first!.steps).toHaveLength(1)
    expect(first!.steps[0]).toMatchObject({
      operation: 'windows.startService',
      targetId: 'Dnscache',
      params: { serviceName: 'Dnscache' },
      requiresAdmin: true,
      reversible: false,
    })
    expect(JSON.stringify(first)).not.toMatch(/Start-Service|sc\.exe|powershell|cmd\.exe/i)
    const second = buildOfflineRepairPlan({ category: 'network', results: [stoppedDnscache], now: () => '2026-01-02T00:00:00.000Z' })
    expect(second!.id).toBe(first!.id)
    expect(second!.steps[0].id).toBe(first!.steps[0].id)
  })

  it('rejects trigger-start and stale or failed services while keeping fresh stopped automatic candidates', () => {
    const freshTrigger = result({
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { serviceName: 'Dnscache', status: 'Stopped', startMode: 'Auto', triggerStart: true },
    })
    const stale = result({
      timestamp: '2025-01-01T00:00:00.000Z',
      data: { serviceName: 'Dnscache', status: 'Stopped', startMode: 'Auto', triggerStart: false },
    })
    expect(buildOfflineRepairPlan({ category: 'network', results: [freshTrigger] })).toBeNull()
    expect(buildOfflineRepairPlan({ category: 'network', results: [stale], maxAgeMs: 120_000, now: () => '2026-01-01T00:00:00.000Z' })).toBeNull()
    expect(buildOfflineRepairPlan({
      category: 'network',
      results: [result({ status: 'unavailable', data: { serviceName: 'Dnscache', status: 'Stopped', startMode: 'Auto' } })],
    })).toBeNull()
    expect(buildOfflineRepairPlan({
      category: 'network',
      results: [result({ status: 'partial', data: { serviceName: 'Dnscache', status: 'Stopped', startMode: 'Auto' } })],
    })).toBeNull()
    const fresh = result({
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { serviceName: 'Dnscache', status: 'Stopped', startMode: 'Auto', triggerStart: false },
    })
    expect(buildOfflineRepairPlan({ category: 'network', results: [fresh], maxAgeMs: 120_000, now: () => '2026-01-01T00:00:00.000Z' })).not.toBeNull()
  })

  it('supports updates only for a fixed update service and prefers no plan when evidence is insufficient', () => {
    const wuauserv = result({ data: { serviceName: 'wuauserv', status: 'Stopped', startMode: 'Automatic' } })
    expect(buildOfflineRepairPlan({ category: 'updates', results: [wuauserv] })).not.toBeNull()
    expect(buildOfflineRepairPlan({ category: 'app', results: [wuauserv] })).toBeNull()
    expect(buildOfflineRepairPlan({ category: 'performance', results: [stoppedDnscache] })).toBeNull()
    expect(buildOfflineRepairPlan({ category: 'network', results: [] })).toBeNull()
    expect(buildOfflineRepairPlan({ category: 'network', results: [result()] })).toBeNull()
    expect(buildOfflineRepairPlan({ category: 'network', results: [result({ data: { serviceName: 'Dnscache', status: 'Running', startMode: 'Auto' } })] })).toBeNull()
    expect(buildOfflineRepairPlan({ category: 'network', results: [result({ data: { serviceName: 'Dnscache', status: 'Stopped', startMode: 'Disabled' } })] })).toBeNull()
    expect(buildOfflineRepairPlan({ category: 'network', results: [result({ data: { serviceName: 'Dnscache', status: 'Stopped' } })] })).toBeNull()
    expect(buildOfflineRepairPlan({ category: 'network', results: [result({ data: { serviceName: 'Spooler', status: 'Stopped', startMode: 'Auto' } })] })).toBeNull()
    expect(buildOfflineRepairPlan({ category: 'bogus' as never, results: [stoppedDnscache] })).toBeNull()
  })

  it('builds reversible clearUserProxy and app.patchConfig offline candidates from fresh unambiguous probes', () => {
    const proxyProbe = result({
      tool: 'windows_network',
      scope: 'network:www.microsoft.com',
      status: 'partial',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { hostname: 'www.microsoft.com', proxyEnabled: true },
    })
    const proxyPlan = buildOfflineRepairPlan({
      category: 'network',
      results: [proxyProbe],
      maxAgeMs: 120_000,
      now: () => '2026-01-01T00:00:30.000Z',
    })
    expect(proxyPlan).not.toBeNull()
    expect(proxyPlan!.status).toBe('needs-validation')
    expect(proxyPlan!.review.approved).toBe(false)
    expect(proxyPlan!.steps[0]).toMatchObject({
      operation: 'windows.clearUserProxy',
      targetId: 'windows',
      params: {},
      reversible: true,
    })
    // Stopped automatic service takes priority over proxy when both are observed.
    const prioritized = buildOfflineRepairPlan({
      category: 'network',
      results: [proxyProbe, stoppedDnscache],
    })
    expect(prioritized!.steps[0].operation).toBe('windows.startService')
    // Disabled or unavailable proxy probes produce no plan.
    expect(buildOfflineRepairPlan({
      category: 'network',
      results: [result({ ...proxyProbe, data: { hostname: 'www.microsoft.com', proxyEnabled: false } })],
    })).toBeNull()
    expect(buildOfflineRepairPlan({
      category: 'network',
      results: [result({ ...proxyProbe, status: 'unavailable' })],
    })).toBeNull()

    const firefoxProbe = result({
      tool: 'app_health',
      scope: 'app:firefox',
      status: 'ok',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { app: 'firefox', profileState: 'single', profileCount: 1, running: false },
    })
    const firefoxPlan = buildOfflineRepairPlan({
      category: 'app',
      appId: 'app-firefox',
      results: [firefoxProbe],
      maxAgeMs: 120_000,
      now: () => '2026-01-01T00:00:30.000Z',
    })
    expect(firefoxPlan).not.toBeNull()
    expect(firefoxPlan!.target).toEqual({ kind: 'app', id: 'app-firefox', name: 'Firefox' })
    expect(firefoxPlan!.steps[0]).toMatchObject({
      operation: 'app.patchConfig',
      targetId: 'app-firefox',
      params: { appId: 'app-firefox', setting: 'network.proxy.type', value: 0 },
      reversible: true,
    })

    const obsidianProbe = result({
      tool: 'app_health',
      scope: 'app:obsidian',
      status: 'ok',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { app: 'obsidian', profileState: 'single', profileCount: 1, running: false },
    })
    const obsidianPlan = buildOfflineRepairPlan({
      category: 'app',
      appId: 'app-obsidian',
      results: [obsidianProbe],
    })
    expect(obsidianPlan).not.toBeNull()
    expect(obsidianPlan!.steps[0]).toMatchObject({
      operation: 'app.patchConfig',
      targetId: 'app-obsidian',
      params: { appId: 'app-obsidian', setting: 'cssTheme', value: '' },
    })

    // Ambiguous profiles, missing appId, zero profiles, or Steam produce no app.patchConfig candidate.
    expect(buildOfflineRepairPlan({ category: 'app', results: [firefoxProbe] })).toBeNull()
    expect(buildOfflineRepairPlan({
      category: 'app',
      appId: 'app-firefox',
      results: [result({ ...firefoxProbe, data: { app: 'firefox', profileState: 'multiple', profileCount: 2 } })],
    })).toBeNull()
    expect(buildOfflineRepairPlan({
      category: 'app',
      appId: 'app-firefox',
      results: [result({ ...firefoxProbe, data: { app: 'firefox', profileState: 'single', profileCount: 0 } })],
    })).toBeNull()
    expect(buildOfflineRepairPlan({
      category: 'app',
      appId: 'app-steam',
      results: [result({ ...firefoxProbe, data: { app: 'steam', profileState: 'single', profileCount: 1 } })],
    })).toBeNull()
  })
})

describe('local investigation tool scope', () => {
  it('invokes only routed tools, reuses its per-investigation cache, and reports unavailable probes', async () => {
    const invoked: Array<{ name: string; args: unknown }> = []
    const tools = {
      invoke: async (name: string, args: unknown) => {
        invoked.push({ name, args })
        return result({ tool: name, scope: name })
      },
    }
    const investigation = createLocalInvestigation({ tools, now: () => '2026-01-01T00:00:00.000Z', appFamily: 'firefox' })
    const first = await investigation.investigate({ category: 'app', appId: 'app-abc123' })
    expect(first.route.calls.map(entry => entry.name)).toEqual(['app_health'])
    expect(invoked.map(entry => entry.name)).toEqual(['app_health'])
    expect(first.evidence).toHaveLength(1)
    expect(first.evidence.every(item => item.appId === 'app-abc123')).toBe(true)
    const second = await investigation.investigate({ category: 'app', appId: 'app-abc123', appFamily: 'firefox' })
    expect(invoked).toHaveLength(1)
    expect(second.cacheHits).toBe(1)

    const unknown = await investigation.investigate({ category: 'app', appId: 'app-abc123', appFamily: null })
    expect(unknown.route.calls).toEqual([])
    expect(unknown.evidence).toEqual([])
    expect(unknown.plan).toBeNull()

    const unavailable = await createLocalInvestigation({
      tools: { invoke: async name => result({ tool: name, scope: name, status: 'unavailable', observations: ['Access denied'] }) },
    }).investigate({ category: 'network' })
    expect(unavailable.unavailable).toEqual(['windows_network', 'windows_service'])
    expect(unavailable.plan).toBeNull()

    await expect(investigation.investigate({ category: 'security' as never })).rejects.toThrow(/Unsupported investigation category/)
  })

  it('reports fixed-fixture actual call counts per category without probing on unknown apps', async () => {
    const invoked: string[] = []
    const fixed = createLocalInvestigation({
      tools: { invoke: async name => { invoked.push(name); return result({ tool: name, scope: name }) } },
      now: () => '2026-01-01T00:00:00.000Z',
    })
    const baseline: Record<string, number> = { performance: 3, network: 2, updates: 3 }
    for (const [category, expected] of Object.entries(baseline)) {
      invoked.length = 0
      const outcome = await fixed.investigate({ category: category as 'performance', appFamily: 'firefox' })
      expect(outcome.route.calls).toHaveLength(expected)
      expect(invoked).toHaveLength(expected)
      expect(outcome.evidence).toHaveLength(expected)
    }
    invoked.length = 0
    const unknownApp = await fixed.investigate({ category: 'app' })
    expect(unknownApp.route.calls).toEqual([])
    expect(invoked).toEqual([])
    expect(unknownApp.plan).toBeNull()
  })
})
