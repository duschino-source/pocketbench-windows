import http from 'node:http'
import { readFileSync, appendFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID, timingSafeEqual } from 'node:crypto'

export const LIMIT = 90
export function cost(input, output, searches = 0) { return input * 1.25 / 1e6 + output * 4.25 / 1e6 + searches * .0025 }
export class BudgetLedger {
  constructor(path, limit = LIMIT) {
    this.path = path; this.limit = limit; this.entries = []
    mkdirSync(dirname(path), { recursive: true })
    if (existsSync(path)) this.entries = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  }
  snapshot() {
    const pending = new Map(); let spent = 0
    for (const entry of this.entries) {
      if (entry.type === 'reserve') pending.set(entry.id, entry.amount)
      if (entry.type === 'settle') { pending.delete(entry.id); spent += entry.amount }
    }
    const reserved = [...pending.values()].reduce((a,b) => a+b, 0)
    return { limit: this.limit, spent, reserved, remaining: Math.max(0, this.limit-spent-reserved), requests: this.entries.filter(e => e.type === 'reserve').length }
  }
  record(entry) { appendFileSync(this.path, JSON.stringify(entry)+'\n', { mode: 0o600 }); this.entries.push(entry) }
  reserve(amount, label = 'development') {
    if (!Number.isFinite(amount) || amount < 0 || amount > this.snapshot().remaining) throw new Error('Budget exhausted: request refused before contacting Meta.')
    const id = randomUUID(); this.record({ type:'reserve', id, amount, label, at: new Date().toISOString() }); return id
  }
  settle(id, amount) {
    const reservation = this.entries.find(e => e.type === 'reserve' && e.id === id)
    if (!reservation || this.entries.some(e => e.type === 'settle' && e.id === id)) throw new Error('Invalid budget settlement')
    if (!Number.isFinite(amount) || amount < 0 || amount > reservation.amount) throw new Error('Unexpected billing: reservation retained; gateway must be reconciled.')
    this.record({ type:'settle', id, amount, at: new Date().toISOString() })
  }
}

export function createGateway({key, token, ledger, upstream = 'https://api.meta.ai', allowSearch = false}) {
  return http.createServer(async (req, res) => {
    const send = (status, object) => { if (!res.headersSent) res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(object)) }
    const supplied = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''))
    const expected = Buffer.from(token)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(401, {error:{message:'Gateway authentication required'}})
    if (req.url === '/budget') return send(200, ledger.snapshot())
    if (req.url === '/v1/models') return send(200, {object:'list',data:[{id:'muse-spark-1.3',object:'model',owned_by:'meta'}]})
    if (req.method !== 'POST' || !['/v1/chat/completions','/v1/responses'].includes(req.url)) return send(404, {error:{message:'Unsupported gateway endpoint'}})
    let reservation
    try {
      let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 524288) throw new Error('Request exceeds 512 KiB limit') }
      const body = JSON.parse(raw)
      if (body.model !== 'muse-spark-1.3') throw new Error('Only Muse Spark 1.3 Standard is enabled')
      const searches = (body.tools || []).filter(t => t.type === 'web_search' || t.type === 'web_search_preview').length
      if (searches && !allowSearch) throw new Error('Web research must use the application research client with separate search reservations')
      if (searches) { body.max_tool_calls = 1; body.stream = false }
      // A byte per input token is deliberately conservative. Unknown usage keeps the full reservation.
      const maxOutput = Math.min(16384, Math.max(256, Number(body.max_tokens || body.max_output_tokens || body.max_completion_tokens || 8192)))
      if (!Number.isFinite(maxOutput)) throw new Error('Invalid token budget')
      if (req.url.endsWith('/responses')) body.max_output_tokens = maxOutput
      else { body.max_tokens = maxOutput; delete body.max_completion_tokens }
      body.reasoning_effort ||= req.url.endsWith('/responses') ? undefined : 'medium'
      const streamed = Boolean(body.stream)
      if (streamed && req.url.endsWith('/chat/completions')) body.stream_options = {...body.stream_options,include_usage:true}
      const reserve = cost(Buffer.byteLength(JSON.stringify(body)) + 4096, maxOutput, searches ? 128 : 0)
      reservation = ledger.reserve(reserve)
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 240000)
      const response = await fetch(upstream + req.url, {method:'POST', headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'}, body:JSON.stringify(body), signal:controller.signal}).finally(() => clearTimeout(timeout))
      if (!response.ok) {
        const error = (await response.text()).split(key).join('[REDACTED]')
        // Only rejected requests are known not to have generated tokens.
        if ([400,401,402,403,404,422,429].includes(response.status)) ledger.settle(reservation, 0)
        return send(response.status, {error:{message:error.slice(0,1500)}})
      }
      res.writeHead(200, {'Content-Type':response.headers.get('content-type') || 'application/json','Cache-Control':'no-cache'})
      let result = ''
      for await (const chunk of response.body) { const text = Buffer.from(chunk).toString('utf8'); result += text; res.write(chunk) }
      let usage; let searchQueries = 0
      if (streamed) {
        for (const line of result.split('\n')) {
          if (!line.startsWith('data:') || line.includes('[DONE]')) continue
          try { const event = JSON.parse(line.slice(5)); usage = event.usage || event.response?.usage || usage } catch {}
        }
      } else {
        const parsed = JSON.parse(result); usage = parsed.usage
        for (const item of parsed.output || []) if (item.type === 'web_search_call' && item.action?.type === 'search') searchQueries += item.action.queries?.length || (item.action.query ? 1 : 0)
        // If provider omits search accounting, keep the conservative search reservation charged.
        if (searches && !searchQueries) searchQueries = 128
      }
      if (usage) ledger.settle(reservation, cost(usage.prompt_tokens ?? usage.input_tokens ?? 0, usage.completion_tokens ?? usage.output_tokens ?? 0, searchQueries))
      res.end()
    } catch (error) { send(reservation ? 502 : 400, {error:{message:String(error.message).split(key).join('[REDACTED]')}}) }
  })
}

