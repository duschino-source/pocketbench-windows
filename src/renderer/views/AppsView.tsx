import * as React from 'react';
import { Button, SearchBox } from '@fluentui/react-components';
import { AppsRegular, ChevronRightRegular, CheckmarkCircleRegular } from '@fluentui/react-icons';
import type { AppTarget, OperationId } from '../../shared/contracts';
import { findPlan, latestRunForPlan, type ViewProps } from '../types';
import { PlanDetail } from '../components/PlanDetail';
import { SymptomForm } from '../components/SymptomForm';
import { ProgramIcon } from '../components/ProgramIcon';

const OPERATION_LABELS: Partial<Record<OperationId,string>> = {'app.updatePackage':'Package update','app.patchConfig':'Supported settings','app.quarantineCache':'Cache repair','app.restart':'App restart'};
const isIdentifier=(name:string)=>/^[0-9a-f]{8}-[0-9a-f-]+$/i.test(name);
function publisher(app:AppTarget):string {
  if (!app.publisher.startsWith('CN=')) return app.publisher || 'Publisher unavailable';
  return app.publisher.match(/(?:^|,\s*)O=([^,]+)/)?.[1] || 'Windows package';
}

export function AppsView(props:ViewProps):React.ReactElement {
  const {state,busy}=props;
  const apps=state.snapshot?.apps ?? [];
  const [query,setQuery]=React.useState('');
  const [selectedId,setSelectedId]=React.useState<string|null>(null);
  const [repairOnly,setRepairOnly]=React.useState(false);
  const filtered=React.useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return apps.filter(app=>(!repairOnly || app.capabilities.length>0) && (!needle || [app.name,app.publisher,app.version,app.id].some(value=>value.toLowerCase().includes(needle))))
      .sort((a,b)=>Number(isIdentifier(a.name))-Number(isIdentifier(b.name)) || a.name.localeCompare(b.name));
  },[apps,query,repairOnly]);
  const selectedApp=apps.find(app=>app.id===selectedId);
  const selectedPlan=findPlan(state,props.selectedPlanId);
  return (
    <div>
      <section className="pb-section pb-apps-workspace" aria-label="Application workspace">
        <div className="pb-apps-catalog">
          <div className="pb-apps-toolbar"><SearchBox placeholder="Search applications…" aria-label="Search installed applications" value={query} onChange={(_,data)=>setQuery(data.value??'')} /><div className="pb-app-filters" role="group" aria-label="Application filters"><Button size="small" appearance="subtle" aria-pressed={!repairOnly} onClick={()=>setRepairOnly(false)}>All apps <span>{apps.length}</span></Button><Button size="small" appearance="subtle" aria-pressed={repairOnly} onClick={()=>setRepairOnly(true)}>Repair tools <span>{apps.filter(app=>app.capabilities.length>0).length}</span></Button></div></div>
          <ul className="pb-app-list" aria-label="Application inventory">
            {filtered.map((app,index)=><li key={app.id}><button type="button" className="pb-app-entry" aria-pressed={selectedId===app.id} onClick={()=>setSelectedId(app.id)}>
              <ProgramIcon app={app} eager={index<12} />
              <span className="pb-app-copy"><span className="pb-app-name">{app.name}</span><span className="pb-app-meta">{publisher(app)}{app.version?' · '+app.version:''}</span></span>
              {app.capabilities.length>0 && <span className="pb-capability-dot" title="Repair tools available" aria-label="Repair tools available" />}<ChevronRightRegular className="pb-app-chevron" />
            </button></li>)}
          </ul>
          {!filtered.length && <div className="pb-empty"><AppsRegular /><h3>{!state.snapshot?'No inventory yet':'No matching apps'}</h3><p>{!state.snapshot?'Scan this PC to discover installed applications.':'Try another search or switch to All apps.'}</p></div>}
          <div className="pb-catalog-foot">{filtered.length} of {apps.length} applications</div>
        </div>
        <div className="pb-app-inspector">
          {!selectedApp?<div className="pb-inspector-empty"><div className="pb-inspector-graphic"><AppsRegular /></div><h2>Let’s look at an app</h2><p>Select an application to see available repair tools and investigate a problem.</p><span>Installed version · Supported repairs · Sources</span></div>
            :<div className="pb-inspector-content" key={selectedApp.id}>
              <div className="pb-inspector-heading"><ProgramIcon app={selectedApp} large /><div><h2>{selectedApp.name}</h2><p>{publisher(selectedApp)} · {selectedApp.version || 'Version unavailable'}</p></div></div>
              <div className="pb-app-tools"><span className="pb-eyebrow">AVAILABLE TOOLS</span><div>{selectedApp.capabilities.length ? selectedApp.capabilities.map(operation=><span className="pb-tool-tag" key={operation}><CheckmarkCircleRegular />{OPERATION_LABELS[operation] || operation}</span>):<span className="pb-note">Research available. No automatic repair tools detected.</span>}</div></div>
              <SymptomForm {...props} app={selectedApp} />
              <details className="pb-technical"><summary>Installation details</summary><dl className="pb-kv"><dt>Identifier</dt><dd>{selectedApp.id}</dd>{selectedApp.installLocation&&<><dt>Location</dt><dd>{selectedApp.installLocation}</dd></>}{selectedApp.executable&&<><dt>Executable</dt><dd>{selectedApp.executable}</dd></>}{selectedApp.packageId&&<><dt>Package</dt><dd>{selectedApp.packageId}</dd></>}</dl></details>
            </div>}
        </div>
      </section>
      {selectedPlan && <PlanDetail plan={selectedPlan} busy={busy} latestRun={latestRunForPlan(state,selectedPlan.id)} onApply={props.onApply} onOpenExternal={props.onOpenExternal} />}
    </div>
  );
}

