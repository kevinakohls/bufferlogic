import { renderTimeline, refreshTimeline } from './timeline.js';
const $=id=>document.getElementById(id);
let plan=null,result=null,dirty=false,busy=false,revision=1,exceptions=[],templateText='';
const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
function today(){const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
$('start-date').value=today();
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(className)node.className=className;return node;}
function dateText(value){if(!value)return '—';const [year,month,day]=value.split('-').map(Number);return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,day)));}
function valueText(f,key){return f.completionDates?dateText(f.completionDates[key]):`${Math.ceil(key==='deterministic'?f.deterministicCompletion:f.completionPercentiles[key])} days`;}
function setBusy(value){busy=value;document.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=value);if(!value&&plan)renderProgress();}
function message(text,pending=false){$('status').textContent=text;$('status').classList.toggle('pending',pending);}
function failure(error){$('error').textContent=error.message??String(error);$('error').classList.remove('hidden');if(result){$('freshness').textContent='Previous calculation · resolve the error and recalculate';message('Your edits are retained. Displayed forecasts are from the previous calculation.',true);}}
function changed(){if(!plan)return;dirty=true;$('error').classList.add('hidden');$('freshness').textContent='Changes pending · results below are from the previous calculation';message('Recalculate to update forecasts and resource waits.',true);}
async function request(path,data){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const value=await response.json();if(!response.ok)throw new Error(value.error??'Unable to calculate');return value;}
function resourceName(id,source=plan){const name=source?.resourceDetails?.find(r=>r.id===id)?.name;return name&&name!==id?`${name} (${id})`:id;}
function allTasks(){return plan.projects.flatMap(p=>p.tasks);}
function taskName(id){const t=result.plan.projects.flatMap(p=>p.tasks).find(t=>t.id===id);return t?`${t.id} · ${t.name}`:id;}
function renderResults(){
 const cards=$('project-cards');cards.replaceChildren();
 for(const project of result.projects){
  const f=project.forecast,card=element('article',undefined,'project-card'),top=element('div',undefined,'card-top');
  top.append(element('h3',project.name),element('span',f.feasible?'Feasible':'Needs attention',`feasible${f.feasible?'':' infeasible'}`));
  card.append(top,element('div','P95 · Conservative completion forecast','p95-label'),element('p',valueText(f,'p95'),'p95-date'),element('p',`Deterministic schedule: ${valueText(f,'deterministic')}`,'deterministic'));
  const values=element('div',undefined,'percentiles');
  for(const key of ['p50','p80','p98','p99']){const item=element('div');item.append(element('div',key.toUpperCase(),'percentile-label'),element('div',valueText(f,key),'percentile-value'));values.append(item);}
  card.append(values);if(f.staleTaskIds.length)card.append(element('p',`Remaining estimates need review: ${f.staleTaskIds.join(', ')}`,'timeline-note'));cards.append(card);
 }
 $('conflicts-panel').classList.toggle('hidden',!result.conflicts.length);$('conflicts').replaceChildren();
 for(const conflict of result.conflicts)$('conflicts').append(element('p',`${conflict.message} · ${conflict.taskIds.map(taskName).join('; ')}`));
 renderTimeline(result);
 const body=$('schedule-body');body.replaceChildren();
 for(const t of [...result.tasks].sort((a,b)=>a.start-b.start)){
  const row=element('tr');const p=result.projects.find(p=>p.id===t.projectId);
  for(const value of [p?.name??t.projectId,taskName(t.id),resourceName(t.resource,result.plan),t.startDate?dateText(t.startDate):t.start.toFixed(2),t.finishDate?dateText(t.finishDate):t.finish.toFixed(2),t.resourcePredecessors.map(taskName).join('; ')||'—',t.locked?'Locked':'—'])row.append(element('td',value));
  body.append(row);
 }
}
function input(value,label,attributes={}){const node=document.createElement('input');node.value=value;node.setAttribute('aria-label',label);for(const [key,v] of Object.entries(attributes))node.setAttribute(key,String(v));return node;}
function select(value,label,values){const node=element('select');node.setAttribute('aria-label',label);for(const [id,name] of values){const option=element('option',name);option.value=id;node.append(option);}node.value=value;return node;}
function cell(node){const td=element('td');td.append(node);return td;}
function renderTasks(){
 const tbody=$('tasks-body');tbody.replaceChildren();const filter=$('project-filter').value;let count=0;
 for(const task of allTasks()){
  if(filter!=='all'&&task.projectId!==filter)continue;count++;
  const row=element('tr');row.dataset.id=task.id;row.append(element('td',task.id,'task-id'),element('td',plan.projects.find(p=>p.id===task.projectId).name));
  const fields=[['name',input(task.name,`${task.id} task name`,{class:'task-name'})],['resource',select(task.resource,`${task.id} resource`,plan.resources.map(r=>[r,resourceName(r)]))],['dependsOn',input(task.dependsOn.join(', '),`${task.id} dependencies`,{class:'dependencies'})]];
  const estimates=task.status==='active'?task.remaining:task;
  for(const field of ['goodCase','poorCase'])fields.push([field,input(estimates?.[field]??'',`${task.id} ${task.status==='active'?'remaining ':''}${field}`,{type:'number',min:0,step:'any'})]);
  fields.push(['priority',input(task.priority,`${task.id} priority`,{type:'number',step:'any'})],['allocationPercent',input(task.allocationPercent??100,`${task.id} allocation percent`,{type:'number',min:1,max:100,step:'any'})],['durationMode',select(task.durationMode??'working',`${task.id} duration type`,[['working','Working effort'],['elapsed','Elapsed waiting']])]);
  for(const [field,node] of fields){node.dataset.field=field;row.append(cell(node));}
  row.append(cell(element('span',`${task.status??'planned'}${task.status==='active'?' · remaining estimates':''}${task.locked?' · locked':''}`,'lifecycle')));tbody.append(row);
 }
 $('task-count').textContent=`${count} tasks`;
}
function renderCalendars(){
 const enabled=Boolean(plan.calendar);$('no-calendars').classList.toggle('hidden',enabled);$('calendar-editor').classList.toggle('hidden',!enabled);if(!enabled)return;
 $('workday-hours').value=plan.calendar.hoursPerWorkday;
 const tbody=$('calendars-body');tbody.replaceChildren();
 for(const calendar of plan.calendar.resources){const row=element('tr');row.dataset.resource=calendar.resource;row.append(element('td',resourceName(calendar.resource)));calendar.weeklyHours.forEach((hours,day)=>{const node=input(hours,`${calendar.resource} ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][day]} hours`,{type:'number',min:0,max:24,step:'any'});node.dataset.day=day;row.append(cell(node));});tbody.append(row);}
 renderExceptions();
}
function renderExceptions(){
 const body=$('exceptions-body');body.replaceChildren();$('exceptions-empty').classList.toggle('hidden',exceptions.length>0);
 exceptions.forEach((exception,index)=>{const row=element('tr');row.dataset.index=index;
 for(const [field,node] of [['resource',select(exception.resource,`Exception ${index+1} resource`,plan.calendar.resources.map(c=>[c.resource,c.resource]))],['date',input(exception.date,`Exception ${index+1} date`,{type:'date'})],['hours',input(exception.hours,`Exception ${index+1} hours`,{type:'number',min:0,max:24,step:'any'})]]){node.dataset.exception=field;row.append(cell(node));}
 const remove=element('button','Remove','remove');remove.dataset.remove=index;remove.type='button';row.append(cell(remove));body.append(row);});
}
function loadResult(value){result=value;plan=structuredClone(value.plan);dirty=false;exceptions=plan.calendar?plan.calendar.resources.flatMap(c=>Object.entries(c.exceptions).map(([date,hours])=>({resource:c.resource,date,hours}))):[];
 if(plan.calendar)$('start-date').value=plan.calendar.startDate;
 if(!$('calendar-file').files.length)$('calendar-name').textContent=plan.calendar?'Calendar included in the loaded plan':'No calendar loaded · results are in abstract days.';
 $('workspace').classList.remove('hidden');$('error').classList.add('hidden');$('freshness').textContent='Calculated from the current plan';
 const filter=$('project-filter'),previousFilter=filter.value;filter.replaceChildren();for(const [id,name] of [['all','All projects'],...plan.projects.map(p=>[p.id,p.name])]){const option=element('option',name);option.value=id;filter.append(option);}if([...filter.options].some(o=>o.value===previousFilter))filter.value=previousFilter;
 renderResults();renderTasks();renderProgress();renderCalendars();renderNotes();renderUtilization();message(`${plan.projects.length} projects · ${allTasks().length} tasks · ${plan.resources.length} shared resources${plan.calendar?' · Calendar dates':' · Abstract days'}`);
}
$('example').addEventListener('click',async()=>{setBusy(true);message('Loading the two-house example…');try{const response=await fetch('/api/example');if(!response.ok)throw new Error('Unable to load the example');const source=await response.json();loadResult(await request('/api/load',{...source,format:'csv',startDate:$('start-date').value,timeZone:zone}));$('project-file').value='';$('calendar-file').value='';$('project-name').textContent='Two-house example · 72 tasks';$('calendar-name').textContent='Example calendar · 21 resources';}catch(error){failure(error);}finally{setBusy(false);}});
for(const [id,label] of [['project-file','project-name'],['calendar-file','calendar-name']])$(id).addEventListener('change',()=>{$(label).textContent=$(id).files[0]?.name??'No file selected';});
$('load').addEventListener('click',async()=>{setBusy(true);try{
 const project=$('project-file').files[0],calendar=$('calendar-file').files[0];if(!project&&!plan)throw new Error('Select a project CSV or portfolio JSON first');if(!project&&!calendar)throw new Error('Select a file to load, or edit the existing plan below');
 const format=project?project.name.toLowerCase().endsWith('.csv')?'csv':'json':'json';
 const data={projectText:project?await project.text():JSON.stringify(plan),format,timeZone:zone,startDate:$('start-date').value};if(calendar)data.calendarText=await calendar.text();
 loadResult(await request('/api/load',data));
 }catch(error){failure(error);}finally{setBusy(false);}});
