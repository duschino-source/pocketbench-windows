import { app, BrowserWindow, ipcMain, nativeImage, safeStorage, session, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { isIP } from 'node:net'
import { WindowsEngine } from './windows'
import { MeteredModel, redact } from './model'
import { Controller } from './controller'
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater
import { UpdateManager, type UpdateAdapter } from './updater'
import { AppIcons } from './app-icons'
import { runScript } from './windows/native'
import type { AppSettings, InvestigateRequest } from '../shared/contracts'

const here=dirname(fileURLToPath(import.meta.url))
app.setName('PocketBench')
let window:BrowserWindow | null=null
let model:MeteredModel
let updates:UpdateManager|undefined
const dataArgument=process.argv.find(arg=>arg.startsWith('--data-dir='))
const userDataDirectory=dataArgument?dataArgument.slice('--data-dir='.length):join(app.getPath('appData'),'PocketBenchDesktop')
mkdirSync(userDataDirectory,{recursive:true});app.setPath('userData',userDataDirectory)
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance',()=>{if (window) {if(window.isMinimized())window.restore();window.focus()}})

function externalUrl(value: unknown): string {
  if (typeof value!=='string' || value.length>4096) throw new Error('Invalid source URL')
  const url=new URL(value)
  if (url.protocol!=='https:' || url.username || url.password || isIP(url.hostname) || !url.hostname.includes('.') || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) throw new Error('Only public HTTPS source links are allowed')
  return url.href
}

app.whenReady().then(async()=>{
  const dataDir=app.getPath('userData');mkdirSync(dataDir,{recursive:true})
  process.env.POCKETBENCH_RESOURCES=app.isPackaged?join(process.resourcesPath,'app.asar.unpacked','resources'):join(app.getAppPath(),'resources')
  const credentialFile=join(dataDir,'meta-credential.bin')
  const importKeyArgument=process.argv.find(arg=>arg.startsWith('--import-key-file='))
  if(importKeyArgument) {
    const key=readFileSync(importKeyArgument.slice('--import-key-file='.length),'utf8').replace(/^\uFEFF/,'').trim()
    if(key.length<20 || key.length>1000 || /[\r\n]/.test(key))throw new Error('Credential import file is not a valid single API key.')
    if(!safeStorage.isEncryptionAvailable())throw new Error('Windows credential encryption is unavailable. Credential import was refused.')
    writeFileSync(credentialFile,safeStorage.encryptString(key),{mode:0o600})
  }
  const labMode=process.argv.includes('--lab')
  function getKey():string|null {
    if (!existsSync(credentialFile)) return null
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable.')
    try {return safeStorage.decryptString(readFileSync(credentialFile))} catch {throw new Error('Stored credential could not be decrypted. Replace it in Settings.')}
  }
  model=new MeteredModel(dataDir,getKey)
  const settings=():AppSettings=>({hasApiKey:existsSync(credentialFile) || Boolean(process.env.POCKETBENCH_GATEWAY),budgetLimit:90,model:'muse-spark-1.3 · Standard',labMode,dataDirectory:dataDir})
  const engine=new WindowsEngine(dataDir,labMode?{labRoot:join(dataDir,'lab')}:undefined)
  const icons=new AppIcons(id=>engine.iconTarget(id),async(file,image)=>{
    const icon=image?nativeImage.createFromPath(file):await app.getFileIcon(file,{size:'large'})
    return icon.isEmpty()?null:icon.resize({width:64,height:64,quality:'best'}).toDataURL()
  })
  const defaultProgramIcon=runScript<{icon:string}>('stock-icon.ps1',{},15000).then(result=>/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.icon) && result.icon.length<200000?result.icon:null).catch(()=>null)
  const controller=new Controller(dataDir,engine,model,settings,event=>window?.webContents.send('pocketbench:progress',event))
  const handle=(channel:string,callback:(...args:any[])=>unknown)=>ipcMain.handle('pocketbench:'+channel,async(event,...args)=>{
    if (!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame) throw new Error('Untrusted application frame')
    try {return await callback(...args)} catch(error) {throw new Error(redact((error as Error).message))}
  })
  // This release is unsigned. Enable only after release signing is provisioned and tested.
  updates=new UpdateManager({currentVersion:app.getVersion(),installed:app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR,trustedPublisher:false,adapter:autoUpdater as unknown as UpdateAdapter,isBusy:()=>controller.isBusy(),changed:state=>window?.webContents.send('pocketbench:update',state)})
  handle('cancel',()=>controller.cancelOperation())
  handle('update-state',()=>updates!.getState());handle('update-check',()=>updates!.check());handle('update-install',()=>updates!.install())
  handle('state',()=>controller.state());handle('scan',()=>controller.scan())
  handle('app-icon',async(id:unknown)=>(await icons.get(id)) || await defaultProgramIcon)
  handle('investigate',(request:InvestigateRequest)=>controller.investigate(request))
  handle('apply',(planId:unknown)=>{if(typeof planId!=='string')throw new Error('Invalid plan identifier');return controller.apply(planId)})
  handle('undo',(runId:unknown)=>{if(typeof runId!=='string')throw new Error('Invalid repair identifier');return controller.undo(runId)})
  handle('save-key',async(key:unknown)=>{
    if(typeof key!=='string' || key.trim().length<20 || key.length>1000 || /[\r\n]/.test(key))throw new Error('Enter a valid Meta Model API key.')
    if(!safeStorage.isEncryptionAvailable())throw new Error('Windows credential encryption is unavailable. The key was not saved.')
    await model.reset();writeFileSync(credentialFile,safeStorage.encryptString(key.trim()),{mode:0o600});return settings()
  })
  handle('clear-key',async()=>{await model.reset();if(existsSync(credentialFile))unlinkSync(credentialFile);return settings()})
  handle('open-external',(url:unknown)=>shell.openExternal(externalUrl(url)))
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false))
  session.defaultSession.setPermissionCheckHandler(()=>false)
  const devUrl=process.env.ELECTRON_RENDERER_URL
  const startUrl=devUrl || new URL('../renderer/index.html',import.meta.url).href
  window=new BrowserWindow({width:1340,height:880,minWidth:980,minHeight:680,title:'PocketBench',icon:join(process.env.POCKETBENCH_RESOURCES,'icon.ico'),backgroundColor:'#000000',show:true,autoHideMenuBar:true,webPreferences:{preload:join(here,'../preload/index.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,spellcheck:false}})
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  window.webContents.on('will-navigate',(event,url)=>{if(url!==startUrl)event.preventDefault()})
  window.webContents.on('will-attach-webview',event=>event.preventDefault())
  window.once('ready-to-show',()=>window?.show())
  window.on('close',event=>{if(controller.isBusy()){event.preventDefault();window?.webContents.send('pocketbench:progress',{phase:'apply',message:'Finish the current operation before closing PocketBench.',cancellable:false})}})
  window.on('closed',()=>{window=null})
  if(devUrl)await window.loadURL(devUrl);else await window.loadFile(join(here,'../renderer/index.html'))
  if(app.isPackaged && !process.argv.includes('--smoke'))updates.start()
  if(process.argv.includes('--smoke')) {
    try {
      const snapshot=await controller.scan()
      const secureRenderer=await window.webContents.executeJavaScript("typeof require === 'undefined' && typeof window.pocketbench?.scan === 'function'")
      writeFileSync(join(dataDir,'smoke-result.json'),JSON.stringify({ok:true,appCount:snapshot.apps.length,diagnosticCount:snapshot.diagnostics.length,labMode:snapshot.labMode,secureRenderer},null,2))
    } catch(error) {writeFileSync(join(dataDir,'smoke-result.json'),JSON.stringify({ok:false,error:redact((error as Error).message)}))}
    app.quit()
  }
}).catch(error=>{console.error('PocketBench startup:',redact(error.message));app.exit(1)})
app.on('window-all-closed',()=>app.quit())
app.on('before-quit',()=>{updates?.dispose();void model?.reset()})
