import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ALL_DIAGNOSTIC_TOOL_DEFINITIONS,
  APP_FAMILIES,
  EXTENDED_DIAGNOSTIC_TOOL_DEFINITIONS,
  STORAGE_CACHE_ROOT_IDS,
  createDiagnosticTools,
  type DiagnosticResult,
  type NativeOperation,
} from '../src/main/diagnostics'

const clock = () => '2026-01-01T00:00:00.000Z'

function api(nativeRunner: (operation: NativeOperation, args: Record<string, string>) => Promise<unknown>) {
  return createDiagnosticTools({ now: clock, nativeRunner })
}

describe('extended diagnostic schemas', () => {
  it('keeps the legacy export intact and adds five closed strict definitions', () => {
    expect(EXTENDED_DIAGNOSTIC_TOOL_DEFINITIONS.map(definition => definition.name)).toEqual([
      'windows_update_readiness',
      'windows_resource_pressure',
      'windows_storage',
      'windows_startup',
      'app_health',
    ])
    expect(ALL_DIAGNOSTIC_TOOL_DEFINITIONS).toHaveLength(8)
    for (const definition of EXTENDED_DIAGNOSTIC_TOOL_DEFINITIONS) {
      expect(definition.type).toBe('function')
      expect(definition.strict).toBe(true)
      expect(definition.parameters.type).toBe('object')
      expect(definition.parameters.additionalProperties).toBe(false)
      expect(definition.parameters.required.length).toBeGreaterThan(0)
    }
    const storage = EXTENDED_DIAGNOSTIC_TOOL_DEFINITIONS.find(definition => definition.name === 'windows_storage')!
    expect(storage.parameters.required).toEqual(['maxEntries'])
    expect(Object.keys(storage.parameters.properties)).toEqual(['maxEntries'])
    const app = EXTENDED_DIAGNOSTIC_TOOL_DEFINITIONS.find(definition => definition.name === 'app_health')!
    expect(app.parameters.properties.app).toMatchObject({ enum: [...APP_FAMILIES] })
  })

  it('rejects malformed, out-of-range, path, and unknown arguments before any native probe', async () => {
    const seen: string[] = []
    const tools = api(async operation => {
      seen.push(operation)
      return {}
    })
    const rejects: [string, unknown][] = [
      ['windows_update_readiness', { hours: 0, maxEvents: 1 }],
      ['windows_update_readiness', { hours: 1, maxEvents: 9 }],
      ['windows_update_readiness', { hours: 1, maxEvents: 1, extra: true }],
      ['windows_resource_pressure', { durationSeconds: 6, sampleCount: 2 }],
      ['windows_resource_pressure', { durationSeconds: 1, sampleCount: 1 }],
      ['windows_storage', { maxEntries: 51 }],
      ['windows_storage', { maxEntries: 10, path: 'C:\\Windows' }],
      ['windows_storage', { maxEntries: 10, root: 'C:\\' }],
      ['windows_storage', { maxEntries: 10, glob: '**/*' }],
      ['windows_startup', { maxEntries: 0 }],
      ['windows_startup', null],
      ['app_health', { app: 'chrome' }],
      ['app_health', { app: 'firefox', profilePath: 'C:\\Users\\alice' }],
    ]
    for (const [name, args] of rejects) {
      await expect(tools.invoke(name, args), name).rejects.toThrow()
    }
    expect(seen).toEqual([])
  })
})

