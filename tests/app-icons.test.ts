import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppIcons, type IconTarget } from '../src/main/app-icons'

const folders:string[]=[]
const folder=()=>{const path=mkdtempSync(join(tmpdir(),'pb-icons-'));folders.push(path);return path}
const image='data:image/png;base64,aWNvbg=='
function target(executable?:string):IconTarget {return {app:{id:'test-app',name:'Test app',version:'1',publisher:'Test',capabilities:[],executable},store:false}}
afterEach(()=>{for(const path of folders.splice(0))rmSync(path,{recursive:true,force:true})})

describe('discovered program icon boundary',()=>{
  it('extracts the registered executable icon without executing it and caches repeated rows',async()=>{
    const root=folder(),file=join(root,'program.exe');writeFileSync(file,'A non-executable test fixture')
    const chosen={...target(),registeredIcon:'"'+file+'",0'};let calls=0
    const icons=new AppIcons(id=>id==='test-app'?chosen:undefined,async(path,isImage)=>{expect(path).toBe(file);expect(isImage).toBe(false);calls++;return image})
    expect(await icons.get('test-app')).toBe(image);expect(await icons.get('test-app')).toBe(image);expect(calls).toBe(1)
    chosen.app.version='2';expect(await icons.get('test-app')).toBe(image);expect(calls).toBe(2)
  })
  it('rejects renderer-supplied paths, unknown identifiers, URLs and UNC locations',async()=>{
    let calls=0
    const chosen=target('\\\\server\\share\\program.exe');chosen.registeredIcon='https://example.com/program.exe'
    const icons=new AppIcons(id=>id==='test-app'?chosen:undefined,async()=>{calls++;return image})
    await expect(icons.get('C:\\private\\file.exe')).rejects.toThrow('inventory')
    await expect(icons.get({path:'secret'})).rejects.toThrow('identifier')
    expect(await icons.get('test-app')).toBeNull();expect(calls).toBe(0)
  })
  it('refuses junctions and symbolic links before icon extraction',async()=>{
    const root=folder(),outside=folder(),link=join(root,'linked')
    writeFileSync(join(outside,'program.exe'),'fixture')
    try{symlinkSync(outside,link,process.platform==='win32'?'junction':'dir')}catch{return}
    const icons=new AppIcons(()=>target(join(link,'program.exe')),async()=>{throw Error('Link was followed')})
    expect(await icons.get('test-app')).toBeNull()
  })
  it('loads a discovered Store PNG variant and refuses a manifest path escape',async()=>{
    const root=folder();mkdirSync(join(root,'Assets'));writeFileSync(join(root,'AppxManifest.xml'),'<VisualElements Square44x44Logo="Assets/logo.png" />')
    writeFileSync(join(root,'Assets','logo.targetsize-48_altform-unplated.png'),Buffer.from([137,80,78,71,13,10,26,10]))
    const chosen=target();chosen.store=true;chosen.app.installLocation=root
    let calls=0
    const icons=new AppIcons(()=>chosen,async(path,isImage)=>{expect(path).toContain('targetsize-48');expect(isImage).toBe(true);calls++;return image})
    expect(await icons.get('test-app')).toBe(image);expect(calls).toBe(1)
    writeFileSync(join(root,'AppxManifest.xml'),'<VisualElements Square44x44Logo="../private.png" />');chosen.app.version='2'
    expect(await icons.get('test-app')).toBeNull();expect(calls).toBe(1)
  })
  it('keeps a missing icon or malformed native response on the local fallback',async()=>{
    const root=folder(),file=join(root,'program.exe');writeFileSync(file,'fixture')
    const icons=new AppIcons(()=>target(file),async()=>'<svg><script>bad</script></svg>')
    expect(await icons.get('test-app')).toBeNull()
  })
})

