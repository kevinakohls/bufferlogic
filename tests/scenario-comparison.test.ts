import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareScenarios} from '../src/scenario-comparison.js';
import {schedulePortfolio,type PortfolioPlan} from '../src/portfolio.js';
const base:PortfolioPlan={id:'scenario',name:'Original',versionId:'v1',asOf:0,settings:{durationUnit:'days'},resources:['Developer','Loader'],projects:[{id:'P1',name:'Release One',tasks:[{id:'A',name:'Build',projectId:'P1',resource:'Developer',allocationPercent:100,goodCase:2,poorCase:2,priority:1,dependsOn:[]}]},{id:'P2',name:'Release Two',tasks:[{id:'B',name:'Test',projectId:'P2',resource:'Developer',goodCase:3,poorCase:3,priority:1,dependsOn:[]}]}]};
test('scenario comparison shows project tradeoffs and task shifts without mutating either input',()=>{
 const scenario={...base,name:'What if',versionId:'v2',projects:[base.projects[1]!,base.projects[0]!]};
 const original=structuredClone(base),copy=structuredClone(scenario),report=compareScenarios(base,scenario);
 assert.equal(report.projects.find(p=>p.projectId==='P1')!.p95Change,3);assert.equal(report.projects.find(p=>p.projectId==='P2')!.p95Change,-2);
 assert.equal(report.tasks.length,2);assert.deepEqual(base,original);assert.deepEqual(scenario,copy);
});
test('comparison includes supporting-resource edits even when timing is unchanged and supports identical versions',()=>{
 assert.equal(compareScenarios(base,base).tasks.length,0);
 assert.ok(compareScenarios(base,{...base,versionId:'new-label-only'}).projects.every(p=>p.status==='unchanged'));
 const scenario={...base,projects:base.projects.map(p=>({...p,tasks:p.tasks.map(t=>({...t,supportingResources:[{resource:'Loader',allocationPercent:50}]}))}))};
 const report=compareScenarios(base,scenario);assert.ok(report.tasks.every(t=>t.changes.includes('Resources')));assert.ok(report.projects.every(p=>p.p95Change===0));
});
test('comparison distinguishes suspended, resumed, removed and added work without treating withheld forecasts as zero',()=>{
 const held={...base,projects:base.projects.map((p,i)=>({...p,onHold:i===0}))};
 const paused=compareScenarios(base,held);assert.equal(paused.projects[0]!.after!.p95,null);assert.equal(paused.projects[0]!.p95Change,null);assert.equal(paused.tasks.find(t=>t.taskId==='A')!.status,'suspended');
 assert.equal(compareScenarios(held,base).tasks.find(t=>t.taskId==='A')!.status,'resumed');
 const removed=compareScenarios(base,{...base,projects:[base.projects[0]!]});assert.equal(removed.projects.find(p=>p.projectId==='P2')!.status,'removed');assert.equal(removed.tasks.find(t=>t.taskId==='B')!.status,'removed');
 const added=compareScenarios({...base,projects:[base.projects[0]!]},base);assert.equal(added.projects.find(p=>p.projectId==='P2')!.status,'added');
});
test('saved result comparison recalculates rather than trusting stale forecast fields; calendars and unrelated progress are handled explicitly',()=>{
 const saved=schedulePortfolio(base);const corrupted={...saved,projects:[]};assert.equal(compareScenarios(corrupted,base).projects[0]!.p95Change,0);
 assert.throws(()=>compareScenarios(base,{...base,id:'unrelated'}),/same workspace/);
 assert.throws(()=>compareScenarios(base,{...base,asOf:1}),/Progress as of/);
 const dated={...base,calendar:{startDate:'2026-10-19',hoursPerWorkday:8,resources:base.resources.map(resource=>({resource,weeklyHours:[8,8,8,8,8,0,0],exceptions:{}}))}};
 assert.throws(()=>compareScenarios(base,dated),/same schedule start/);
 const changed={...dated,calendar:{...dated.calendar,resources:dated.calendar.resources.map(c=>c.resource==='Developer'?{...c,weeklyHours:[4,4,4,4,4,0,0]}:c)}};
 const report=compareScenarios(dated,changed);assert.equal(report.resources.length,1);assert.ok(report.projects[0]!.p95Change!>0);assert.equal(report.calendarDates,true);
 assert.throws(()=>compareScenarios(base,{...base,projects:base.projects.map(p=>({...p,tasks:p.tasks.map(t=>({...t,resource:''}))}))}),/Assign a resource/);
});
