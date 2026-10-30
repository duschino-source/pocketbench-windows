import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WindowsEngine } from '../src/main/windows'
import { MeteredModel } from '../src/main/model'
import { investigate } from '../src/main/research'
import { setProcessRunner, resetProcessRunner } from '../src/main/windows/native'

const enabled=process.env.POCKETBENCH_LIVE_MODEL==='1'
const folders:string[]=[]
afterEach(()=>{resetProcessRunner();for(const folder of folders.splice(0))rmSync(folder,{recursive:true,force:true})})
function fixture(firefox=false) {
  const directory=mkdtempSync(join(tmpdir(),'pocketbench-live-'));folders.push(directory)
  const labRoot=join(directory,'lab'),profile=join(labRoot,'apps','firefox','profile.default')
  mkdirSync(join(labRoot,'.pocketbench'),{recursive:true})
  const proxy={enable:1,server:'127.0.0.1:9',hasEnable:true,hasServer:true,enableKind:'DWord',serverKind:'String'}
  writeFileSync(join(labRoot,'.pocketbench','proxy.json'),JSON.stringify(proxy))
  if(firefox){mkdirSync(profile,{recursive:true});writeFileSync(join(profile,'prefs.js'),'// Disposable verification profile\nuser_pref("network.proxy.type", 1);\nuser_pref("network.proxy.http", "127.0.0.1");\nuser_pref("network.proxy.http_port", 9);\nuser_pref("network.proxy.allow_hijacking_localhost", true);\nuser_pref("network.proxy.no_proxies_on", "");\n')}
  setProcessRunner(async(_exe,args)=>{
    if(!args.some(arg=>arg.endsWith('scan.ps1')))throw new Error('A lab test attempted a native host operation.')
    return {exitCode:0,stderr:'',stdout:JSON.stringify({computerName:'Disposable Lab',osCaption:'Windows 11 Pro',osVersion:'10.0.26100',memoryTotal:8e9,memoryFree:4e9,cpuCount:4,diskFree:100e9,diskTotal:200e9,proxyEnable:1,proxyServer:'127.0.0.1:9',apps:firefox?[{id:'fixture-firefox',hive:'Fixture',name:'Mozilla Firefox (x64 en-US)',version:'159.0',publisher:'Mozilla'}]:[],services:[],startup:[]})}
  })
  const metered=new MeteredModel(join(directory,'model'),()=>null);let calls=0
  const model={call:async(...args:Parameters<MeteredModel['call']>)=>{const output=await metered.call(...args);mkdirSync('.local',{recursive:true});writeFileSync(`.local/live-${firefox?'firefox':'windows'}-call-${++calls}.json`,JSON.stringify({text:output.text,citations:output.citations},null,2));return output}}
  return {directory,labRoot,profile,proxy,engine:new WindowsEngine(join(directory,'data'),{labRoot}),model}
}

describe.skipIf(!enabled)('live Meta internet research and real isolated repair operations',()=>{
  it('researches, reviews, applies, verifies and undoes a Windows proxy lab repair',async()=>{
    const f=fixture(),snapshot=await f.engine.scan()
    const capabilities=f.engine.capabilities(snapshot).filter(cap=>cap.operation==='windows.clearUserProxy')
    const plan=await investigate({symptom:'In this isolated Windows 11 lab the manual user proxy is 127.0.0.1:9, a closed port. Direct connectivity works and no managed policy applies. Find a documented fix to turn off the broken manual proxy.'},snapshot,capabilities,f.model,()=>{})
    expect(plan.sources.length).toBeGreaterThan(0);expect(plan.status,JSON.stringify({reason:plan.reason,review:plan.review})).toBe('ready')
    for(const proposed of plan.steps) {
      const step=f.engine.validateStep(proposed,snapshot),execution=await f.engine.execute(step)
      expect(execution.success,execution.output).toBe(true);expect((await f.engine.verify(step,execution)).passed).toBe(true)
      expect(JSON.parse(readFileSync(join(f.labRoot,'.pocketbench','proxy.json'),'utf8')).enable).toBe(0)
      expect((await f.engine.undo(execution)).passed).toBe(true)
    }
    expect(JSON.parse(readFileSync(join(f.labRoot,'.pocketbench','proxy.json'),'utf8'))).toEqual(f.proxy)
    mkdirSync('.local',{recursive:true});writeFileSync('.local/live-windows-proof.json',JSON.stringify({at:new Date().toISOString(),plan,verified:true,restored:true},null,2))
  },240000)

  it('finds a Firefox fix online, changes real profile bytes and optionally proves browser connectivity',async()=>{
    const f=fixture(true),snapshot=await f.engine.scan(),app=snapshot.apps.find(app=>app.family==='firefox')!
    const capabilities=f.engine.capabilities(snapshot,app.id).filter(cap=>cap.operation==='app.patchConfig')
    const plan=await investigate({appId:app.id,symptom:'Firefox 159 cannot load pages because its default profile has network.proxy.type=1 and a stale manual HTTP proxy 127.0.0.1:9. Direct connectivity works. Find documented instructions for No proxy; use the provided supported operation to set network.proxy.type to 0.'},snapshot,capabilities,f.model,()=>{})
    expect(plan.sources.length).toBeGreaterThan(0);expect(plan.status,JSON.stringify({reason:plan.reason,review:plan.review})).toBe('ready')
    for(const proposed of plan.steps){const step=f.engine.validateStep(proposed,snapshot),execution=await f.engine.execute(step);expect(execution.success,execution.output).toBe(true);expect((await f.engine.verify(step,execution)).passed).toBe(true)}
    expect(readFileSync(join(f.profile,'prefs.js'),'utf8')).toContain('user_pref("network.proxy.type", 0);')
    let browserVerified=false
    const firefox=process.env.POCKETBENCH_FIREFOX_EXE
    if(firefox && existsSync(firefox)) {
      const nonce=randomUUID();let visited=false
      const server=createServer((request,response)=>{if(request.url?.includes(nonce))visited=true;response.writeHead(200,{'Content-Type':'text/html'});response.end('<title>PocketBench verified</title><h1>Firefox connection verified</h1><p>The repaired profile reached this local test page.</p>')})
      await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
      const address=server.address();if(!address || typeof address==='string')throw new Error('Local verification server unavailable')
      try {
        await new Promise<void>((resolve,reject)=>execFile(firefox,['--headless','--no-remote','--profile',f.profile,'--screenshot',join(f.directory,'firefox-verified.png'),`http://127.0.0.1:${address.port}/${nonce}`],{timeout:60000,windowsHide:true},error=>error?reject(error):resolve()))
        expect(visited,'The real Firefox process must reach the verification endpoint').toBe(true);browserVerified=true
      } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
    }
    mkdirSync('.local',{recursive:true});writeFileSync('.local/live-firefox-proof.json',JSON.stringify({at:new Date().toISOString(),plan,settingVerified:true,browserVerified},null,2))
  },300000)
})
