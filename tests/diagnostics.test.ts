import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { promises as dns } from 'node:dns'
import https from 'node:https'
import { createDiagnosticTools, isPublicAddress, minimizeDiagnosticText, type DiagnosticResult } from '../src/main/diagnostics'
import { runDiagnosticAgent, type DiagnosticTurnRequest } from '../src/main/diagnostic-agent'

const call = (call_id: string, name = 'windows_network', args: unknown = { hostname: 'www.microsoft.com' }) => ({ type: 'function_call', call_id, name, arguments: JSON.stringify(args), status: 'completed' })
const observation = (name = 'windows_network'): DiagnosticResult => ({ tool: name, timestamp: '2026-10-30T20:00:00.000Z', scope: 'network:www.microsoft.com', status: 'ok', observations: ['DNS outcome: resolved.', 'HTTPS returned HTTP 200.'], data: {} })
const local = { invoke: vi.fn(async (name: string) => observation(name)) }
afterEach(() => { vi.restoreAllMocks(); local.invoke.mockClear() })

describe('bounded diagnostic Responses protocol', () => {
  it('keeps direct DNS/HTTPS outcomes and their limitations ahead of verbose native notes',async()=>{
    const tools=createDiagnosticTools({nativeRunner:async()=>({status:'partial',connected:1,adaptersConnected:1,adaptersTotal:2,proxyEnabled:false,notes:['One unavailable field','Second unavailable field','Third unavailable field']}),networkProbe:async()=>({reachable:true,dnsStatus:'resolved',statusCode:200})})
    let round=0
    const result=await runDiagnosticAgent({symptom:'Connection failure',tools,transport:async()=>({output:round++?[]:[call('network_check')]})})
    expect(result.evidence[0].observed).toContain('DNS outcome')
    expect(result.evidence[0].details.join(' ')).toContain('HTTP 200')
    expect(result.evidence[0].details.join(' ')).toContain('DIRECT Node HTTPS')
    expect(result.evidence[0].severity).toBe('info')
  })
  it('replays paired function calls, encrypted reasoning and minimized results', async () => {
    const requests: DiagnosticTurnRequest[] = []
    const encrypted = 'opaque-content-must-remain-exact'
    const tools = { invoke: vi.fn(async () => ({ ...observation(), observations: ['TLS probe returned HTTP 403.', 'C:\\Users\\alice\\secret alice@example.com 10.1.2.3 2001:db8::1 Bearer abc.def.ghi'], data: { rawSecret: 'never transmit this field' } })) }
    const result = await runDiagnosticAgent({ symptom: 'Cannot load websites; contact alice@example.com', context: 'C:\\Users\\alice\\app.log', appId: 'browser-1', tools, transport: async request => {
      requests.push(request)
      return requests.length === 1 ? { output: [{ type: 'reasoning', id: 'rs_one', encrypted_content: encrypted }, { type: 'message', phase: 'commentary', content: [{ type: 'output_text', text: 'Checking the endpoint.' }] }, call('call_one')] } : { output: [{ type: 'message', content: [{ type: 'output_text', text: 'A single endpoint was reachable; application connectivity remains unverified.' }] }] }
    } })
    expect(result.rounds).toBe(2)
    expect(result.toolCalls).toBe(1)
    const replay = requests[1].input
    expect(replay.find(item => item.type === 'reasoning')).toEqual({ type: 'reasoning', summary: [], encrypted_content: encrypted })
    expect(replay.find(item => item.type === 'function_call')).toMatchObject({ call_id: 'call_one', name: 'windows_network' })
    const answer = replay.find(item => item.type === 'function_call_output')!
    expect(answer.call_id).toBe('call_one')
    expect(JSON.parse(answer.output as string)).toMatchObject({ tool: 'windows_network', observations: [expect.stringContaining('HTTP 403'), expect.any(String)] })
    const transmitted = JSON.stringify(requests)
    for (const secret of ['alice', '10.1.2.3', '2001:db8::1', 'abc.def.ghi', 'rawSecret', 'never transmit']) expect(transmitted).not.toContain(secret)
    expect(result.evidence[0]).toMatchObject({ appId: 'browser-1', severity: 'info', observed: 'TLS probe returned HTTP 403.', context: { readOnly: true, source: 'local-read-only-tool' } })
    expect(result.evidence[0].suggestedOperation).toBeUndefined()
  })

  it('rejects names, malformed JSON and extra or disallowed arguments before an injected tool sees them', async () => {
    const outputs = [call('bad_name', 'run_command', { command: 'Start-Service BITS' }), { ...call('bad_json'), arguments: '{' }, call('bad_host', 'windows_network', { hostname: 'https://127.0.0.1:444/', command: 'iex' })]
    let rounds = 0
    const result = await runDiagnosticAgent({ symptom: 'Network unavailable', tools: local, transport: async () => ({ output: rounds++ ? [] : outputs }) })
    expect(local.invoke).not.toHaveBeenCalled()
    expect(result.evidence).toEqual([])
    expect(result.toolCalls).toBe(0)
    expect(result.issues).toHaveLength(3)
  })

  it('does not execute ambiguous duplicate call IDs or incomplete model turns', async () => {
    for (const response of [{ output: [call('same'), call('same')] }, { status: 'incomplete', output: [call('partial')] }, { output: [{ ...call('bad;id') }] }]) {
      const result = await runDiagnosticAgent({ symptom: 'Network unavailable', tools: local, transport: async () => response })
      expect(result.toolCalls).toBe(0)
      expect(result.issues.length).toBeGreaterThan(0)
    }
    expect(local.invoke).not.toHaveBeenCalled()
  })

  it('caps collection at two rounds and four native invocations', async () => {
    let rounds = 0
    const result = await runDiagnosticAgent({ symptom: 'Network unavailable', tools: local, transport: async () => { const output = Array.from({ length: 3 }, (_, i) => call('call_' + rounds + '_' + i)); rounds++; return { output } } })
    expect(result.rounds).toBe(2)
    expect(result.toolCalls).toBe(4)
    expect(local.invoke).toHaveBeenCalledTimes(4)
    expect(result.evidence).toHaveLength(4)
  })

  it('reports unavailable collection as missing evidence and contains model transport failures', async () => {
    const tools = { invoke: vi.fn(async () => { throw new Error('Access is denied') }) }
    let rounds = 0
    const result = await runDiagnosticAgent({ symptom: 'Service issue', tools, transport: async () => ({ output: rounds++ ? [] : [call('one')] }), onProgress: () => { throw new Error('Display unavailable') } })
    expect(result.evidence[0]).toMatchObject({ severity: 'info', context: { status: 'unavailable' } })
    expect(result.evidence[0].observed).toContain('Access is denied')
    const failed = await runDiagnosticAgent({ symptom: 'Service issue', tools: local, transport: async () => { throw new Error('Model connection unavailable') } })
    expect(failed.evidence).toEqual([])
    expect(failed.issues[0]).toContain('Model connection unavailable')
  })

  it('never treats a model narrative as an independent local observation', async () => {
    const result = await runDiagnosticAgent({ symptom: 'Issue', tools: local, transport: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'I think the DNS service is broken.' }] }] }) })
    expect(result.evidence).toEqual([])
    expect(local.invoke).not.toHaveBeenCalled()
  })
})

