import {workspaceFilename} from './workspace-name.js';
import {forecastState,holdAction,usesCalendarDates,estimateReviewValue,deadlineTargetState,daysLateText} from './forecast-state.js';
import { renderTimeline, refreshTimeline } from './timeline.js';
const $=id=>document.getElementById(id);
let plan=null,result=null,dirty=false,busy=false,revision=1,exceptions=[],templateText='';
const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
function today(){const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
$('start-date').value=today();
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(className)node.className=className;return node;}
function dateText(value){if(!value)return '—';const [year,month,day]=value.split('-').map(Number);return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,day)));}
function valueText(f,key){if(f.withheldReason)return forecastState(f).completionLabel;return usesCalendarDates(result.plan)&&f.completionDates?dateText(f.completionDates[key]):`${Math.ceil(key==='deterministic'?f.deterministicCompletion:f.completionPercentiles[key])} days`;}
function setBusy(value){busy=value;document.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=value);if(!value&&plan){renderProgress();renderProjectOrder();$('show-add-task').disabled=!plan.projects.length;$('create-task').disabled=!plan.projects.length;for(const node of document.querySelectorAll('[data-add-support]'))node.disabled=allTasks().find(t=>t.id===node.dataset.addSupport)?.durationMode==='elapsed';if(plan.calendar)renderExceptions();renderTimeDisplay();}}
function message(text,pending=false){$('status').textContent=text;$('status').classList.toggle('pending',pending);}
function failure(error){$('error').textContent=error.message??String(error);$('error').classList.remove('hidden');if(result){$('freshness').textContent='Previous calculation · resolve the error and recalculate';message('Your edits are retained. Displayed forecasts are from the previous calculation.',true);}}
function changed(){if(!plan)return;dirty=true;$('error').classList.add('hidden');$('freshness').textContent='Changes pending · results below are from the previous calculation';message('Recalculate to update forecasts and resource waits.',true);}
async function request(path,data){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const value=await response.json();if(!response.ok)throw new Error(value.error??'Unable to calculate');return value;}
function resourceName(id,source=plan){const name=source?.resourceDetails?.find(r=>r.id===id)?.name;return name&&name!==id?`${name} (${id})`:id;}
function assignmentsOf(task){return [{resource:task.resource,allocationPercent:task.allocationPercent??100},...(task.supportingResources??[])];}
function hasUnassigned(task){return assignmentsOf(task).some(a=>!a.resource);}
function supportingText(task,source=plan){return (task.supportingResources??[]).map(a=>`${resourceName(a.resource,source)||'Unassigned'} (${a.allocationPercent}%)`).join('; ')||'—';}
function allTasks(){return plan.projects.flatMap(p=>p.tasks);}
function taskName(id){const t=result.plan.projects.flatMap(p=>p.tasks).find(t=>t.id===id);return t?`${t.id} · ${t.name}`:id;}
function renderResults(){
 const cards=$('project-cards');cards.replaceChildren();
 if(result.needsTasks)cards.append(element('p','No tasks yet. Add resources in Resources & calendars, then use Add task in Tasks.','timeline-note'));
 if(result.needsAssignments)cards.append(element('p','Schedule not calculated. Assign a resource to every task, then recalculate.','timeline-note'));
 for(const project of result.projects){
  if(!result.plan.projects.find(p=>p.id===project.id)?.tasks.length){const empty=element('article',undefined,'project-card');empty.append(element('h3',project.name),element('p','No tasks yet. Add tasks to calculate a forecast.'));cards.append(empty);continue;}
  const f=project.forecast,card=element('article',undefined,'project-card'),top=element('div',undefined,'card-top');
  const deadline=result.deadlineReport?.projects.find(p=>p.projectId===project.id),target=deadlineTargetState(deadline?.assessments.p95);
  const presentation=forecastState(f,deadline?.assessments.p95);top.append(element('h3',project.name),element('span',presentation.badgeText,presentation.badgeClass));
  card.append(top,element('div','P95 · Conservative completion forecast','p95-label'),element('p',valueText(f,'p95'),'p95-date'),element('p',`Deterministic schedule: ${valueText(f,'deterministic')}`,'deterministic'));
  const values=element('div',undefined,'percentiles');
  for(const key of ['p50','p80','p98','p99']){const item=element('div');item.append(element('div',key.toUpperCase(),'percentile-label'),element('div',valueText(f,key),'percentile-value'));values.append(item);}
  card.append(values);if(f.withheldReason)card.append(element('p',`${f.unscheduledTaskIds?.length??0} tasks unscheduled. Active work and locked commitments remain reserved. Resume held work and recalculate for a full completion forecast.`,'timeline-note'));if(deadline)card.append(element('p',`Deadline: ${deadlineText(deadline.deadline)} · ${target.text}${deadline.feasible===false?' · Schedule has conflicts':''}`,`deadline-summary ${target.className}`));if(f.staleTaskIds.length)card.append(element('p',`Remaining estimates need review: ${f.staleTaskIds.join(', ')}`,'timeline-note'));cards.append(card);
 }
 $('conflicts-panel').classList.toggle('hidden',!result.conflicts.length);$('conflicts').replaceChildren();
 for(const conflict of result.conflicts)$('conflicts').append(element('p',`${conflict.message} · ${conflict.taskIds.map(taskName).join('; ')}`));
 renderTimeline(result);
 const body=$('schedule-body');body.replaceChildren();
 for(const t of [...result.tasks].sort((a,b)=>a.start-b.start)){
  const row=element('tr');const p=result.projects.find(p=>p.id===t.projectId);
  for(const value of [p?.name??t.projectId,taskName(t.id),resourceName(t.resource,result.plan),supportingText(t,result.plan),usesCalendarDates(result.plan)&&t.startDate?dateText(t.startDate):t.start.toFixed(2),usesCalendarDates(result.plan)&&t.finishDate?dateText(t.finishDate):t.finish.toFixed(2),t.resourcePredecessors.map(taskName).join('; ')||'—',t.locked?'Locked':'—'])row.append(element('td',value));
  body.append(row);
 }
}
function input(value,label,attributes={}){const node=document.createElement('input');node.value=value;node.setAttribute('aria-label',label);for(const [key,v] of Object.entries(attributes))node.setAttribute(key,String(v));return node;}
function select(value,label,values){const node=element('select');node.setAttribute('aria-label',label);for(const [id,name] of values){const option=element('option',name);option.value=id;node.append(option);}node.value=value;return node;}
function cell(node){const td=element('td');td.append(node);return td;}
function supportingEditor(task){
 const host=element('div',undefined,'supporting-editor');
 (task.supportingResources??[]).forEach((assignment,index)=>{
  const row=element('div',undefined,'supporting-assignment');row.dataset.supportIndex=index;
  const used=new Set([task.resource,...(task.supportingResources??[]).filter((_,i)=>i!==index).map(a=>a.resource)].filter(Boolean));
  const resource=select(assignment.resource,`${task.id} supporting resource ${index+1}`,[['','Unassigned — choose a resource'],...plan.resources.filter(id=>!used.has(id)).map(id=>[id,resourceName(id)])]);resource.dataset.supportingField='resource';
  const percent=input(assignment.allocationPercent,`${task.id} supporting allocation ${index+1}`,{type:'number',min:1,max:100,step:'any'});percent.dataset.supportingField='allocationPercent';
  const remove=element('button','Remove','secondary');remove.type='button';remove.dataset.removeSupport=index;remove.setAttribute('aria-label',`${task.id} remove supporting resource ${index+1}`);
  row.append(resource,percent,element('span','%'),remove);host.append(row);
 });
 const add=element('button','Add supporting resource','secondary');add.type='button';add.dataset.addSupport=task.id;add.disabled=busy||task.durationMode==='elapsed';host.append(add);return host;
}
$('tasks-body').addEventListener('click',event=>{
 const add=event.target.closest('button[data-add-support]'),remove=event.target.closest('button[data-remove-support]');if(!add&&!remove)return;
 const task=allTasks().find(t=>t.id===event.target.closest('tr').dataset.id);
 if(add){if(task.durationMode==='elapsed'){failure(new Error('Use a working task to reserve supporting resources.'));return;}task.supportingResources??=[];task.supportingResources.push({resource:'',allocationPercent:100});}
 else task.supportingResources.splice(Number(remove.dataset.removeSupport),1);
 changed();renderTasks();renderResources();
});
function renderTasks(){
 const tbody=$('tasks-body');tbody.replaceChildren();const filter=$('project-filter').value;let count=0;
 for(const task of allTasks()){
  if(filter!=='all'&&task.projectId!==filter)continue;count++;
  const row=element('tr');row.dataset.id=task.id;row.append(element('td',task.id,'task-id'),element('td',plan.projects.find(p=>p.id===task.projectId).name));
  const fields=[['name',input(task.name,`${task.id} task name`,{class:'task-name'})],['resource',select(task.resource,`${task.id} resource`,[['','Unassigned — choose a resource'],...plan.resources.map(r=>[r,resourceName(r)])])],['dependsOn',input(task.dependsOn.join(', '),`${task.id} dependencies`,{class:'dependencies'})]];
  const estimates=task.status==='active'?task.remaining:task;
  for(const field of ['goodCase','poorCase'])fields.push([field,input(estimates?.[field]??'',`${task.id} ${task.status==='active'?'remaining ':''}${field}`,{type:'number',min:0,step:'any'})]);
  fields.push(['priority',input(task.priority,`${task.id} priority`,{type:'number',step:'any'})],['allocationPercent',input(task.allocationPercent??100,`${task.id} allocation percent`,{type:'number',min:1,max:100,step:'any'})],['durationMode',select(task.durationMode??'working',`${task.id} duration type`,[['working','Working effort'],['elapsed','Elapsed waiting']])]);
  for(const [field,node] of fields){node.dataset.field=field;row.append(cell(node));if(field==='resource')row.append(cell(supportingEditor(task)));}
  row.append(cell(element('span',`${task.status??'planned'}${task.status==='active'?' · remaining estimates':''}${task.locked?' · locked':''}`,'lifecycle')));tbody.append(row);
 }
 $('task-count').textContent=`${count} tasks`;
}
function renderResources(){
 const body=$('resources-body');body.replaceChildren();
 $('resources-empty').classList.toggle('hidden',plan.resources.length>0);
 for(const resource of plan.resources){
  const row=element('tr'),calendar=plan.calendar?.resources.find(c=>c.resource===resource);
  const count=allTasks().filter(task=>assignmentsOf(task).some(a=>a.resource===resource)).length;
  const remove=element('button','Delete','secondary');remove.type='button';remove.dataset.deleteResource=resource;
  remove.setAttribute('aria-label',`Delete resource ${resource}`);
  row.append(element('td',resourceName(resource)),element('td',calendar?calendar.weeklyHours.reduce((sum,h)=>sum+h,0):40),element('td',count),cell(remove));body.append(row);
 }
}
function resourceListChanged(){
 renderResources();renderCalendars();renderTasks();renderNotes();if(!$('add-task-panel').classList.contains('hidden'))renderNewTaskFields();changed();
}
$('add-resource').addEventListener('click',()=>{
 if(!plan)return;
 const resource=$('new-resource').value.trim();
 if(!resource){failure(new Error('Enter a resource name.'));return;}
 if(plan.resources.includes(resource)){failure(new Error('That resource already exists.'));return;}
 plan.resources.push(resource);
 if(plan.calendar)plan.calendar.resources.push({resource,weeklyHours:[8,8,8,8,8,0,0],exceptions:{}});
 $('new-resource').value='';resourceListChanged();
});
$('resources-body').addEventListener('click',event=>{
 const button=event.target.closest('button[data-delete-resource]');if(!button||!plan)return;
 const resource=button.dataset.deleteResource;
 if(!confirm(`Are you sure? Tasks assigned to this resource will become unassigned. Delete ${resource}?`))return;
 plan.resources=plan.resources.filter(id=>id!==resource);
 if(plan.calendar)plan.calendar.resources=plan.calendar.resources.filter(c=>c.resource!==resource);
 if(plan.resourceDetails)plan.resourceDetails=plan.resourceDetails.filter(detail=>detail.id!==resource);
 exceptions=exceptions.filter(exception=>exception.resource!==resource);
 for(const task of allTasks()){if(task.resource===resource)task.resource='';for(const assignment of task.supportingResources??[])if(assignment.resource===resource)assignment.resource='';}
 resourceListChanged();
 const unassigned=allTasks().filter(hasUnassigned);
 if(unassigned.length)message(`${unassigned.length} tasks unassigned. Choose replacement resources in Tasks before scheduling.`,true);
});
function renderCalendars(){
 renderResources();
 const enabled=Boolean(plan.calendar);$('no-calendars').classList.toggle('hidden',enabled);$('calendar-editor').classList.toggle('hidden',!enabled);if(!enabled)return;
 $('workday-hours').value=plan.calendar.hoursPerWorkday;
 const tbody=$('calendars-body');tbody.replaceChildren();
 for(const calendar of plan.calendar.resources){const row=element('tr');row.dataset.resource=calendar.resource;row.append(element('td',resourceName(calendar.resource)));calendar.weeklyHours.forEach((hours,day)=>{const node=input(hours,`${calendar.resource} ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][day]} hours`,{type:'number',min:0,max:24,step:'any'});node.dataset.day=day;row.append(cell(node));});tbody.append(row);}
 renderExceptions();
}
function renderExceptions(){
 const body=$('exceptions-body');body.replaceChildren();$('exceptions-empty').classList.toggle('hidden',exceptions.length>0);$('add-exception').disabled=busy||!plan.calendar.resources.length;
 exceptions.forEach((exception,index)=>{const row=element('tr');row.dataset.index=index;
 for(const [field,node] of [['resource',select(exception.resource,`Exception ${index+1} resource`,plan.calendar.resources.map(c=>[c.resource,c.resource]))],['date',input(exception.date,`Exception ${index+1} date`,{type:'date'})],['hours',input(exception.hours,`Exception ${index+1} hours`,{type:'number',min:0,max:24,step:'any'})]]){node.dataset.exception=field;row.append(cell(node));}
 const remove=element('button','Remove','remove');remove.dataset.remove=index;remove.type='button';row.append(cell(remove));body.append(row);});
}
function loadResult(value){result=(value.needsAssignments||value.needsTasks)?{...value,projects:[],tasks:[],conflicts:[]}:value;plan=structuredClone(value.plan);dirty=false;exceptions=plan.calendar?plan.calendar.resources.flatMap(c=>Object.entries(c.exceptions).map(([date,hours])=>({resource:c.resource,date,hours}))):[];
 $('workspace-name').value=plan.name??'Untitled workspace';document.title=`${$('workspace-name').value} · BufferLogic`;$('show-new-project').textContent='Add project';
 if(plan.calendar)$('start-date').value=plan.calendar.startDate;
 if(!$('calendar-file').files.length)$('calendar-name').textContent=plan.calendar?'Calendar included in the loaded plan':'No calendar loaded · results are in abstract days.';
 $('workspace').classList.remove('hidden');$('error').classList.add('hidden');$('freshness').textContent='Calculated from the current plan';
 const filter=$('project-filter'),previousFilter=filter.value;filter.replaceChildren();for(const [id,name] of [['all','All projects'],...plan.projects.map(p=>[p.id,p.name])]){const option=element('option',name);option.value=id;filter.append(option);}if([...filter.options].some(o=>o.value===previousFilter))filter.value=previousFilter;
 renderTimeDisplay();renderResults();renderProjectOrder();renderTasks();if(!$('add-task-panel').classList.contains('hidden'))renderNewTaskFields();renderProgress();renderChecklists();renderDeadlines();renderFeeding();renderCalendars();renderNotes();renderUtilization();message(result.needsTasks?'No tasks to schedule. Add a project or add tasks to an existing project.':result.needsAssignments?'Assign resources to the unassigned tasks, then recalculate.':`${plan.projects.length} projects · ${allTasks().length} tasks · ${plan.resources.length} shared resources${plan.calendar?' · Calendar dates':' · Abstract days'}`,Boolean(result.needsAssignments||result.needsTasks));if(result.needsTasks)$('freshness').textContent='Not calculated · add tasks to get started';if(result.needsAssignments)$('freshness').textContent='Not calculated · tasks need resources';
}
$('example').addEventListener('click',async()=>{setBusy(true);message('Loading the two-house example…');try{const response=await fetch('/api/example');if(!response.ok)throw new Error('Unable to load the example');const source=await response.json();loadResult(await request('/api/load',{...source,format:'csv',startDate:$('start-date').value,timeZone:zone}));$('project-file').value='';$('calendar-file').value='';$('project-name').textContent='Two-house example · 72 tasks';$('calendar-name').textContent='Example calendar · 21 resources';}catch(error){failure(error);}finally{setBusy(false);}});
for(const [id,label] of [['project-file','project-name'],['calendar-file','calendar-name']])$(id).addEventListener('change',()=>{$(label).textContent=$(id).files[0]?.name??'No file selected';});
$('load').addEventListener('click',async()=>{setBusy(true);try{
 const project=$('project-file').files[0],calendar=$('calendar-file').files[0];if(!project&&!plan)throw new Error('Select a project CSV or saved workspace first');if(!project&&!calendar)throw new Error('Select a file to load, or edit the existing plan below');
 const format=project?project.name.toLowerCase().endsWith('.csv')?'csv':'json':'json';
 const data={projectText:project?await project.text():JSON.stringify(plan),format,timeZone:zone,startDate:$('start-date').value};if(calendar)data.calendarText=await calendar.text();
 loadResult(await request('/api/load',data));
 }catch(error){failure(error);}finally{setBusy(false);}});
