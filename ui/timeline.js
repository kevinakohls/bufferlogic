const ns='http://www.w3.org/2000/svg';
const $=id=>document.getElementById(id);
let result,projectId,selectedId;
function svg(tag,attrs={},text){const node=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;}
function html(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function original(id){return result.plan.projects.flatMap(p=>p.tasks).find(t=>t.id===id);}
function scheduled(id){return result.tasks.find(t=>t.id===id);}
function taskLabel(id){const t=original(id);return t?`${id} · ${t.name}`:id;}
function displayDate(offset){if(!result.plan.calendar)return `Day ${Number(offset.toFixed(2))}`;const date=new Date(result.plan.calendar.startDate+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+Math.floor(offset));return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(date);}
function details(){
 const entry=scheduled(selectedId),task=original(selectedId),panel=$('timeline-details');panel.replaceChildren();if(!entry||!task)return;
 const owner=result.projects.find(p=>p.id===entry.projectId),chain=result.projects.find(p=>p.id===projectId).forecast.criticalChain;
 panel.append(html('p','SELECTED TASK','eyebrow'),html('h3',task.name),html('p',`${task.id} · ${owner.name}`,'detail-project'));
 if(chain.includes(task.id))panel.append(html('span',entry.projectId===projectId?'On this project’s critical chain':'Cross-project critical-chain task','detail-chain'));
 const list=html('dl');const estimates=task.status==='active'?task.remaining:task;
 for(const [label,value]of [['Resource',result.plan.resourceDetails?.find(r=>r.id===task.resource)?.name||task.resource],['Allocation',`${entry.allocationPercent}%${task.durationMode==='elapsed'?' · elapsed wait':''}`],['Start',entry.startDate??displayDate(entry.start)],['Finish',entry.finishDate??displayDate(entry.finish)],['Estimates',`${estimates.goodCase} / ${estimates.poorCase} days · P20 / P80${task.status==='active'?' remaining':''}`],['Commitment',entry.locked?(entry.start===entry.finish?'Locked milestone':'Locked start and finish'):(entry.start===entry.finish?'Milestone':'Flexible')],['Status',task.status??'planned']])list.append(html('dt',label),html('dd',value));
 panel.append(list);
 for(const [title,value]of [['Description',task.description],['Completion criteria',task.completionCriteria],['Locked commitment reason',task.lockReason],['Comments',task.comments]])if(value){panel.append(html('h4',title),html('p',value,'detail-note'));}
 for(const [title,ids]of [['Depends on',entry.technicalPredecessors],['Waits for resource from',entry.resourcePredecessors]]){
  panel.append(html('h4',title));if(!ids.length){panel.append(html('p','None','detail-empty'));continue;}
  for(const id of ids){const button=html('button',taskLabel(id),'detail-link');button.type='button';button.addEventListener('click',()=>selectTask(id,true));panel.append(button);}
 }
 const resource=result.plan.resourceDetails?.find(r=>r.id===task.resource);
 if(resource?.comments){panel.append(html('h4','Resource comments'),html('p',resource.comments,'detail-note'));}
 const warnings=result.conflicts.filter(c=>c.taskIds.includes(task.id));for(const warning of warnings)panel.append(html('p',warning.message,'detail-warning'));
}
function selectTask(id,scroll=false){selectedId=id;$('timeline-task').value=id;draw();if(scroll){const node=[...$('timeline-chart').querySelectorAll('[data-task]')].find(n=>n.dataset.task===id);node?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});}}
function draw(){
 if(!result)return;
 const project=result.projects.find(p=>p.id===projectId);const chain=project.forecast.criticalChain,chainSet=new Set(chain),chainPairs=new Set(chain.slice(1).map((id,i)=>`${chain[i]}\0${id}`));
 const cross=chain.filter(id=>scheduled(id).projectId!==projectId).length;
 $('timeline-summary').textContent=`${project.name}: ${chain.length} critical-chain tasks${cross?`, including ${cross} from another project`:''}${project.forecast.feasible?'':' · Infeasible schedule — review conflicts'}.`;
 const chart=$('timeline-chart');const restoreFocus=document.activeElement?.classList?.contains('timeline-task');const oldTop=chart.scrollTop,oldLeft=chart.scrollLeft;chart.replaceChildren();
 const width=Math.max(680,chart.clientWidth||920)*Number($('timeline-zoom').value),labelWidth=270,end=Math.max(1,...result.tasks.map(t=>t.finish)),plotWidth=width-labelWidth-35,rowHeight=32,positions=new Map();let y=14;
 const groups=[];
 for(const owner of result.projects){const tasks=result.tasks.filter(t=>t.projectId===owner.id).sort((a,b)=>a.start-b.start||a.finish-b.finish);groups.push({owner,y});y+=32;for(const task of tasks){positions.set(task.id,{y});y+=rowHeight;}y+=12;}
 const height=y+12,x=time=>labelWidth+time/end*plotWidth,canvas=svg('svg',{width,height,class:'timeline-canvas',role:'group','aria-label':`Schedule for ${result.projects.length} projects. ${project.name} critical chain highlighted.`});
 const defs=svg('defs');for(const [kind,color]of [['technical','#508caa'],['resource','#8d69ac']]){const marker=svg('marker',{id:`arrow-${kind}`,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:color}));defs.append(marker);}canvas.append(defs);
 canvas.append(svg('rect',{width,height,fill:'#fff'}));
 const axis=svg('svg',{width,height:40,class:'timeline-axis','aria-hidden':'true'});
 const minimumStep=end/plotWidth*100;
 const step=[1,2,7,14,30,60,90,180,365,730,3650].find(value=>value>=minimumStep)??Math.ceil(minimumStep);
 for(let day=0;day<=end;day+=step){canvas.append(svg('line',{x1:x(day),x2:x(day),y1:0,y2:height,stroke:'#edf1ec'}));axis.append(svg('text',{x:x(day)+4,y:25,class:'axis-label'},displayDate(day)));}
 axis.append(svg('text',{x:16,y:25,class:'axis-label'},'PROJECT / TASK'));
 for(const group of groups){canvas.append(svg('rect',{x:0,y:group.y,width,height:28,fill:group.owner.id===projectId?'#e8f2eb':'#f2f5f0'}),svg('text',{x:16,y:group.y+19,class:'group-label'},group.owner.name));}
 // Links are drawn behind task buttons; each kind remains visually distinct.
 const mode=$('timeline-links').value;
 for(const task of result.tasks){
  for(const [kind,ids]of [['technical',task.technicalPredecessors],['resource',task.resourcePredecessors]])for(const id of ids){
   const before=scheduled(id);if(!before||!positions.has(id)||!positions.has(task.id))continue;
   const onChain=chainPairs.has(`${id}\0${task.id}`);
   if(mode==='none'||(mode==='chain'&&!onChain)||(mode==='task'&&task.id!==selectedId&&id!==selectedId))continue;
   const a=positions.get(id),b=positions.get(task.id),sx=x(before.finish),tx=x(task.start),sy=a.y+16,ty=b.y+16,bend=Math.max(sx+10,tx-12);
   const edge=svg('path',{d:`M ${sx} ${sy} L ${bend} ${sy} L ${bend} ${ty} L ${tx} ${ty}`,fill:'none',stroke:kind==='resource'?'#8d69ac':'#508caa','stroke-width':onChain?2:1.2,'stroke-dasharray':kind==='resource'?'5 4':'none','marker-end':`url(#arrow-${kind})`,opacity:mode==='all'&&!onChain?.45:.85,class:'timeline-edge'});edge.append(svg('title',{},`${taskLabel(id)} → ${taskLabel(task.id)} · ${kind==='resource'?'resource wait':'dependency'}`));canvas.append(edge);
  }
 }
 for(const task of result.tasks){
  const taskData=original(task.id),p=positions.get(task.id),onChain=chainSet.has(task.id),isSelected=task.id===selectedId,isMilestone=task.start===task.finish;
  const row=svg('g',{'data-task':task.id,role:'button',tabindex:0,'aria-label':`${taskLabel(task.id)}, ${task.resource}, ${task.startDate??displayDate(task.start)} to ${task.finishDate??displayDate(task.finish)}${onChain?', critical chain':''}${task.locked?', locked':''}`,'aria-pressed':isSelected,class:'timeline-task'});
  row.append(svg('rect',{x:0,y:p.y,width:labelWidth-8,height:rowHeight,fill:isSelected?'#edf5ee':'#fff'}));
  const label=`${task.id} · ${taskData.name}`;row.append(svg('text',{x:16,y:p.y+20,class:onChain?'task-label chain-label':'task-label'},label.length>36?label.slice(0,34)+'…':label));
  const start=x(task.start),barWidth=Math.max(4,x(task.finish)-start),fill=onChain?'#dfab56':'#87b4a0',stroke=isSelected?'#113f33':task.locked?'#63452c':onChain?'#c28e38':'#619680';
  if(isMilestone)row.append(svg('polygon',{points:`${start},${p.y+8} ${start+8},${p.y+16} ${start},${p.y+24} ${start-8},${p.y+16}`,fill,stroke,'stroke-width':isSelected?3:task.locked?2:1}));
  else{row.append(svg('rect',{x:start,y:p.y+7,width:barWidth,height:18,rx:3,fill,stroke,'stroke-width':isSelected?3:task.locked?2:1}));if(barWidth>24)row.append(svg('text',{x:start+7,y:p.y+20,class:'bar-id'},task.id));}
  if(task.locked)row.append(svg('text',{x:start+(isMilestone?12:barWidth+5),y:p.y+20,class:'lock-label'},'L'));
  row.append(svg('title',{},`${taskLabel(task.id)} · ${task.resource}${onChain?' · critical chain':''}${task.locked?' · locked':''}`));
  row.addEventListener('click',()=>selectTask(task.id));row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectTask(task.id);}});canvas.append(row);
 }
 chart.append(axis,canvas);chart.scrollTop=oldTop;chart.scrollLeft=oldLeft;details();
 const focused=canvas.querySelector(`[data-task="${CSS.escape(selectedId??'')}"]`);if(restoreFocus)focused?.focus({preventScroll:true});
}
export function renderTimeline(value){
 result=value;if(!result.projects.some(p=>p.id===projectId))projectId=result.projects[0]?.id;
 const projectSelect=$('timeline-project');projectSelect.replaceChildren();for(const p of result.projects){const option=html('option',p.name);option.value=p.id;projectSelect.append(option);}projectSelect.value=projectId;
 const taskSelect=$('timeline-task');taskSelect.replaceChildren();for(const t of result.tasks){const option=html('option',`${t.projectId} · ${taskLabel(t.id)}`);option.value=t.id;taskSelect.append(option);}
 if(!scheduled(selectedId))selectedId=result.tasks[0]?.id;taskSelect.value=selectedId;
 if(!projectId){$('timeline-chart').replaceChildren();$('timeline-details').replaceChildren();$('timeline-summary').textContent='No projects to display.';return;}draw();
}
$('timeline-project').addEventListener('change',()=>{projectId=$('timeline-project').value;draw();});
$('timeline-links').addEventListener('change',draw);$('timeline-zoom').addEventListener('change',draw);$('timeline-task').addEventListener('change',()=>selectTask($('timeline-task').value,true));

export function refreshTimeline(){draw();}
window.addEventListener('resize',()=>{if(result&&!$('timeline-view').classList.contains('hidden'))draw();});
