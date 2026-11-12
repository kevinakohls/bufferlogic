import {usesCalendarDates} from './forecast-state.js';
/** Optional jobs are separate from the analytical calculation and never alter its cards. */
export function createSimulationPanel(getState){
 const $=id=>document.getElementById(id);let report=null,controller=null,generation=0;
 const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
 function controls(){const {busy}=getState(),running=controller!==null;for(const id of ['run-monte-carlo','mc-samples','mc-seed'])$(id).disabled=busy||running;$('cancel-monte-carlo').disabled=!running;$('download-monte-carlo').disabled=busy||!report;}
 function stop(message){generation++;controller?.abort();controller=null;report=null;$('mc-results').classList.add('hidden');$('mc-status').textContent=message;controls();}
 function invalidate(){stop('Plan changed. Recalculate, then run Monte Carlo again if needed.');}
 function format(value,date){const {plan}=getState();return usesCalendarDates(plan)&&date?date:`${Number(value.toFixed(2))} days`;}
 function render(){
  const state=getState();$('mc-body').replaceChildren();
  for(const project of report.projects){
   const analytical=state.result.projects.find(p=>p.id===project.projectId)?.forecast,row=document.createElement('tr');row.append(text('td',project.name));
   const values=[];
   for(const key of ['p95','p98','p99']){
    const analyticalValue=analytical?.completionPercentiles?format(analytical.completionPercentiles[key],analytical.completionDates?.[key]):'—';
    if(!project.completionPercentiles){values.push(analyticalValue,`Withheld: ${project.withheldReason}`,'—');continue;}
    const q=project.completionPercentiles[key],interval=q.samplingInterval;
    values.push(analyticalValue,format(q.value,q.date),`${format(interval.lower,interval.lowerDate)} → ${format(interval.upper,interval.upperDate)}`);
   }
   values.push(`${project.infeasibleSamples} / ${report.samples}`);for(const value of values)row.append(text('td',value));$('mc-body').append(row);
  }
  $('mc-assumptions').textContent=report.assumptions.join(' · ');$('mc-results').classList.remove('hidden');
 }
 $('run-monte-carlo').addEventListener('click',async()=>{
  const state=getState();if(controller||state.busy)return;
  if(!state.plan||state.dirty||state.result.needsAssignments||state.result.needsTasks){$('mc-status').textContent='Assign resources and recalculate the plan before simulating.';return;}
  const seed=$('mc-seed').valueAsNumber;if(!Number.isInteger(seed)||seed<0||seed>4294967295){$('mc-status').textContent='Enter a whole-number seed from 0 to 4294967295.';return;}
  const current=++generation,request=new AbortController();controller=request;report=null;$('mc-results').classList.add('hidden');controls();$('mc-status').textContent='Simulation running separately. You can cancel or edit the plan; edits discard this run.';
  try{
   const response=await fetch('/api/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:state.plan,samples:Number($('mc-samples').value),seed}),signal:request.signal});const value=await response.json();
   if(current!==generation)return;if(!response.ok)throw new Error(value.error??'Simulation failed');report=value;render();$('mc-status').textContent=`Finished ${report.samples.toLocaleString()} runs, seed ${report.seed}. Analytical P95 and the regular schedule are unchanged.`;
  }catch(error){if(current===generation)$('mc-status').textContent=error.name==='AbortError'?'Simulation cancelled.':`Simulation unavailable: ${error.message}`;}
  finally{if(current===generation){controller=null;controls();}}
 });
 $('cancel-monte-carlo').addEventListener('click',()=>stop('Simulation cancelled. Analytical forecasts are unchanged.'));
 $('download-monte-carlo').addEventListener('click',()=>{
  if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='bufferlogic-monte-carlo.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 controls();return {invalidate,controls,refresh(){if(report)render();controls();}};
}
