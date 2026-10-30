import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MeteredModel } from '../src/main/model'

const folders:string[]=[]
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();for(const folder of folders.splice(0))rmSync(folder,{recursive:true,force:true})})
function fixture() {
 const folder=mkdtempSync(join(tmpdir(),'pb-tool-transport-'));folders.push(folder)
 const file=join(folder,'token');writeFileSync(file,'loopback-token')
 vi.stubEnv('POCKETBENCH_GATEWAY','http://127.0.0.1:43187')
 vi.stubEnv('POCKETBENCH_GATEWAY_TOKEN_FILE',file)
 return new MeteredModel(folder,()=>{throw Error('Provider key must remain in the gateway')})
}
const request={instructions:'Read-only diagnostics',input:[{role:'user',content:[{type:'input_text',text:'DNS fails'}]}],tools:[{type:'function',name:'windows_network',parameters:{type:'object'}}],maxOutputTokens:2048}
describe('metered diagnostic Responses transport',()=>{
 it('preserves function calls, encrypted reasoning and empty-text turns through the authenticated gateway',async()=>{
  const model=fixture()
  const output=[{type:'reasoning',id:'rs_1',encrypted_content:'opaque-encrypted-reasoning'},{type:'function_call',call_id:'call_1',name:'windows_network',arguments:'{"hostname":"www.microsoft.com"}',status:'completed'}]
  const fetch=vi.fn(async(url,options)=>{
   expect(url).toBe('http://127.0.0.1:43187/v1/responses')
   expect(options.headers.Authorization).toBe('Bearer loopback-token')
   const body=JSON.parse(options.body);expect(body.store).toBe(false);expect(body.include).toEqual(['reasoning.encrypted_content']);expect(body.tools).toEqual(request.tools)
   return new Response(JSON.stringify({status:'completed',output}),{headers:{'Content-Type':'application/json'}})
  })
  vi.stubGlobal('fetch',fetch)
  expect((await model.diagnosticTurn(request)).output).toEqual(output)
 })
 it('refuses incomplete turns and oversized context before local observations can be trusted',async()=>{
  const model=fixture(),fetch=vi.fn(async()=>new Response(JSON.stringify({status:'incomplete',output:[]})))
  vi.stubGlobal('fetch',fetch)
  await expect(model.diagnosticTurn(request)).rejects.toThrow('did not finish')
  await expect(model.diagnosticTurn({...request,input:[{text:'x'.repeat(140000)}]})).rejects.toThrow('size limit')
  expect(fetch).toHaveBeenCalledTimes(1)
 })
})

