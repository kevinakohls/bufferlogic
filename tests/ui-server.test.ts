import { todayDate } from '../src/resource-calendars.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { createReviewServer } from '../src/ui-server.js';
import { schedulePortfolio } from '../src/portfolio.js';

async function withServer(run:(base:string)=>Promise<void>){
 const server=createReviewServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try{await run(base);}finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
const post=(base:string,path:string,data:unknown)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});

test('review UI serves its files and two-house example without accepting arbitrary paths',async()=>withServer(async base=>{
 const response=await fetch(base);assert.equal(response.status,200);assert.match(await response.text(),/Project completion forecasts/);
 assert.match(response.headers.get('content-security-policy')!,/frame-ancestors 'none'/);
 const sample=await (await fetch(base+'/api/example')).json();assert.match(sample.projectText,/Project/);assert.match(sample.calendarText,/Monday hours/);
 assert.equal((await fetch(base+'/package.json')).status,404);
}));
test('file loading and edited calendars use the existing engine and return separate project forecasts',async()=>withServer(async base=>{
 const source=await (await fetch(base+'/api/example')).json();
 const response=await post(base,'/api/load',{...source,format:'csv',startDate:'2026-10-09',timeZone:'America/New_York'});
 assert.equal(response.status,200);const loaded=await response.json();assert.equal(loaded.tasks.length,72);
 assert.deepEqual(loaded.projects,schedulePortfolio(loaded.plan).projects);
 const draft=structuredClone(loaded.plan);draft.versionId='edited';draft.calendar.resources.forEach((r:{weeklyHours:number[]})=>r.weeklyHours[5]=8);
 const edited=await (await post(base,'/api/schedule',{plan:draft})).json();
 assert.ok(edited.projects[0].forecast.completionDates.p95<loaded.projects[0].forecast.completionDates.p95);
 assert.ok(edited.projects[1].forecast.completionDates.p95<loaded.projects[1].forecast.completionDates.p95);
}));
test('UI reloads saved result JSON and reports invalid dependencies without modifying the source',async()=>withServer(async base=>{
 const source=await readFile('examples/portfolio-contention.json','utf8');
 const loaded=await (await post(base,'/api/load',{projectText:source,format:'json'})).json();
 const reloaded=await (await post(base,'/api/load',{projectText:JSON.stringify(loaded),format:'json'})).json();assert.deepEqual(reloaded.projects,loaded.projects);
 const draft=structuredClone(loaded.plan);draft.projects[0].tasks[0].dependsOn=['missing'];
 const failed=await post(base,'/api/schedule',{plan:draft});assert.equal(failed.status,400);assert.match((await failed.json()).error,/Missing dependency/);
 assert.deepEqual(loaded.plan.projects[0].tasks[0].dependsOn,[]);
}));
test('review API rejects cross-origin requests and moving a dated locked plan origin',async()=>withServer(async base=>{
 const rejected=await fetch(base+'/api/schedule',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:'{}'});assert.equal(rejected.status,403);
 const plan=JSON.parse(await readFile('examples/portfolio.json','utf8'));
 plan.calendar={startDate:'2026-10-09',hoursPerWorkday:8,resources:plan.resources.map((resource:string)=>({resource,weeklyHours:[8,8,8,8,8,0,0],exceptions:{}}))};
 const calendar='Resource,Row type,Date,Monday hours,Tuesday hours,Wednesday hours,Thursday hours,Friday hours,Saturday hours,Sunday hours,Exception hours\nAlice,weekly,,8,8,8,8,8,0,0,';
 const response=await post(base,'/api/load',{projectText:JSON.stringify(plan),format:'json',calendarText:calendar,startDate:'2026-10-10'});
 assert.equal(response.status,400);assert.match((await response.json()).error,/fixed commitments/);
}));

