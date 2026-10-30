import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WindowsEngine } from '../src/main/windows'
import type { RepairStep } from '../src/shared/contracts'

// Never run fault injection on a developer workstation or self-hosted runner.
const hosted = process.platform==='win32' && process.env.GITHUB_ACTIONS==='true' && process.env.RUNNER_ENVIRONMENT==='github-hosted' && process.env.POCKETBENCH_CI_FAULT_TESTS==='1'
const ps=(script:string)=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:60000,windowsHide:true}).trim()
const makeStep=(operation:RepairStep['operation'],targetId:string,params:RepairStep['params']):RepairStep=>({id:'native-'+operation,operation,targetId,params,title:'Disposable native verification: '+operation,requiresAdmin:false,reversible:false,impact:'Derived locally',verification:'Derived locally'})
const results:{operation:string;passed:boolean;summary:string}[]=[]
function report(operation:string,passed:boolean,summary:string) {
  results.push({operation,passed,summary});mkdirSync('.local',{recursive:true});writeFileSync('.local/native-test-result.json',JSON.stringify({environment:'github-hosted-disposable-windows',results},null,2))
}

describe.skipIf(!hosted)('native repairs in disposable GitHub-hosted Windows VM',()=>{
  it('repairs a deliberately stale user proxy, independently reads it back, and undoes it',async()=>{
    const baseline=ps("$p='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; $k=Get-ItemProperty $p; [pscustomobject]@{hasEnable=($null -ne $k.ProxyEnable);enable=$k.ProxyEnable;hasServer=($null -ne $k.ProxyServer);server=$k.ProxyServer}|ConvertTo-Json -Compress")
    const original=JSON.parse(baseline)
    const dir=mkdtempSync(join(tmpdir(),'pocketbench-native-'));const engine=new WindowsEngine(dir)
    try {
      ps("$p='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; New-Item -Path $p -Force|Out-Null; Set-ItemProperty $p ProxyEnable 1 -Type DWord; Set-ItemProperty $p ProxyServer '127.0.0.1:9'")
      const snapshot=await engine.scan();const step=engine.validateStep(makeStep('windows.clearUserProxy','windows',{}),snapshot)
      const execution=await engine.execute(step);expect(execution.success,execution.output).toBe(true)
      expect(ps("(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings').ProxyEnable")).toBe('0')
      const verified=await engine.verify(step,execution);expect(verified.passed,verified.summary).toBe(true)
      const restored=await engine.undo(execution);expect(restored.passed,restored.summary).toBe(true)
      const proxy=JSON.parse(ps("Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'|Select-Object ProxyEnable,ProxyServer|ConvertTo-Json -Compress"))
      expect(proxy.ProxyEnable).toBe(1);expect(proxy.ProxyServer).toBe('127.0.0.1:9')
      report(step.operation,true,'Real registry mutation, independent readback, and undo passed.')
    } finally {
      const encoded=Buffer.from(JSON.stringify(original)).toString('base64')
      ps(`$v=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json; $p='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; if($v.hasEnable){Set-ItemProperty $p ProxyEnable ([int]$v.enable) -Type DWord}else{Remove-ItemProperty $p ProxyEnable -ErrorAction SilentlyContinue}; if($v.hasServer){Set-ItemProperty $p ProxyServer ([string]$v.server)}else{Remove-ItemProperty $p ProxyServer -ErrorAction SilentlyContinue}`)
    }
  },180000)

  it('starts an intentionally stopped selected service and verifies its native state',async()=>{
    const original=JSON.parse(ps("$s=Get-CimInstance Win32_Service -Filter \"Name='W32Time'\";[pscustomobject]@{status=$s.State;start=$s.StartMode}|ConvertTo-Json -Compress"))
    const dir=mkdtempSync(join(tmpdir(),'pocketbench-native-service-'));const engine=new WindowsEngine(dir)
    try {
      ps('Set-Service W32Time -StartupType Manual; Stop-Service W32Time -Force -ErrorAction Stop')
      const step=engine.validateStep(makeStep('windows.startService','W32Time',{serviceName:'W32Time'}),await engine.scan())
      const execution=await engine.execute(step);expect(execution.success,execution.output).toBe(true)
      expect(ps('(Get-Service W32Time).Status.ToString()')).toBe('Running')
      const verification=await engine.verify(step,execution);expect(verification.passed,verification.summary).toBe(true)
      report(step.operation,true,'Real service start and independent SCM readback passed.')
    } finally {
      const start=original.start==='Auto'?'Automatic':original.start==='Disabled'?'Disabled':'Manual'
      if(original.status!=='Running')ps('Stop-Service W32Time -Force -ErrorAction SilentlyContinue')
      ps(`Set-Service W32Time -StartupType ${start}`)
      if(original.status==='Running')ps('Start-Service W32Time')
    }
  },180000)

  it('disables and restores only its own disposable startup entry',async()=>{
    const name='PocketBench-CI-Only'
    const engine=new WindowsEngine(mkdtempSync(join(tmpdir(),'pocketbench-native-startup-')))
    try {
      ps("$p='HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';New-Item $p -Force|Out-Null;Set-ItemProperty $p 'PocketBench-CI-Only' 'C:\\Windows\\System32\\notepad.exe'")
      const snapshot=await engine.scan();const entry=snapshot.startup.find(s=>s.name===name);expect(entry).toBeDefined()
      const step=engine.validateStep(makeStep('windows.disableStartup',entry!.id,{entryId:entry!.id}),snapshot)
      const execution=await engine.execute(step);expect(execution.success,execution.output).toBe(true)
      expect((await engine.verify(step,execution)).passed).toBe(true)
      expect((await engine.undo(execution)).passed).toBe(true)
      expect(ps("(Get-ItemProperty 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run').'PocketBench-CI-Only'")).toBe('C:\\Windows\\System32\\notepad.exe')
      report(step.operation,true,'Real user startup entry, verification, and backup restoration passed.')
    } finally {ps("Remove-ItemProperty 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run' 'PocketBench-CI-Only' -ErrorAction SilentlyContinue")}
  },180000)
})
