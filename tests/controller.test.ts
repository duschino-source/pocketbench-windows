import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Controller } from '../src/main/controller'
import type { RepairPlan, RepairStep, SystemSnapshot } from '../src/shared/contracts'

vi.mock('../src/main/research',()=>({investigate:vi.fn()}))
vi.mock('../src/main/diagnostic-agent',()=>({runDiagnosticAgent:vi.fn()}))
vi.mock('../src/main/diagnostics',async importOriginal=>{const actual=await importOriginal<typeof import('../src/main/diagnostics')>();return {...actual,createDiagnosticTools:vi.fn()}})
vi.mock('../src/main/local-investigation',async importOriginal=>{const actual=await importOriginal<typeof import('../src/main/local-investigation')>();return {...actual,createLocalInvestigation:vi.fn((...args:Parameters<typeof actual.createLocalInvestigation>)=>actual.createLocalInvestigation(...args))}})
import { investigate } from '../src/main/research'
import { runDiagnosticAgent } from '../src/main/diagnostic-agent'
import { createDiagnosticTools } from '../src/main/diagnostics'
import { createLocalInvestigation } from '../src/main/local-investigation'
const localMock = vi.mocked(createLocalInvestigation)
beforeEach(async()=>{const actual=await vi.importActual<typeof import('../src/main/local-investigation')>('../src/main/local-investigation');localMock.mockReset();localMock.mockImplementation((...args:Parameters<typeof actual.createLocalInvestigation>)=>actual.createLocalInvestigation(...args));vi.mocked(runDiagnosticAgent).mockReset();vi.mocked(investigate).mockReset();vi.mocked(createDiagnosticTools).mockReset();vi.mocked(investigate).mockResolvedValue(structuredClone(plan)) })

