const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
 const {spawnSync}=require('node:child_process');
 const run=spawnSync(require('electron'),[__filename],{cwd:root,stdio:'inherit',windowsHide:true});
 process.exit(run.status??1);
}
const {app,BrowserWindow,ipcMain}=require('electron');
process.chdir(root);fs.mkdirSync('.local',{recursive:true});
app.setPath('userData',path.join(process.cwd(),'.local','ui-qa-profile'));
const state={snapshot:{scannedAt:new Date().toISOString(),platform:'win32',machine:{name:'QA fixture',os:'Windows 11',memoryTotal:16*1024**3,memoryFree:8*1024**3,uptime:3600,cpuCount:8},metrics:{diskFree:100*1024**3,diskTotal:500*1024**3,cpuPercent:12},diagnostics:[],apps:[{id:'qa-firefox',name:'Mozilla Firefox',version:'159.0',publisher:'Mozilla',family:'firefox',capabilities:['app.patchConfig','app.restart']},{id:'qa-obsidian',name:'Obsidian',version:'1.0',publisher:'Obsidian',family:'obsidian',capabilities:[]}],startup:[],services:[],labMode:true},plans:[],history:[],settings:{hasApiKey:false,budgetLimit:90,model:'muse-spark-1.3',labMode:true,dataDirectory:'Isolated UI QA fixture'},budget:{limit:90,spent:0,reserved:0,remaining:90,requests:0}};
ipcMain.handle('pocketbench:state',()=>state);
ipcMain.handle('pocketbench:update-state',()=>({status:'manual',supported:false,trustedPublisher:false,message:'Isolated UI check'}));
const fixtureIcon='data:image/png;base64,'+fs.readFileSync('resources/icon.png').toString('base64');
ipcMain.handle('pocketbench:app-icon',()=>fixtureIcon);
for(const name of ['scan','investigate','apply','undo','save-key','clear-key','open-external'])ipcMain.handle('pocketbench:'+name,()=>{throw Error('Isolated UI QA: host operations unavailable')});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,width:1340,height:880,webPreferences:{preload:path.join(process.cwd(),'out/preload/index.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
 const errors=[];window.webContents.on('console-message',(event,...args)=>{const detail=args.find(value=>value&&typeof value==='object'&&value.message)||event;if(detail.level==='error'||detail.level===3)errors.push(detail.message)});
 await window.loadFile(path.join(process.cwd(),'out/renderer/index.html'));
 const check=async(code)=>{try{return await window.webContents.executeJavaScript(code)}catch(error){fs.writeFileSync('.local/ui-qa-failed-js.txt',code);fs.writeFileSync('.local/ui-qa-dom.txt',await window.webContents.executeJavaScript('document.body.innerText'));throw error}};
 const until=async(code,label)=>{const deadline=Date.now()+8000;while(Date.now()<deadline){if(await check(code))return;await pause(50)}throw Error('UI did not finish loading: '+label)};
 await until("Boolean(document.querySelector('.pb-page-view'))",'initial state');await pause(260);
 const results={mode:'Isolated UI fixtures. No host repairs or API calls.',normal:await check("({name:getComputedStyle(document.querySelector('.pb-page-view')).animationName,duration:getComputedStyle(document.querySelector('.pb-page-view')).animationDuration})"),routes:[],scaling:[]};
 // Hidden Chromium windows can pause animation clocks. Finish only initial entry before testing navigation.
 await check("document.querySelector('.pb-page-view').getAnimations().forEach(animation=>animation.finish())");
 for(const label of ['Windows','Apps','Activity','Settings','Overview']){
  await check("document.querySelector('button[aria-label=\""+label+"\"]').click()");
  const expected=label==='Windows'?'Windows diagnostics':label==='Apps'?'Applications':label;
  await until("document.querySelector('h1')?.textContent === "+JSON.stringify(expected),label);await pause(260);
  const observed=await check("({title:document.querySelector('h1').textContent,animation:getComputedStyle(document.querySelector('.pb-page-view')).animationName,overflow:document.documentElement.scrollWidth>innerWidth})");
  if(observed.overflow)throw Error('Horizontal viewport overflow at '+label);
  observed.contrast=await check(fs.readFileSync(path.join(__dirname,'contrast-check.js'),'utf8'));
  if(observed.contrast.failures.length)throw Error('Text contrast failed: '+JSON.stringify(observed.contrast.failures));
  observed.navigationReplayed=await check("document.querySelector('.pb-page-view').getAnimations().some(animation=>animation.playState==='running')");
  if(observed.navigationReplayed)throw Error('Frequent navigation replayed an animation');
  results.routes.push(observed);
  if(label==='Apps'){
   await check("document.querySelector('.pb-app-entry').click()");
   await until("document.querySelectorAll('.pb-program-icon img').length===3",'program icons');
   results.appSelection=await check("({heading:document.querySelector('.pb-inspector-heading h2').textContent,animation:getComputedStyle(document.querySelector('.pb-inspector-content')).animationName,iconsLoaded:document.querySelectorAll('.pb-program-icon img').length})");
  }
 }
 results.blackPalette=await check("({canvas:getComputedStyle(document.querySelector('.pb-app')).backgroundColor,sidebar:getComputedStyle(document.querySelector('.pb-sidebar')).backgroundColor})");
 if(results.blackPalette.canvas!=='rgb(0, 0, 0)'||results.blackPalette.sidebar!=='rgb(0, 0, 0)')throw Error('Canvas is not true black');
 if(results.appSelection.iconsLoaded!==3)throw Error('Program icon images failed to load');
 window.webContents.debugger.attach('1.3');
 await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 results.reduced=await check("({enabled:matchMedia('(prefers-reduced-motion: reduce)').matches,name:getComputedStyle(document.querySelector('.pb-page-view')).animationName,transition:getComputedStyle(document.querySelector('.pb-nav-button')).transitionDuration})");
 if(!results.reduced.enabled||results.reduced.name!=='none'||results.reduced.transition!=='0s')throw Error('Reduced motion did not disable animation and transitions');
 for(const zoom of [1,1.5,2]){
  window.webContents.setZoomFactor(zoom);await pause(100);
  results.scaling.push(await check("({zoom:"+zoom+",viewport:innerWidth,document:document.documentElement.scrollWidth,content:document.querySelector('.pb-content').clientWidth,contentScroll:document.querySelector('.pb-content').scrollWidth})"));
 }
 if(results.scaling.some(item=>item.document>item.viewport||item.contentScroll>item.content+1))throw Error('Horizontal overflow at display scaling');
 results.rendererErrors=errors;if(errors.length)throw Error('Renderer console errors: '+errors.join('; '));
 fs.writeFileSync(path.join(process.cwd(),'.local/ui-qa-result.json'),JSON.stringify(results,null,2));console.log('UI checks passed: true black, AA text contrast, icon loading, reduced motion, instant navigation, 100–200% zoom.');window.destroy();app.quit();
}).catch(error=>{fs.writeFileSync(path.join(process.cwd(),'.local/ui-qa-error.txt'),error.stack||error.message);console.error(error.message);app.exit(1)});

