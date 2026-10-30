import * as React from 'react';
import { WindowRegular } from '@fluentui/react-icons';
import { getApi } from '../api';
import type { AppTarget } from '../../shared/contracts';

export function ProgramIcon({app,large=false,eager=false}:{app:AppTarget;large?:boolean;eager?:boolean}):React.ReactElement {
  const element=React.useRef<HTMLSpanElement>(null);
  const [icon,setIcon]=React.useState<string|null>(null);
  React.useEffect(()=>{
    setIcon(null);
    let active=true,requested=false;
    const load=()=>{
      if(requested)return;
      requested=true;
      void getApi().getAppIcon(app.id).then(value=>{if(active && value?.startsWith('data:image/png;base64,'))setIcon(value)}).catch(()=>{});
    };
    if(large || eager){load();return ()=>{active=false}};
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){load();observer.disconnect()}},{rootMargin:'96px'});
    if(element.current)observer.observe(element.current);
    return ()=>{active=false;observer.disconnect()};
  },[app.id,app.version,large,eager]);
  return <span className={'pb-program-icon'+(large?' pb-program-icon-large':'')} ref={element} aria-hidden="true">{icon?<img src={icon} alt="" onError={()=>setIcon(null)} />:<WindowRegular />}</span>;
}