$('recalculate').addEventListener('click',async()=>{if(!plan||busy)return;setBusy(true);message('Recalculating the schedule…');try{
 const draft=editablePlan();draft.versionId=`review-${++revision}`;
 loadResult(await request('/api/schedule',{plan:draft}));
 }catch(error){failure(error);}finally{setBusy(false);}});
$('tasks-body').addEventListener('change',event=>{const node=event.target;
 if(node.dataset.supportingField){const task=allTasks().find(t=>t.id===node.closest('tr').dataset.id),assignment=task.supportingResources[Number(node.closest('[data-support-index]').dataset.supportIndex)];assignment[node.dataset.supportingField]=node.type==='number'?node.valueAsNumber:node.value;changed();renderTasks();renderResources();return;}
 if(!node.dataset.field)return;const task=allTasks().find(t=>t.id===node.closest('tr').dataset.id),field=node.dataset.field;
 if(field==='resource'&&(task.supportingResources??[]).some(a=>a.resource&&a.resource===node.value)){node.value=task.resource;failure(new Error('That resource is already a supporting resource. Remove that assignment before making it primary.'));return;}
 if(field==='durationMode'&&node.value==='elapsed'&&task.supportingResources?.length){node.value=task.durationMode??'working';failure(new Error('Remove supporting resources before changing this task to elapsed waiting.'));return;}
 if(field==='dependsOn')task.dependsOn=node.value.trim()?node.value.split(',').map(s=>s.trim()):[];
 else if(['goodCase','poorCase'].includes(field)&&task.status==='active'){task.remaining[field]=node.valueAsNumber;task.remaining.estimateStatus='current';}
 else task[field]=node.type==='number'?node.valueAsNumber:node.value;if(field==='resource'||field==='durationMode'){renderResources();renderTasks();}changed();});
