import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AppSettings, AppState, DiagnosticEvidence, InvestigateRequest, ProgressEvent, RepairPlan, RepairRun, SystemSnapshot } from '../shared/contracts'
import { hasPendingUndo, isRestored, isUndoEligible } from '../shared/contracts'
import type { WindowsEngine } from './windows'
import type { MeteredModel } from './model'
import { investigate } from './research'
import { runDiagnosticAgent } from './diagnostic-agent'
import { redact } from './model'
import { createDiagnosticTools } from './diagnostics'
import type { AppFamily } from './diagnostics'
import { createLocalInvestigation, OFFLINE_OBSERVATION_MAX_AGE_MS } from './local-investigation'
import { classifySymptomCategory } from '../shared/investigation'

export class Controller {
  private snapshot: SystemSnapshot | null = null
  private plans: RepairPlan[] = []
  private restoredPlans = new Set<string>()
  private history: RepairRun[] = []
  private busy = false
  private scanAbort:AbortController|null=null
  private startedAt:string|undefined
  isBusy():boolean {return this.busy}
  cancelOperation():void {
    if(!this.scanAbort)throw new Error("This operation cannot be stopped safely. Wait for verification to finish.")
    this.scanAbort.abort()
  }
  private progress(event:ProgressEvent):void {
    this.emitProgress({...event,startedAt:this.startedAt,cancellable:Boolean(this.scanAbort),cancellationReason:this.scanAbort?undefined:"This operation must finish before changes or updates can proceed."})
  }
  private file: string
  constructor(private directory: string, private engine: WindowsEngine, private model: MeteredModel, private settings: () => AppSettings, private emitProgress: (event: ProgressEvent) => void) {
    mkdirSync(directory,{recursive:true});this.file=join(directory,'state.json')
    if (existsSync(this.file)) {
      try {
        const saved=JSON.parse(readFileSync(this.file,'utf8'))
        this.plans=Array.isArray(saved.plans)?saved.plans.filter((plan:RepairPlan)=>plan && typeof plan.id==='string' && Array.isArray(plan.steps) && plan.review && Array.isArray(plan.sources) && Array.isArray(plan.evidence)).slice(0,50):[]
        for(const plan of this.plans)if(plan.status==='ready' || (plan.status==='needs-validation' && plan.review.approved && plan.steps.length>0)) { this.restoredPlans.add(plan.id);plan.status='needs-validation';plan.reason='Scan this PC to recheck saved targets and values before applying.' }
        this.history=Array.isArray(saved.history)?saved.history:[]
        for (const run of this.history) {
          if (run.status==='running') { run.status='pending-verification';run.error='The application closed before verification completed. Inspect recorded changes before retrying.' }
          // Recompute eligibility so older records also benefit from partial
          // recovery, without re-offering a run that was fully undone.
          run.canUndo=hasPendingUndo(run)
        }
      } catch { renameSync(this.file,this.file+'.corrupt-'+Date.now()) }
    }
  }
  private persist() {
    const temporary=this.file+'.tmp'
    writeFileSync(temporary,JSON.stringify({history:this.history.slice(0,200),plans:this.plans.slice(0,50)},null,2),{mode:0o600})
    renameSync(temporary,this.file)
  }
  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('Another operation is in progress. Wait for it to finish.')
    this.busy=true;this.startedAt=new Date().toISOString();try { return await action() } finally { this.busy=false;this.scanAbort=null;this.startedAt=undefined }
  }
  async state(): Promise<AppState> { return {snapshot:this.snapshot,plans:this.plans,history:this.history,settings:this.settings(),budget:await this.model.budget()} }  async scan(): Promise<SystemSnapshot> {
    return this.exclusive(async()=> {
      this.scanAbort=new AbortController()
      this.progress({phase:'scan',message:'Reading Windows health…'})
      const snapshot=await this.engine.scan(partial=>{
        this.snapshot=partial
        this.progress({phase:'scan',message:'Windows findings are ready. Checking installed app repair capabilities…',snapshot:partial})
      },this.scanAbort.signal);this.snapshot=snapshot
      for(const plan of this.plans.filter(plan=>this.restoredPlans.has(plan.id))) {
        try {
          for(const step of plan.steps) {
            const canonical=this.engine.validateStep(step,snapshot)
            if(JSON.stringify(canonical.params)!==JSON.stringify(step.params) || canonical.targetId!==step.targetId || canonical.requiresAdmin!==step.requiresAdmin || canonical.reversible!==step.reversible)throw new Error('The repair target or impact changed.')
            if(typeof this.engine.previewStep==='function' && JSON.stringify(await this.engine.previewStep(canonical,snapshot))!==JSON.stringify(step.preview))throw new Error('A current setting changed since this plan was reviewed.')
          }
          plan.status='ready';plan.reason='Saved research rechecked against current local values.'
        } catch(error) {plan.status='blocked';plan.reason=`Saved plan needs fresh research: ${(error as Error).message}`;plan.review.approved=false}
        this.restoredPlans.delete(plan.id)
      }
      this.scanAbort=null
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
      if(request.category && !['performance','connectivity','updates','app'].includes(request.category))throw new Error('Unknown symptom category.')
      let snapshot=this.snapshot || await this.engine.scan();this.snapshot=snapshot
      if (request.appId && !snapshot.apps.some(app=>app.id===request.appId)) throw new Error('This application is no longer in the inventory. Scan again.')
      let localPlan:RepairPlan|null=null
      const structuredCategory = request.category
        ? (request.category==='connectivity'?'network':request.category)
        : (!snapshot.labMode ? (():string=>{const classified=classifySymptomCategory(request.symptom,request.appId);return classified==='connectivity'?'network':classified})() : undefined)
      if(structuredCategory && !snapshot.labMode) {
        const selected=snapshot.apps.find(app=>app.id===request.appId)
        this.progress({phase:'research',message:'Running focused local checks before AI research...'})
        let local:{evidence:DiagnosticEvidence[];unavailable:string[];plan:RepairPlan|null}
        if(structuredCategory==='app' && (!selected || selected.family==='other')) {
          const observation:DiagnosticEvidence={id:'local-app-unavailable',area:'app',category:'app',title:'Read-only application health observations',severity:'info',observed:'The selected application family is not supported by a read-only probe. No unrelated application was inspected.',details:['No applicable offline repair was established.'],...(request.appId?{appId:request.appId}:{}),context:{source:'local-read-only-tool',tool:'app_health',status:'unavailable',readOnly:true}}
          local={evidence:[observation],unavailable:['app_health'],plan:null}
          snapshot={...snapshot,diagnostics:[observation,...snapshot.diagnostics.filter(item=>item.context?.source!=='local-read-only-tool')]};this.snapshot=snapshot
        } else {
          const family:AppFamily|null|undefined = selected?.family==='other' ? null : selected?.family as AppFamily|undefined
          const investigated=await createLocalInvestigation({tools:createDiagnosticTools()}).investigate({category:structuredCategory as 'performance'|'network'|'updates'|'app',appId:request.appId,appFamily:family})
          snapshot={...snapshot,diagnostics:[...investigated.evidence,...snapshot.diagnostics.filter(item=>item.context?.source!=='local-read-only-tool')]};this.snapshot=snapshot
          local={evidence:investigated.evidence,unavailable:investigated.unavailable,plan:investigated.plan}
        }
        localPlan=local.plan
        if(localPlan) {
          const fresh=await this.engine.scan();snapshot={...fresh,diagnostics:[...local.evidence,...fresh.diagnostics.filter(item=>item.context?.source!=='local-read-only-tool')]};this.snapshot=snapshot
          const step=localPlan.steps[0]
          const service=fresh.services.find(service=>service.name===step.targetId)
          const app=fresh.apps.find(item=>item.id===step.targetId)
          const validService=step.operation==='windows.startService' && service?.status.toLowerCase()==='stopped' && /^(auto|automatic)$/i.test(service.startType) && service.triggerStart!==true
          const validProxy=step.operation==='windows.clearUserProxy' && fresh.diagnostics.some(d=>d.id==='windows-proxy') && this.engine.capabilities(fresh).some(c=>c.operation==='windows.clearUserProxy')
          const validAppConfig=step.operation==='app.patchConfig' && Boolean(app && app.capabilities.includes('app.patchConfig') && fresh.diagnostics.some(d=>d.id==='firefox-proxy-'+app.id || d.id==='obsidian-theme-'+app.id))
          if(validService || validProxy || validAppConfig) {
            localPlan.steps=[this.engine.validateStep(step,fresh)]
            localPlan.status='ready';localPlan.reason=validService?'A tested local rule matched a stopped automatic service. Apply fix starts only this service.':validProxy?'A tested local rule matched an active manual user proxy. Apply fix clears the proxy with a restorable backup.':'A tested local rule matched a supported application configuration issue. Apply fix backs up and resets only this setting.'
            localPlan.review={approved:true,rationale:'Local catalog rule and fresh native preconditions validated; independent verification remains required.',concerns:[]}
          } else localPlan=null
        }
        if(!localPlan && !this.settings().hasApiKey) localPlan={id:randomUUID(),createdAt:new Date().toISOString(),title:'Local checks complete',summary:'Review the local observations. No applicable offline repair was established.',target:{kind:request.appId?'app':'windows',id:request.appId,name:selected?.name||'Windows'},status:'needs-validation',reason:'Connect Meta for deeper research. No change is authorized by these observations.',evidence:local.evidence,sources:[],steps:[],review:{approved:false,rationale:'No tested offline rule matched.',concerns:local.unavailable}}
      }
      if(!request.category && !snapshot.labMode && this.settings().hasApiKey && typeof this.model.diagnosticTurn==='function') {
        const selected=snapshot.apps.find(app=>app.id===request.appId)
        const context=JSON.stringify({os:snapshot.machine.os,target:selected?{name:selected.name,version:selected.version}:'Windows',services:snapshot.services.map(service=>({name:service.name,status:service.status,startType:service.startType}))})
        let collected:DiagnosticEvidence[]=[]
        try {
          const diagnostic=await runDiagnosticAgent({symptom:request.symptom,context,appId:request.appId,transport:turn=>this.model.diagnosticTurn(turn),onProgress:event=>this.progress(event)})
          collected=diagnostic.evidence
          if(diagnostic.issues.length)collected.push({id:'diagnostic-issue-'+randomUUID(),area:'windows',category:'diagnostics',title:'Some local checks were unavailable',severity:'info',observed:'Incomplete checks do not establish a Windows fault.',details:diagnostic.issues.map(issue=>redact(issue).slice(0,300)),...(request.appId?{appId:request.appId}:{}),context:{source:'local-read-only-tool',status:'unavailable',readOnly:true}})
        } catch(error) {
          collected=[{id:'diagnostic-issue-'+randomUUID(),area:'windows',category:'diagnostics',title:'Local diagnostic collection was unavailable',severity:'info',observed:'No local tool outcome was assumed.',details:[redact((error as Error).message).slice(0,300)],...(request.appId?{appId:request.appId}:{}),context:{source:'local-read-only-tool',status:'unavailable',readOnly:true}}]
        }
        const base=snapshot.diagnostics.filter(item=>item.context?.source!=='local-read-only-tool' || item.id===request.evidenceId)
        snapshot={...snapshot,diagnostics:[...collected,...base]};this.snapshot=snapshot
      }
      const plan=localPlan || await investigate(request,snapshot,this.engine.capabilities(snapshot,request.appId),this.model,event=>this.progress(event))
      try { plan.steps=plan.steps.map(step=>{
        const canonical=this.engine.validateStep(step,this.snapshot!)
        if(canonical.targetId!==step.targetId)throw new Error('Repair parameters do not match the reviewed target. Research again before applying.')
        return canonical
      }) }
      catch (error) { plan.status='blocked';plan.reason=String((error as Error).message);plan.review.approved=false }
      if(plan.status==='ready' && typeof this.engine.previewStep==='function') {
        try { for(const step of plan.steps) step.preview=await this.engine.previewStep(step,this.snapshot!) }
        catch(error) {plan.status='blocked';plan.reason=`Current values could not be read: ${(error as Error).message}`;plan.review.approved=false}
      }
      if (!plan.steps.length && plan.status==='ready') { plan.status='needs-validation';plan.reason='No applicable executable repair was established.';plan.review.approved=false }
      this.plans.unshift(plan);this.plans=this.plans.slice(0,50);this.persist();return plan
    })
  }
  async apply(planId: string): Promise<RepairRun> {
    return this.exclusive(async()=> {
      const plan=this.plans.find(p=>p.id===planId)
      if (!plan || plan.status!=='ready' || !plan.review.approved || !plan.steps.length) throw new Error('Only a stored, reviewed, Ready repair can be applied.')
      if (this.history.some(run=>run.planId===planId && ['running','fixed','pending-verification','partially-undone'].includes(run.status))) throw new Error('This plan has already been applied. Investigate again before making further changes.')
      this.progress({phase:'apply',message:'Rechecking targets and repair preconditions…',planId})
      const fresh=await this.engine.scan()
      const steps=plan.steps.map(step=>this.engine.validateStep(step,fresh))
      for (let i=0;i<steps.length;i++) if (JSON.stringify(steps[i].params)!==JSON.stringify(plan.steps[i].params) || steps[i].requiresAdmin!==plan.steps[i].requiresAdmin || steps[i].reversible!==plan.steps[i].reversible) { plan.status='needs-validation';plan.reason='Repair impact changed after investigation. Research again before applying.';plan.review.approved=false;this.persist();throw new Error(plan.reason) }
      if(typeof this.engine.previewStep==='function')for(let i=0;i<steps.length;i++){const currentPreview=await this.engine.previewStep(steps[i],fresh);if(JSON.stringify(currentPreview)!==JSON.stringify(plan.steps[i].preview)){plan.steps[i].preview=currentPreview;plan.status='needs-validation';plan.reason='A setting changed since review. Investigate again before applying.';plan.review.approved=false;this.persist();throw new Error(plan.reason)}}
      const run:RepairRun={id:randomUUID(),planId,title:plan.title,createdAt:new Date().toISOString(),status:'running',executions:[],verification:[],canUndo:false}
      this.history.unshift(run);this.persist()
      try {
        for (const step of steps) {
          this.progress({phase:'apply',message:step.title,planId})
          const execution=await this.engine.execute(step,(message,percent)=>this.progress({phase:'apply',message,percent,planId}));run.executions.push(execution);this.persist()
          if (!execution.success) throw new Error(execution.output || 'The repair operation failed.')
          this.progress({phase:'verify',message:'Independently checking: '+step.verification,planId})
          const verification=await this.engine.verify(step,execution);run.verification.push(verification);this.persist()
          if (!verification.passed && !verification.pendingReboot) throw new Error(verification.summary)
        }
        run.status=run.verification.some(v=>v.pendingReboot)?'pending-verification':run.verification.every(v=>v.passed)?'fixed':'failed'
      } catch (error) { run.status='failed';run.error=(error as Error).message }
      run.finishedAt=new Date().toISOString()
      run.canUndo=run.executions.some(isUndoEligible)
      this.persist();this.snapshot=await this.engine.scan().catch(()=>fresh)
      return run
    })
  }
  async undo(runId: string): Promise<RepairRun> {
    return this.exclusive(async()=> {
      const run=this.history.find(r=>r.id===runId)
      if (!run) throw new Error('This repair does not have a restorable backup.')
      if (run.status==='undone') throw new Error('This repair has already been undone.')
      const eligible=run.executions.filter(isUndoEligible)
      if (!eligible.length) throw new Error('This repair does not have a restorable backup.')
      const previouslyFailedUndo=run.undoError
      // Restore in reverse order. Completed restorations are durable and are
      // always skipped, so a retry only revisits steps that have not succeeded.
      const pending=[...run.executions].reverse().filter(execution=>isUndoEligible(execution) && !isRestored(execution));if (!pending.length) throw new Error('This repair has already been undone.')
      let failure:string|undefined
      for (const execution of pending) {
        this.progress({phase:'undo',message:'Restoring: '+execution.step.title,planId:run.planId})
        try {
          const check=await this.engine.undo(execution)
          execution.restoration={status:check.passed?'restored':'failed',finishedAt:new Date().toISOString(),summary:check.summary,checks:check.checks}
          this.persist()
          if (!check.passed) { failure=check.summary;break }
        } catch(error) {
          // Keep the guard's own message; never treat a thrown stale-edit
          // refusal as a successful restoration.
          const summary=(error as Error).message || String(error)
          execution.restoration={status:'failed',finishedAt:new Date().toISOString(),summary,checks:[]}
          this.persist();failure=summary;break
        }
      }
      const residual=run.executions.some(execution=>!isUndoEligible(execution))
      const fullyRestored=eligible.every(isRestored)
      run.status=fullyRestored && !residual ? 'undone' : 'partially-undone'
      run.canUndo=hasPendingUndo(run)
      if (failure) {
        run.undoError=failure
        if (!run.error || run.error===previouslyFailedUndo) run.error=failure
      } else if (previouslyFailedUndo) {
        run.undoError=undefined
        if (run.error===previouslyFailedUndo) run.error=undefined
      }
      this.persist()
      this.snapshot=await this.engine.scan().catch(()=>this.snapshot!)
      if (failure) throw new Error(failure)
      return run
    })
  }
}
