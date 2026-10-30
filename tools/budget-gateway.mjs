import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { BudgetLedger, createGateway } from '../src/main/gateway.mjs'
export { LIMIT, cost, BudgetLedger, createGateway } from '../src/main/gateway.mjs'

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const local = resolve('.local'); mkdirSync(local,{recursive:true})
  const tokenPath = resolve(local,'gateway-token')
  if (!existsSync(tokenPath)) writeFileSync(tokenPath,randomBytes(32).toString('hex'),{mode:0o600})
  const keyPath = process.env.POCKETBENCH_KEY_FILE
  const key = (process.env.MODEL_API_KEY || (keyPath ? readFileSync(keyPath,'utf8') : '')).replace(/^\uFEFF/,'').trim()
  if (!key) throw new Error('Set MODEL_API_KEY or POCKETBENCH_KEY_FILE before starting the development gateway.')
  const ledger = new BudgetLedger(resolve(local,'development-budget.jsonl'))
  createGateway({key,token:readFileSync(tokenPath,'utf8').trim(),ledger,allowSearch:true}).listen(43187,'127.0.0.1',() => console.log(JSON.stringify({gateway:'http://127.0.0.1:43187',budget:ledger.snapshot()})))
}