$('project-filter').addEventListener('change',renderTasks);
$('calendars-body').addEventListener('change',event=>{const node=event.target;if(node.dataset.day===undefined)return;const c=plan.calendar.resources.find(c=>c.resource===node.closest('tr').dataset.resource);c.weeklyHours[Number(node.dataset.day)]=node.valueAsNumber;renderResources();changed();});
$('workday-hours').addEventListener('change',()=>{plan.calendar.hoursPerWorkday=$('workday-hours').valueAsNumber;changed();});
$('start-date').addEventListener('change',changed);
$('add-exception').addEventListener('click',()=>{if(!plan.calendar?.resources.length)return;exceptions.push({resource:plan.calendar.resources[0].resource,date:'',hours:0});renderExceptions();changed();});
$('exceptions-body').addEventListener('change',event=>{const node=event.target;if(!node.dataset.exception)return;const entry=exceptions[Number(node.closest('tr').dataset.index)];entry[node.dataset.exception]=node.type==='number'?node.valueAsNumber:node.value;changed();});
$('exceptions-body').addEventListener('click',event=>{const node=event.target;if(node.dataset.remove===undefined)return;exceptions.splice(Number(node.dataset.remove),1);renderExceptions();changed();});
for(const button of document.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>{for(const b of document.querySelectorAll('[data-tab]')){b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));}for(const name of ['tasks','feeding','deadlines','checklists','progress','calendars','notes','utilization','timeline','schedule'])$(name+'-view').classList.toggle('hidden',name!==button.dataset.tab);if(button.dataset.tab==='timeline')refreshTimeline();});
$('download').addEventListener('click',()=>{const unassigned=allTasks().some(hasUnassigned),empty=!allTasks().length;if(dirty&&!unassigned&&!empty){failure(new Error('Recalculate before saving so the plan and forecasts match.'));return;}let saved=result;try{if(unassigned||empty)saved={plan:editablePlan(),...(empty?{needsTasks:true}:{needsAssignments:true})};}catch(error){failure(error);return;}const blob=new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=workspaceFilename(plan.name);link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});

