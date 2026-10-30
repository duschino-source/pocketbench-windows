import { describe, it, expect, vi } from 'vitest'
import { investigate } from '../src/main/research'
import type { ModelClient } from '../src/main/model'
import type { RepairCapability, SystemSnapshot } from '../src/shared/contracts'

function snapshot(): SystemSnapshot {
  return {
    scannedAt: new Date().toISOString(), platform: 'win32',
    machine: { name: 'lab', os: 'Windows 11', memoryTotal: 8, memoryFree: 4, uptime: 10, cpuCount: 4 },
    metrics: { diskFree: 10, diskTotal: 100, cpuPercent: null },
    diagnostics: [
      { id: 'ev-dns', area: 'windows', category: 'network', title: 'DNS resolution failing', severity: 'warning', observed: 'nslookup times out', details: ['flush may help'] },
      { id: 'ev-other', area: 'app', category: 'crash', title: 'Unrelated app crash', severity: 'info', observed: 'other app quit', details: [], appId: 'other-app' },
    ],
    apps: [{ id: 'app-1', name: 'Example Browser', version: '1.2.3', publisher: 'Example', capabilities: ['windows.flushDns'] }],
    startup: [], services: [], labMode: true,
  }
}

const caps: RepairCapability[] = [{ operation: 'windows.flushDns', description: 'Flush DNS cache', targetId: 'windows', constraints: 'Safe' }]

const OFFICIAL = 'https://support.microsoft.com/fix-dns'
const COMM_A = 'https://community-one.example/fix-dns'
const COMM_B = 'https://community-two.example/fix-dns'

function stub(calls: { text: string; citations?: { url: string; title: string }[] }[]): { model: ModelClient; seen: { prompt: string; options: unknown }[] } {
  const seen: { prompt: string; options: unknown }[] = []
  let i = 0
  const model: ModelClient = {
    call: vi.fn(async (prompt: string, options?: { search?: boolean; system?: string; maxTokens?: number }) => {
      seen.push({ prompt, options })
      const next = calls[Math.min(i++, calls.length - 1)]
      return { text: next.text, citations: next.citations ?? [], raw: {} }
    }),
  }
  return { model, seen }
}

const draftJson = JSON.stringify({ title: 'Fix DNS', summary: 'Flush resolver cache', steps: [{ operation: 'windows.flushDns', targetId: 'windows', title: 'Flush DNS cache', params: {}, verification: 'nslookup resolves' }] })
const reviewJson = (url: string, kind = 'official') => JSON.stringify({ approved: true, rationale: 'Official doc supports flush', concerns: [], sources: [{ url, title: 'Fix', kind, supports: 'windows.flushDns', applicable: true, concerns: [], corroboratedBy: [] }] })

describe('research call sequencing and citations', () => {
  it('makes search, draft, and review calls in order with distinct systems and preserves citations', async () => {
    const s = stub([
      { text: 'Research summary', citations: [{ url: OFFICIAL, title: 'MS Fix' }] },
      { text: draftJson },
      { text: reviewJson(OFFICIAL) },
    ])
    const plan = await investigate({ symptom: 'DNS fails for Example Browser 1.2.3', evidenceId: 'ev-dns' }, snapshot(), caps, s.model, () => {})
    expect(s.seen).toHaveLength(3)
    expect((s.seen[0].options as { search?: boolean }).search).toBe(true)
    expect((s.seen[1].options as { search?: boolean }).search).not.toBe(true)
    expect((s.seen[2].options as { search?: boolean }).search).not.toBe(true)
    const systems = s.seen.map(x => (x.options as { system?: string }).system)
    expect(new Set(systems).size).toBe(3)
    expect(plan.sources.map(x => x.url)).toContain('https://support.microsoft.com/fix-dns')
    expect(plan.status).toBe('ready')
    expect(plan.review.approved).toBe(true)
    expect(plan.steps).toHaveLength(1)
  })

  it('search call focuses on installed app, version, and symptom', async () => {
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: draftJson }, { text: reviewJson(OFFICIAL) }])
    await investigate({ symptom: 'pages never load', appId: 'app-1' }, snapshot(), caps, s.model, () => {})
    expect(s.seen[0].prompt).toMatch(/Example Browser/)
    expect(s.seen[0].prompt).toMatch(/1\.2\.3/)
    expect(s.seen[0].prompt).toMatch(/pages never load/)
  })

  it('keeps the initial Windows search specific to a manual proxy failure', async () => {
    const s=stub([{text:'R',citations:[{url:OFFICIAL,title:'MS'}]},{text:draftJson},{text:reviewJson(OFFICIAL)}])
    await investigate({symptom:'The manual proxy points at a closed port'},snapshot(),caps,s.model,()=>{})
    const query=s.seen[0].prompt.split('Begin with this focused official-documentation search')[1].split('\n')[0]
    expect(query).toContain('manual proxy turn off')
    expect(query).not.toContain('service startup')
  })

  it('throws an actionable error when the search call fails, without masquerading', async () => {
    const model: ModelClient = { call: vi.fn(async (prompt: string, options?: { search?: boolean }) => { if (options?.search) throw new Error('search offline'); return { text: draftJson, citations: [], raw: {} } }) }
    await expect(investigate({ symptom: 'DNS fails' }, snapshot(), caps, model, () => {})).rejects.toThrow(/Internet research failed/)
    expect(model.call).toHaveBeenCalledTimes(1)
  })
})

