import { execFile } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppTarget, DiagnosticEvidence, JsonValue, OperationId, RepairCapability, RepairStep, ServiceInfo, StartupEntry, StepExecution, SystemSnapshot, VerificationResult } from '../shared/contracts'
import { LabGuard } from './windows/lab'
import { AppRepairs } from './windows/apps'
import { runScript, userOperation, elevatedOperation } from './windows/native'
import { OPERATION_META, SELECTED_SERVICES, isSelectedService, SECURITY_STARTUP_PATTERN, WINGET_ID_PATTERN } from './windows/policy'

interface RawScan {
  computerName?:string;osCaption?:string;osVersion?:string;memoryTotal?:number;memoryFree?:number;uptimeSeconds?:number;cpuCount?:number;cpuPercent?:number
  diskFree?:number;diskTotal?:number;proxyEnable?:number;proxyServer?:string
  apps?:{id?:string;hive?:string;name?:string;version?:string;publisher?:string;installLocation?:string;displayIcon?:string}[]
  startup?:StartupEntry[];services?:ServiceInfo[];updateErrors?:{id:number;at:string;message:string}[]
}
interface ProxyState {enable:number;server:string;hasEnable:boolean;hasServer:boolean;enableKind:string;serverKind:string}
export interface WingetRow {id:string;name:string;version:string;source:string}
export function parseWingetListTable(text:string,sourceScope?:'winget'):WingetRow[] {
  const lines=text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g,'').split(/\r?\n/)
  const separator=lines.findIndex(line=>/^\s*-{5,}\s*$/.test(line))
  if(separator<1)return []
  const header=lines[separator-1];const idAt=header.indexOf('Id');const versionAt=header.indexOf('Version');const sourceAt=header.lastIndexOf('Source');const availableAt=header.indexOf('Available')
  if(idAt<1 || versionAt<=idAt || (sourceAt<=versionAt && sourceScope!=='winget'))return []
  const rows:WingetRow[]=[]
  for(const line of lines.slice(separator+1)) {
    const name=line.slice(0,idAt).trim();const id=line.slice(idAt,versionAt).trim();const version=line.slice(versionAt,availableAt>versionAt?availableAt:sourceAt>versionAt?sourceAt:line.length).trim();const source=sourceAt>versionAt?line.slice(sourceAt).trim():sourceScope||''
    if(!name || /\.\.\.|\u2026/.test(name+id) || !WINGET_ID_PATTERN.test(id) || source.toLowerCase()!=='winget')continue
    rows.push({name,id,version,source})
  }
  return rows
}
async function wingetInventory():Promise<WingetRow[]> {
  return new Promise(resolve=>execFile('winget.exe',['list','--source','winget','--disable-interactivity'],{timeout:20000,maxBuffer:4*1024*1024,windowsHide:true},(error,stdout)=>resolve(error?[]:parseWingetListTable(stdout,'winget'))))
}
function family(name:string):AppTarget['family'] {
  if(/firefox/i.test(name) && !/thunderbird/i.test(name))return 'firefox'
  if(/^steam(?:\s|$)/i.test(name))return 'steam'
  if(/^obsidian(?:\s|$)/i.test(name))return 'obsidian'
  return 'other'
}
function proxyState(value:Partial<ProxyState>):ProxyState {return {enable:Number(value.enable||0),server:String(value.server||''),hasEnable:value.hasEnable!==false,hasServer:value.hasServer!==false,enableKind:String(value.enableKind||'DWord'),serverKind:String(value.serverKind||'String')}}
function fingerprint(value:unknown):string {return createHash('sha256').update(JSON.stringify(value)).digest('hex')}
const json=(value:unknown):JsonValue=>JSON.parse(JSON.stringify(value)) as JsonValue
const check=(name:string,passed:boolean,before?:unknown,after?:unknown)=>({name,passed,...(before!==undefined?{before:String(before)}:{}),...(after!==undefined?{after:String(after)}:{})})