function editablePlan(){
 if(plan.calendar && plan.calendar.startDate!==$('start-date').value && allTasks().some(t=>t.locked||t.actuals))throw new Error('This plan contains fixed commitments or actuals. Keep its recorded schedule start date.');
 const draft=structuredClone(plan);draft.approvalStatus='draft';
 if(draft.calendar){draft.calendar.startDate=$('start-date').value;for(const c of draft.calendar.resources)c.exceptions={};for(const e of exceptions){if(!e.date)throw new Error('Choose a date for every exception');const c=draft.calendar.resources.find(c=>c.resource===e.resource);if(Object.hasOwn(c.exceptions,e.date))throw new Error(`Only one exception per resource and date: ${e.resource}, ${e.date}`);c.exceptions[e.date]=e.hours;}}
 return draft;
}

async function inspectTemplate(text,label){templateText='';const info=await request('/api/template-info',{csvText:text});templateText=text;$('template-file-name').textContent=label;$('template-source').replaceChildren();for(const source of info.projects){const option=element('option',source);option.value=source;$('template-source').append(option);}if(!$('template-name').value)$('template-name').value=label.replace(/\.csv$/i,'').replaceAll('_',' ');}
$('show-template').addEventListener('click',()=>{$('new-project-panel').classList.add('hidden');$('template-panel').classList.toggle('hidden');if(!$('template-panel').classList.contains('hidden'))$('template-panel').scrollIntoView({block:'start'});});
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
function renderUtilization(){const report=result.utilization;$('utilization-content').classList.toggle('hidden',!report);$('utilization-empty').textContent=report?'':result.needsTasks?'Add tasks to calculate resource utilization.':result.needsAssignments?'Assign resources and recalculate to report utilization.':'Load a working calendar to report available and scheduled hours.';if(!report)return;const old=$('utilization-resource').value;$('utilization-resource').replaceChildren();for(const [id,label]of [['all','All resources'],...report.resources.map(r=>[r.resource,resourceName(r.resource,result.plan)])]){const option=element('option',label);option.value=id;$('utilization-resource').append(option);}if([...$('utilization-resource').options].some(o=>o.value===old))$('utilization-resource').value=old;renderUtilizationRows();}
function renderUtilizationRows(){const report=result.utilization;if(!report)return;const resource=$('utilization-resource').value;$('utilization-period').textContent=`${dateText(report.startDate)} – ${dateText(report.finishDate)} · Remaining calculated schedule${result.conflicts.length?' · Some commitments are infeasible; inspect conflicts above':''}`;
 $('utilization-summary').replaceChildren();for(const row of report.resources.filter(r=>resource==='all'||r.resource===resource)){const tr=element('tr');for(const value of [resourceName(row.resource,result.plan),hours(row.availableHours),hours(row.scheduledHours),hours(row.remainingHours),row.utilizationPercent===null?'—':hours(row.utilizationPercent)+'%',projectsText(row)])tr.append(element('td',value));$('utilization-summary').append(tr);}
 renderUtilizationGraph(report,resource);$('utilization-weeks').replaceChildren();for(const row of report.weeks.filter(r=>resource==='all'||r.resource===resource)){const tr=element('tr');for(const value of [dateText(row.weekStart),resourceName(row.resource,result.plan),hours(row.availableHours),hours(row.scheduledHours),hours(row.remainingHours),row.utilizationPercent===null?'—':hours(row.utilizationPercent)+'%',projectsText(row),row.taskIds.join(', ')||'—'])tr.append(element('td',value));$('utilization-weeks').append(tr);}}
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
  fields.push(['review',select(estimateReviewValue(task),`${task.id} estimate review`,status==='active'?[['stale','Needs review'],['current','Reviewed']]:[['','']])]);
  for(const [field,node] of fields){node.dataset.progress=field;node.disabled=field==='start'?status==='planned':field==='finish'?status!=='completed':['goodCase','poorCase','review'].includes(field)?status!=='active':false;row.append(cell(node));}body.append(row);
 }
}
$('progress-asof').addEventListener('change',event=>{const day=progressDay(event.target);if(!Number.isFinite(day)||day<plan.asOf){failure(new Error('Progress date must not move backward.'));event.target.value=progressValue(plan.asOf);return;}if(day>plan.asOf)for(const task of allTasks())if(task.status==='active'&&task.remaining)task.remaining.estimateStatus='stale';plan.asOf=day;changed();for(const row of $('progress-body').rows){const task=allTasks().find(t=>t.id===row.dataset.id);if(task.status==='active'&&task.remaining)row.querySelector('[data-progress="review"]').value=task.remaining.estimateStatus;}});
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

