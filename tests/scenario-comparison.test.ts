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

test('object-key order and unordered assignment/dependency lists do not create comparison changes',()=>{
 const p:PortfolioPlan={...base,resources:[...base.resources,'Spotter','Equipment'],projects:[{id:'P1',name:'Build',tasks:[
  {...base.projects[0]!.tasks[0]!,goodCase:1,poorCase:1,supportingResources:[{resource:'Spotter',allocationPercent:50},{resource:'Equipment',allocationPercent:100}]},
  {id:'C',name:'Other prerequisite',projectId:'P1',resource:'Loader',goodCase:2,poorCase:2,priority:2,dependsOn:[]},
  {id:'D',name:'Finish',projectId:'P1',resource:'Developer',goodCase:1,poorCase:1,priority:3,dependsOn:['A','C']},
 ]}],calendar:{startDate:'2026-10-19',hoursPerWorkday:8,resources:['Developer','Loader','Spotter','Equipment'].map(resource=>({resource,weeklyHours:[8,8,8,8,8,0,0],exceptions:{'2026-10-20':8,'2026-10-22':4}}))}};
 const reordered=structuredClone(p);
 for(const calendar of reordered.calendar!.resources)Object.assign(calendar,{exceptions:{'2026-10-22':4,'2026-10-20':8}});
 const a=reordered.projects[0]!.tasks[0]!;
 Object.assign(a,{supportingResources:[...a.supportingResources!].reverse().map(assignment=>({allocationPercent:assignment.allocationPercent,resource:assignment.resource}))});
 Object.assign(reordered.projects[0]!.tasks[2]!,{dependsOn:['C','A']});
 const original=structuredClone(p),snapshot=structuredClone(reordered),report=compareScenarios(p,reordered);
 assert.equal(report.resources.length,0);assert.equal(report.tasks.length,0);assert.ok(report.projects.every(project=>project.status==='unchanged'));assert.deepEqual(p,original);assert.deepEqual(reordered,snapshot);
 // Weekly hours are an ordered calendar, not a set: moving availability matters.
 const shifted=structuredClone(reordered);Object.assign(shifted.calendar!.resources[0]!,{weeklyHours:[0,8,8,8,8,8,0]});
 assert.equal(compareScenarios(p,shifted).resources.length,1);
});

test('comments, descriptions and checklist ticks do not mark a project schedule changed, but real inputs still do',()=>{
 const metadata={...base,projects:base.projects.map(p=>({...p,comments:'Project note',description:'Description',owner:'Owner',tasks:p.tasks.map(t=>({...t,comments:'Task note',description:'Task description',completionCriteria:'Checked',checklist:[{text:'Review work',completed:true}]}))}))};
 const report=compareScenarios(base,metadata);assert.equal(report.tasks.length,0);assert.ok(report.projects.every(p=>p.status==='unchanged'));
 const estimate={...metadata,projects:metadata.projects.map(p=>({...p,tasks:p.tasks.map(t=>({...t,goodCase:t.goodCase+1,poorCase:t.poorCase+1}))}))};
 assert.ok(compareScenarios(base,estimate).projects.some(p=>p.status==='changed'));
 const deadline={...metadata,projects:metadata.projects.map(p=>({...p,deadline:10}))};assert.ok(compareScenarios(base,deadline).projects.every(p=>p.status==='changed'));
 const moved={...base,projects:[base.projects[1]!,base.projects[0]!]};assert.ok(compareScenarios(base,moved).projects.every(p=>p.status==='changed'));
});