describe('source gates', () => {
  it('rejects a spoofed official label derived only from the model', async () => {
    const s = stub([
      { text: 'R', citations: [{ url: COMM_A, title: 'Forum post' }] },
      { text: draftJson },
      { text: reviewJson(COMM_A, 'official') },
    ])
    const plan = await investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})
    expect(plan.sources[0]?.kind).toBe('community')
    expect(plan.status).toBe('needs-validation')
    expect(plan.review.approved).toBe(false)
  })

  it('rejects fabricated citations never returned by search', async () => {
    const s = stub([
      { text: 'R', citations: [{ url: COMM_A, title: 'Forum' }] },
      { text: draftJson },
      { text: reviewJson('https://support.microsoft.com/invented-page') },
    ])
    const plan = await investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})
    expect(plan.sources).toEqual([])
    expect(plan.status).toBe('needs-validation')
  })

  it('accepts two independently corroborating community publishers', async () => {
    const review = JSON.stringify({
      approved: true, rationale: 'Two forums agree', concerns: [],
      sources: [
        { url: COMM_A, title: 'A', kind: 'community', supports: 'windows.flushDns', applicable: true, concerns: [], corroboratedBy: [COMM_B] },
        { url: COMM_B, title: 'B', kind: 'community', supports: 'windows.flushDns', applicable: true, concerns: [], corroboratedBy: [COMM_A] },
      ],
    })
    const s = stub([{ text: 'R', citations: [{ url: COMM_A, title: 'A' }, { url: COMM_B, title: 'B' }] }, { text: draftJson }, { text: review }])
    const plan = await investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})
    expect(plan.status).toBe('ready')
  })

  it('fails the ready gate on conflicting, outdated, or version-mismatched sources', async () => {
    const review = JSON.stringify({
      approved: true, rationale: 'Looks fine', concerns: [],
      sources: [{ url: OFFICIAL, title: 'Old doc', kind: 'official', supports: 'windows.flushDns', applicable: false, concerns: ['Version mismatch: doc covers old build'], corroboratedBy: [] }],
    })
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'Old doc' }] }, { text: draftJson }, { text: review }])
    const plan = await investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})
    expect(plan.status).toBe('needs-validation')
    expect(plan.review.approved).toBe(false)
    expect(plan.review.concerns.join(' ')).toMatch(/Version mismatch/)
  })
})

