import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Controller } from '../src/main/controller'
import type { RepairPlan, RepairStep, SystemSnapshot } from '../src/shared/contracts'

vi.mock('../src/main/research',()=>({investigate:vi.fn()}))
import { investigate } from '../src/main/research'

const step:RepairStep={id:'step',operation:'windows.clearUserProxy',title:'Clear stale proxy',targetId:'windows',params:{},requiresAdmin:false,reversible:true,impact:'Changes user proxy',verification:'Proxy is disabled'}
const plan:RepairPlan={id:'plan',createdAt:new Date().toISOString(),title:'Repair connection',summary:'Diagnosed proxy issue',target:{kind:'windows',name:'Windows'},status:'ready',reason:'Verified applicable',evidence:[],sources:[],steps:[step],review:{approved:true,rationale:'Applicable',concerns:[]}}
const snapshot:SystemSnapshot={scannedAt:new Date().toISOString(),platform:'win32',machine:{name:'test',os:'Windows',memoryTotal:1,memoryFree:1,uptime:1,cpuCount:1},metrics:{diskFree:1,diskTotal:1,cpuPercent:null},diagnostics:[],apps:[],startup:[],services:[],labMode:true}
function fixture(verifyPassed:boolean) {
  const dir=mkdtempSync(join(tmpdir(),'pocketbench-controller-'))
  const engine={scan:vi.fn(async()=>snapshot),capabilities:vi.fn(()=>[]),validateStep:vi.fn((s:RepairStep)=>s),execute:vi.fn(async(s:RepairStep)=>({step:s,startedAt:'now',finishedAt:'now',success:true,output:'command exited zero',backupId:'backup',data:{}})),verify:vi.fn(async()=>({passed:verifyPassed,summary:verifyPassed?'Verified':'The proxy is still enabled',checks:[{name:'Proxy disabled',passed:verifyPassed}]})),undo:vi.fn(async()=>({passed:true,summary:'Restored',checks:[{name:'Original proxy restored',passed:true}]}))}
  const model={budget:async()=>({limit:90,spent:0,reserved:0,remaining:90,requests:0})}
  const controller=new Controller(dir,engine as any,model as any,()=>({hasApiKey:true,budgetLimit:90,model:'muse-spark-1.3',labMode:true,dataDirectory:dir}),()=>{})
  vi.mocked(investigate).mockResolvedValue(structuredClone(plan))
  return {controller,engine,cleanup:()=>rmSync(dir,{recursive:true,force:true})}
}
describe('repair workflow authority',()=>{
  it('never marks a successful command Fixed when independent verification fails',async()=>{
    const f=fixture(false);try {await f.controller.investigate({symptom:'network fails'});const run=await f.controller.apply('plan');expect(run.status).toBe('failed');expect(run.error).toContain('still enabled');expect(run.canUndo).toBe(true)}finally{f.cleanup()}
  })
  it('rejects unknown plans and blocked research without executing',async()=>{
    const f=fixture(true);try {await expect(f.controller.apply('forged')).rejects.toThrow('stored');vi.mocked(investigate).mockResolvedValue({...structuredClone(plan),status:'blocked'});await f.controller.investigate({symptom:'network fails'});await expect(f.controller.apply('plan')).rejects.toThrow('Ready');expect(f.engine.execute).not.toHaveBeenCalled()}finally{f.cleanup()}
  })
  it('records verified outcomes, rejects duplicate execution, and restores with verification',async()=>{
    const f=fixture(true);try {await f.controller.investigate({symptom:'network fails'});const run=await f.controller.apply('plan');expect(run.status).toBe('fixed');await expect(f.controller.apply('plan')).rejects.toThrow('already');expect((await f.controller.undo(run.id)).status).toBe('undone');expect(f.engine.undo).toHaveBeenCalledOnce()}finally{f.cleanup()}
  })
  it('revalidates impact and refuses changed privileges before any mutation',async()=>{
    const f=fixture(true);try {await f.controller.investigate({symptom:'network fails'});f.engine.validateStep.mockImplementation(s=>({...s,requiresAdmin:true}));await expect(f.controller.apply('plan')).rejects.toThrow('impact changed');expect(f.engine.execute).not.toHaveBeenCalled()}finally{f.cleanup()}
  })
  it('blocks parameters that silently retarget a reviewed step',async()=>{
    const f=fixture(true);try {f.engine.validateStep.mockImplementation(s=>({...s,targetId:'other-resource'}));const result=await f.controller.investigate({symptom:'network fails'});expect(result.status).toBe('blocked');await expect(f.controller.apply('plan')).rejects.toThrow('Ready');expect(f.engine.execute).not.toHaveBeenCalled()}finally{f.cleanup()}
  })
})