$('recalculate').addEventListener('click',async()=>{if(!plan||busy)return;setBusy(true);message('Recalculating the schedule…');try{
 const draft=editablePlan();draft.versionId=`review-${++revision}`;
 loadResult(await request('/api/schedule',{plan:draft}));
 }catch(error){failure(error);}finally{setBusy(false);}});
$('tasks-body').addEventListener('change',event=>{const node=event.target;if(!node.dataset.field)return;const task=allTasks().find(t=>t.id===node.closest('tr').dataset.id),field=node.dataset.field;
 if(field==='dependsOn')task.dependsOn=node.value.trim()?node.value.split(',').map(s=>s.trim()):[];
 else if(['goodCase','poorCase'].includes(field)&&task.status==='active'){task.remaining[field]=node.valueAsNumber;task.remaining.estimateStatus='current';}
 else task[field]=node.type==='number'?node.valueAsNumber:node.value;changed();});
$('project-filter').addEventListener('change',renderTasks);
$('calendars-body').addEventListener('change',event=>{const node=event.target;if(node.dataset.day===undefined)return;const c=plan.calendar.resources.find(c=>c.resource===node.closest('tr').dataset.resource);c.weeklyHours[Number(node.dataset.day)]=node.valueAsNumber;changed();});
$('workday-hours').addEventListener('change',()=>{plan.calendar.hoursPerWorkday=$('workday-hours').valueAsNumber;changed();});
$('start-date').addEventListener('change',changed);
$('add-exception').addEventListener('click',()=>{exceptions.push({resource:plan.calendar.resources[0].resource,date:'',hours:0});renderExceptions();changed();});
$('exceptions-body').addEventListener('change',event=>{const node=event.target;if(!node.dataset.exception)return;const entry=exceptions[Number(node.closest('tr').dataset.index)];entry[node.dataset.exception]=node.type==='number'?node.valueAsNumber:node.value;changed();});
$('exceptions-body').addEventListener('click',event=>{const node=event.target;if(node.dataset.remove===undefined)return;exceptions.splice(Number(node.dataset.remove),1);renderExceptions();changed();});
for(const button of document.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>{for(const b of document.querySelectorAll('[data-tab]')){b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));}for(const name of ['tasks','progress','calendars','notes','utilization','timeline','schedule'])$(name+'-view').classList.toggle('hidden',name!==button.dataset.tab);if(button.dataset.tab==='timeline')refreshTimeline();});
$('download').addEventListener('click',()=>{if(dirty){failure(new Error('Recalculate before saving so the plan and forecasts match.'));return;}const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`bufferlogic-${result.plan.versionId}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});

function editablePlan(){
 if(plan.calendar && plan.calendar.startDate!==$('start-date').value && allTasks().some(t=>t.locked||t.actuals))throw new Error('This plan contains fixed commitments or actuals. Keep its recorded schedule start date.');
 const draft=structuredClone(plan);draft.approvalStatus='draft';
 if(draft.calendar){draft.calendar.startDate=$('start-date').value;for(const c of draft.calendar.resources)c.exceptions={};for(const e of exceptions){if(!e.date)throw new Error('Choose a date for every exception');const c=draft.calendar.resources.find(c=>c.resource===e.resource);if(Object.hasOwn(c.exceptions,e.date))throw new Error(`Only one exception per resource and date: ${e.resource}, ${e.date}`);c.exceptions[e.date]=e.hours;}}
 return draft;
}

async function inspectTemplate(text,label){templateText='';const info=await request('/api/template-info',{csvText:text});templateText=text;$('template-file-name').textContent=label;$('template-source').replaceChildren();for(const source of info.projects){const option=element('option',source);option.value=source;$('template-source').append(option);}if(!$('template-name').value)$('template-name').value=label.replace(/\.csv$/i,'').replaceAll('_',' ');}
$('show-template').addEventListener('click',()=>{$('template-panel').classList.toggle('hidden');});
$('housing-template').addEventListener('click',async()=>{setBusy(true);try{const response=await fetch('/api/housing-template');if(!response.ok)throw new Error('Unable to load housing template');const source=await response.json();await inspectTemplate(source.csvText,'Housing project');$('template-file').value='';}catch(error){failure(error);}finally{setBusy(false);}});
$('software-template').addEventListener('click',async()=>{setBusy(true);try{const response=await fetch('/api/software-template');if(!response.ok)throw new Error('Unable to load software template');const source=await response.json();await inspectTemplate(source.csvText,'Software project');$('template-file').value='';}catch(error){failure(error);}finally{setBusy(false);}});
$('template-file').addEventListener('change',async()=>{const file=$('template-file').files[0];if(!file)return;setBusy(true);try{await inspectTemplate(await file.text(),file.name);}catch(error){failure(error);}finally{setBusy(false);}});
$('create-template').addEventListener('click',async()=>{setBusy(true);try{if(!templateText)throw new Error('Choose a template CSV first');const data={csvText:templateText,name:$('template-name').value,sourceProjectId:$('template-source').value,startDate:$('start-date').value,timeZone:zone};if(plan)data.plan=editablePlan();loadResult(await request('/api/template',data));$('template-panel').classList.add('hidden');message('Project created with new IDs and row-order priorities. Review the task and calendar defaults.');}catch(error){failure(error);}finally{setBusy(false);}});
function noteTarget(create=false){const kind=$('notes-kind').value,id=$('notes-item').value;if(kind==='project')return plan.projects.find(p=>p.id===id);if(kind==='task')return allTasks().find(t=>t.id===id);let resource=plan.resourceDetails?.find(r=>r.id===id);if(!resource){resource={id};if(create){plan.resourceDetails??=[];plan.resourceDetails.push(resource);}}return resource;}
function renderNotes(){if(!plan)return;const kind=$('notes-kind').value,old=$('notes-item').value;const items=kind==='project'?plan.projects.map(p=>[p.id,p.name]):kind==='task'?allTasks().map(t=>[t.id,`${t.id} · ${t.name}`]):plan.resources.map(id=>[id,plan.resourceDetails?.find(r=>r.id===id)?.name||id]);$('notes-item').replaceChildren();for(const [id,name]of items){const option=element('option',name);option.value=id;$('notes-item').append(option);}if(items.some(([id])=>id===old))$('notes-item').value=old;renderNoteFields();}
function renderNoteFields(){const editor=$('notes-editor');editor.replaceChildren();if(!$('notes-item').value)return;const target=noteTarget(),kind=$('notes-kind').value;const fields=kind==='project'?[['name','Project name',false],['owner','Project owner',false],['description','Description',true],['comments','Comments',true]]:kind==='task'?[['description','Description',true],['completionCriteria','Completion criteria',true],['lockReason','Reason for locked commitment',true],['comments','Comments',true]]:[['name','Display name',false],['role','Role or skill',false],['description','Description',true],['comments','Comments',true]];
 for(const [field,title,multi]of fields){const label=element('label',title,multi?'wide':'');const node=multi?element('textarea'):document.createElement('input');node.value=target[field]??'';node.dataset.note=field;node.setAttribute('aria-label',title);label.append(node);editor.append(label);}}
$('notes-kind').addEventListener('change',renderNotes);$('notes-item').addEventListener('change',renderNoteFields);$('notes-editor').addEventListener('change',event=>{const field=event.target.dataset.note;if(!field)return;noteTarget(true)[field]=event.target.value;changed();});
function hours(value){return Number(value.toFixed(2)).toLocaleString();}
function projectsText(row){return row.projectHours.filter(p=>p.hours>1e-9).map(p=>`${p.projectName}: ${hours(p.hours)} h`).join(' · ')||'—';}
function renderUtilization(){const report=result.utilization;$('utilization-content').classList.toggle('hidden',!report);$('utilization-empty').textContent=report?'':'Load a working calendar to report available and scheduled hours.';if(!report)return;const old=$('utilization-resource').value;$('utilization-resource').replaceChildren();for(const [id,label]of [['all','All resources'],...report.resources.map(r=>[r.resource,resourceName(r.resource,result.plan)])]){const option=element('option',label);option.value=id;$('utilization-resource').append(option);}if([...$('utilization-resource').options].some(o=>o.value===old))$('utilization-resource').value=old;renderUtilizationRows();}
function renderUtilizationRows(){const report=result.utilization;if(!report)return;const resource=$('utilization-resource').value;$('utilization-period').textContent=`${dateText(report.startDate)} – ${dateText(report.finishDate)} · Remaining calculated schedule${result.conflicts.length?' · Some commitments are infeasible; inspect conflicts above':''}`;
 $('utilization-summary').replaceChildren();for(const row of report.resources.filter(r=>resource==='all'||r.resource===resource)){const tr=element('tr');for(const value of [resourceName(row.resource,result.plan),hours(row.availableHours),hours(row.scheduledHours),hours(row.remainingHours),row.utilizationPercent===null?'—':hours(row.utilizationPercent)+'%',projectsText(row)])tr.append(element('td',value));$('utilization-summary').append(tr);}
 $('utilization-weeks').replaceChildren();for(const row of report.weeks.filter(r=>resource==='all'||r.resource===resource)){const tr=element('tr');for(const value of [dateText(row.weekStart),resourceName(row.resource,result.plan),hours(row.availableHours),hours(row.scheduledHours),hours(row.remainingHours),row.utilizationPercent===null?'—':hours(row.utilizationPercent)+'%',projectsText(row),row.taskIds.join(', ')||'—'])tr.append(element('td',value));$('utilization-weeks').append(tr);}}
$('utilization-resource').addEventListener('change',renderUtilizationRows);
$('export-utilization').addEventListener('click',()=>{if(dirty){failure(new Error('Recalculate before exporting utilization.'));return;}const report=result.utilization;if(!report)return;const header=['Week beginning','Resource','Available hours','Scheduled hours','Remaining hours','Utilization percent',...result.projects.map(p=>`${p.name} hours`),'Task IDs'];const selection=$('utilization-resource').value;const rows=report.weeks.filter(r=>selection==='all'||r.resource===selection).map(r=>[r.weekStart,r.resource,r.availableHours,r.scheduledHours,r.remainingHours,r.utilizationPercent??'',...result.projects.map(p=>r.projectHours.find(h=>h.projectId===p.id).hours),r.taskIds.join(', ')]);const quote=value=>{let text=String(value);if(typeof value==='string'&&/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};const blob=new Blob(['\uFEFF'+[header,...rows].map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='resource-utilization.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});

function progressValue(day){if(day===undefined)return '';if(!plan.calendar)return day;return new Date(Date.parse(plan.calendar.startDate+'T00:00:00Z')+day*86400000).toISOString().slice(0,10);}
function progressDay(node){return plan.calendar?(Date.parse(node.value+'T00:00:00Z')-Date.parse(plan.calendar.startDate+'T00:00:00Z'))/86400000:node.valueAsNumber;}
function progressInput(day,label){return input(progressValue(day),label,plan.calendar?{type:'date'}:{type:'number',min:0,step:'any'});}
function renderProgress(){
 const asof=$('progress-asof');asof.type=plan.calendar?'date':'number';asof.value=progressValue(plan.asOf);asof.min=plan.calendar?plan.calendar.startDate:0;asof.step='any';$('progress-units').textContent=plan.calendar?'At the beginning of this date':'Days from schedule start';
 const body=$('progress-body');body.replaceChildren();
 for(const task of allTasks()){
  const status=task.status??'planned',row=element('tr');row.dataset.id=task.id;row.append(element('td',`${task.id} · ${task.name}`),element('td',plan.projects.find(p=>p.id===task.projectId).name));
  const fields=[['status',select(status,`${task.id} progress status`,[['planned','Not started'],['active','In progress'],['completed','Complete']])],['start',progressInput(task.actuals?.start??task.actualStart,`${task.id} actual start`)],['finish',progressInput(task.actuals?.finish,`${task.id} actual finish`)]];
  for(const field of ['goodCase','poorCase'])fields.push([field,input(task.remaining?.[field]??'',`${task.id} remaining ${field}`,{type:'number',min:0,step:'any'})]);
  fields.push(['review',select(task.remaining?.estimateStatus??'stale',`${task.id} estimate review`,[['stale','Needs review'],['current','Reviewed']])]);
  for(const [field,node] of fields){node.dataset.progress=field;node.disabled=field==='start'?status==='planned':field==='finish'?status!=='completed':['goodCase','poorCase','review'].includes(field)?status!=='active':false;row.append(cell(node));}body.append(row);
 }
}
$('progress-asof').addEventListener('change',event=>{const day=progressDay(event.target);if(!Number.isFinite(day)||day<plan.asOf){failure(new Error('Progress date must not move backward.'));event.target.value=progressValue(plan.asOf);return;}if(day>plan.asOf)for(const task of allTasks())if(task.status==='active'&&task.remaining)task.remaining.estimateStatus='stale';plan.asOf=day;changed();for(const row of $('progress-body').rows){const task=allTasks().find(t=>t.id===row.dataset.id);if(task.remaining)row.querySelector('[data-progress="review"]').value=task.remaining.estimateStatus;}});
$('progress-body').addEventListener('change',event=>{
 const node=event.target,field=node.dataset.progress;if(!field)return;const task=allTasks().find(t=>t.id===node.closest('tr').dataset.id);
 if(field==='status'){
  task.status=node.value;
  if(task.status==='planned'){delete task.actuals;delete task.actualStart;delete task.remaining;}
  else if(task.status==='active'){task.actualStart=task.actuals?.start??task.actualStart??plan.asOf;delete task.actuals;task.remaining??={goodCase:task.goodCase,poorCase:task.poorCase,estimateStatus:'stale'};}
  else {task.actualStart=task.actualStart??plan.asOf;task.actuals={start:task.actualStart,finish:plan.asOf};delete task.remaining;}
 }else if(field==='start'){task.actualStart=progressDay(node);if(task.actuals)task.actuals.start=task.actualStart;}
 else if(field==='finish')task.actuals.finish=progressDay(node);
 else if(field==='review')task.remaining.estimateStatus=node.value;
 else {task.remaining[field]=node.valueAsNumber;task.remaining.estimateStatus='current';}
 changed();if(field==='status')renderProgress();else if(task.remaining)node.closest('tr').querySelector('[data-progress="review"]').value=task.remaining.estimateStatus;renderTasks();
});