function renderUtilizationGraph(report,selection){
 const host=$('utilization-graph');host.replaceChildren();
 const dates=[...new Set(report.weeks.map(w=>w.weekStart))],colors=['#126452','#508caa','#b58a37','#8d69ac','#c56650','#50734a'];
 if(!dates.length){host.append(element('p','No remaining weeks to plot.'));return;}
 const svgNode=(tag,attrs={},text)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=text;return node;};
 const all=selection==='all',resources=all?report.resources.map(r=>r.resource):[selection],left=all?210:70,step=all?30:42,width=Math.max(700,left+dates.length*step+30),height=all?80+resources.length*32:300;
 host.append(element('h3',all?'Weekly resource utilization':'Weekly scheduled hours by project'));
 const scroll=element('div',undefined,'utilization-plot');const svg=svgNode('svg',{width,height,role:'img','aria-label':all?'Weekly utilization heatmap. Focus a cell for hours and utilization.':'Weekly project hours with available capacity line. Focus a bar for details.'});scroll.append(svg);host.append(scroll);
 const tooltip=(node,text)=>{node.setAttribute('tabindex','0');node.setAttribute('aria-label',text);node.append(svgNode('title',{},text));};
 if(all){
 const lookup=new Map(report.weeks.map(w=>[w.resource+'|'+w.weekStart,w]));
 resources.forEach((resource,i)=>{const y=35+i*32;svg.append(svgNode('text',{x:8,y:y+18,class:'axis-label'},resourceName(resource,result.plan)));dates.forEach((date,j)=>{const row=lookup.get(resource+'|'+date);if(!row)return;const percent=row.utilizationPercent,fill=percent===null?'#e5e7eb':percent>100.0001?'#bd5543':percent>=80?'#126452':percent>=40?'#79ad96':percent>0?'#c5dfd0':'#f1f5f0';const box=svgNode('rect',{x:left+j*step,y,width:26,height:25,rx:3,fill,stroke:'#dce5df'});tooltip(box,`${resourceName(resource,result.plan)} · week ${date}: ${hours(row.scheduledHours)} scheduled / ${hours(row.availableHours)} available hours; ${percent===null?'no availability':hours(percent)+'% utilization'}`);svg.append(box);});});
 dates.forEach((date,j)=>{if(j%Math.max(1,Math.ceil(dates.length/12))===0)svg.append(svgNode('text',{x:left+j*step,y:height-10,class:'axis-label'},date.slice(5)));});
 host.append(element('p','Weeks begin Monday · Pale: spare capacity · Dark green: 80–100% · Red: over capacity · Gray: no availability','graph-legend'));
 }else{
 const rows=report.weeks.filter(w=>w.resource===selection),max=Math.max(1,...rows.flatMap(w=>[w.availableHours,w.scheduledHours])),top=20,bottom=240,scale=(bottom-top)/max;
 for(let i=0;i<=4;i++){const value=max*i/4,y=bottom-value*scale;svg.append(svgNode('line',{x1:left,y1:y,x2:width-20,y2:y,stroke:'#e3e9e4'}),svgNode('text',{x:8,y:y+4,class:'axis-label'},hours(value)+'h'));}
 const points=[];
 rows.forEach((row,j)=>{const x=left+j*step;let sum=0;row.projectHours.forEach((project,k)=>{if(project.hours<=0)return;const rect=svgNode('rect',{x:x+4,y:bottom-(sum+project.hours)*scale,width:28,height:project.hours*scale,fill:colors[k%colors.length]});tooltip(rect,`${row.weekStart} · ${project.projectName}: ${hours(project.hours)} hours. Total ${hours(row.scheduledHours)} / ${hours(row.availableHours)} available hours.`);svg.append(rect);sum+=project.hours;});points.push(`${x+18},${bottom-row.availableHours*scale}`);if(j%Math.max(1,Math.ceil(rows.length/12))===0)svg.append(svgNode('text',{x,y:265,class:'axis-label'},row.weekStart.slice(5)));});
 svg.append(svgNode('polyline',{points:points.join(' '),fill:'none',stroke:'#26342f','stroke-width':2,'stroke-dasharray':'5 3'}));
 const legend=element('div',undefined,'graph-legend');result.projects.forEach((p,i)=>{const item=element('span',p.name);const swatch=svgNode('svg',{width:12,height:12,'aria-hidden':'true'});swatch.append(svgNode('rect',{width:12,height:12,fill:colors[i%colors.length]}));item.prepend(swatch);legend.append(item);});legend.append(element('span','Dashed line: available hours'));host.append(legend);
 }
 host.append(element('p','First and last weeks cover only the reporting period. Detailed values remain in the tables below.','graph-legend'));
}

