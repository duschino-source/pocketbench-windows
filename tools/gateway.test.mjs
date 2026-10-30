import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { BudgetLedger, cost, createGateway } from './budget-gateway.mjs'

test('reserves atomically, retains unknown usage across restart, and rejects overspend', () => {
  const dir = mkdtempSync(join(tmpdir(),'pocketbench-budget-'))
  try {
    const path = join(dir,'ledger.jsonl'); const ledger = new BudgetLedger(path,1)
    const id = ledger.reserve(.8)
    assert.throws(() => ledger.reserve(.3), /exhausted/)
    assert.equal(new BudgetLedger(path,1).snapshot().reserved,.8)
    assert.throws(() => ledger.settle(id,.9),/Unexpected billing/)
    ledger.settle(id,.2)
    assert.throws(() => ledger.settle(id,.2),/Invalid budget/)
    assert.equal(ledger.snapshot().remaining,.8)
    assert.throws(() => ledger.reserve(-1))
    assert.throws(() => ledger.reserve(NaN))
    assert.equal(cost(1e6,1e6),5.5)
  } finally { rmSync(dir,{recursive:true,force:true}) }
})

test('gateway protects key, rejects unsafe routes, and accounts actual generated tokens', async () => {
  const dir=mkdtempSync(join(tmpdir(),'pocketbench-gateway-')); let calls=0
  const upstream=createServer(async (req,res) => {
    calls++; let body=''; for await(const chunk of req) body+=chunk
    assert.equal(req.headers.authorization,'Bearer real-test-key')
    const parsed=JSON.parse(body); assert.ok(parsed.max_tokens <= 16384)
    assert.ok(!JSON.stringify(parsed).includes('real-test-key'), 'provider credential must not appear in model input')
    res.setHeader('Content-Type','application/json')
    res.end(JSON.stringify({choices:[{message:{content:'OK'}}],usage:{prompt_tokens:20,completion_tokens:10}}))
  })
  const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)))
  const upstreamPort=await listen(upstream)
  const ledger=new BudgetLedger(join(dir,'ledger.jsonl'),1)
  const gateway=createGateway({key:'real-test-key',token:'local-token',ledger,upstream:`http://127.0.0.1:${upstreamPort}`})
  const gatewayPort=await listen(gateway);const base=`http://127.0.0.1:${gatewayPort}`
  const post=(body,token='local-token')=>fetch(base+'/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)})
  try {
    assert.equal((await post({},'wrong')).status,401)
    assert.equal((await post({model:'other'})).status,400)
    assert.equal((await post({model:'muse-spark-1.3',tools:[{type:'web_search'}]})).status,400)
    assert.equal(calls,0)
    const response=await post({model:'muse-spark-1.3',messages:[{role:'user',content:'hello, accidental paste: real-test-key'}],max_tokens:256})
    assert.equal(response.status,200);assert.equal((await response.json()).choices[0].message.content,'OK')
    assert.equal(calls,1);assert.equal(ledger.snapshot().spent,cost(20,10));assert.equal(ledger.snapshot().reserved,0)
  } finally { gateway.closeAllConnections(); upstream.closeAllConnections();await Promise.all([new Promise(r=>gateway.close(r)),new Promise(r=>upstream.close(r))]);rmSync(dir,{recursive:true,force:true}) }
})
