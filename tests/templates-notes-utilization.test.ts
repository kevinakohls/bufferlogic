import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { instantiateTemplate, templateProjects } from '../src/templates.js';
import { parsePortfolio, schedulePortfolio, type PortfolioPlan, type PortfolioTask } from '../src/portfolio.js';
import { parsePortfolioCsv } from '../src/portfolio-csv.js';
import { resourceUtilization } from '../src/utilization.js';
const header='ID,Task,Resource,Depends on,Good days,Poor days,Priority';
const csv=header+'\nA,Design,Alice,none,2,2,99\nB,Build,Alice,A,3,3,0';
const task=(id:string,extra:Partial<PortfolioTask>={}):PortfolioTask=>({id,projectId:'P1',name:id,resource:'Alice',goodCase:2,poorCase:2,dependsOn:[],priority:1,...extra});
function plan(tasks:PortfolioTask[]):PortfolioPlan{return {id:'notes',versionId:'v1',asOf:0,settings:{durationUnit:'days'},resources:['Alice','Bob'],projects:[{id:'P1',name:'One',tasks}],calendar:{startDate:'2026-10-09',hoursPerWorkday:8,resources:['Alice','Bob'].map(resource=>({resource,weeklyHours:[8,8,8,8,8,0,0],exceptions:{}}))}};}