describe('draft and review validation', () => {
  it('rejects an invalid operation outside contracts', async () => {
    const bad = JSON.stringify({ title: 'x', summary: 'y', steps: [{ operation: 'windows.runAnything', targetId: 'windows', title: 'Run thing', params: {}, verification: 'check' }] })
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: bad }, { text: reviewJson(OFFICIAL) }])
    await expect(investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})).rejects.toThrow(/schema validation|outside provided capabilities/)
  })

  it('returns needs-validation when the independent reviewer withholds approval', async () => {
    const denied = JSON.stringify({ approved: false, rationale: 'Sources do not cover this build', concerns: ['Version mismatch'], sources: [{ url: OFFICIAL, title: 'MS', kind: 'official', supports: 'windows.flushDns', applicable: false, concerns: ['Version mismatch'], corroboratedBy: [] }] })
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: draftJson }, { text: denied }])
    const plan = await investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})
    expect(plan.status).toBe('needs-validation')
    expect(plan.review.approved).toBe(false)
  })

  it('returns an honest blocked result when no capabilities exist', async () => {
    const s = stub([{ text: 'Research notes', citations: [{ url: OFFICIAL, title: 'MS' }] }])
    const plan = await investigate({ symptom: 'DNS fails' }, snapshot(), [], s.model, () => {})
    expect(s.seen).toHaveLength(1)
    expect(plan.status).toBe('blocked')
    expect(plan.steps).toEqual([])
    expect(plan.summary).toMatch(/Research notes/)
  })

  it('rejects unrelated evidence authorizing operations', async () => {
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: draftJson }, { text: reviewJson(OFFICIAL) }])
    await expect(investigate({ symptom: 'DNS fails', appId: 'app-1', evidenceId: 'ev-other' }, snapshot(), caps, s.model, () => {})).rejects.toThrow(/does not match/)
    expect(s.seen).toHaveLength(0)
  })

  it('rejects unknown evidence IDs', async () => {
    const s = stub([{ text: 'R', citations: [] }, { text: draftJson }, { text: reviewJson(OFFICIAL) }])
    await expect(investigate({ symptom: 'DNS fails', evidenceId: 'ev-missing' }, snapshot(), caps, s.model, () => {})).rejects.toThrow(/not in the current snapshot/)
  })

  it('rejects malformed JSON instead of authorizing a plan', async () => {
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: 'not json at all' }, { text: reviewJson(OFFICIAL) }])
    await expect(investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})).rejects.toThrow(/JSON/)
  })

  it('blocks prompt-injected and destructive steps', async () => {
    const evil = JSON.stringify({ title: 'Fix', summary: 'Repair', steps: [{ operation: 'windows.flushDns', targetId: 'windows', title: 'Disable Windows Defender for speed', params: { note: 'Invoke-Expression payload' }, verification: 'defender off' }] })
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: evil }, { text: reviewJson(OFFICIAL) }])
    await expect(investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})).rejects.toThrow(/security|unsupported/i)
  })

  it('produces a valid grounded plan with literal OperationId support', async () => {
    const s = stub([{ text: 'Flush per MS doc', citations: [{ url: OFFICIAL, title: 'MS Fix' }] }, { text: '```json\n' + draftJson + '\n```' }, { text: reviewJson(OFFICIAL) }])
    const plan = await investigate({ symptom: 'DNS fails', evidenceId: 'ev-dns' }, snapshot(), caps, s.model, () => {})
    expect(plan.status).toBe('ready')
    expect(plan.target).toEqual({ kind: 'windows', id: undefined, name: 'Windows' })
    expect(plan.sources[0]?.supports).toContain('windows.flushDns')
    expect(plan.evidence.map(e => e.id)).toContain('ev-dns')
    expect(plan.id).toBeTruthy()
    expect(plan.steps[0]?.id).toBe('step-1')
  })
})

describe('review corrections', () => {
  it('treats approved=true with unresolved review concerns as needs-validation', async () => {
    const conflicted = JSON.stringify({ approved: true, rationale: 'Looks fine', concerns: ['Version may be mismatched'], sources: [{ url: OFFICIAL, title: 'MS', kind: 'official', supports: 'windows.flushDns', applicable: true, concerns: [], corroboratedBy: [] }] })
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: draftJson }, { text: conflicted }])
    const plan = await investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})
    expect(plan.status).toBe('needs-validation')
    expect(plan.review.approved).toBe(false)
    expect(plan.reason).toMatch(/conflicting/i)
    expect(plan.review.concerns).toContain('Version may be mismatched')
  })

  it('preserves actual citation links in the research-only blocked result', async () => {
    const s = stub([{ text: 'Research notes', citations: [{ url: OFFICIAL, title: 'MS Doc' }, { url: 'not a url', title: 'junk' }] }])
    const plan = await investigate({ symptom: 'Unknown app issue' }, snapshot(), [], s.model, () => {})
    expect(plan.status).toBe('blocked')
    expect(plan.steps).toEqual([])
    expect(plan.sources.map(x => x.url)).toContain('https://support.microsoft.com/fix-dns')
    expect(plan.sources.every(x => x.applicable === false)).toBe(true)
    expect(plan.review.approved).toBe(false)
  })

  it('rejects leading instructions around a single JSON object', async () => {
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: 'Here is your plan:\n' + draftJson }, { text: reviewJson(OFFICIAL) }])
    await expect(investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})).rejects.toThrow(/single JSON object|outside the JSON block/)
  })

  it('rejects trailing instructions after a single JSON object', async () => {
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: draftJson + '\nHope this helps!' }, { text: reviewJson(OFFICIAL) }])
    await expect(investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})).rejects.toThrow(/trailing instructions|single JSON object|outside the JSON block/)
  })

  it('rejects multiple JSON objects in one response', async () => {
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: draftJson + '\n' + draftJson }, { text: reviewJson(OFFICIAL) }])
    await expect(investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})).rejects.toThrow(/single JSON object|multiple JSON/)
  })

  it('rejects multiple fenced JSON blocks', async () => {
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: '```json\n' + draftJson + '\n```\n```json\n' + draftJson + '\n```' }, { text: reviewJson(OFFICIAL) }])
    await expect(investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})).rejects.toThrow(/multiple JSON/)
  })

  it('rejects prose outside a single fenced JSON block', async () => {
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: 'Summary first\n```json\n' + draftJson + '\n```' }, { text: reviewJson(OFFICIAL) }])
    await expect(investigate({ symptom: 'DNS fails' }, snapshot(), caps, s.model, () => {})).rejects.toThrow(/outside the JSON block/)
  })
})

