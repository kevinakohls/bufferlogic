import {test} from 'node:test';import assert from 'node:assert/strict';
import {schedulePortfolio,parsePortfolio,type PortfolioPlan,type PortfolioTask} from '../src/portfolio.js';
const task=(id:string,projectId:string,resource:string,duration:number,extra:Partial<PortfolioTask>={}):PortfolioTask=>({id,projectId,name:id,resource,dependsOn:[],priority:1,goodCase:duration,poorCase:duration,...extra});
const base:PortfolioPlan={id:'feeding',versionId:'v1',asOf:0,settings:{durationUnit:'days'},resources:['Alice','Bob'],projects:[{id:'P1',name:'One',tasks:[task('C','P1','Bob',20),task('F','P1','Alice',4,{goodCase:3,poorCase:16/3}),task('D','P1','Bob',2,{dependsOn:['C','F']})]},{id:'P2',name:'Two',tasks:[task('L','P2','Alice',6)]}]};
test('latest safe placement frees earlier resources and protects target and critical-chain starts',()=>{
 const before=schedulePortfolio(base),input={...base,feedingTaskIds:['F']},snapshot=structuredClone(input),after=schedulePortfolio(input);
 assert.deepEqual(input,snapshot);const change=after.feedingReport!.changes[0]!;assert.equal(change.status,'applied');assert.ok(change.newStart>change.originalStart);assert.ok(Math.abs(change.newStart+change.p99Effort-20)<1e-8);assert.ok(Math.abs(change.p99Effort-change.p50Effort-change.bufferEffort)<1e-8);
 assert.equal(after.tasks.find(t=>t.id==='L')!.start,0);assert.equal(before.tasks.find(t=>t.id==='L')!.start,4);assert.equal(after.tasks.find(t=>t.id==='D')!.start,20);assert.equal(after.tasks.find(t=>t.id==='C')!.start,0);assert.equal(after.tasks.find(t=>t.id==='F')!.locked,false);assert.deepEqual(after.plan.projects[0]!.tasks[1]!.locked,undefined);
 assert.equal(after.feedingReport!.resourceWindows[0]!.finish,4);assert.equal(after.conflicts.length,0);
 assert.deepEqual(schedulePortfolio(parsePortfolio(JSON.parse(JSON.stringify(after.plan)))).tasks,after.tasks);
});
test('long lower-priority tasks cannot cross the reserved P99 feeding window',()=>{
 const after=schedulePortfolio({...base,feedingTaskIds:['F'],projects:[base.projects[0]!,{...base.projects[1]!,tasks:[task('L','P2','Alice',15)]}]});assert.equal(after.feedingReport!.changes[0]!.status,'applied');assert.equal(after.tasks.find(t=>t.id==='L')!.start,20);
});
test('insufficient P99 slack keeps the original plan and reports protection cannot fit',()=>{
 const input={...base,feedingTaskIds:['F'],projects:[{...base.projects[0]!,tasks:base.projects[0]!.tasks.map(t=>t.id==='F'?{...t,goodCase:1,poorCase:16}:t)},base.projects[1]!]};const {feedingTaskIds,...forward}=input;
 const after=schedulePortfolio(input);assert.equal(after.feedingReport!.changes[0]!.status,'not-applied');assert.match(after.feedingReport!.changes[0]!.reason,/does not fit/);assert.deepEqual(after.tasks,schedulePortfolio(forward).tasks);
});
test('critical-chain, active and locked tasks cannot be delayed',()=>{
 for(const id of ['C','D'])assert.equal(schedulePortfolio({...base,feedingTaskIds:[id]}).feedingReport!.changes[0]!.status,'not-applied');
 for(const extra of [{status:'active' as const,remaining:{goodCase:4,poorCase:4,estimateStatus:'current' as const}},{locked:{start:0,finish:4}}]){
 const result=schedulePortfolio({...base,feedingTaskIds:['F'],projects:[{...base.projects[0]!,tasks:base.projects[0]!.tasks.map(t=>t.id==='F'?{...t,...extra}:t)},base.projects[1]!]});assert.equal(result.feedingReport!.changes[0]!.status,'not-applied');assert.equal(result.tasks.find(t=>t.id==='F')!.start,0);
 }
 assert.throws(()=>schedulePortfolio({...base,feedingTaskIds:['missing']}),/Unknown feeding task/);
});
test('calendar latest starts respect weekends, exceptions and percentage allocations',()=>{
 const calendar={startDate:'2026-10-09',hoursPerWorkday:8,resources:base.resources.map(resource=>({resource,weeklyHours:[8,8,8,8,8,0,0],exceptions:{'2026-10-12':0}}))};
 const result=schedulePortfolio({...base,calendar,feedingTaskIds:['F'],projects:[{...base.projects[0]!,tasks:base.projects[0]!.tasks.map(t=>t.id==='F'?{...t,allocationPercent:50}:t)},base.projects[1]!]});const change=result.feedingReport!.changes[0]!;assert.equal(change.status,'applied');assert.equal(change.p50Effort,8);assert.ok(change.newStart>=0);assert.equal(result.tasks.find(t=>t.id==='D')!.start,schedulePortfolio({...base,calendar,projects:[{...base.projects[0]!,tasks:base.projects[0]!.tasks.map(t=>t.id==='F'?{...t,allocationPercent:50}:t)},base.projects[1]!]}).tasks.find(t=>t.id==='D')!.start);
});

test('higher-priority work conflicting with a feeder protection window forces safe fallback',()=>{
 const high={id:'P0',name:'Higher',tasks:[task('H0','P0','Charlie',17),task('H1','P0','Alice',2,{dependsOn:['H0']})]};
 const input={...base,resources:[...base.resources,'Charlie'],projects:[high,...base.projects],feedingTaskIds:['F']};const {feedingTaskIds,...forward}=input;
 const after=schedulePortfolio(input);assert.equal(after.feedingReport!.changes[0]!.status,'not-applied');assert.deepEqual(after.tasks,schedulePortfolio(forward).tasks);
});