describe('extended read-only diagnostic normalization', () => {
  it('reports restart flags, fixed servicing services, and sanitized update errors', async () => {
    const tools = api(async operation => {
      expect(operation).toBe('updateReadiness')
      return {
        status: 'ok',
        restartFlags: { cbs: true, windowsUpdate: false, pendingFileRename: '0' },
        services: [
          { name: 'wuauserv', status: 'Stopped', startMode: 'Manual' },
          { name: 'BITS', status: 'Running', startMode: 'Auto' },
          { name: 'Spooler', status: 'Running', startMode: 'Auto' },
        ],
        events: [{ id: 20, timeCreated: '2026-01-01T00:00:00Z', message: 'Failed at C:\\Users\\alice\\secret.txt alice@example.com 10.1.2.3' }],
        notes: ['C:\\Users\\alice\\note'],
        dropped: 'never return this',
      }
    })
    const result = await tools.invoke('windows_update_readiness', { hours: 4, maxEvents: 1 })
    expect(result.tool).toBe('windows_update_readiness')
    expect(result.status).toBe('ok')
    expect(result.scope).toBe('updates:readiness')
    expect(result.data.restartFlags).toMatchObject({ cbs: true, windowsUpdate: false, pendingFileRename: false, pending: true })
    const services = result.data.services as Array<{ name: string }>
    expect(services.map(service => service.name)).toEqual(['wuauserv', 'BITS'])
    const text = JSON.stringify(result)
    for (const secret of ['alice', 'alice@example.com', '10.1.2.3', 'secret.txt', 'note', 'dropped', 'Spooler']) expect(text).not.toContain(secret)
    expect(result.observations.join(' ')).toContain('pending-restart')
    expect(result.observations.join(' ')).toContain('Event 20')
  })

  it('samples bounded CPU/memory and drops unsafe process names without suggesting a kill', async () => {
    const tools = api(async operation => {
      expect(operation).toBe('resourcePressure')
      return {
        cpuPercent: 41.5,
        memoryTotalBytes: 8 * 1024 ** 3,
        memoryAvailableBytes: 2 * 1024 ** 3,
        samples: [30, 40, 55, 99, 99],
        topCpu: [
          { name: 'firefox', cpuSeconds: 1.25 },
          { name: 'C:\\Users\\alice\\secret.exe', cpuSeconds: 9 },
          { name: 'C:\\Users\\alice\\secret.exe', cpuSeconds: 8 },
        ],
        topMemory: [{ name: 'obsidian', workingSetBytes: 512 * 1024 ** 2 }, { name: '../evil', workingSetBytes: 1 }],
        killCommand: 'Stop-Process -Id 1',
      }
    })
    const result = await tools.invoke('windows_resource_pressure', { durationSeconds: 2, sampleCount: 3 })
    expect(result.status).toBe('ok')
    expect(result.data.cpuPercent).toBe(41.5)
    expect((result.data.topCpu as Array<{ name: string }>).map(row => row.name)).toEqual(['firefox'])
    expect((result.data.topMemory as Array<{ name: string }>).map(row => row.name)).toEqual(['obsidian'])
    expect((result.data.samples as number[]).length).toBe(3)
    const text = JSON.stringify(result)
    expect(text).not.toContain('alice')
    expect(text).not.toContain('Stop-Process')
    expect(text).not.toContain('killCommand')
    expect(result.observations.join(' ')).toContain('no process was stopped')
  })

  it('returns only allow-listed cache-root identities and never echoes a path', async () => {
    const tools = api(async operation => {
      expect(operation).toBe('storage')
      return {
        volumes: [
          { drive: 'C:', totalBytes: 100 * 1024 ** 3, freeBytes: 5 * 1024 ** 3 },
          { drive: 'C:\\Users\\alice', totalBytes: 1, freeBytes: 1 },
          { drive: 'D:', totalBytes: 10, freeBytes: 11 },
        ],
        cacheRoots: [
          { id: STORAGE_CACHE_ROOT_IDS[0], present: true, sizeBytes: 2048, fileCount: 2, skippedReparsePoints: 1, path: 'C:\\Users\\alice\\cache2' },
          { id: 'arbitrary-root', present: true, sizeBytes: 999, path: 'C:\\Windows' },
          { id: STORAGE_CACHE_ROOT_IDS[7], present: false },
        ],
        notes: ['Read C:\\Users\\alice\\AppData'],
      }
    })
    const result = await tools.invoke('windows_storage', { maxEntries: 10 })
    expect(result.status).toBe('ok')
    const volumes = result.data.volumes as Array<{ drive: string }>
    expect(volumes.map(volume => volume.drive)).toEqual(['C:'])
    const roots = result.data.cacheRoots as Array<{ id: string }>
    expect(roots.map(root => root.id)).toEqual([STORAGE_CACHE_ROOT_IDS[0], STORAGE_CACHE_ROOT_IDS[7]])
    const text = JSON.stringify(result)
    for (const forbidden of ['C:\\Users', 'alice', 'arbitrary-root', 'C:\\Windows', 'AppData', 'path"']) expect(text).not.toContain(forbidden)
    expect(result.observations.join(' ')).toContain('no arbitrary path')
    expect(result.data.skippedReparsePoints).toBe(1)
  })

  it('lists startup names, publishers, and protection without returning raw commands', async () => {
    const tools = api(async operation => {
      expect(operation).toBe('startup')
      return {
        entries: [
          { name: 'Updater', publisher: 'Contoso alice@example.com', location: 'HKCU Run', enabled: true, protected: false, command: 'powershell -enc SECRET-TOKEN' },
          { name: 'Windows Defender', location: 'HKLM Run', enabled: true, command: 'C:\\Program Files\\Defender\\msmpeng.exe' },
          { name: 'Bad location', location: 'C:\\Users\\alice', command: 'secret' },
        ],
      }
    })
    const result = await tools.invoke('windows_startup', { maxEntries: 5 })
    expect(result.status).toBe('ok')
    const entries = result.data.entries as Array<{ name: string; protected: boolean; publisher?: string }>
    expect(entries.map(entry => entry.name)).toEqual(['Updater', 'Windows Defender'])
    expect(entries[0].publisher).not.toContain('alice@example.com')
    expect(entries[1].protected).toBe(true)
    expect(result.data.protectedCount).toBe(1)
    const text = JSON.stringify(result)
    for (const secret of ['SECRET-TOKEN', 'powershell -enc', 'msmpeng.exe', 'alice', 'C:\\Users']) expect(text).not.toContain(secret)
    expect(result.observations.join(' ')).toContain('no startup entry was enabled, disabled, or changed')
  })

  it('reports running state and profile ambiguity without exposing content', async () => {
    const tools = api(async operation => {
      expect(operation).toBe('appHealth')
      return {
        running: true,
        processCount: 3,
        profileCount: 2,
        profileState: 'multiple',
        cookies: 'session-cookie-value',
        notes: 'private note content',
        profilePath: 'C:\\Users\\alice\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles\\x.default',
        logs: ['raw log line'],
      }
    })
    const result = await tools.invoke('app_health', { app: 'firefox' })
    expect(result.status).toBe('ok')
    expect(result.data).toEqual({ app: 'firefox', profileState: 'multiple', running: true, processCount: 3, profileCount: 2 })
    const text = JSON.stringify(result)
    for (const secret of ['session-cookie-value', 'private note content', 'alice', 'Profiles', 'raw log line', 'profilePath', 'logs']) expect(text).not.toContain(secret)
    expect(result.observations.join(' ')).toContain('cannot determine which profile is active')
    expect(result.observations.join(' ')).toContain('No notes, cookies, profile file contents, or log contents were read')
  })

  it('maps access denied and hangs to explicit unavailable results', async () => {
    const denied = await api(async () => {
      throw new Error('Access is denied (0x80070005)')
    }).invoke('windows_storage', { maxEntries: 5 })
    expect(denied.status).toBe('unavailable')
    expect(denied.observations[0]).toContain('Storage data unavailable')

    const hanging = createDiagnosticTools({
      now: clock,
      timeoutMs: 20,
      nativeRunner: async () => new Promise(() => {}),
    })
    const result = await hanging.invoke('windows_resource_pressure', { durationSeconds: 1, sampleCount: 2 })
    expect(['unavailable', 'error']).toContain(result.status)
    expect(result.observations.length).toBeGreaterThan(0)
  })

  it('keeps hostile extended output bounded', async () => {
    const hostile = 'C:\\Users\\alice\\secret alice@example.com 10.0.0.5 Bearer abc.def.ghi ' + 'x'.repeat(800)
    const tools = api(async operation => {
      if (operation === 'startup') {
        return { entries: Array.from({ length: 300 }, (_, index) => ({ name: 'Entry' + index + ' ' + hostile, publisher: hostile, location: 'HKCU Run', command: hostile })) }
      }
      return { volumes: Array.from({ length: 40 }, (_, index) => ({ drive: 'C:', totalBytes: 1, freeBytes: 0, path: hostile })) }
    })
    const startup = await tools.invoke('windows_startup', { maxEntries: 50 })
    const storage = await tools.invoke('windows_storage', { maxEntries: 50 })
    expect(JSON.stringify(startup).length).toBeLessThanOrEqual(12000)
    expect(JSON.stringify(storage).length).toBeLessThanOrEqual(12000)
    expect(JSON.stringify(startup)).not.toContain('alice')
    expect(JSON.stringify(startup)).not.toContain('abc.def.ghi')
  })
})