function renderProjectOrder(){
 const list=$('project-order');list.replaceChildren();$('order-overrides').classList.toggle('hidden',!plan.taskOrderOverrides?.length);
 plan.projects.forEach((project,index)=>{
  const row=element('li'),label=element('span',`${index+1}. ${project.name}`),actions=element('div',undefined,'actions');
  for(const [direction,text] of [[-1,'Move up'],[1,'Move down']]){const button=element('button',text,'secondary');button.type='button';button.dataset.project=project.id;button.dataset.direction=direction;button.setAttribute('aria-label',`${text}: ${project.name}`);button.disabled=busy||(direction<0?index===0:index===plan.projects.length-1);actions.append(button);}
  const action=holdAction(project.onHold),hold=element('button',action.label,'secondary');hold.type='button';hold.setAttribute('aria-pressed',action.pressed);hold.dataset.holdProject=project.id;hold.setAttribute('aria-label',`${project.onHold?'Resume project':'Put on hold'}: ${project.name}`);hold.disabled=busy;actions.append(hold);const remove=element('button','Delete project','secondary delete-project');remove.type='button';remove.dataset.deleteProject=project.id;remove.setAttribute('aria-label',`Delete project: ${project.name}`);remove.disabled=busy;actions.append(remove);if(project.onHold)label.append(element('span',' · On hold','hold-label'));row.append(label,actions);list.append(row);
 });
}
$('project-order').addEventListener('click',async event=>{
 const remove=event.target.closest('button[data-delete-project]');
 if(remove){
  if(busy||remove.disabled)return;
  const project=plan.projects.find(project=>project.id===remove.dataset.deleteProject);
  if(!project)return;
  if(!confirm(`Are you sure you want to delete ${project.name} and all ${project.tasks.length} of its tasks? Resources will be kept. Save a workspace copy first if you may need to restore this project.`))return;
  setBusy(true);
  try{
   loadResult(await request('/api/project/delete',{plan:editablePlan(),projectId:project.id}));
   message(`Deleted ${project.name}. Resources were retained. Save workspace to keep this change.`,true);
  }catch(error){failure(error);}finally{setBusy(false);}
  return;
 }

 const hold=event.target.closest('button[data-hold-project]');if(hold&&!busy){const project=plan.projects.find(p=>p.id===hold.dataset.holdProject);project.onHold=!project.onHold;changed();renderProjectOrder();return;}
 const button=event.target.closest('button[data-project]');if(!button||button.disabled||busy)return;
 const index=plan.projects.findIndex(p=>p.id===button.dataset.project),next=index+Number(button.dataset.direction);
 if(next<0||next>=plan.projects.length)return;
 [plan.projects[index],plan.projects[next]]=[plan.projects[next],plan.projects[index]];changed();renderProjectOrder();
 $('project-order').querySelector(`button[data-project="${CSS.escape(button.dataset.project)}"][data-direction="${next===0?1:next===plan.projects.length-1?-1:button.dataset.direction}"]`)?.focus();
});
$('open-workspace').addEventListener('click',()=>{$('workspace-file').value='';$('workspace-file').click();});
$('workspace-file').addEventListener('change',async()=>{
 const file=$('workspace-file').files[0];if(!file)return;
 if(dirty&&!confirm('Open this workspace and discard your pending edits?'))return;
 setBusy(true);message('Opening saved workspace…');
 try{loadResult(await request('/api/load',{projectText:await file.text(),format:'json'}));$('project-file').value='';$('calendar-file').value='';$('project-name').textContent=file.name;}
 catch(error){failure(error);}finally{setBusy(false);}
});

