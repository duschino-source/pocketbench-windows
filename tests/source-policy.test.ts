import { describe, it, expect } from 'vitest'
import { assessSources, sourceKind, publicSource, sourceGate, dangerousPlan } from '../src/main/source-policy'
import type { SourceAssessment, RepairStep } from '../src/shared/contracts'
const step:RepairStep={id:'one',operation:'windows.clearUserProxy',title:'Restore direct connection',targetId:'windows',params:{},requiresAdmin:false,reversible:true,impact:'Update user proxy',verification:'Direct route works'}
const source=(url:string):SourceAssessment=>({url,title:'Fix',kind:'community',supports:'windows.clearUserProxy',applicable:true,concerns:[],corroboratedBy:[]})
describe('internet evidence gates',()=>{
  it('rejects forged official labels, fabricated citations, credentials and local URLs',()=>{
    expect(sourceKind('https://support.microsoft.com.evil.example/fix','Windows')).toBe('community')
    expect(sourceKind('https://learn.microsoft.com/en-us/answers/questions/1','Windows')).toBe('community')
    expect(sourceKind('https://forum.obsidian.md/t/fix','Obsidian')).toBe('community')
    for (const url of ['http://vendor.example','https://127.0.0.1/x','https://user:password@vendor.example/x','javascript:alert(1)']) expect(()=>publicSource(url)).toThrow()
    expect(assessSources([{...source('https://fake.example/fix'),kind:'official'}],[],'Windows')).toEqual([])
  })
  it('accepts only evidenced applicable fixes and rejects unsupported step claims',()=>{
    const s={...source('https://support.microsoft.com/fix'),kind:'official' as const}
    expect(sourceGate([step],[s])).toEqual([])
    expect(sourceGate([step],[{...s,applicable:false}])).toHaveLength(1)
    expect(sourceGate([step],[{...s,concerns:['Wrong Windows version']}])).toHaveLength(1)
    expect(sourceGate([step],[{...s,supports:'app.repairPackage'}])).toHaveLength(1)
  })
  it('requires distinct corroborating publishers, not two posts from one forum',()=>{
    const a=source('https://reddit.com/r/windows/a');const b=source('https://old.reddit.com/r/windows/b')
    a.corroboratedBy=[b.url];b.corroboratedBy=[a.url]
    expect(sourceGate([step],[a,b])).toHaveLength(1)
    b.url='https://vendor-forum.example/fix';a.corroboratedBy=[b.url];b.corroboratedBy=[a.url]
    expect(sourceGate([step],[a,b])).toEqual([])
    expect(sourceGate([step],[a])).toHaveLength(1)
  })
  it('blocks destructive commands and security weakening despite model approval',()=>{
    expect(dangerousPlan({steps:[{...step,title:'Disable Windows Defender'}]})).toContain('security')
    expect(dangerousPlan({steps:[{...step,params:{command:'Invoke-Expression'}}]})).toContain('unsupported')
    expect(dangerousPlan({steps:[step]})).toBeNull()
  })
})
