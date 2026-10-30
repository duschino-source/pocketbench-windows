import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AppSettings, AppState, DiagnosticEvidence, InvestigateRequest, ProgressEvent, RepairPlan, RepairRun, SystemSnapshot } from '../shared/contracts'
import type { WindowsEngine } from './windows'
import type { MeteredModel } from './model'
import { investigate } from './research'
import { runDiagnosticAgent } from './diagnostic-agent'
import { redact } from './model'

export class Controller {
  private snapshot: SystemSnapshot | null = null
  private plans: RepairPlan[] = []
  private history: RepairRun[] = []
  private busy = false
  private file: string
  constructor(private directory: string, private engine: WindowsEngine, private model: MeteredModel, private settings: () => AppSettings, private progress: (event: ProgressEvent) => void) {
    mkdirSync(directory,{recursive:true});this.file=join(directory,'state.json')
    if (existsSync(this.file)) {
      try {
        const saved=JSON.parse(readFileSync(this.file,'utf8'))
        this.history=Array.isArray(saved.history)?saved.history:[]
        for (const run of this.history) if (run.status==='running') { run.status='pending-verification';run.error='The application closed before verification completed. Inspect recorded changes before retrying.' }
      } catch { renameSync(this.file,this.file+'.corrupt-'+Date.now()) }
    }
  }
  private persist() {
    const temporary=this.file+'.tmp'
    writeFileSync(temporary,JSON.stringify({history:this.history.slice(0,200)},null,2),{mode:0o600})
    renameSync(temporary,this.file)
  }
  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('Another operation is in progress. Wait for it to finish.')
    this.busy=true;try { return await action() } finally { this.busy=false }
  }
  async state(): Promise<AppState> { return {snapshot:this.snapshot,plans:this.plans,history:this.history,settings:this.settings(),budget:await this.model.budget()} }
  async scan(): Promise<SystemSnapshot> {
    return this.exclusive(async()=> {
      this.progress({phase:'scan',message:'Reading Windows diagnostics and installed applications…'})
      const snapshot=await this.engine.scan();this.snapshot=snapshot
      const bootTime=Date.now()-snapshot.machine.uptime*1000
      for (const run of this.history.filter(run=>run.status==='pending-verification' && run.finishedAt && Date.parse(run.finishedAt)<bootTime)) {
        const checks=[]
        for (const execution of run.executions) checks.push(await this.engine.verify(execution.step,execution))
        run.verification=checks
        if(checks.length && checks.every(check=>check.passed && !check.pendingReboot))run.status='fixed'
      }
      this.persist();this.progress({phase:'scan',message:'Scan complete. No settings were changed.'});return snapshot
    })
  }
  async investigate(request: InvestigateRequest): Promise<RepairPlan> {
    return this.exclusive(async()=> {
      if (!request || typeof request.symptom!=='string' || request.symptom.trim().length<3 || request.symptom.length>4000) throw new Error('Describe the problem using 3–4000 characters.')
      let snapshot=this.snapshot || await this.engine.scan();this.snapshot=snapshot
      if (request.appId && !snapshot.apps.some(app=>app.id===request.appId)) throw new Error('This application is no longer in the inventory. Scan again.')
      if(!snapshot.labMode && typeof this.model.diagnosticTurn==='function') {
        const selected=snapshot.apps.find(app=>app.id===request.appId)
        const context=JSON.stringify({os:snapshot.machine.os,target:selected?{name:selected.name,version:selected.version}:'Windows',services:snapshot.services.map(service=>({name:service.name,status:service.status,startType:service.startType}))})
        let collected:DiagnosticEvidence[]=[]
        try {
          const diagnostic=await runDiagnosticAgent({symptom:request.symptom,context,appId:request.appId,transport:turn=>this.model.diagnosticTurn(turn),onProgress:this.progress})
          collected=diagnostic.evidence
          if(diagnostic.issues.length)collected.push({id:'diagnostic-issue-'+randomUUID(),area:'windows',category:'diagnostics',title:'Some local checks were unavailable',severity:'info',observed:'Incomplete checks do not establish a Windows fault.',details:diagnostic.issues.map(issue=>redact(issue).slice(0,300)),...(request.appId?{appId:request.appId}:{}),context:{source:'local-read-only-tool',status:'unavailable',readOnly:true}})
        } catch(error) {
          collected=[{id:'diagnostic-issue-'+randomUUID(),area:'windows',category:'diagnostics',title:'Local diagnostic collection was unavailable',severity:'info',observed:'No local tool outcome was assumed.',details:[redact((error as Error).message).slice(0,300)],...(request.appId?{appId:request.appId}:{}),context:{source:'local-read-only-tool',status:'unavailable',readOnly:true}}]
        }
        const base=snapshot.diagnostics.filter(item=>item.context?.source!=='local-read-only-tool' || item.id===request.evidenceId)
        snapshot={...snapshot,diagnostics:[...collected,...base]};this.snapshot=snapshot
      }
      const plan=await investigate(request,snapshot,this.engine.capabilities(snapshot,request.appId),this.model,this.progress)
      try { plan.steps=plan.steps.map(step=>{
        const canonical=this.engine.validateStep(step,this.snapshot!)
        if(canonical.targetId!==step.targetId)throw new Error('Repair parameters do not match the reviewed target. Research again before applying.')
        return canonical
      }) }
      catch (error) { plan.status='blocked';plan.reason=String((error as Error).message);plan.review.approved=false }
      if (!plan.steps.length && plan.status==='ready') { plan.status='needs-validation';plan.reason='No applicable executable repair was established.';plan.review.approved=false }
      this.plans.unshift(plan);this.plans=this.plans.slice(0,50);return plan
    })
  }
  async apply(planId: string): Promise<RepairRun> {
    return this.exclusive(async()=> {
      const plan=this.plans.find(p=>p.id===planId)
      if (!plan || plan.status!=='ready' || !plan.review.approved || !plan.steps.length) throw new Error('Only a stored, reviewed, Ready repair can be applied.')
      if (this.history.some(run=>run.planId===planId && ['running','fixed','pending-verification'].includes(run.status))) throw new Error('This plan has already been applied. Investigate again before making further changes.')
      this.progress({phase:'apply',message:'Rechecking targets and repair preconditions…',planId})
      const fresh=await this.engine.scan()
      const steps=plan.steps.map(step=>this.engine.validateStep(step,fresh))
      for (let i=0;i<steps.length;i++) if (JSON.stringify(steps[i].params)!==JSON.stringify(plan.steps[i].params) || steps[i].requiresAdmin!==plan.steps[i].requiresAdmin || steps[i].reversible!==plan.steps[i].reversible) throw new Error('Repair impact changed after investigation. Research again before applying.')
      const run:RepairRun={id:randomUUID(),planId,title:plan.title,createdAt:new Date().toISOString(),status:'running',executions:[],verification:[],canUndo:false}
      this.history.unshift(run);this.persist()
      try {
        for (const step of steps) {
          this.progress({phase:'apply',message:step.title,planId})
          const execution=await this.engine.execute(step);run.executions.push(execution);this.persist()
          if (!execution.success) throw new Error(execution.output || 'The repair operation failed.')
          this.progress({phase:'verify',message:'Independently checking: '+step.verification,planId})
          const verification=await this.engine.verify(step,execution);run.verification.push(verification);this.persist()
          if (!verification.passed && !verification.pendingReboot) throw new Error(verification.summary)
        }
        run.status=run.verification.some(v=>v.pendingReboot)?'pending-verification':run.verification.every(v=>v.passed)?'fixed':'failed'
      } catch (error) { run.status='failed';run.error=(error as Error).message }
      run.finishedAt=new Date().toISOString()
      run.canUndo=run.executions.length>0 && run.executions.every(e=>e.step.reversible && Boolean(e.backupId) && e.success)
      this.persist();this.snapshot=await this.engine.scan().catch(()=>fresh)
      return run
    })
  }
  async undo(runId: string): Promise<RepairRun> {
    return this.exclusive(async()=> {
      const run=this.history.find(r=>r.id===runId)
      if (!run || !run.canUndo || run.status==='undone') throw new Error('This repair does not have a complete restorable backup.')
      const checks=[]
      for (const execution of [...run.executions].reverse()) {
        this.progress({phase:'undo',message:'Restoring: '+execution.step.title,planId:run.planId})
        const check=await this.engine.undo(execution);checks.push(check)
        if (!check.passed) { run.error=check.summary;this.persist();throw new Error(check.summary) }
      }
      run.status='undone';run.canUndo=false;run.verification=checks;this.persist();this.snapshot=await this.engine.scan();return run
    })
  }
}