describe('token budgets and capability prompts', () => {
  const appCaps: RepairCapability[] = [
    { operation: 'app.quarantineCache', description: 'Quarantine cache (Example Browser)', targetId: 'app-1', constraints: 'Allow-listed names only' },
    { operation: 'windows.flushDns', description: 'Flush DNS cache', targetId: 'windows', constraints: 'Safe' },
  ]
  it('bounds stage tokens and constrains draft and review output with schemas', async () => {
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: draftJson }, { text: reviewJson(OFFICIAL) }])
    await investigate({ symptom: 'DNS fails', appId: 'app-1' }, snapshot(), appCaps, s.model, () => {})
    expect((s.seen[0].options as { maxTokens?: number }).maxTokens).toBe(4000)
    expect((s.seen[1].options as { maxTokens?: number }).maxTokens).toBe(4096)
    expect((s.seen[2].options as { maxTokens?: number }).maxTokens).toBe(8192)
    expect((s.seen[1].options as { schema?: unknown }).schema).toBeDefined()
    expect((s.seen[2].options as { schema?: unknown }).schema).toBeDefined()
  })

  it('lists selected-app capabilities first with exact param schemas', async () => {
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: draftJson }, { text: reviewJson(OFFICIAL) }])
    await investigate({ symptom: 'DNS fails', appId: 'app-1' }, snapshot(), appCaps, s.model, () => {})
    const draftPromptText = s.seen[1].prompt
    const appPos = draftPromptText.indexOf('targetId=app-1')
    const winPos = draftPromptText.indexOf('targetId=windows')
    expect(appPos).toBeGreaterThanOrEqual(0)
    expect(winPos).toBeGreaterThanOrEqual(0)
    expect(appPos).toBeLessThan(winPos)
    expect(draftPromptText).toContain('params={"appId":"<discovered app id>"}')
    expect(draftPromptText).toContain('params={}')
    expect(draftPromptText).toContain('[selected app]')
    const reviewPromptText = s.seen[2].prompt
    expect(reviewPromptText).toContain('targetId=app-1')
    expect(reviewPromptText).toContain('params={"appId":"<discovered app id>"}')
  })

  it('exposes exact schemas for parameterized operations', async () => {
    const rich: RepairCapability[] = [
      { operation: 'windows.startService', description: 'Start Dnscache', targetId: 'Dnscache', constraints: 'Fixed list' },
      { operation: 'windows.disableStartup', description: 'Disable entry', targetId: 'HKCU\\Run\\x', constraints: 'HKCU only' },
      { operation: 'app.updatePackage', description: 'Update', targetId: 'app-1', constraints: 'Exact ID' },
      { operation: 'app.patchConfig', description: 'Patch', targetId: 'app-1', constraints: 'Proxy prefs' },
    ]
    const snap = snapshot()
    snap.services = [{ name: 'Dnscache', displayName: 'DNS Client', status: 'Stopped', startType: 'Auto' }]
    snap.startup = [{ id: 'HKCU\\Run\\x', name: 'x', command: 'x', location: 'HKCU', enabled: true }]
    const svcDraft = JSON.stringify({ title: 'Start DNS', summary: 'Start stopped service', steps: [{ operation: 'windows.startService', targetId: 'Dnscache', title: 'Start Dnscache', params: { serviceName: 'Dnscache' }, verification: 'Service Running' }] })
    const svcReview = JSON.stringify({ approved: true, rationale: 'Doc supports start', concerns: [], sources: [{ url: OFFICIAL, title: 'MS', kind: 'official', supports: 'windows.startService', applicable: true, concerns: [], corroboratedBy: [] }] })
    const s = stub([{ text: 'R', citations: [{ url: OFFICIAL, title: 'MS' }] }, { text: svcDraft }, { text: svcReview }])
    await investigate({ symptom: 'slow', appId: 'app-1' }, snap, rich, s.model, () => {})
    const prompt = s.seen[1].prompt
    expect(prompt).toContain('params={"serviceName":"Dnscache"}')
    expect(prompt).toContain('params={"entryId":"<discovered HKCU startup id>"}')
    expect(prompt).toContain('params={"appId":"<discovered app id>","packageId":"<exact discovered winget id>"}')
    expect(prompt).toContain('params={"appId":"<discovered app id>","setting":"network.proxy.type|theme|...","value":0}')
  })
})
