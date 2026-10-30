import { describe, expect, it } from 'vitest'
import { createDiagnosticTools } from '../src/main/diagnostics'

// Explicit opt-in: only read-only packaged probes and one fixed public HTTPS target.
describe.skipIf(process.platform !== 'win32' || process.env.POCKETBENCH_NATIVE_DIAGNOSTICS !== '1')('read-only Windows diagnostic smoke', () => {
  it('reads native state, a selected service and both fixed event channels', async () => {
    const tools = createDiagnosticTools()
    const requests: [string, Record<string, unknown>][] = [
      ['windows_network', { hostname: 'www.microsoft.com' }],
      ['windows_service', { serviceName: 'BITS', hours: 1, maxEvents: 1 }],
      ['windows_events', { channel: 'system', hours: 1, maxEvents: 1 }],
      ['windows_events', { channel: 'windows-update', hours: 1, maxEvents: 1 }],
    ]
    for (const [name, args] of requests) {
      const result = await tools.invoke(name, args)
      expect(result.status, result.observations.join(' ')).not.toBe('error')
      expect(Number.isFinite(Date.parse(result.timestamp))).toBe(true)
      expect(result.observations.length).toBeGreaterThan(0)
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(12000)
      process.stdout.write(JSON.stringify({ tool: result.tool, scope: result.scope, status: result.status, eventCount: result.data.eventCount, dnsStatus: result.data.dnsStatus, httpStatus: result.data.httpStatus, nativeServiceStatus: result.data.status, startMode: result.data.startMode }) + '\n')
    }
  }, 60000)
})