test('template API appends unique software projects and includes utilization without changing prior data',async()=>withServer(async base=>{
 const source=await (await fetch(base+'/api/software-template')).json();
 const info=await (await post(base,'/api/template-info',{csvText:source.csvText})).json();assert.deepEqual(info.projects,['Template']);
 const first=await (await post(base,'/api/template',{csvText:source.csvText,name:'Software One',startDate:'2026-10-09'})).json();
 assert.equal(first.projects[0].tasks[0].id,'P1-T001');assert.equal(first.projects[0].tasks.length,26);assert.ok(first.utilization);
 first.plan.projects[0].comments='Customer review';
 const second=await (await post(base,'/api/template',{csvText:source.csvText,name:'Software Two',plan:first.plan})).json();
 assert.equal(second.projects[1].tasks[0].id,'P2-T001');assert.equal(second.projects[0].comments,'Customer review');assert.equal(first.plan.projects.length,1);
 assert.equal(second.utilization.resources.length,12);assert.ok(second.utilization.resources.some((r:{projectHours:{hours:number}[]})=>r.projectHours.every(p=>p.hours>0)));
}));

test('review API persists feeding selections, applies protection and rejects stale IDs at load',async()=>withServer(async base=>{
 const source=await readFile('examples/feeding-protection.json','utf8');const loaded=await (await post(base,'/api/load',{projectText:source,format:'json'})).json();
 const plan={...loaded.plan,feedingTaskIds:['F']};const response=await post(base,'/api/schedule',{plan});assert.equal(response.status,200);const updated=await response.json();assert.equal(updated.feedingReport.changes[0].status,'applied');assert.deepEqual(updated.plan.feedingTaskIds,['F']);assert.equal(updated.tasks.find((task:{id:string})=>task.id==='L').start,0);
 const reopened=await (await post(base,'/api/load',{projectText:JSON.stringify(updated),format:'json'})).json();assert.deepEqual(reopened.tasks,updated.tasks);
 const bad=await post(base,'/api/load',{projectText:JSON.stringify({...plan,feedingTaskIds:['missing']}),format:'json'});assert.equal(bad.status,400);assert.match((await bad.json()).error,/Unknown feeding task/);
 const cleared=await (await post(base,'/api/schedule',{plan:{...updated.plan,feedingTaskIds:[]}})).json();assert.equal(cleared.feedingReport,undefined);assert.equal(cleared.tasks.find((task:{id:string})=>task.id==='L').start,4);
}));

test('unassigned workspaces reopen as editable drafts with no misleading forecasts, then schedule after assignment',async()=>withServer(async base=>{
 const source=JSON.parse(await readFile('examples/feeding-protection.json','utf8'));
 source.resources=[];for(const project of source.projects)for(const task of project.tasks)task.resource='';
 const loadedResponse=await post(base,'/api/load',{projectText:JSON.stringify(source),format:'json'});assert.equal(loadedResponse.status,200);
 const loaded=await loadedResponse.json();assert.equal(loaded.needsAssignments,true);assert.equal(loaded.unassignedTaskIds.length,4);assert.deepEqual(loaded.plan.resources,[]);assert.equal(loaded.projects,undefined);assert.equal(loaded.tasks,undefined);
 const rescheduled=await (await post(base,'/api/schedule',{plan:loaded.plan})).json();assert.equal(rescheduled.needsAssignments,true);assert.deepEqual(rescheduled.plan.resources,[]);
 const reopened=await (await post(base,'/api/load',{projectText:JSON.stringify(loaded),format:'json'})).json();assert.deepEqual(reopened.plan,loaded.plan);
 for(const project of reopened.plan.projects)for(const task of project.tasks)task.resource='New';
 const scheduled=await (await post(base,'/api/schedule',{plan:reopened.plan})).json();assert.equal(scheduled.needsAssignments,undefined);assert.equal(scheduled.tasks.length,4);assert.deepEqual(scheduled.plan.resources,['New']);
}));

