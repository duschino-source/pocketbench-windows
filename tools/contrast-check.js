(() => {
 const luminance = channels => channels.map(v => {v/=255; return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const color = text => {const m=text.match(/[\d.]+/g);return m?m.map(Number):[0,0,0,0]};
 const composite=(top,bottom)=>{const alpha=top.length>3?top[3]:1;return top.slice(0,3).map((v,i)=>v*alpha+bottom[i]*(1-alpha))};
 const background = element => {
   const chain=[];for(let current=element;current;current=current.parentElement)chain.unshift(current);
   return chain.reduce((result,current)=>composite(color(getComputedStyle(current).backgroundColor),result),[0,0,0]);
 };
 const failures=[];let checked=0,minRatio=100;
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 for(let node=walker.nextNode();node;node=walker.nextNode()){
   if(!node.textContent.trim())continue;
   const element=node.parentElement;if(!element||element.closest('svg,script,style,button:disabled,input:disabled,[aria-disabled="true"]'))continue;
   const style=getComputedStyle(element),rect=element.getBoundingClientRect();
   if(!rect.width||!rect.height||style.visibility!=='visible'||Number(style.opacity)===0)continue;
   const bg=background(element),fg=composite(color(style.color),bg);
   const a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700);
   const minimum=large?3:4.5;checked++;minRatio=Math.min(minRatio,ratio);
   if(ratio<minimum)failures.push({text:node.textContent.trim().slice(0,70),ratio:Number(ratio.toFixed(2)),foreground:style.color,background:bg});
 }
 return {checked,minRatio:Number(minRatio.toFixed(2)),failures};
})()