describe('native diagnostic trust boundaries', () => {
  it('redacts IPv6 identities while retaining diagnostic timestamps', () => {
    expect(minimizeDiagnosticText('2026-10-30T20:00:00.000Z ::1 2001:db8::1')).toBe('2026-10-30T20:00:00.000Z [IP] [IP]')
  })
  it('denies local, reserved, transition, malformed and mapped addresses', () => {
    for (const address of ['not-an-address', '100.64.1.1', '198.19.0.1', '192.0.0.1', '::ffff:7f00:1', '::ffff:127.0.0.1', '2002:7f00:1::1', '2001::1', '2001:db8::1', '3fff::1', 'fe80::1%5', 'fdb0::1']) expect(isPublicAddress(address), address).toBe(false)
    for (const address of ['8.8.8.8', '93.184.216.34', '2001:4860:4860::8888', '2606:4700:4700::1111']) expect(isPublicAddress(address), address).toBe(true)
  })

  it('refuses non-public DNS answers without opening HTTPS', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never)
    const request = vi.spyOn(https, 'request')
    const tools = createDiagnosticTools({ nativeRunner: async () => ({ connected: 1, proxyEnabled: false }) })
    const result = await tools.invoke('windows_network', { hostname: 'www.microsoft.com' })
    expect(request).not.toHaveBeenCalled()
    expect(result.data.dnsStatus).toBe('blocked')
    expect(result.status).toBe('partial')
  })

  it('pins HTTPS to the validated address, verifies TLS and reports redirects without following them', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
    const seen: Record<string, unknown>[] = []
    vi.spyOn(https, 'request').mockImplementation(((options: Record<string, unknown>, callback: (response: unknown) => void) => {
      seen.push(options)
      const request = new EventEmitter() as EventEmitter & { end: () => void }
      request.end = () => callback({ statusCode: 302, destroy: () => {} })
      return request
    }) as never)
    const tools = createDiagnosticTools({ nativeRunner: async () => ({ connected: 1, proxyEnabled: false }) })
    const result = await tools.invoke('windows_network', { hostname: 'www.microsoft.com' })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ host: '93.184.216.34', servername: 'www.microsoft.com', port: 443, path: '/', method: 'HEAD', rejectUnauthorized: true, agent: false })
    expect(result.observations.join(' ')).toMatch(/redirect was not followed/)
    expect(result.observations.join(' ')).toContain('DIRECT Node HTTPS')
  })

  it('does not turn partial/malformed native output into a successful clean event query', async () => {
    for (const raw of [{ status: 'unavailable', note: 'Access denied' }, {}, { status: 'error', events: [] }]) {
      const result = await createDiagnosticTools({ nativeRunner: async () => raw }).invoke('windows_events', { channel: 'system', hours: 1, maxEvents: 1 })
      expect(result.status).not.toBe('ok')
      expect(result.observations.join(' ')).not.toMatch(/No error\/critical events/)
    }
    const partial = await createDiagnosticTools({ nativeRunner: async () => ({ status: 'partial', statusText: 'Running', events: [], eventStatus: 'unavailable' }) }).invoke('windows_service', { serviceName: 'BITS', hours: 1, maxEvents: 1 })
    expect(partial.status).toBe('partial')
    expect(partial.observations.join(' ')).toContain('could not be read')
  })

  it('enforces requested count and removes unexpected event identities and timestamps', async () => {
    const tools = createDiagnosticTools({ nativeRunner: async () => ({ events: Array.from({ length: 8 }, () => ({ id: 7001, timeCreated: 'Bearer token-that-is-not-a-time', message: 'DOMAIN\\alice connected to 10.0.0.1 and 2001:db8::1', computer: 'private-machine' })) }) })
    const result = await tools.invoke('windows_events', { channel: 'system', hours: 1, maxEvents: 1 })
    expect(result.data.eventCount).toBe(1)
    expect(result.observations.join(' ')).toContain('Event 7001')
    for (const privateValue of ['alice', '10.0.0.1', '2001:db8::1', 'private-machine', 'token-that']) expect(JSON.stringify(result)).not.toContain(privateValue)
    await expect(tools.invoke('windows_network', Object.create({ hostname: 'www.microsoft.com' }))).rejects.toThrow()
  })
})
