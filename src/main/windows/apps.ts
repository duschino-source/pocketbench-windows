import { spawn, execFile } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, copyFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, relative, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { AppTarget, DiagnosticEvidence, JsonValue, OperationId, RepairStep, StepExecution, SystemSnapshot, VerificationResult } from '../../shared/contracts'
import { LabGuard } from './lab'
import { CACHE_ALLOWLIST, EXECUTABLE_EXTENSIONS, OPERATION_META, RESTART_EXECUTABLES, WINGET_ID_PATTERN, isDeepFamily } from './policy'
import { userOperation } from './native'

const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex')
const json=(value:unknown):JsonValue=>JSON.parse(JSON.stringify(value)) as JsonValue
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
const result=(name:string,passed:boolean,before?:string,after?:string)=>({name,passed,...(before!==undefined?{before}:{}),...(after!==undefined?{after}:{})})
const localPath=(value:string|undefined):value is string=>Boolean(value && !/^(?:\\\\|\/\/|[A-Za-z]+:\/\/)/.test(value) && !value.includes('\0'))
function plainParams(params:Record<string,JsonValue>,allowed:string[]):void {if(Object.keys(params).some(key=>!allowed.includes(key)))throw new Error('Unsupported application repair parameter.')}
function safeFile(file:string,root:string,lab:LabGuard):string {const confined=lab.confine(file,root,'Application data');lab.assertNotLink(confined,'Application data');return confined}
export function readIni(text:string):Record<string,Record<string,string>> {
  const sections:Record<string,Record<string,string>>=Object.create(null);let section=''
  for(const line of text.split(/\r?\n/)) {
    const head=line.match(/^\s*\[([^\]]+)\]\s*$/);if(head){section=head[1];sections[section]=Object.create(null);continue}
    const field=line.match(/^\s*([^;#=]+?)\s*=\s*(.*?)\s*$/);if(field && section && !['__proto__','constructor','prototype'].includes(field[1]))sections[section][field[1]]=field[2]
  }
  return sections
}
export class AppRepairs {
  constructor(private dataDirectory:string,private lab:LabGuard,private getApp:(id:string)=>Promise<AppTarget>) {}
  private roots(app:AppTarget):{profile?:string;vault?:string;caches:{path:string;root:string}[];exe?:string} {
    if(!isDeepFamily(app.family))return {caches:[]}
    const family=app.family;const caches:{path:string;root:string}[]=[]
    let profile:string|undefined,vault:string|undefined
    const addCache=(root:string,name:string)=>{if(!localPath(root))return;const path=safeFile(join(root,name),root,this.lab);if(existsSync(path) && lstatSync(path).isDirectory())caches.push({path,root})}
    if(this.lab.labMode) {
      const root=join(this.lab.assertLab('Application lab'),'apps',family)
      if(existsSync(root)) {
        const candidate=join(root,'profile.default');if(family==='firefox' && existsSync(join(candidate,'prefs.js')))profile=safeFile(candidate,root,this.lab)
        const candidateVault=join(root,'vault');if(family==='obsidian' && existsSync(join(candidateVault,'.obsidian','appearance.json')))vault=safeFile(candidateVault,root,this.lab)
        for(const name of CACHE_ALLOWLIST[family])addCache(root,name)
      }
      return {profile,vault,caches}
    }
    const roaming=localPath(process.env.APPDATA)?process.env.APPDATA:undefined,local=localPath(process.env.LOCALAPPDATA)?process.env.LOCALAPPDATA:undefined
    if(family==='firefox' && roaming) {
      const root=join(roaming,'Mozilla','Firefox'),ini=safeFile(join(root,'profiles.ini'),root,this.lab)
      if(existsSync(ini)) {
        safeFile(ini,root,this.lab);const sections=readIni(readFileSync(ini,'utf8'));const defaults:string[]=[]
        for(const [name,entry] of Object.entries(sections)) {
          const value=name.startsWith('Install')?entry.Default:name.startsWith('Profile') && entry.Default==='1'?entry.Path:undefined
          if(value && !/^(?:[A-Za-z]:|\\\\|\/)/.test(value)) {
            const path=safeFile(resolve(root,value),join(root,'Profiles'),this.lab)
            if(existsSync(join(path,'prefs.js')))defaults.push(path)
          }
        }
        const unique=[...new Set(defaults)];if(unique.length===1)profile=unique[0]
      }
      if(profile) {
        for(const name of ['startupCache','shader-cache'])addCache(profile,name)
        if(local){const cacheProfile=join(local,'Mozilla','Firefox','Profiles',basename(profile));for(const name of ['cache2','startupCache','shader-cache'])addCache(cacheProfile,name)}
      }
    }
    if(family==='steam') {
      if(localPath(app.installLocation))for(const name of ['appcache','config/htmlcache','steamapps/shadercache'])addCache(app.installLocation,name)
      if(local)addCache(join(local,'Steam'),'htmlcache')
    }
    if(family==='obsidian' && roaming) {
      const root=join(roaming,'obsidian');for(const name of ['Cache','Code Cache','GPUCache'])addCache(root,name)
      const registry=safeFile(join(root,'obsidian.json'),root,this.lab)
      if(existsSync(registry)) {
        safeFile(registry,root,this.lab)
        try {
          const registryData=JSON.parse(readFileSync(registry,'utf8'));const entries=(Object.values(registryData.vaults||{}) as {path?:string;open?:boolean}[]).filter(entry=>localPath(entry.path)).filter(entry=>{safeFile(entry.path!,entry.path!,this.lab);return true})
          const open=entries.filter(entry=>entry.open && entry.path && existsSync(join(entry.path,'.obsidian','appearance.json')))
          const candidates=open.length?open:entries.filter(entry=>entry.path && existsSync(join(entry.path,'.obsidian','appearance.json')))
          if(candidates.length===1){vault=candidates[0].path;safeFile(join(vault!,'.obsidian','appearance.json'),vault!,this.lab)}
        } catch(error){if(error instanceof SyntaxError)throw new Error('Obsidian vault registry is invalid; no vault was selected.');throw error}
      }
    }
    let exe:string|undefined
    for(const candidate of [app.executable,localPath(app.installLocation)?join(app.installLocation,RESTART_EXECUTABLES[family]):undefined])if(localPath(candidate) && basename(candidate).toLowerCase()===RESTART_EXECUTABLES[family]){safeFile(candidate,dirname(candidate),this.lab);if(existsSync(candidate) && lstatSync(candidate).isFile()){exe=candidate;break}}
    return {profile,vault,caches,exe}
  }
  capabilities(app:AppTarget):OperationId[] {
    const operations:OperationId[]=[]
    if(app.packageId && WINGET_ID_PATTERN.test(app.packageId))operations.push('app.updatePackage')
    if(!isDeepFamily(app.family))return operations
    try {
      const roots=this.roots(app),canClose=this.lab.labMode||Boolean(roots.exe)
      if(canClose && roots.caches.length)operations.push('app.quarantineCache')
      if(canClose && (roots.profile||roots.vault))operations.push('app.patchConfig')
      if(roots.exe || this.lab.labMode)operations.push('app.restart')
    } catch { /* Unsafe/unreadable roots never become executable capabilities. */ }
    return operations
  }
  constraints(app:AppTarget,operation:OperationId):string {
    const appId=JSON.stringify(app.id)
    if(operation==='app.updatePackage')return `Params: {"appId":${appId},"packageId":${JSON.stringify(app.packageId)}}. Update only the exact discovered package. Verify a version change; do not claim success if already current.`
    if(operation==='app.patchConfig')return app.family==='firefox'?`Params: {"appId":${appId},"setting":"network.proxy.type","value":0}. Clear manual Firefox proxy in its uniquely identified default profile; only value0 is allowed.`:`Params: {"appId":${appId},"setting":"cssTheme","value":""}. Disable a broken custom Obsidian theme in the uniquely identified open vault.`
    return `Params: {"appId":${appId}}. ${OPERATION_META[operation].constraints} Running apps may close and relaunch; refusal to close stops the repair.`
  }
  diagnostics(app:AppTarget):DiagnosticEvidence[] {
    if(!isDeepFamily(app.family))return []
    try {
      const roots=this.roots(app),evidence:DiagnosticEvidence[]=[]
      if(roots.profile) {
        const pref=this.prefFile(roots.profile)
        if(this.readPref(pref,'network.proxy.type')===1)evidence.push({id:'firefox-proxy-'+app.id,area:'app',category:'network',title:'Firefox has a manual proxy',severity:'info',observed:'The default Firefox profile uses a manual proxy.',details:['This may be intentional. Investigate connection failures before resetting it.'],appId:app.id,suggestedOperation:'app.patchConfig'})
      }
      if(roots.vault) {
        const file=safeFile(join(roots.vault,'.obsidian','appearance.json'),roots.vault,this.lab)
        const theme=JSON.parse(readFileSync(file,'utf8'))?.cssTheme
        if(typeof theme==='string' && theme.trim().length>0)evidence.push({id:'obsidian-theme-'+app.id,area:'app',category:'app',title:'Obsidian uses a custom CSS theme',severity:'info',observed:`The active Obsidian vault uses custom theme "${theme.trim().slice(0,64)}".`,details:['A broken custom theme can prevent normal rendering. Resetting it preserves notes and vault data.'],appId:app.id,suggestedOperation:'app.patchConfig'})
      }
      return evidence
    }catch{return []}
  }
  private canonical(step:RepairStep,app:AppTarget):RepairStep {
    if(step.targetId!==app.id || step.params.appId!==app.id)throw new Error('Application repair parameters do not match the reviewed target.')
    if(!this.capabilities(app).includes(step.operation))throw new Error('This application does not expose that repair capability in the current scan.')
    plainParams(step.params,step.operation==='app.patchConfig'?['appId','setting','value']:step.operation==='app.updatePackage'?['appId','packageId']:['appId'])
    if(step.operation==='app.updatePackage' && (step.params.packageId!==app.packageId || !WINGET_ID_PATTERN.test(String(app.packageId))))throw new Error('Package identity no longer matches the discovered application.')
    if(step.operation==='app.patchConfig') {
      if(app.family==='firefox' && !(step.params.setting==='network.proxy.type' && step.params.value===0))throw new Error('Only clearing the manual Firefox proxy is supported.')
      if(app.family==='obsidian' && !(step.params.setting==='cssTheme' && step.params.value===''))throw new Error('Only resetting the custom Obsidian theme is supported.')
    }
    const meta=OPERATION_META[step.operation]
    return {...step,title:meta.description+' '+app.name,requiresAdmin:false,reversible:meta.reversible,impact:`${app.name}: ${meta.impact}${step.operation==='app.updatePackage'?' The vendor installer may request Windows UAC.':' The app may close and relaunch; unsaved-work prompts can pause the repair.'}`,verification:step.operation==='app.restart'?'The exact application executable is running again.':meta.verification}
  }
  validate(step:RepairStep,snapshot:SystemSnapshot):RepairStep {const app=snapshot.apps.find(app=>app.id===step.targetId);if(!app)throw new Error('Application is no longer installed.');return this.canonical(step,app)}
  private prefFile(profile:string):string {
    const user=join(profile,'user.js')
    return existsSync(user) && /user_pref\s*\(\s*["']network\.proxy\.type["']\s*,/.test(readFileSync(user,'utf8'))?user:join(profile,'prefs.js')
  }
  private readPref(file:string,key:string):unknown {
    const matches=[...readFileSync(file,'utf8').matchAll(new RegExp('^\\s*user_pref\\(\\s*"'+key.replace(/\./g,'\\.')+'"\\s*,\\s*([^\\n]+?)\\s*\\);?\\s*$','gm'))]
    if(!matches.length)return undefined
    try{return JSON.parse(matches[matches.length-1][1])}catch{throw new Error('Firefox preference format cannot be safely verified.')}
  }
  async previewStep(step:RepairStep,snapshot:SystemSnapshot):Promise<{resource:string;before:string;after:string}> { step=this.validate(step,snapshot)
    const app=snapshot.apps.find(item=>item.id===step.targetId)
    if(!app)throw new Error('Application is no longer in the inventory.')
    const roots=this.roots(app)
    if(step.operation==='app.patchConfig') {
      const root=roots.profile||roots.vault
      if(!root)throw new Error('No unique supported profile or vault is available.')
      const file=roots.profile?this.prefFile(roots.profile):join(roots.vault!,'.obsidian','appearance.json')
      safeFile(file,root,this.lab)
      const before=roots.profile?this.readPref(file,'network.proxy.type'):JSON.parse(readFileSync(file,'utf8')).cssTheme
      const format=(val:unknown)=>val===undefined||val===null?'(unset)':val===''?'(default / none)':roots.profile&&val===1?'1 (manual proxy enabled)':roots.profile&&val===0?'0 (manual proxy disabled)':String(val);return {resource:`${app.name}: ${String(step.params.setting)}`,before:format(before),after:format(step.params.value)}
    }
    if(step.operation==='app.updatePackage')return {resource:`${app.name}: ${app.packageId}`,before:`Version ${app.version}`,after:'Update to exact WinGet package; installed version verified afterward'}
    if(step.operation==='app.quarantineCache')return {resource:`${app.name}: allow-listed cache`,before:roots.caches.map(item=>basename(item.path)).join(', ')||'No eligible cache found',after:'Eligible cache directories moved to restorable quarantine'}
    return {resource:`${app.name}: application process`,before:'Current process state',after:'Known executable restarted and checked'}
  }
  private async close(app:AppTarget,exe?:string):Promise<boolean> {
    if(this.lab.labMode)return false
    if(!exe)throw new Error('The exact app executable could not be identified safely.')
    const state=await userOperation<{found:number}>('checkProcess',{ExpectedExe:exe});if(!state.found)return false
    let after=await userOperation<{remaining:number}>('requestClose',{ExpectedExe:exe})
    for(let i=0;i<5 && after.remaining;i++){await wait(300);after=await userOperation<{remaining:number}>('checkProcess',{ExpectedExe:exe})}
    if(after.remaining)throw new Error(`${app.name} needs your attention before it can close. No repair changes were made.`)
    return true
  }
  private launch(exe?:string):void {
    if(this.lab.labMode)return
    if(!exe || !existsSync(exe))throw new Error('Application executable is unavailable for relaunch.')
    const child=spawn(exe,[],{shell:false,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref()
  }
  private execution(step:RepairStep,start:string,success:boolean,output:string,backupId?:string,data:Record<string,JsonValue>={}):StepExecution{return {step,startedAt:start,finishedAt:new Date().toISOString(),success,output,backupId,data}}
  private async runningCheck(exe:string) {
    let found=0
    for(let i=0;i<5 && !found;i++){await wait(300);found=(await userOperation<{found:number}>('checkProcess',{ExpectedExe:exe})).found}
    return result('App is running again',found>0)
  }
  async execute(step:RepairStep):Promise<StepExecution> {
    const start=new Date().toISOString();let backupId:string|undefined
    try {
      const app=await this.getApp(step.targetId);step=this.canonical(step,app);const roots=this.roots(app)
      if(step.operation==='app.updatePackage') {
        if(this.lab.labMode)throw new Error('Package updates are not simulated as successful in lab mode.')
        const output=await new Promise<string>((resolve,reject)=>execFile('winget.exe',['upgrade','--id',app.packageId!,'--exact','--source','winget','--disable-interactivity','--accept-package-agreements','--accept-source-agreements'],{windowsHide:true,timeout:30*60*1000,maxBuffer:4*1024*1024},(error,stdout,stderr)=>error?reject(new Error((stdout||stderr||error.message).slice(-3000))):resolve(stdout)))
        return this.execution(step,start,true,output.slice(-3000),undefined,{beforeVersion:app.version,packageId:app.packageId!})
      }
      const wasRunning=await this.close(app,roots.exe)
      try {
        if(step.operation==='app.restart'){this.launch(roots.exe);return this.execution(step,start,true,'Application was closed politely and relaunched.',undefined,{exe:roots.exe||'',labMode:this.lab.labMode})}
        if(step.operation==='app.patchConfig') {
          const root=roots.profile||roots.vault;if(!root)throw new Error('No unique supported profile or vault is available.')
          const file=roots.profile?this.prefFile(roots.profile):join(roots.vault!,'.obsidian','appearance.json');safeFile(file,root,this.lab)
          const before=readFileSync(file,'utf8');let after:string
          if(roots.profile) {
            const key='network.proxy.type',line=`user_pref("${key}", 0);`,pattern=/^\s*user_pref\(\s*"network\.proxy\.type"\s*,[^\r\n]+\);?\s*$/gm
            after=pattern.test(before)?before.replace(pattern,line):before+'\n'+line+'\n'
          } else {const data=JSON.parse(before);if(!data || typeof data!=='object' || Array.isArray(data))throw new Error('Appearance config is not a JSON object.');data.cssTheme='';after=JSON.stringify(data,null,2)+'\n'}
          backupId=randomUUID();const backupFile=join(this.lab.cacheDir(),backupId+'.backup');copyFileSync(file,backupFile)
          const beforeHash=hash(file),afterHash=createHash('sha256').update(after).digest('hex')
          this.lab.storeBackup({id:backupId,stepId:step.id,operation:step.operation,createdAt:start,kind:'config',data:{file,root,backupFile,beforeHash,afterHash}})
          const temporary=safeFile(file+'.pocketbench-'+backupId+'.tmp',root,this.lab);writeFileSync(temporary,after,'utf8');renameSync(temporary,file)
          return this.execution(step,start,true,'Supported setting changed; the original file is backed up.',backupId,{file,root,afterHash,setting:String(step.params.setting),value:step.params.value,labMode:this.lab.labMode,relaunchExpected:wasRunning,exe:roots.exe||''})
        }
        if(step.operation==='app.quarantineCache') {
          const targets=roots.caches;if(!targets.length)throw new Error('No supported cache directories remain.')
          for(const target of targets)this.inspectCache(target.path,target.root,app)
          backupId=randomUUID();const records:{source:string;root:string;destination:string}[]=[]
          const container=join(this.lab.quarantineDir(),backupId);mkdirSync(container,{recursive:true})
          try {
            for(let i=0;i<targets.length;i++){const {path,root}=targets[i];const destination=join(container,String(i));renameSync(path,destination);records.push({source:path,root,destination})}
          } catch(error) {for(const record of [...records].reverse())if(!existsSync(record.source))renameSync(record.destination,record.source);throw new Error('Cache quarantine was rolled back: '+(error as Error).message)}
          this.lab.storeBackup({id:backupId,stepId:step.id,operation:step.operation,createdAt:start,kind:'cache',data:{records}})
          return this.execution(step,start,true,`${records.length} cache directories quarantined. User data was preserved.`,backupId,{records:json(records),labMode:this.lab.labMode,relaunchExpected:wasRunning,exe:roots.exe||''})
        }
        throw new Error('No executable application repair was selected.')
      } finally {if(wasRunning && step.operation!=='app.restart')this.launch(roots.exe)}
    } catch(error){return this.execution(step,start,false,(error as Error).message,backupId)}
  }
  private inspectCache(path:string,root:string,app:AppTarget):void {
    safeFile(path,root,this.lab)
    if(!isDeepFamily(app.family) || !CACHE_ALLOWLIST[app.family].some(name=>name.toLowerCase()===basename(path).toLowerCase()))throw new Error('Cache directory is not allow-listed.')
    const pending=[path];let entries=0
    while(pending.length)for(const item of readdirSync(pending.pop()!,{withFileTypes:true})) {
      if(++entries>100000)throw new Error('Cache is too large to inspect safely in this release.')
      const full=join(item.parentPath,item.name);safeFile(full,root,this.lab)
      if(EXECUTABLE_EXTENSIONS.has(extname(item.name).toLowerCase()))throw new Error('An executable was found inside the cache; quarantine refused.')
      if(item.isDirectory())pending.push(full)
    }
  }
  async verify(step:RepairStep,execution:StepExecution):Promise<VerificationResult> {
    try {
      if(!execution.success)return {passed:false,summary:execution.output,checks:[]}
      const app=await this.getApp(step.targetId)
      if(step.operation==='app.updatePackage') {
        const passed=app.packageId===execution.data.packageId && app.version!==execution.data.beforeVersion
        return {passed,summary:passed?'The installed package reports a new version.':'An installed version change could not be verified.',checks:[result('Installed version changed',passed,String(execution.data.beforeVersion),app.version)]}
      }
      if(step.operation==='app.restart') {
        if(this.lab.labMode)return {passed:true,summary:'Isolated restart workflow verified; no host process was launched.',checks:[result('Lab mode preserved host processes',true)]}
        const check=await this.runningCheck(String(execution.data.exe))
        return {passed:check.passed,summary:check.passed?'The exact app executable is running again.':'App relaunch could not be verified.',checks:[check]}
      }
      const relaunchChecks=!this.lab.labMode && execution.data.relaunchExpected?[await this.runningCheck(String(execution.data.exe))]:[]
      if(step.operation==='app.patchConfig') {
        const file=safeFile(String(execution.data.file),String(execution.data.root),this.lab)
        const actual=app.family==='firefox'?this.readPref(file,'network.proxy.type'):JSON.parse(readFileSync(file,'utf8')).cssTheme
        const checks=[result('Setting verified',actual===execution.data.value,undefined,String(actual)),...relaunchChecks]
        const passed=checks.every(check=>check.passed)
        return {passed,summary:passed?'The saved setting and any required relaunch were independently verified.':'The saved setting or app relaunch could not be verified.',checks}
      }
      const records=execution.data.records as unknown as {source:string;root:string;destination:string}[]
      const checks=records.map(record=>{safeFile(record.destination,this.lab.quarantineDir(),this.lab);safeFile(record.source,record.root,this.lab);const moved=existsSync(record.destination) && (!existsSync(record.source) || lstatSync(record.source).ino!==lstatSync(record.destination).ino);return result('Original cache moved to quarantine: '+basename(record.source),moved)})
      checks.push(...relaunchChecks)
      return {passed:checks.length>0 && checks.every(check=>check.passed),summary:'Cache locations and quarantine contents were independently checked.',checks}
    }catch(error){return {passed:false,summary:(error as Error).message,checks:[]}}
  }
  async undo(execution:StepExecution):Promise<VerificationResult> {
    try {
      if(!execution.backupId)throw new Error('No supported backup is available.')
      const backup=this.lab.readBackup(execution.backupId)
      if(backup.stepId!==execution.step.id || backup.operation!==execution.step.operation)throw new Error('Backup does not match the repair.')
      const app=await this.getApp(execution.step.targetId),roots=this.roots(app),wasRunning=await this.close(app,roots.exe)
      try {
        if(backup.kind==='config') {
          const {file,root,backupFile,beforeHash,afterHash}=backup.data as Record<string,string>
          safeFile(file,root,this.lab);safeFile(backupFile,this.lab.cacheDir(),this.lab)
          if(hash(file)!==afterHash)throw new Error('The setting file changed after this repair. Undo refused to preserve newer edits.')
          if(hash(backupFile)!==beforeHash)throw new Error('The backup failed its integrity check.')
          copyFileSync(backupFile,file);const passed=hash(file)===beforeHash
          return {passed,summary:passed?'The original config file was restored byte for byte.':'Config restoration did not verify.',checks:[result('Original config restored',passed)]}
        }
        if(backup.kind==='cache') {
          const records=backup.data.records as {source:string;root:string;destination:string}[]
          for(const record of records){safeFile(record.source,record.root,this.lab);safeFile(record.destination,this.lab.quarantineDir(),this.lab);if(existsSync(record.source))throw new Error('The app created a new cache. Undo refused to overwrite it.')}
          for(const record of records)renameSync(record.destination,record.source)
          return {passed:records.every(record=>existsSync(record.source)),summary:'Original cache directories restored.',checks:records.map(record=>result('Cache restored: '+basename(record.source),existsSync(record.source)))}
        }
        throw new Error('Unsupported application backup type.')
      } finally {if(wasRunning)this.launch(roots.exe)}
    }catch(error){return {passed:false,summary:(error as Error).message,checks:[]}}
  }
}