test('file-free project and task entry supports empty drafts, assignment, dependencies and multiple projects',async()=>withServer(async base=>{
 const created=await post(base,'/api/project',{name:'New release',startDate:'2026-10-12',timeZone:'America/New_York'});assert.equal(created.status,200);
 const blank=await created.json();assert.equal(blank.needsTasks,true);assert.equal(blank.projects,undefined);assert.deepEqual(blank.plan.resources,[]);
 const reopened=await (await post(base,'/api/load',{projectText:JSON.stringify(blank),format:'json'})).json();assert.deepEqual(reopened.plan,blank.plan);
 const input={projectId:'P1',name:'Build',resource:'',goodCase:2,poorCase:4,dependsOn:[]};
 const draft=await (await post(base,'/api/task',{plan:blank.plan,...input})).json();assert.equal(draft.needsAssignments,true);
 draft.plan.resources=['Developer'];draft.plan.projects[0].tasks[0].resource='Developer';
 const id=draft.plan.projects[0].tasks[0].id;
 const scheduled=await (await post(base,'/api/task',{plan:draft.plan,...input,name:'Test',resource:'Developer',dependsOn:[id]})).json();assert.equal(scheduled.tasks.length,2);assert.ok(scheduled.tasks[1].start>=scheduled.tasks[0].finish);
 const expanded=await (await post(base,'/api/project',{plan:scheduled.plan,name:'Second release',startDate:'2030-01-01'})).json();assert.equal(expanded.plan.projects.length,2);assert.deepEqual(expanded.plan.projects[0],scheduled.plan.projects[0]);assert.equal(expanded.plan.calendar.startDate,'2026-10-12');
 assert.equal((await post(base,'/api/task',{plan:scheduled.plan,...input,dependsOn:['missing']})).status,400);
 assert.equal((await post(base,'/api/project',{name:' '})).status,400);
}));


test('blank-project dates default to today in the client timezone when missing or empty, while invalid dates are rejected',async()=>withServer(async base=>{
 for(const extra of [{},{startDate:''},{startDate:'   '}]){
  const before=todayDate('Pacific/Kiritimati');
  const response=await post(base,'/api/project',{name:'New release',timeZone:'Pacific/Kiritimati',...extra});
  assert.equal(response.status,200);const value=await response.json();
  assert.ok([before,todayDate('Pacific/Kiritimati')].includes(value.plan.calendar.startDate));
  assert.equal(value.needsTasks,true);
 }
 const invalid=await post(base,'/api/project',{name:'New release',startDate:'2026-02-30'});
 assert.equal(invalid.status,400);assert.match((await invalid.json()).error,/Invalid date/);
}));

test('workspace names survive save/load and the browser icon is served safely',async()=>withServer(async base=>{
 const blank=await (await post(base,'/api/project',{name:'Release One',startDate:'2026-10-15'})).json();
 blank.plan.name='Kevin functionality review';
 const reopened=await (await post(base,'/api/load',{projectText:JSON.stringify(blank),format:'json'})).json();assert.equal(reopened.plan.name,'Kevin functionality review');
 const second=await (await post(base,'/api/project',{plan:reopened.plan,name:'Release Two'})).json();assert.equal(second.plan.name,'Kevin functionality review');assert.deepEqual(second.plan.projects[0],blank.plan.projects[0]);
 const icon=await fetch(base+'/favicon.svg');assert.equal(icon.status,200);assert.equal(icon.headers.get('content-type'),'image/svg+xml');assert.match(await icon.text(),/<svg/);
 const page=await (await fetch(base)).text();assert.match(page,/rel="icon"/);assert.match(page,/id="add-blank-project"/);
}));