test('template copies generate unique IDs, row-order priorities and remapped dependencies',()=>{
 const first=instantiateTemplate(csv,'First');const snapshot=structuredClone(first);const second=instantiateTemplate(csv,'Second',first);
 assert.deepEqual(first,snapshot);assert.deepEqual(second.projects.map(p=>p.id),['P1','P2']);
 assert.deepEqual(second.projects[0]!.tasks.map(t=>t.id),['P1-T001','P1-T002']);assert.deepEqual(second.projects[1]!.tasks.map(t=>t.id),['P2-T001','P2-T002']);
 assert.deepEqual(second.projects[1]!.tasks.map(t=>t.priority),[1,2]);assert.deepEqual(second.projects[1]!.tasks[1]!.dependsOn,['P2-T001']);
 const schedule=schedulePortfolio(second);assert.equal(schedule.tasks.find(t=>t.id==='P2-T001')!.start,5);assert.equal(schedule.tasks.find(t=>t.id==='P1-T002')!.start,2);
});
test('regular import preserves priorities and IDs rather than applying template defaults',()=>{
 const regular=parsePortfolioCsv(header+',Project\nA,Design,Alice,none,2,2,99,P1\nB,Build,Alice,A,3,3,0,P1');
 assert.deepEqual(regular.projects[0]!.tasks.map(t=>[t.id,t.priority]),[['A',99],['B',0]]);
});
test('template ID generation avoids collisions and rejects missing or external predecessors',()=>{
 const base=plan([task('P2-T001')]);const copy=instantiateTemplate(csv,'Copy',base);assert.equal(copy.projects[1]!.id,'P3');
 assert.throws(()=>instantiateTemplate(csv.replace(',A,3',',missing,3'),'Copy'),/missing/);
 assert.throws(()=>instantiateTemplate(csv.replace('B,Build','A,Build'),'Copy'),/unique/);
 assert.throws(()=>instantiateTemplate(csv,''),/name/);
});
test('house template selects one source project; software headings work without Priority or Project',async()=>{
 const houses=await readFile('examples/house_build_tasks2.csv','utf8');assert.deepEqual(templateProjects(houses),['P1','P2']);
 assert.throws(()=>instantiateTemplate(houses,'House'),/Choose/);
 const house=instantiateTemplate(houses,'House',undefined,'P1');assert.equal(house.projects[0]!.tasks.length,36);
 const software=instantiateTemplate(await readFile('examples/software-template.csv','utf8'),'Software');assert.equal(software.projects[0]!.tasks.length,26);assert.equal(software.resources.length,12);assert.equal(schedulePortfolio(software).conflicts.length,0);
});
test('template new resources get default calendars while preserving existing calendars',()=>{
 const base=plan([task('X')]);const copy=instantiateTemplate(csv.replaceAll('Alice','Developer'),'Copy',base);
 assert.deepEqual(copy.calendar!.resources[0],base.calendar!.resources[0]);assert.deepEqual(copy.calendar!.resources.find(r=>r.resource==='Developer')!.weeklyHours,[8,8,8,8,8,0,0]);assert.equal(base.resources.includes('Developer'),false);
});
test('project/task/resource descriptions and comments survive scheduling and saved-result reload',()=>{
 const p={...plan([task('A',{description:'Design detail',comments:'Estimate reviewed',completionCriteria:'Signed off',lockReason:'Customer availability'})]),projects:[{...plan([]).projects[0]!,description:'Project context',comments:'Project note',owner:'PM',tasks:[task('A',{description:'Design detail',comments:'Estimate reviewed',completionCriteria:'Signed off',lockReason:'Customer availability'})]}],resourceDetails:[{id:'Alice',name:'Alice Smith',role:'Developer',comments:'Support on Fridays',description:'Backend experience'}]};
 const before=structuredClone(p);const result=schedulePortfolio(p);assert.deepEqual(p,before);assert.equal(result.projects[0]!.comments,'Project note');assert.equal(result.projects[0]!.tasks[0]!.comments,'Estimate reviewed');assert.deepEqual(parsePortfolio(JSON.parse(JSON.stringify(result.plan))).resourceDetails,p.resourceDetails);
 assert.throws(()=>parsePortfolio({...p,resourceDetails:[{id:'unknown',comments:'Note'}]}),/existing/);
 assert.throws(()=>parsePortfolio({...p,projects:[{...p.projects[0],comments:123}]}),/text/);
});
test('regular CSV retains optional task descriptions and comments including quoted newlines',()=>{
 const p=parsePortfolioCsv('ID,Task,Resource,Depends on,Good days,Poor days,Priority,Project,Description,Comments\nA,Design,Alice,none,2,2,1,P1,"Detailed description","Line one\nLine two"');
 assert.equal(p.projects[0]!.tasks[0]!.description,'Detailed description');assert.equal(p.projects[0]!.tasks[0]!.comments,'Line one\nLine two');
});
test('utilization excludes weekends, splits weeks and records separate project hours',()=>{
 const p=plan([task('A')]);const result=schedulePortfolio({...p,projects:[...p.projects,{id:'P2',name:'Two',tasks:[{...task('B'),projectId:'P2'}]}]});
 const report=resourceUtilization(result),alice=report.resources.find(r=>r.resource==='Alice')!;
 assert.equal(alice.scheduledHours,32);assert.equal(alice.availableHours,32);assert.equal(alice.utilizationPercent,100);assert.deepEqual(alice.projectHours.map(p=>p.hours),[16,16]);
 assert.equal(report.weeks[0]!.weekStart,'2026-10-05');assert.equal(report.weeks[0]!.availableHours,8);
 assert.equal(report.resources.find(r=>r.resource==='Bob')!.scheduledHours,0);
});
test('utilization uses allocations and working hours; elapsed waits and milestones consume none',()=>{
 const r=schedulePortfolio(plan([task('A',{allocationPercent:50}),task('W',{durationMode:'elapsed',goodCase:5,poorCase:5}),task('M',{goodCase:0,poorCase:0})]));
 const report=resourceUtilization(r),alice=report.resources[0]!;assert.equal(alice.scheduledHours,16);assert.equal(alice.availableHours,32);assert.equal(alice.remainingHours,16);assert.equal(alice.utilizationPercent,50);
 assert.ok(report.weeks.every(w=>!w.taskIds.includes('W')&&!w.taskIds.includes('M')));
});
test('partial-day report starts at asOf and excludes completed history',()=>{
 const p={...plan([task('C',{status:'completed',actuals:{start:0,finish:.25}}),task('A',{goodCase:.5,poorCase:.5})]),asOf:.5};
 const report=resourceUtilization(schedulePortfolio(p));assert.equal(report.resources[0]!.availableHours,4);assert.equal(report.resources[0]!.scheduledHours,4);assert.equal(report.weeks[0]!.taskIds.includes('C'),false);
});
test('utilization handles holiday zero availability, overbooking, empty periods and missing calendars',()=>{
 const p=plan([task('A',{locked:{start:0,finish:1},goodCase:1,poorCase:1}),task('B',{locked:{start:0,finish:1},goodCase:1,poorCase:1})]);
 const overloaded=resourceUtilization(schedulePortfolio(p));assert.equal(overloaded.resources[0]!.utilizationPercent,200);assert.equal(overloaded.resources[0]!.remainingHours,-8);
 const empty=resourceUtilization(schedulePortfolio({...plan([]),asOf:3}));assert.equal(empty.weeks.length,0);assert.equal(empty.startDate,empty.finishDate);assert.equal(empty.resources[0]!.utilizationPercent,null);
 const {calendar,...plain}=plan([]);assert.throws(()=>resourceUtilization(schedulePortfolio(plain)),/calendars/);
 const closed={...p,calendar:{...p.calendar!,resources:p.calendar!.resources.map(r=>({...r,exceptions:{'2026-10-09':0}}))}};const report=resourceUtilization(schedulePortfolio(closed));assert.equal(report.resources[0]!.availableHours,0);assert.equal(report.resources[0]!.utilizationPercent,null);
});