function checklistTask(){return allTasks().find(t=>t.id===$('checklist-task').value);}
function renderChecklists(){const select=$('checklist-task'),old=select.value;select.replaceChildren();for(const project of plan.projects)for(const task of project.tasks){const option=element('option',`${project.name} · ${task.id} · ${task.name}`);option.value=task.id;select.append(option);}if([...select.options].some(o=>o.value===old))select.value=old;renderChecklistItems();}
function renderChecklistItems(){
 const task=checklistTask(),items=task?.checklist??[],list=$('checklist-items');list.replaceChildren();$('checklist-count').textContent=`${items.filter(i=>i.completed).length} of ${items.length} complete`;$('add-checklist-item').disabled=!task||busy;
 items.forEach((item,index)=>{const row=element('li');row.dataset.index=index;const check=input('',`Checklist item ${index+1} complete`,{type:'checkbox'});check.checked=item.completed;check.dataset.checklist='completed';const text=input(item.text,`Checklist item ${index+1} text`,{type:'text'});text.dataset.checklist='text';const remove=element('button','Remove','secondary');remove.dataset.removeChecklist=index;remove.setAttribute('aria-label',`Remove checklist item ${index+1}`);row.append(check,text,remove);list.append(row);});
}
$('checklist-task').addEventListener('change',renderChecklistItems);
$('add-checklist-item').addEventListener('click',()=>{const task=checklistTask();if(!task)return;task.checklist??=[];task.checklist.push({text:'New checklist item',completed:false});changed();renderChecklistItems();const inputs=$('checklist-items').querySelectorAll('[data-checklist="text"]');inputs[inputs.length-1].focus();inputs[inputs.length-1].select();});
$('checklist-items').addEventListener('change',event=>{const node=event.target,field=node.dataset.checklist;if(!field)return;const item=checklistTask().checklist[Number(node.closest('li').dataset.index)];item[field]=field==='completed'?node.checked:node.value;changed();const items=checklistTask().checklist;$('checklist-count').textContent=`${items.filter(i=>i.completed).length} of ${items.length} complete`;});
$('checklist-items').addEventListener('click',event=>{const button=event.target.closest('[data-remove-checklist]');if(!button)return;checklistTask().checklist.splice(Number(button.dataset.removeChecklist),1);changed();renderChecklistItems();});

function deadlineText(value){return typeof value==='string'?dateText(value):`Day ${value}`;}
function deadlineAssessmentText(assessment){if(!assessment)return 'No deadline';if(assessment.status==='unavailable')return assessment.reason==='calendar-required'?'Calendar required':'Forecast unavailable';return assessment.status==='late'?daysLateText(assessment.daysLate):'Meets deadline';}
function deadlineInput(target,label){const value=target.deadline;const node=input(value??'',label,{type:typeof value==='string'||(value===undefined&&plan.calendar)?'date':'number'});if(node.type==='number'){node.min=0;node.step='any';}return node;}
function renderDeadlines(){
 $('project-deadlines').replaceChildren();$('task-deadlines').replaceChildren();
 for(const project of plan.projects){const row=element('tr'),node=deadlineInput(project,`${project.id} project deadline`);node.dataset.deadlineProject=project.id;row.append(element('td',project.name),cell(node));const report=result.deadlineReport?.projects.find(p=>p.projectId===project.id);const target=deadlineTargetState(report?.assessments.p95);row.append(element('td',target.text,target.className));for(const key of ['deterministic','p50','p80','p95','p98','p99']){const assessment=report?.assessments[key];row.append(element('td',deadlineAssessmentText(assessment)+(report&&report.feasible===false?' · Infeasible':''),assessment?.status==='late'?'deadline-late':''));}$('project-deadlines').append(row);
 for(const task of project.tasks){const row=element('tr'),node=deadlineInput(task,`${task.id} task deadline`);node.dataset.deadlineTask=task.id;const assessment=result.deadlineReport?.tasks.find(t=>t.taskId===task.id)?.assessment;row.append(element('td',project.name),element('td',`${task.id} · ${task.name}`),cell(node),element('td',deadlineAssessmentText(assessment),assessment?.status==='late'?'deadline-late':''));$('task-deadlines').append(row);}}
}
function updateDeadline(event){const node=event.target;if(!node.dataset.deadlineProject&&!node.dataset.deadlineTask)return;const target=node.dataset.deadlineProject?plan.projects.find(p=>p.id===node.dataset.deadlineProject):allTasks().find(t=>t.id===node.dataset.deadlineTask);if(node.value==='')delete target.deadline;else target.deadline=node.type==='date'?node.value:node.valueAsNumber;changed();}
$('project-deadlines').addEventListener('change',updateDeadline);$('task-deadlines').addEventListener('change',updateDeadline);