const step:RepairStep={id:'step',operation:'windows.clearUserProxy',title:'Clear stale proxy',targetId:'windows',params:{},requiresAdmin:false,reversible:true,impact:'Changes user proxy',verification:'Proxy is disabled'}
const plan:RepairPlan={id:'plan',createdAt:new Date().toISOString(),title:'Repair connection',summary:'Diagnosed proxy issue',target:{kind:'windows',name:'Windows'},status:'ready',reason:'Verified applicable',evidence:[],sources:[],steps:[step],review:{approved:true,rationale:'Applicable',concerns:[]}}
const snapshot:SystemSnapshot={scannedAt:new Date().toISOString(),platform:'win32',machine:{name:'test',os:'Windows',memoryTotal:1,memoryFree:1,uptime:1,cpuCount:1},metrics:{diskFree:1,diskTotal:1,cpuPercent:null},diagnostics:[],apps:[],startup:[],services:[],labMode:true}
function fixture(verifyPassed:boolean,labMode=true,hasApiKey=true) {
  const dir=mkdtempSync(join(tmpdir(),'pocketbench-controller-'))
  const engine={scan:vi.fn(async()=>({...snapshot,labMode})),capabilities:vi.fn(()=>[]),validateStep:vi.fn((s:RepairStep)=>s),execute:vi.fn(async(s:RepairStep)=>({step:s,startedAt:'now',finishedAt:'now',success:true,output:'command exited zero',backupId:'backup',data:{}})),verify:vi.fn(async()=>({passed:verifyPassed,summary:verifyPassed?'Verified':'The proxy is still enabled',checks:[{name:'Proxy disabled',passed:verifyPassed}]})),undo:vi.fn(async()=>({passed:true,summary:'Restored',checks:[{name:'Original proxy restored',passed:true}]}))}
  const model={budget:async()=>({limit:90,spent:0,reserved:0,remaining:90,requests:0})}
  const controller=new Controller(dir,engine as any,model as any,()=>({hasApiKey,budgetLimit:90,model:'muse-spark-1.3',labMode,dataDirectory:dir}),()=>{})
  vi.mocked(investigate).mockResolvedValue(structuredClone(plan))
  return {controller,engine,model,cleanup:()=>rmSync(dir,{recursive:true,force:true})}
}
describe('repair workflow authority',()=>{
  it('publishes partial scans, cancels only read-only scans, and holds the busy lock until cancellation settles',async()=>{
    const f=fixture(true)
    let signal:AbortSignal|undefined
    f.engine.scan.mockImplementation(((partial:(s:SystemSnapshot)=>void,abort:AbortSignal)=>new Promise((_resolve,reject)=>{
      signal=abort;partial({...snapshot,apps:[]})
      abort.addEventListener('abort',()=>reject(new Error('Scan cancelled')),{once:true})
    })) as any)
    try {
      const pending=f.controller.scan()
      expect(f.controller.isBusy()).toBe(true)
      expect((await f.controller.state()).snapshot).not.toBeNull()
      f.controller.cancelOperation()
      expect(signal?.aborted).toBe(true)
      await expect(pending).rejects.toThrow('cancelled')
      expect(f.controller.isBusy()).toBe(false)
      expect(()=>f.controller.cancelOperation()).toThrow('cannot be stopped')
    } finally {f.cleanup()}
  })
  it('collects local tool evidence before research without granting mutation authority',async()=>{
    const f=fixture(true,false)
    Object.assign(f.model,{diagnosticTurn:vi.fn()})
    const evidence={id:'local-network',area:'windows' as const,category:'network',title:'Network probe',severity:'info' as const,observed:'DNS resolved; HTTPS returned 200.',details:['Collected by a read-only probe.'],context:{source:'local-read-only-tool',tool:'windows_network',readOnly:true}}
    vi.mocked(runDiagnosticAgent).mockResolvedValue({evidence:[evidence],rounds:2,toolCalls:1,summary:'',issues:[]})
    try {
      await f.controller.investigate({symptom:'Internet fails'})
      expect(runDiagnosticAgent).toHaveBeenCalled()
      expect(vi.mocked(investigate).mock.calls.at(-1)?.[1].diagnostics[0]).toEqual(evidence)
      expect(f.engine.execute).not.toHaveBeenCalled()
    }finally{f.cleanup()}
  })
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
describe('structured local investigation',()=>{
  function localFixture(services:any[],hasApiKey:boolean,apps:any[]=[]) {
    vi.mocked(createDiagnosticTools).mockReturnValue({invoke:vi.fn()} as any)
    localMock.mockReset()
    const dir=mkdtempSync(join(tmpdir(),'pocketbench-structured-'))
    const tools={invoke:vi.fn()}
    const base:SystemSnapshot={...snapshot,labMode:false,apps,services:services as any}
    const engine={scan:vi.fn(async()=>structuredClone(base)),capabilities:vi.fn(()=>[]),validateStep:vi.fn((s:RepairStep)=>s),execute:vi.fn(async(s:RepairStep)=>({step:s,startedAt:'now',finishedAt:'now',success:true,output:'ok',backupId:'backup',data:{}})),verify:vi.fn(async()=>({passed:true,summary:'ok',checks:[]})),undo:vi.fn(async()=>({passed:true,summary:'ok',checks:[]}))}
    const model={budget:async()=>({limit:90,spent:0,reserved:0,remaining:90,requests:0}),diagnosticTurn:vi.fn()}
    const controller=new Controller(dir,engine as any,model as any,()=>({hasApiKey,budgetLimit:90,model:'muse-spark-1.3',labMode:false,dataDirectory:dir}),()=>{})
    return {controller,engine,model,tools,toolsFactory:tools,cleanup:()=>rmSync(dir,{recursive:true,force:true})}
  }
  function offlineCandidate():RepairPlan {
    const step:RepairStep={id:'offline-step',operation:'windows.startService',title:'Start Dnscache',targetId:'Dnscache',params:{serviceName:'Dnscache'},requiresAdmin:true,reversible:true,impact:'Starts service',verification:'Service running'}
    return {id:'offline',createdAt:new Date().toISOString(),title:'Offline candidate: start Dnscache',summary:'candidate',target:{kind:'windows',name:'Windows'},status:'needs-validation',reason:'candidate',evidence:[],sources:[],steps:[step],review:{approved:false,rationale:'candidate',concerns:[]}}
  }
  it('promotes a fresh valid service candidate to Ready but never executes until apply',async()=>{
    const f=localFixture([{name:'Dnscache',status:'stopped',startType:'auto',triggerStart:false}],true)
    try {
      vi.mocked(createLocalInvestigation).mockReturnValue({cache:{} as any,investigate:vi.fn(async()=>({category:'network' as const,route:{category:'network' as const,calls:[]},results:[],evidence:[],unavailable:[],cacheHits:0,plan:offlineCandidate()}))} as any)
      const result=await f.controller.investigate({symptom:'Internet DNS fails',category:'connectivity'})
      expect(result.status).toBe('ready');expect(result.review.approved).toBe(true)
      expect(f.engine.execute).not.toHaveBeenCalled()
    } finally{f.cleanup()}
  })
  it('cannot promote a partial or stale candidate',async()=>{
    const f=localFixture([{name:'Dnscache',status:'running',startType:'auto',triggerStart:false}],false)
    try {
      vi.mocked(createLocalInvestigation).mockReturnValue({cache:{} as any,investigate:vi.fn(async()=>({category:'network' as const,route:{category:'network' as const,calls:[]},results:[],evidence:[{id:'e',area:'windows' as const,category:'network',title:'t',severity:'info' as const,observed:'o',details:['d'],context:{source:'local-read-only-tool'}}],unavailable:[],cacheHits:0,plan:offlineCandidate()}))} as any)
      const result=await f.controller.investigate({symptom:'Internet DNS fails',category:'connectivity'})
      expect(result.status).toBe('needs-validation');expect(result.steps).toHaveLength(0);expect(result.review.approved).toBe(false)
      expect(f.engine.execute).not.toHaveBeenCalled()
    } finally{f.cleanup()}
  })
  it('never probes unrelated families for unknown or unsupported apps',async()=>{
    const f=localFixture([],false,[{id:'mystery',name:'Mystery',version:'1',family:'other' as any,installDate:null,capabilities:[]},{id:'known',name:'Known',version:'1',family:'firefox' as any,installDate:null,capabilities:[]}])
    try {
      const spy=vi.fn(async()=>({category:'app' as const,route:{category:'app' as const,calls:[]},results:[],evidence:[],unavailable:['app_health'],cacheHits:0,plan:null}))
      vi.mocked(createLocalInvestigation).mockReturnValue({cache:{} as any,investigate:spy} as any)
      const unknown=await f.controller.investigate({symptom:'Mystery app crashes',category:'app',appId:'mystery'})
      expect(unknown.status).toBe('needs-validation');expect(spy).not.toHaveBeenCalled()
      expect(unknown.evidence[0]?.context).toMatchObject({source:'local-read-only-tool',status:'unavailable'})
      vi.mocked(investigate).mockResolvedValue(structuredClone(plan))
      const noTarget=await f.controller.investigate({symptom:'App crashes',category:'app'})
      expect(noTarget.evidence[0]?.context).toMatchObject({status:'unavailable'})
      expect(spy).not.toHaveBeenCalled()
      expect(f.engine.execute).not.toHaveBeenCalled()
    } finally{f.cleanup()}
  })
  it('routes uncategorized symptoms structurally and never calls the diagnostic model without a key',async()=>{
    const f=localFixture([{name:'Dnscache',status:'running',startType:'auto',triggerStart:false}],false)
    try {
      const spy=vi.fn(async()=>({category:'network' as const,route:{category:'network' as const,calls:[{name:'windows_network',args:{hostname:'www.microsoft.com'}}]},results:[],evidence:[],unavailable:[],cacheHits:0,plan:null}))
      localMock.mockReturnValue({cache:{} as any,investigate:spy} as any)
      const result=await f.controller.investigate({symptom:'Internet DNS fails everywhere'})
      expect(spy).toHaveBeenCalledOnce()
      expect((spy.mock.calls as unknown[][])[0][0]).toMatchObject({category:'network'})
      expect(f.model.diagnosticTurn).not.toHaveBeenCalled()
      expect(vi.mocked(runDiagnosticAgent)).not.toHaveBeenCalled()
      expect(result.status).toBe('needs-validation');expect(result.steps).toHaveLength(0)
    } finally{f.cleanup()}
  })
  it('never promotes a trigger-start service even when a local candidate exists',async()=>{
    const f=localFixture([{name:'Dnscache',displayName:'DNS Client',status:'Stopped',startType:'Auto',triggerStart:true}],false)
    try {
      vi.mocked(createLocalInvestigation).mockReturnValue({cache:{} as any,investigate:vi.fn(async()=>({category:'network' as const,route:{category:'network' as const,calls:[{name:'windows_network',args:{hostname:'www.microsoft.com'}},{name:'windows_service',args:{serviceName:'Dnscache',hours:2,maxEvents:3}}]},results:[],evidence:[],unavailable:[],cacheHits:0,plan:offlineCandidate()}))} as any)
      const result=await f.controller.investigate({symptom:'Internet DNS fails',category:'connectivity'})
      expect(result.status).toBe('needs-validation');expect(result.steps).toHaveLength(0);expect(result.review.approved).toBe(false)
      expect(f.engine.execute).not.toHaveBeenCalled()
      expect(JSON.stringify(result)).not.toMatch(/Start-Service|sc\.exe|powershell|cmd\.exe/i)
    } finally{f.cleanup()}
  })
})
describe('offline deterministic category local checks (no API key)',()=>{
  const networkEvidenceTs=()=>new Date().toISOString()
  function offlineTools(serviceData:Record<string,unknown>,timestamp?:string) {
    const invoked:string[]=[]
    const ts=timestamp ?? networkEvidenceTs()
    vi.mocked(createDiagnosticTools).mockReturnValue({invoke:vi.fn(async(name:string)=>{
      invoked.push(name)
      if(name==='windows_network')return {tool:name,timestamp:ts,scope:'network:www.microsoft.com',status:'ok',observations:['DNS resolved; HTTPS returned 200.'],data:{hostname:'www.microsoft.com'}} as any
      if(name==='windows_service')return {tool:name,timestamp:ts,scope:'service:Dnscache',status:'ok',observations:['Service Dnscache status: Stopped (start mode Auto).'],data:{serviceName:'Dnscache',status:'Stopped',startMode:'Auto',...serviceData}} as any
      return {tool:name,timestamp:ts,scope:name,status:'unavailable',observations:['Unavailable.'],data:{}} as any
    })} as any)
    return {invoked}
  }
  function offlineSnapshot(service:{status:string;startType:string;triggerStart?:boolean}): SystemSnapshot {
    return {...snapshot,labMode:false,services:[{name:'Dnscache',displayName:'DNS Client',status:service.status,startType:service.startType,...(service.triggerStart===undefined?{}:{triggerStart:service.triggerStart})}]}
  }
  it('promotes a fresh stopped automatic non-trigger service without an API key',async()=>{
    const f=fixture(true,false,false)
    try {
      vi.mocked(investigate).mockClear();vi.mocked(investigate).mockResolvedValue(structuredClone(plan))
      const tools=offlineTools({triggerStart:false})
      f.engine.scan.mockResolvedValue(offlineSnapshot({status:'Stopped',startType:'Auto',triggerStart:false}))
      const result=await f.controller.investigate({symptom:'Internet DNS fails',category:'connectivity'})
      expect(tools.invoked).toEqual(['windows_network','windows_service'])
      expect(result.status).toBe('ready')
      expect(result.review.approved).toBe(true)
      expect(result.steps).toHaveLength(1)
      expect(result.steps[0]).toMatchObject({operation:'windows.startService',targetId:'Dnscache',params:{serviceName:'Dnscache'}})
      expect(f.engine.scan.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(vi.mocked(investigate)).not.toHaveBeenCalled()
      expect(f.engine.execute).not.toHaveBeenCalled()
      expect(JSON.stringify(result)).not.toMatch(/Start-Service|sc\.exe|powershell|cmd\.exe/i)
    } finally {f.cleanup()}
  })
  it('rejects trigger-start services and reports no offline repair without executing',async()=>{
    const f=fixture(true,false,false)
    try {
      vi.mocked(investigate).mockClear();vi.mocked(investigate).mockResolvedValue(structuredClone(plan))
      const tools=offlineTools({triggerStart:true})
      f.engine.scan.mockResolvedValue(offlineSnapshot({status:'Stopped',startType:'Auto',triggerStart:true}))
      const result=await f.controller.investigate({symptom:'Internet DNS fails',category:'connectivity'})
      expect(tools.invoked).toEqual(['windows_network','windows_service'])
      expect(result.status).toBe('needs-validation')
      expect(result.steps).toHaveLength(0)
      expect(result.review.approved).toBe(false)
      expect(vi.mocked(investigate)).not.toHaveBeenCalled()
      expect(f.engine.execute).not.toHaveBeenCalled()
    } finally {f.cleanup()}
  })
  it('never auto-offers manual-start services and rejects stale observations',async()=>{
    const f=fixture(true,false,false)
    try {
      vi.mocked(investigate).mockClear();vi.mocked(investigate).mockResolvedValue(structuredClone(plan))
      const tools=offlineTools({triggerStart:false})
      f.engine.scan.mockResolvedValue(offlineSnapshot({status:'Stopped',startType:'Manual'}))
      vi.mocked(createDiagnosticTools).mockReturnValue({invoke:vi.fn(async(name:string)=>{
        tools.invoked.push(name+'-manual')
        const ts=networkEvidenceTs()
        if(name==='windows_network')return {tool:name,timestamp:ts,scope:'network:www.microsoft.com',status:'ok',observations:['DNS resolved.'],data:{}} as any
        return {tool:name,timestamp:ts,scope:'service:Dnscache',status:'ok',observations:['Service Dnscache status: Stopped (start mode Manual).'],data:{serviceName:'Dnscache',status:'Stopped',startMode:'Manual'}} as any
      })} as any)
      const manual=await f.controller.investigate({symptom:'Internet DNS fails',category:'connectivity'})
      expect(manual.status).toBe('needs-validation')
      expect(manual.steps).toHaveLength(0)
      const staleTs=new Date(Date.now()-10*60*1000).toISOString()
      offlineTools({triggerStart:false},staleTs)
      f.engine.scan.mockResolvedValue(offlineSnapshot({status:'Stopped',startType:'Auto',triggerStart:false}))
      const stale=await f.controller.investigate({symptom:'Internet DNS fails',category:'connectivity'})
      expect(stale.status).toBe('needs-validation')
      expect(stale.steps).toHaveLength(0)
      expect(f.engine.execute).not.toHaveBeenCalled()
    } finally {f.cleanup()}
  })
  it('requires fresh stopped state before promotion',async()=>{
    const f=fixture(true,false,false)
    try {
      vi.mocked(investigate).mockClear();vi.mocked(investigate).mockResolvedValue(structuredClone(plan))
      const tools=offlineTools({triggerStart:false})
      f.engine.scan.mockResolvedValue(offlineSnapshot({status:'Running',startType:'Auto',triggerStart:false}))
      const result=await f.controller.investigate({symptom:'Internet DNS fails',category:'connectivity'})
      expect(tools.invoked).toEqual(['windows_network','windows_service'])
      expect(result.status).toBe('needs-validation')
      expect(result.steps).toHaveLength(0)
      expect(f.engine.execute).not.toHaveBeenCalled()
    } finally {f.cleanup()}
  })
})
describe('model call budgets',()=>{
  it('legacy uncategorized with key: 1 local + 1 diagnostic agent + 1 research model',async()=>{
    const f=fixture(true,false,true)
    try {
      Object.assign(f.model,{diagnosticTurn:vi.fn()})
      const localSpy=vi.fn(async()=>({category:'network' as const,route:{category:'network' as const,calls:[]},results:[],evidence:[],unavailable:[],cacheHits:0,plan:null}))
      localMock.mockReturnValue({cache:{} as any,investigate:localSpy} as any)
      vi.mocked(runDiagnosticAgent).mockResolvedValue({evidence:[],rounds:1,toolCalls:1,summary:'legacy',issues:[]})
      vi.mocked(investigate).mockResolvedValue(structuredClone(plan))
      await f.controller.investigate({symptom:'Internet DNS fails everywhere'})
      expect(localSpy).toHaveBeenCalledTimes(1)
      expect(vi.mocked(runDiagnosticAgent)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(investigate)).toHaveBeenCalledTimes(1)
    } finally{f.cleanup()}
  })
  it('structured categorized with key but no candidate: 1 local + 0 agent + 1 research',async()=>{
    const f=fixture(true,false,true)
    try {
      const localSpy=vi.fn(async()=>({category:'network' as const,route:{category:'network' as const,calls:[]},results:[],evidence:[],unavailable:[],cacheHits:0,plan:null}))
      localMock.mockReturnValue({cache:{} as any,investigate:localSpy} as any)
      vi.mocked(investigate).mockResolvedValue(structuredClone(plan))
      await f.controller.investigate({symptom:'Internet DNS fails',category:'connectivity'})
      expect(localSpy).toHaveBeenCalledTimes(1)
      expect(vi.mocked(runDiagnosticAgent)).not.toHaveBeenCalled()
      expect(vi.mocked(investigate)).toHaveBeenCalledTimes(1)
    } finally{f.cleanup()}
  })
  it('offline no-key with promotion or report: 1 local + 0 agent + 0 research',async()=>{
    const f=fixture(true,false,false)
    try {
      const localSpy=vi.fn(async()=>({category:'network' as const,route:{category:'network' as const,calls:[]},results:[],evidence:[{id:'e',area:'windows' as const,category:'network',title:'t',severity:'info' as const,observed:'o',details:['d'],context:{source:'local-read-only-tool'}}],unavailable:[],cacheHits:0,plan:null}))
      localMock.mockReturnValue({cache:{} as any,investigate:localSpy} as any)
      vi.mocked(investigate).mockResolvedValue(structuredClone(plan))
      const result=await f.controller.investigate({symptom:'Internet DNS fails',category:'connectivity'})
      expect(localSpy).toHaveBeenCalledTimes(1)
      expect(vi.mocked(runDiagnosticAgent)).not.toHaveBeenCalled()
      expect(vi.mocked(investigate)).not.toHaveBeenCalled()
      expect(result.status).toBe('needs-validation')
    } finally{f.cleanup()}
  })
})