export class WindowsEngine {
  private lab:LabGuard
  private apps:AppRepairs
  private latest:SystemSnapshot|null=null
  readonly labMode:boolean
  constructor(private dataDirectory:string,options?:{labRoot?:string}) {
    if(!dataDirectory)throw new Error('A local data directory is required.')
    mkdirSync(dataDirectory,{recursive:true});this.lab=new LabGuard(options?.labRoot,dataDirectory);this.labMode=this.lab.labMode
    this.apps=new AppRepairs(dataDirectory,this.lab,async id=>{const app=(await this.scan()).apps.find(app=>app.id===id);if(!app)throw new Error('The application is no longer installed. Scan again.');return app})
  }
  private statePath(name:string):string {return join(this.lab.cacheDir(),name+'.json')}
  private readLab<T>(name:string,fallback:T):T {const file=this.statePath(name);return existsSync(file)?JSON.parse(readFileSync(file,'utf8')):fallback}
  private writeLab(name:string,value:unknown):void {if(!this.labMode)throw new Error('Lab state is unavailable in live mode');writeFileSync(this.statePath(name),JSON.stringify(value,null,2))}
  async scan():Promise<SystemSnapshot> {
    const raw=await runScript<RawScan>('scan.ps1')
    const packages=await wingetInventory()
    const seen=new Set<string>();const apps:AppTarget[]=[]
    for(const entry of raw.apps||[]) {
      const name=String(entry.name||'').trim();if(!name)continue
      const identity=`${entry.hive||''}|${entry.id||''}|${name}`;if(seen.has(identity))continue;seen.add(identity)
      const icon=String(entry.displayIcon||'').replace(/^"([^"]+)".*$/,'$1').replace(/,\s*-?\d+$/,'').trim()
      const matches=packages.filter(row=>row.name.toLowerCase()===name.toLowerCase() && (!entry.version || row.version===entry.version))
      const app:AppTarget={id:'app-'+createHash('sha256').update(matches.length===1?'winget:'+matches[0].id:identity).digest('hex').slice(0,20),name,version:String(entry.version||''),publisher:String(entry.publisher||''),family:family(name),installLocation:entry.installLocation||undefined,executable:/\.exe$/i.test(icon)?icon:undefined,packageId:matches.length===1?matches[0].id:undefined,capabilities:[]}
      app.capabilities=this.apps.capabilities(app);apps.push(app)
    }
    apps.sort((a,b)=>a.name.localeCompare(b.name))
    let services=(raw.services||[]).map(service=>({...service,startType:service.startType||''}))
    let startup=raw.startup||[]
    if(this.labMode) {
      const serviceStates=this.readLab<Record<string,string>>('services',{});services=services.map(service=>({...service,status:serviceStates[service.name]||service.status}))
      const startupStates=this.readLab<Record<string,string>|null>('startup',null)
      if(startupStates)startup=Object.entries(startupStates).map(([name,command])=>({id:'HKCU\\Run\\'+name,name,command,location:'HKCU Run',enabled:true}))
    }
    const diagnostics:DiagnosticEvidence[]=[]
    const proxy=this.labMode?this.readLab<ProxyState>('proxy',proxyState({enable:raw.proxyEnable,server:raw.proxyServer})):proxyState({enable:raw.proxyEnable,server:raw.proxyServer})
    if(proxy.enable)diagnostics.push({id:'windows-proxy',area:'windows',category:'network',title:'A manual proxy is configured',severity:'info',observed:`Manual proxy: ${proxy.server||'not specified'}`,details:['A manual proxy may be intentional. Investigate connection failures before changing it.'],suggestedOperation:'windows.clearUserProxy'})
    for(const service of services)if(isSelectedService(service.name) && service.status.toLowerCase()==='stopped' && /^(auto|automatic)$/i.test(service.startType))diagnostics.push({id:'service-'+service.name,area:'windows',category:'service',title:service.displayName+' is stopped',severity:'warning',observed:`${service.name} is configured ${service.startType} and reports Stopped.`,details:['Manual and trigger-start services are not classified as broken solely because they are stopped.'],suggestedOperation:'windows.startService',context:{serviceName:service.name}})
    const diskFree=Number(raw.diskFree||0),diskTotal=Number(raw.diskTotal||0)
    if(diskTotal>0 && diskFree/diskTotal<.1)diagnostics.push({id:'windows-storage',area:'windows',category:'storage',title:'System drive is low on free space',severity:'warning',observed:`${(diskFree/1024**3).toFixed(1)} GiB available of ${(diskTotal/1024**3).toFixed(1)} GiB.`,details:['Cache quarantine preserves data and does not free space when the backup remains on the same drive. Storage findings require a verified applicable repair.']})
    if(Number(raw.memoryTotal)>0 && Number(raw.memoryFree)/Number(raw.memoryTotal)<.1)diagnostics.push({id:'windows-memory',area:'windows',category:'performance',title:'Available memory is low',severity:'warning',observed:`${(Number(raw.memoryFree)/1024**3).toFixed(1)} GiB available.`,details:['Inspect the application causing the problem before changing startup behavior.']})
    if(startup.length>10)diagnostics.push({id:'windows-startup',area:'windows',category:'startup',title:'Review startup load',severity:'info',observed:`${startup.length} startup entries are registered.`,details:['Only a selected current-user entry can be disabled; security applications are protected.']})
    for(const error of raw.updateErrors||[])diagnostics.push({id:'windows-update-'+error.id+'-'+error.at,area:'windows',category:'updates',title:'A recent Windows Update error was recorded',severity:'info',observed:`Event ${error.id} at ${error.at}`,details:[error.message.slice(0,1200),'Historical errors do not establish that the current update state is broken.'],suggestedOperation:'windows.integrityRepair'})
    for(const app of apps)diagnostics.push(...this.apps.diagnostics(app))
    const snapshot:SystemSnapshot={scannedAt:new Date().toISOString(),platform:'win32',machine:{name:String(raw.computerName||'This PC'),os:`${raw.osCaption||'Windows'} ${raw.osVersion||''}`.trim(),memoryTotal:Number(raw.memoryTotal||0),memoryFree:Number(raw.memoryFree||0),uptime:Number(raw.uptimeSeconds||0),cpuCount:Number(raw.cpuCount||0)},metrics:{diskFree,diskTotal,cpuPercent:typeof raw.cpuPercent==='number'?raw.cpuPercent:null},diagnostics,apps,startup,services,labMode:this.labMode}
    this.latest=snapshot;return snapshot
  }
  capabilities(snapshot:SystemSnapshot,appId?:string):RepairCapability[] {
    if(appId) {
      const app=snapshot.apps.find(app=>app.id===appId)
      return app?app.capabilities.map(operation=>({operation,targetId:app.id,description:OPERATION_META[operation].description,constraints:this.apps.constraints(app,operation)})):[]
    }
    const capabilities:RepairCapability[]=(['windows.clearUserProxy','windows.flushDns','windows.integrityRepair'] as OperationId[]).map(operation=>({operation,targetId:'windows',description:OPERATION_META[operation].description,constraints:OPERATION_META[operation].constraints+' Params: {}'}))
    for(const service of snapshot.services)if(isSelectedService(service.name) && service.status.toLowerCase()!=='running' && !/disabled/i.test(service.startType))capabilities.push({operation:'windows.startService',targetId:service.name,description:'Start '+service.displayName,constraints:`Params: {"serviceName":${JSON.stringify(service.name)}}. Starts this service without changing its configuration.`})
    for(const entry of snapshot.startup)if(entry.id.startsWith('HKCU\\Run\\') && !SECURITY_STARTUP_PATTERN.test(entry.name+' '+entry.command))capabilities.push({operation:'windows.disableStartup',targetId:entry.id,description:'Disable startup: '+entry.name,constraints:`Params: {"entryId":${JSON.stringify(entry.id)}}. Current-user entry only; complete original value is backed up.`})
    return capabilities
  }
  validateStep(step:RepairStep,snapshot:SystemSnapshot):RepairStep {
    if(!step || typeof step.id!=='string' || !step.id || !Object.hasOwn(OPERATION_META,step.operation) || !step.params || typeof step.params!=='object' || Array.isArray(step.params))throw new Error('Invalid repair operation.')
    if(step.operation.startsWith('app.'))return this.apps.validate(step,snapshot)
    let targetId='windows',params:Record<string,JsonValue>={},label='Windows'
    const allowed=step.operation==='windows.startService'?['serviceName']:step.operation==='windows.disableStartup'?['entryId']:[]
    if(Object.keys(step.params).some(key=>!allowed.includes(key)))throw new Error('Unsupported repair parameter. No action was authorized.')
    if(step.operation==='windows.startService') {
      const service=snapshot.services.find(service=>service.name===step.params.serviceName)
      if(!service || !isSelectedService(service.name) || /disabled/i.test(service.startType))throw new Error('This service cannot be started by the available repair operation.')
      targetId=service.name;label=service.displayName;params={serviceName:service.name}
    } else if(step.operation==='windows.disableStartup') {
      const entry=snapshot.startup.find(entry=>entry.id===step.params.entryId)
      if(!entry || !entry.id.startsWith('HKCU\\Run\\') || SECURITY_STARTUP_PATTERN.test(entry.name+' '+entry.command))throw new Error('This startup entry is not an eligible current-user application.')
      targetId=entry.id;label=entry.name;params={entryId:entry.id}
    }
    if(step.targetId!==targetId)throw new Error('Repair parameters do not match the reviewed target.')
    const meta=OPERATION_META[step.operation]
    return {...step,targetId,params,title:meta.description+' '+(label==='Windows'?'':label),requiresAdmin:meta.requiresAdmin,reversible:meta.reversible,impact:`${label}: ${meta.impact}`,verification:meta.verification}
  }
  private finish(step:RepairStep,startedAt:string,success:boolean,output:string,backupId?:string,data:Record<string,JsonValue>={}):StepExecution {return {step,startedAt,finishedAt:new Date().toISOString(),success,output:output.slice(0,8000),backupId,data}}
  async execute(step:RepairStep):Promise<StepExecution> {
    const startedAt=new Date().toISOString()
    try {
      const current=this.latest||await this.scan();step=this.validateStep(step,current)
      if(step.operation.startsWith('app.'))return await this.apps.execute(step)
      if(['windows.flushDns','windows.startService','windows.integrityRepair'].includes(step.operation)) {
        const operation=step.operation==='windows.flushDns'?'flushDns':step.operation==='windows.startService'?'startService':'integrityRepair'
        if(this.labMode) {
          if(operation==='startService'){const state=this.readLab<Record<string,string>>('services',{});state[String(step.params.serviceName)]='Running';this.writeLab('services',state)}
          if(operation==='flushDns')this.writeLab('dns',{count:0})
          if(operation==='integrityRepair')this.writeLab('health',{healthy:true,pendingReboot:false,summary:'Lab integrity state restored'})
          return this.finish(step,startedAt,true,'Isolated lab state changed; host Windows was untouched.',undefined,{labMode:true})
        }
        const before=operation==='flushDns'?await userOperation('getDnsCache'):null
        const result=await elevatedOperation(operation,this.dataDirectory,String(step.params.serviceName||''))
        return this.finish(step,startedAt,result.success,result.output,undefined,{exitCode:result.exitCode,pendingReboot:result.pendingReboot,before:json(before),...json(result.data||{}) as Record<string,JsonValue>})
      }
      if(step.operation==='windows.clearUserProxy') {
        if(!this.labMode){const policy=await userOperation<{pinned:string}>('proxyPolicy');if(policy.pinned)throw new Error('Proxy settings are managed by policy; no settings were changed.')}
        const before=this.labMode?this.readLab<ProxyState>('proxy',proxyState({enable:0,server:''})):await userOperation<ProxyState>('getProxy')
        const backupId=randomUUID();this.lab.storeBackup({id:backupId,stepId:step.id,operation:step.operation,createdAt:startedAt,kind:'proxy',data:{before}})
        const after=this.labMode?proxyState({...before,enable:0,server:'',hasEnable:true,hasServer:true}):(await userOperation<{after:ProxyState}>('clearProxy')).after
        if(this.labMode)this.writeLab('proxy',after)
        return this.finish(step,startedAt,true,'Per-user proxy cleared and original settings backed up.',backupId,{before:json(before),after:json(after)})
      }
      if(step.operation==='windows.disableStartup') {
        const name=String(step.params.entryId).slice('HKCU\\Run\\'.length)
        const entries=this.labMode?Object.entries(this.readLab<Record<string,string>>('startup',{})).map(([name,command])=>({name,command,kind:'String'})):await userOperation<{name:string;command:string;kind:string}[]>('getStartup')
        const before=entries.find(entry=>entry.name===name)
        if(!before || SECURITY_STARTUP_PATTERN.test(before.name+' '+before.command))throw new Error('The startup entry changed or is protected. Scan again.')
        const backupId=randomUUID();this.lab.storeBackup({id:backupId,stepId:step.id,operation:step.operation,createdAt:startedAt,kind:'startup',data:{before}})
        if(this.labMode){const state=this.readLab<Record<string,string>>('startup',{});delete state[name];this.writeLab('startup',state)}else await userOperation('disableStartup',{Name:name})
        return this.finish(step,startedAt,true,'Startup entry disabled. Original value is backed up.',backupId,{before:json(before)})
      }
      throw new Error('Unsupported repair operation.')
    } catch(error){return this.finish(step,startedAt,false,(error as Error).message)}
  }
  async verify(step:RepairStep,execution:StepExecution):Promise<VerificationResult> {
    try {
      if(!execution.success)return {passed:false,summary:execution.output,checks:[]}
      if(step.operation.startsWith('app.'))return await this.apps.verify(step,execution)
      if(step.operation==='windows.clearUserProxy') {
        const after=this.labMode?this.readLab<ProxyState>('proxy',proxyState({})):await userOperation<ProxyState>('getProxy')
        const passed=after.enable===0 && after.server==='';return {passed,summary:passed?'Independent registry read confirms manual proxy is off.':'Proxy settings do not match the repair.',checks:[check('Manual proxy disabled',after.enable===0,execution.data.before?JSON.stringify(execution.data.before):undefined,after.enable),check('Proxy server cleared',after.server==='','configured',after.server)]}
      }
      if(step.operation==='windows.startService') {
        const name=String(step.params.serviceName),status=this.labMode?this.readLab<Record<string,string>>('services',{})[name]:(await userOperation<{status:string}>('checkService',{ServiceName:name})).status
        const passed=/^running$/i.test(status||'');return {passed,summary:`${name}: ${status||'Unknown'}`,checks:[check('Service reports Running',passed,'Stopped',status)]}
      }
      if(step.operation==='windows.disableStartup') {
        const name=String(step.params.entryId).slice('HKCU\\Run\\'.length)
        const entries=this.labMode?Object.keys(this.readLab<Record<string,string>>('startup',{})).map(name=>({name})):await userOperation<{name:string}[]>('getStartup')
        const passed=!entries.some(entry=>entry.name===name);return {passed,summary:passed?'Independent startup scan confirms the entry is disabled.':'Startup entry is still present.',checks:[check('Startup entry removed',passed,'Enabled',passed?'Disabled':'Enabled')]}
      }
      if(step.operation==='windows.flushDns') {
        const cache=this.labMode?this.readLab<{count:number}>('dns',{count:-1}):await userOperation<{count:number}>('getDnsCache')
        const resolved=this.labMode?true:await lookup('www.microsoft.com').then(()=>true,()=>false)
        const before=execution.data.before as {count?:number}|undefined
        const cleared=cache.count===0 || (typeof before?.count==='number' && cache.count<before.count)
        return {passed:cleared && resolved,summary:cleared && resolved?'DNS cache rechecked and name resolution succeeded.':'DNS changes could not be independently verified.',checks:[check('Cache emptied or reduced',cleared,before?.count,cache.count),check('Windows name resolution works',resolved)]}
      }
      if(step.operation==='windows.integrityRepair') {
        const health=this.labMode?this.readLab<{healthy:boolean;pendingReboot:boolean;summary:string}>('health',{healthy:false,pendingReboot:false,summary:'No lab health result'}):await userOperation<{healthy:boolean;pendingReboot:boolean;summary:string}>('checkHealth')
        const rebooted=this.latest && Date.now()-this.latest.machine.uptime*1000>Date.parse(execution.finishedAt)
        const pendingReboot=health.pendingReboot || (Boolean(execution.data.pendingReboot) && !rebooted)
        const independentlyHealthy=health.healthy || execution.data.healthVerified===true
        return {passed:independentlyHealthy && !pendingReboot,pendingReboot,summary:pendingReboot?'Restart Windows, then scan again to verify the repair.':health.summary,checks:[check('Independent Windows health check',independentlyHealthy),check('No reboot required',!pendingReboot)]}
      }
      return {passed:false,summary:'No independent verification is available.',checks:[]}
    } catch(error){return {passed:false,summary:'Verification failed: '+(error as Error).message,checks:[]}}
  }
  async undo(execution:StepExecution):Promise<VerificationResult> {
    try {
      if(execution.step.operation.startsWith('app.'))return await this.apps.undo(execution)
      if(!execution.backupId)throw new Error('No restorable backup is available.')
      const backup=this.lab.readBackup(execution.backupId)
      if(backup.stepId!==execution.step.id || backup.operation!==execution.step.operation)throw new Error('Backup does not match this repair.')
      if(backup.kind==='proxy') {
        const current=this.labMode?this.readLab<ProxyState>('proxy',proxyState({})):await userOperation<ProxyState>('getProxy')
        if(fingerprint(current)!==fingerprint(execution.data.after))throw new Error('Proxy settings changed after this repair. Undo refused to preserve your newer changes.')
        const before=backup.data.before as ProxyState
        if(this.labMode)this.writeLab('proxy',before);else await userOperation('restoreProxy',{StateBase64:Buffer.from(JSON.stringify(before)).toString('base64')})
        const after=this.labMode?this.readLab<ProxyState>('proxy',proxyState({})):await userOperation<ProxyState>('getProxy')
        const passed=fingerprint(after)===fingerprint(before);return {passed,summary:passed?'Original proxy values, types, and presence restored.':'Proxy restoration could not be verified.',checks:[check('Original proxy state restored',passed)]}
      }
      if(backup.kind==='startup') {
        const before=backup.data.before as {name:string;command:string;kind:string}
        const existing=this.labMode?Object.keys(this.readLab<Record<string,string>>('startup',{})).map(name=>({name})):await userOperation<{name:string}[]>('getStartup')
        if(existing.some(entry=>entry.name===before.name))throw new Error('A startup value was added after this repair. Undo refused to preserve it.')
        if(this.labMode){const state=this.readLab<Record<string,string>>('startup',{});state[before.name]=before.command;this.writeLab('startup',state)}else await userOperation('restoreStartup',{StateBase64:Buffer.from(JSON.stringify(before)).toString('base64')})
        const restored=this.labMode?this.readLab<Record<string,string>>('startup',{})[before.name]:(await userOperation<{name:string;command:string;kind:string}[]>('getStartup')).find(entry=>entry.name===before.name)?.command
        const passed=restored===before.command;return {passed,summary:passed?'Original startup value restored.':'Startup restoration failed verification.',checks:[check('Original startup command restored',passed)]}
      }
      throw new Error('This backup type cannot restore the selected Windows operation.')
    } catch(error){return {passed:false,summary:(error as Error).message,checks:[]}}
  }
}
