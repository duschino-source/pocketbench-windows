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
const state={snapshot:{scannedAt:new Date().toISOString(),platform:'win32',machine:{name:'QA fixture',os:'Windows 11',memoryTotal:16*1024**3,memoryFree:8*1024**3,uptime:3600,cpuCount:8},metrics:{diskFree:100*1024**3,diskTotal:500*1024**3,cpuPercent:12},diagnostics:[{id:'qa-dns',area:'windows',category:'network',title:'DNS cache stale',severity:'warning',observed:'Resolver cache holds old records',details:['Cached records predate the last network change.']}],apps:[{id:'qa-firefox',name:'Mozilla Firefox',version:'159.0',publisher:'Mozilla',family:'firefox',capabilities:['app.patchConfig','app.restart']},{id:'qa-obsidian',name:'Obsidian',version:'1.0',publisher:'Obsidian',family:'obsidian',capabilities:[]}],startup:[],services:[],labMode:true},plans:[],history:[],settings:{hasApiKey:false,budgetLimit:90,model:'muse-spark-1.3',labMode:true,dataDirectory:'Isolated UI QA fixture'},budget:{limit:90,spent:0,reserved:0,remaining:90,requests:0}};
let releaseState;
ipcMain.handle('pocketbench:state',()=>releaseState ? new Promise(resolve=>{releaseState=()=>resolve(state)}) : state);
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
  await until("document.querySelector('h1')?.textContent === "+JSON.stringify(expected),label);
   await until("Boolean(document.querySelector('.pb-page-view'))",label+' view');
   await check("new Promise(requestAnimationFrame).then(()=>new Promise(requestAnimationFrame))");
   if(label==='Apps')await until("Boolean(document.querySelector('.pb-app-entry'))",label+' entries');
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
 // Global palette: Ctrl+K, ranked results, Enter focuses the app inspector.
 await check("document.querySelector('button[aria-label=\"Overview\"]').click()");
 await check("window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))");
 await until("Boolean(document.querySelector('.pb-palette'))",'palette open');
 results.paletteAnimation=await check("getComputedStyle(document.querySelector('.pb-palette')).animationName");
 if(results.paletteAnimation!=='pb-panel-enter')throw Error('Palette entry animation missing: '+results.paletteAnimation);
 await check("document.querySelector('.pb-palette input').focus()");
 await check("document.execCommand('insertText',false,'fire')");
 await until("document.querySelector('.pb-palette-item')?.textContent.includes('Firefox')",'palette result');
 await check("document.querySelector('.pb-palette input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
 await until("document.querySelector('.pb-inspector-heading h2')?.textContent==='Mozilla Firefox'",'palette app focus');
 results.palette={opened:true,focusedApp:'Mozilla Firefox'};
 // Findings search filters by text on top of the category chips.
 await check("document.querySelector('button[aria-label=\"Windows\"]').click()");
 await until("Boolean(document.querySelector('input[aria-label=\"Search diagnostic findings\"]'))",'findings search');
 await check("document.querySelector('input[aria-label=\"Search diagnostic findings\"]').focus()");
 await check("document.execCommand('insertText',false,'dns')");
 await until("document.querySelectorAll('.pb-win-row').length===1",'findings filtered');
 results.findingsSearch={matches:1};
 if(results.appSelection.iconsLoaded!==3)throw Error('Program icon images failed to load');
 window.webContents.debugger.attach('1.3');
 await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 results.reduced=await check("({enabled:matchMedia('(prefers-reduced-motion: reduce)').matches,name:getComputedStyle(document.querySelector('.pb-page-view')).animationName,transition:getComputedStyle(document.querySelector('.pb-nav-button')).transitionDuration})");
 if(!results.reduced.enabled||results.reduced.name!=='none'||results.reduced.transition!=='0s')throw Error('Reduced motion did not disable animation and transitions');
 await check("document.querySelector('button[aria-label=\"Apps\"]').click()");
 await until("Boolean(document.querySelector('.pb-app-entry'))",'reduced apps entries');
 await check("document.querySelector('.pb-app-entry').click()");
 await until("Boolean(document.querySelector('.pb-inspector-content'))",'reduced inspector');
 results.reducedInspector=await check("getComputedStyle(document.querySelector('.pb-inspector-content')).animationName");
 if(results.reducedInspector!=='none')throw Error('Reduced motion did not disable inspector animation');
 await check("window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))");
 await until("Boolean(document.querySelector('.pb-palette'))",'reduced palette open');
 results.reducedPalette=await check("getComputedStyle(document.querySelector('.pb-palette')).animationName");
 if(results.reducedPalette!=='none')throw Error('Reduced motion did not disable palette animation');
 await check("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
 // Theme interaction tests use the real provider and browser storage.
 console.log('Base UI navigation, search, icons and reduced-motion checks passed.');
 const navigate=async(label)=>{
  await check(`document.querySelector('button[aria-label="${label}"]').click()`);
  const expected=label==='Windows'?'Windows diagnostics':label==='Apps'?'Applications':label;
  await until(`document.querySelector('h1')?.textContent===${JSON.stringify(expected)}`,'route '+label);
  const marker={Overview:'.pb-overview',Windows:'#windows-diagnostics',Apps:'.pb-apps-workspace',Activity:'#activity-history',Settings:'#settings-appearance'}[label];
  await until(`Boolean(document.querySelector('${marker}'))`,'route content');
  await check("document.getAnimations().forEach(a=>{if(a.effect?.getTiming().iterations!==Infinity)a.finish()})");
 };
 const reload=async()=>{
  await window.loadFile(path.join(root,'out/renderer/index.html'));
  await until("Boolean(document.querySelector('.pb-page-view'))",'reload');
 };
 const selectTheme=async(theme)=>{
  await navigate('Settings');
  await until("Boolean(document.querySelector('input[value=\"system\"]'))",'appearance controls');
  await check(`document.querySelector('input[value="${theme}"]').click()`);
  await until(`document.querySelector('input[value="${theme}"]').checked`,'theme preference');
 };
 const emulate=async(theme)=>window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[
  {name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-color-scheme',value:theme}
 ]});
 await emulate('light');await selectTheme('system');
 await until("document.documentElement.dataset.theme==='light'",'system light');
 await emulate('dark');
 await until("document.documentElement.dataset.theme==='dark'",'OS change');
 await selectTheme('light');await emulate('dark');
 if(await check("document.documentElement.dataset.theme")!=='light')throw Error('Explicit appearance followed OS');
 await reload();
 if(await check("document.documentElement.dataset.theme")!=='light')throw Error('Appearance did not persist');
 await navigate('Settings');
 await check("window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('Storage denied')};void 0");
 await check("document.querySelector('input[value=\"dark\"]').click()");
 await until("document.querySelector('input[value=\"system\"]').checked",'storage failure fallback');
 await check("Storage.prototype.setItem=window.qaSetItem;localStorage.setItem('pocketbench:appearance','invalid')");
 await reload();await navigate('Settings');
 await until("document.querySelector('input[value=\"system\"]').checked",'invalid preference fallback');
 console.log('Appearance behavior checks passed.');
 results.appearance={osChanges:true,explicitOverride:true,persistence:true,writeFailure:true,invalidValue:true};

 // Repair fixtures are display-only. All mutation IPC handlers above still refuse execution.
 const step={id:'qa-step',operation:'windows.clearUserProxy',title:'Clear manual proxy',targetId:'current-user',params:{},requiresAdmin:false,reversible:true,impact:'Windows will connect directly. Your previous proxy settings are backed up.',verification:'Read back the proxy setting and check connectivity.'};
 const plan={id:'qa-ready',createdAt:new Date().toISOString(),title:'Restore the Windows connection',summary:'The manual proxy is unavailable. A direct connection may restore access.',target:{kind:'windows',name:'Windows'},status:'ready',reason:'Supported change reviewed.',evidence:state.snapshot.diagnostics,sources:[{url:'https://support.microsoft.com/',title:'Windows network guidance',kind:'official',supports:'Proxy settings',applicable:true,concerns:[],corroboratedBy:[]}],steps:[step],review:{approved:true,rationale:'Supported operation with independent verification.',concerns:[]}};
 state.plans=[plan,{...plan,id:'qa-blocked',title:'Blocked repair',status:'blocked',reason:'The selected setting is managed by your organization.',review:{approved:false,rationale:'Managed setting',concerns:['Managed setting']}},...['fixed','failed','pending-verification'].map(status=>({...plan,id:'qa-'+status,title:status+' repair'}))];
 state.history=['fixed','failed','pending-verification'].map(status=>({id:'run-'+status,planId:'qa-'+status,title:status==='fixed'?'Restored proxy settings':status==='failed'?'Connection check failed':'Waiting for Windows restart',createdAt:plan.createdAt,finishedAt:plan.createdAt,status,canUndo:status==='fixed',executions:[{step,startedAt:plan.createdAt,finishedAt:plan.createdAt,success:status!=='failed',output:'Fixture only',data:{},backupId:'qa-backup'}],verification:[{passed:status==='fixed',pendingReboot:status==='pending-verification',summary:status==='fixed'?'The proxy setting was restored.':status==='failed'?'The connection could not be verified.':'Verification requires a restart.',checks:[{name:'Manual proxy',passed:status!=='failed',before:'Enabled',after:'Disabled'},{name:'Connection',passed:status==='fixed'}]}],...(status==='failed'?{error:'The endpoint did not respond.'}:{})}));
 await reload();await navigate('Activity');
 await until("Boolean(document.querySelector('.pb-operation-details'))",'history');
 if(await check("document.querySelector('.pb-operation-details').open"))throw Error('History details should start collapsed');
 await check("document.querySelector('.pb-operation-details summary').click()");
 await until("document.querySelector('.pb-operation-details').open",'history disclosure');
 if(!await check("document.querySelector('.pb-operation-details').textContent.includes('Not recorded')"))throw Error('Missing check observations were not labeled');
 const openPlan=async(index)=>{
  await navigate('Activity');
  await until("document.querySelectorAll('button').length>0",'activity buttons');
  await check(`[...document.querySelectorAll('button')].filter(b=>b.textContent==='Open plan')[${index}].focus();[...document.querySelectorAll('button')].filter(b=>b.textContent==='Open plan')[${index}].click()`);
  await until("Boolean(document.querySelector('.pb-plan-focus'))",'plan review');
  await check("document.getAnimations().forEach(a=>{if(a.effect?.getTiming().iterations!==Infinity)a.finish()})");
 };
 await openPlan(1);
 if(!await check("[...document.querySelectorAll('.pb-apply-bar button')][0].disabled"))throw Error('Blocked plan can apply');
 await check("document.querySelector('.pb-plan-focus-bar button').click()");
 await until("!document.querySelector('.pb-plan-focus')",'return to activity');
 if(!await check("document.activeElement.textContent==='Open plan'"))throw Error('Plan focus was not restored');
 await openPlan(0);
 if(await check("document.querySelector('.pb-apply-bar button').disabled"))throw Error('Ready reviewed plan is incorrectly disabled');
 await openPlan(4);
 if(!await check("Boolean(document.querySelector('.pb-plan-result .pb-pending-reboot')) && document.querySelector('.pb-plan-result').textContent.includes('Pending verification')"))throw Error('Pending reboot presented as completed');
 console.log('Repair states and focus restoration checks passed.');
 results.repairStates={blocked:true,ready:true,pending:true,details:true,missingValues:true,focusRestored:true};

 fs.mkdirSync('.local/ui-redesign',{recursive:true});
 const capture=async(name)=>{
  await check("new Promise(requestAnimationFrame).then(()=>new Promise(requestAnimationFrame))");
  await pause(100);
  fs.writeFileSync('.local/ui-redesign/'+name+'.png',(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 };
 const assertLayout=async(label)=>{
  const measured=await check("({viewport:innerWidth,document:document.documentElement.scrollWidth,content:document.querySelector('.pb-content').clientWidth,contentScroll:document.querySelector('.pb-content').scrollWidth})");
  if(measured.document>measured.viewport+1||measured.contentScroll>measured.content+1)throw Error('Horizontal overflow: '+label+' '+JSON.stringify(measured));
  const contrast=await check(fs.readFileSync(path.join(__dirname,'contrast-check.js'),'utf8'));
  if(contrast.failures.length)throw Error('Contrast: '+label+' '+JSON.stringify(contrast.failures));
  const clipped=await check(`Array.from(document.querySelectorAll('button,input,summary')).filter(e=>{
    const r=e.getBoundingClientRect();return r.width && r.height && r.bottom>56 && r.top<innerHeight && (r.left<0 || r.right>innerWidth+1);
  }).map(e=>e.textContent || e.getAttribute('aria-label'))`);
  if(clipped.length)throw Error('Clipped controls: '+label+' '+JSON.stringify(clipped));
  results.scaling.push({label,...measured,contrast});
 };
 for(const theme of ['light','dark']){
  await selectTheme(theme);
  for(const [width,height] of [[1340,880],[980,680]])for(const zoom of [1,2]){
   window.setSize(width,height);window.webContents.setZoomFactor(zoom);await pause(100);
   const label=theme+'-'+width+'-'+zoom;
   for(const route of ['Overview','Windows','Apps','Activity','Settings']){
    await navigate(route);
    if(route==='Activity')await check("document.querySelectorAll('.pb-operation-details').forEach(d=>d.open=true)");
    if(route==='Apps')await check("document.querySelector('.pb-app-entry').click()");
    await assertLayout(label+'-'+route);
    if(route==='Overview')await capture(label);
   }
   await openPlan(2);await assertLayout(label+'-verified');
   await check("document.querySelector('.pb-plan-result').scrollIntoView({block:'end'})");
   await capture(label+'-result');
   await openPlan(1);await assertLayout(label+'-blocked');
   await openPlan(3);await assertLayout(label+'-failed');
   await openPlan(4);await assertLayout(label+'-pending');
  }
 }
 // Empty and startup states share the same theme and require no scan or model call.
 const savedSnapshot=state.snapshot;state.snapshot=null;state.plans=[];state.history=[];
 window.setSize(1340,880);window.webContents.setZoomFactor(1);
 for(const theme of ['light','dark']){
  await selectTheme(theme);await reload();
  if(!await check("document.body.innerText.includes('Scan this PC')"))throw Error('Empty scan action missing');
  await assertLayout(theme+'-empty');
  await capture(theme+'-empty');
  window.webContents.send('pocketbench:progress',{phase:'apply',message:'Checking the recorded repair result.',startedAt:new Date().toISOString(),cancellable:false,cancellationReason:'Verification must finish before another change.'});
  await until("Boolean(document.querySelector('.pb-progress [role=progressbar]'))",'indeterminate progress');
  if(await check("document.querySelector('.pb-progress [role=progressbar]').hasAttribute('aria-valuenow')"))throw Error('Indeterminate progress fabricated a percentage');
  if(await check("Boolean(document.querySelector('.pb-progress button'))"))throw Error('Unsafe cancel action shown');
  await assertLayout(theme+'-progress');await capture(theme+'-progress');
  window.webContents.send('pocketbench:progress',{phase:'scan',message:'Reading application inventory.',percent:40});
  await until("document.querySelector('.pb-progress [role=progressbar]')?.getAttribute('aria-valuenow')==='0.4'",'measured progress');

  releaseState=()=>{};
  await window.loadFile(path.join(root,'out/renderer/index.html'));
  await until("Boolean(document.querySelector('.pb-boot-loading'))",'loading state');
  if(await check("document.documentElement.dataset.theme")!==theme)throw Error('Startup theme mismatch');
  await capture(theme+'-loading');
  releaseState();releaseState=null;
  await until("Boolean(document.querySelector('.pb-page-view'))",'startup resolved');
 }
 state.snapshot=savedSnapshot;
 results.rendererErrors=errors;if(errors.length)throw Error('Renderer console errors: '+errors.join('; '));
 fs.writeFileSync(path.join(process.cwd(),'.local/ui-qa-result.json'),JSON.stringify(results,null,2));console.log('UI checks passed: themes, preferences, repair states, contrast, focus, reduced motion, and 100-200% scaling');window.destroy();app.quit();
}).catch(error=>{fs.writeFileSync(path.join(process.cwd(),'.local/ui-qa-error.txt'),error.stack||error.message);console.error(error.message);app.exit(1)});