function feedingTime(day){if(!usesCalendarDates(result.plan))return `Day ${hours(day)}`;return `${dateText(new Date(Date.parse(plan.calendar.startDate+'T00:00:00Z')+day*86400000).toISOString().slice(0,10))} (day ${hours(day)})`;}
function renderFeeding(){
 const body=$('feeding-tasks');body.replaceChildren();
 for(const project of plan.projects)for(const task of project.tasks){const row=element('tr'),check=input('',`${task.id} latest safe start`,{type:'checkbox'});check.checked=plan.feedingTaskIds?.includes(task.id)??false;check.dataset.feedingTask=task.id;row.append(cell(check),element('td',project.name),element('td',`${task.id} · ${task.name}`),element('td',resourceName(task.resource)));body.append(row);}
 const host=$('feeding-report');host.replaceChildren();const report=result.feedingReport;if(!report){host.append(element('p',result.needsTasks?'Add tasks to calculate feeding protection.':result.needsAssignments?'Assign resources and recalculate to calculate feeding protection.':'No feeding tasks selected in the last calculation.'));return;}
 for(const change of report.changes){const item=element('article');item.append(element('h4',`${taskName(change.taskId)} · ${change.status}`),element('p',change.reason));if(change.protectedStart!==null)item.append(element('p',`Start: ${feedingTime(change.originalStart)} → ${feedingTime(change.newStart)}. P50: ${hours(change.p50Effort)} workdays; P99: ${hours(change.p99Effort)} workdays; buffer: ${hours(change.bufferEffort)} workdays. Protected downstream start: ${feedingTime(change.protectedStart)}.`));for(const window of report.resourceWindows.filter(w=>w.taskId===change.taskId))item.append(element('p',`${resourceName(window.resource)}: ${window.allocationPercent}% allocation freed from ${feedingTime(window.start)} to ${feedingTime(window.finish)}. Later occupied by this task from ${feedingTime(change.newStart)} to ${feedingTime(change.newFinish)}; protection reserves its allocation until ${feedingTime(change.protectionFinish??change.protectedStart)}. Other work can use safe earlier gaps.`));if(change.feedsHigherPriorityProject)item.append(element('p',`Owning project deterministic completion: ${change.ownerCompletionBefore===null?'unavailable':feedingTime(change.ownerCompletionBefore)} → ${change.ownerCompletionAfter===null?'unavailable':feedingTime(change.ownerCompletionAfter)}. Higher-priority downstream start remains protected.`));host.append(item);}
}
$('feeding-tasks').addEventListener('change',event=>{const node=event.target,id=node.dataset.feedingTask;if(!id)return;const ids=new Set(plan.feedingTaskIds??[]);if(node.checked)ids.add(id);else ids.delete(id);plan.feedingTaskIds=[...ids];changed();});

function renderTimeDisplay(){const control=$('time-display');control.value=usesCalendarDates(result.plan)?'dates':'days';const dates=control.querySelector('[value="dates"]');dates.disabled=!result.plan.calendar;dates.textContent=result.plan.calendar?'Calendar dates':'Dates (calendar required)';$('time-display-note').textContent=result.plan.calendar?(usesCalendarDates(result.plan)?'Calendar dates use resource availability. Estimates remain working days.':'Day numbers are elapsed calendar days from schedule start, including weekends and holidays.'):'Abstract day numbers. Load a resource calendar to view completion dates.';}
$('time-display').addEventListener('change',()=>{if(!plan)return;const mode=$('time-display').value;plan.settings.displayTime=mode;result.plan.settings.displayTime=mode;renderTimeDisplay();renderResults();renderFeeding();});

// File-free project and task entry. Existing edits are included in each request.
function openBlankProject(){
 $('template-panel').classList.add('hidden');$('new-project-panel').classList.remove('hidden');
 $('new-project-panel').scrollIntoView({block:'start'});$('new-project-name').focus();
}
for(const id of ['show-new-project','add-blank-project','template-start-blank'])$(id).addEventListener('click',openBlankProject);
$('workspace-name').addEventListener('change',()=>{
 const name=$('workspace-name').value.trim()||'Untitled workspace';
 $('workspace-name').value=name;plan.name=name;result.plan.name=name;document.title=`${name} · BufferLogic`;
});
$('cancel-new-project').addEventListener('click',()=>$('new-project-panel').classList.add('hidden'));
$('create-blank-project').addEventListener('click',async()=>{
 if(busy)return;setBusy(true);
 try{
  const data={name:$('new-project-name').value,startDate:$('start-date').value,timeZone:zone};
  if(plan)data.plan=editablePlan();
  loadResult(await request('/api/project',data));
  const project=plan.projects[plan.projects.length-1];
  $('project-filter').value=project.id;renderTasks();
  $('new-project-panel').classList.add('hidden');$('new-project-name').value='';
  document.querySelector('[data-tab="tasks"]').click();
  message(`Created ${project.name}. Add resources in Resources & calendars, then add tasks.`);
 }catch(error){failure(error);}finally{setBusy(false);}
});
function renderNewTaskFields(){
 const projects=$('new-task-project'),previous=projects.value,filter=$('project-filter').value;
 projects.replaceChildren();for(const project of plan.projects){const option=element('option',project.name);option.value=project.id;projects.append(option);}
 projects.value=plan.projects.some(p=>p.id===filter)?filter:plan.projects.some(p=>p.id===previous)?previous:plan.projects[0]?.id??'';
 const resources=$('new-task-resource'),old=resources.value;resources.replaceChildren();
 for(const [id,label]of [['','Unassigned — choose later'],...plan.resources.map(id=>[id,resourceName(id)])]){const option=element('option',label);option.value=id;resources.append(option);}
 if(plan.resources.includes(old))resources.value=old;
}
$('show-add-task').addEventListener('click',()=>{renderNewTaskFields();$('add-task-panel').classList.remove('hidden');$('new-task-name').focus();});
$('cancel-add-task').addEventListener('click',()=>$('add-task-panel').classList.add('hidden'));
$('create-task').addEventListener('click',async()=>{
 if(busy||!plan)return;setBusy(true);
 try{
  const projectId=$('new-task-project').value;
  const data={plan:editablePlan(),projectId,name:$('new-task-name').value,resource:$('new-task-resource').value,goodCase:$('new-task-good').valueAsNumber,poorCase:$('new-task-poor').valueAsNumber,dependsOn:$('new-task-dependencies').value.trim()?$('new-task-dependencies').value.split(',').map(id=>id.trim()):[]};
  loadResult(await request('/api/task',data));$('project-filter').value=projectId;renderTasks();
  $('add-task-panel').classList.add('hidden');$('new-task-name').value='';$('new-task-dependencies').value='';
 }catch(error){failure(error);}finally{setBusy(false);}
});