describe('extended native script contract', () => {
  it('declares the fixed checks and stays read-only, bounded, and path-free', () => {
    const text = readFileSync(join(process.cwd(), 'resources', 'windows', 'diagnostics.ps1'), 'utf8')
    expect(text).toMatch(/ValidateSet\('updateReadiness','resourcePressure','storage','startup','appHealth'\)/)
    expect(text).toMatch(/ValidateRange\(1,5\)\]\[int\]\$DurationSeconds/)
    expect(text).toMatch(/ValidateRange\(2,5\)\]\[int\]\$SampleCount/)
    expect(text).toMatch(/ValidateRange\(1,50\)\]\[int\]\$MaxEntries/)
    expect(text).toMatch(/ReparsePoint/)
    expect(text).toMatch(/Mozilla\\Firefox\\Profiles/)
    expect(text).toMatch(/obsidian/)
    expect(text).toMatch(/Steam/)
    expect(text).toMatch(/Win32_LogicalDisk/)
    expect(text).not.toMatch(/Invoke-Expression|Stop-Service|Start-Service|Set-Service|Restart-Service|Remove-Item|Stop-Process|-EncodedCommand|Invoke-WebRequest|Invoke-RestMethod|Start-Process|New-Service/)
    expect(text).not.toMatch(/logins\.json|prefs\.js|Local State/i)
    // A storage traversal never accepts a caller path parameter.
    expect(text).not.toMatch(/\$Path\s*=\s*\$args|\[string\]\$StoragePath/)
  })

  it('keeps the original legacy operation list and service allow-list available', () => {
    const text = readFileSync(join(process.cwd(), 'resources', 'windows', 'diagnostics.ps1'), 'utf8')
    expect(text).toMatch(/ValidateSet\('networkState','service','events'\)/)
    expect(text).toMatch(/Dnscache.*Dhcp.*NlaSvc.*W32Time.*BITS.*wuauserv.*Winmgmt/)
    expect(text).toMatch(/ValidateRange\(1,8\)/)
  })
})
