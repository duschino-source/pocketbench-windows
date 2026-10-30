import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MeteredModel } from '../src/main/model'
import { runDiagnosticAgent } from '../src/main/diagnostic-agent'

describe.skipIf(process.env.POCKETBENCH_LIVE_MODEL!=='1' || process.platform!=='win32')('live Muse function calls into real read-only Windows tools',()=>{
 it('asks for BITS service observations and receives actual local results',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'pb-live-tools-'))
  try {
   const model=new MeteredModel(directory,()=>null)
   const result=await runDiagnosticAgent({symptom:'Inspect the real BITS service using windows_service with hours=1 and maxEvents=1 before considering any fix. This is a read-only integration check. Report its actual status and do not change anything.',context:'Windows 11; read-only integration verification.',transport:turn=>model.diagnosticTurn(turn)})
   expect(result.toolCalls).toBeGreaterThan(0);expect(result.toolCalls).toBeLessThanOrEqual(4);expect(result.rounds).toBeLessThanOrEqual(2)
   const evidence=result.evidence.find(item=>item.context?.tool==='windows_service')
   expect(evidence,'Muse must invoke the actual local service function').toBeDefined()
   expect(evidence?.context?.status).not.toBe('unavailable')
   expect(evidence?.context?.readOnly).toBe(true)
   mkdirSync('.local',{recursive:true});writeFileSync('.local/live-diagnostic-proof.json',JSON.stringify({at:new Date().toISOString(),model:'muse-spark-1.3',readOnly:true,...result},null,2))
  } finally {rmSync(directory,{recursive:true,force:true})}
 },240000)
 it('runs an allow-listed direct DNS and HTTPS probe without changing Windows settings',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'pb-live-tools-'))
  try {
   const model=new MeteredModel(directory,()=>null)
   const result=await runDiagnosticAgent({symptom:'Run windows_network for www.microsoft.com to collect actual DNS and direct HTTPS observations. This is a read-only integration verification, not evidence that a browser or proxy works. Do not change anything.',context:'Windows 11; one-host read-only reachability verification.',transport:turn=>model.diagnosticTurn(turn)})
   expect(result.toolCalls).toBeGreaterThan(0);expect(result.toolCalls).toBeLessThanOrEqual(4)
   const evidence=result.evidence.find(item=>item.context?.tool==='windows_network')
   expect(evidence,'Muse must invoke the actual local network function').toBeDefined()
   expect(evidence?.context?.readOnly).toBe(true)
   expect(evidence?.observed).toContain('DNS')
   mkdirSync('.local',{recursive:true});writeFileSync('.local/live-diagnostic-network-proof.json',JSON.stringify({at:new Date().toISOString(),model:'muse-spark-1.3',readOnly:true,...result},null,2))
  } finally {rmSync(directory,{recursive:true,force:true})}
 },240000)
})