test('project deletion API blocks cross-project dependencies and supports an empty saveable workspace',async()=>withServer(async base=>{
 const source=JSON.parse(await readFile('examples/feeding-protection.json','utf8'));
 const blocked=structuredClone(source);blocked.projects[1].tasks[0].dependsOn=['D'];
 const refused=await post(base,'/api/project/delete',{plan:blocked,projectId:'P1'});assert.equal(refused.status,400);assert.match((await refused.json()).error,/dependencies/);
 const response=await post(base,'/api/project/delete',{plan:source,projectId:'P1'});assert.equal(response.status,200);const result=await response.json();assert.equal(result.plan.projects.length,1);assert.equal(result.tasks.length,1);assert.deepEqual(result.plan.resources,source.resources);
 const last=await (await post(base,'/api/project/delete',{plan:result.plan,projectId:'P2'})).json();assert.equal(last.needsTasks,true);assert.deepEqual(last.plan.projects,[]);assert.deepEqual(last.plan.resources,source.resources);
 const reopened=await (await post(base,'/api/load',{projectText:JSON.stringify(last),format:'json'})).json();assert.deepEqual(reopened.plan,last.plan);
 assert.equal((await post(base,'/api/project/delete',{plan:source,projectId:'missing'})).status,400);
}));

test('supporting assignments round-trip through the review API, and missing support blocks calculation without dropping the requirement',async()=>withServer(async base=>{
 const source=JSON.parse(await readFile('examples/feeding-protection.json','utf8'));
 source.projects[0].tasks[0].supportingResources=[{resource:'Loader',allocationPercent:100},{resource:'Spotter',allocationPercent:50}];
 const loaded=await (await post(base,'/api/load',{projectText:JSON.stringify(source),format:'json'})).json();
 assert.ok(loaded.plan.resources.includes('Loader'));assert.equal(loaded.tasks.find((t:{id:string})=>t.id==='C').supportingResources.length,2);
 const reopened=await (await post(base,'/api/load',{projectText:JSON.stringify(loaded),format:'json'})).json();assert.deepEqual(reopened.tasks,loaded.tasks);
 reopened.plan.projects[0].tasks[0].supportingResources[0].resource='';reopened.plan.resources=reopened.plan.resources.filter((r:string)=>r!=='Loader');
 const draft=await (await post(base,'/api/schedule',{plan:reopened.plan})).json();assert.equal(draft.needsAssignments,true);assert.deepEqual(draft.unassignedTaskIds,['C']);assert.equal(draft.projects,undefined);assert.equal(draft.plan.projects[0].tasks[0].supportingResources[0].resource,'');
}));

test('built-in housing template adds shared equipment and spotting support to new project copies',async()=>withServer(async base=>{
 const source=await (await fetch(base+'/api/housing-template')).json();assert.match(source.csvText,/Supporting resources/);
 const first=await (await post(base,'/api/template',{csvText:source.csvText,name:'House One',startDate:'2026-10-19'})).json();assert.equal(first.plan.projects[0].tasks.length,36);
 const excavation=first.plan.projects[0].tasks.find((t:{name:string})=>t.name==='Excavate foundation');assert.equal(excavation.supportingResources.length,2);
 for(const id of ['Backhoe 1','Loader 1','Concrete pump 1','Telehandler 1'])assert.deepEqual(first.plan.calendar.resources.find((r:{resource:string})=>r.resource===id).weeklyHours,[8,8,8,8,8,0,0]);
 const second=await (await post(base,'/api/template',{csvText:source.csvText,name:'House Two',plan:first.plan})).json();assert.equal(second.plan.projects.length,2);assert.equal(second.tasks.length,72);assert.equal(second.conflicts.length,0);assert.equal(second.plan.resources.filter((r:string)=>r==='Loader 1').length,1);
}));

test('comparison API reports a saved baseline versus a what-if plan and rejects incompatible versions',async()=>withServer(async base=>{
 const source=JSON.parse(await readFile('examples/feeding-protection.json','utf8'));
 const scenario=structuredClone(source);scenario.projects[0].tasks[0].goodCase=25;scenario.projects[0].tasks[0].poorCase=25;
 const response=await post(base,'/api/compare',{baseline:{plan:source},scenario});assert.equal(response.status,200);const report=await response.json();assert.ok(report.projects.find((p:{projectId:string})=>p.projectId==='P1').p95Change>0);assert.ok(report.tasks.length>0);
 const bad=await post(base,'/api/compare',{baseline:source,scenario:{...source,asOf:1}});assert.equal(bad.status,400);assert.match((await bad.json()).error,/Progress as of/);
}));
