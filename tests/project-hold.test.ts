import {test} from 'node:test';import assert from 'node:assert/strict';
import {parsePortfolio,schedulePortfolio,type PortfolioPlan,type PortfolioTask} from '../src/portfolio.js';
const task=(id:string,projectId:string,extra:Partial<PortfolioTask>={}):PortfolioTask=>({id,projectId,name:id,resource:'Alice',dependsOn:[],priority:1,goodCase:2,poorCase:2,...extra});
const base:PortfolioPlan={id:'hold',versionId:'v1',asOf:0,settings:{durationUnit:'days'},resources:['Alice'],projects:[{id:'P1',name:'One',tasks:[task('A','P1')]},{id:'P2',name:'Two',tasks:[task('B','P2')]}]};
test('holding a project releases new work, preserves order/metadata and resume restores dispatch',()=>{
 const original=schedulePortfolio(base);assert.equal(original.tasks.find(t=>t.id==='B')!.start,2);
 const input={...base,projects:[{...base.projects[0]!,onHold:true},base.projects[1]!]};
 const held=schedulePortfolio(parsePortfolio(JSON.parse(JSON.stringify(input))));assert.deepEqual(held.tasks.map(t=>t.id),['B']);assert.equal(held.tasks[0]!.start,0);assert.equal(held.projects[0]!.forecast.withheldReason,'on-hold');assert.deepEqual(held.projects[0]!.forecast.unscheduledTaskIds,['A']);
 assert.equal(held.plan.projects[0]!.tasks[0]!.id,'A');assert.equal(base.projects[0]!.onHold,undefined);
 const resumed=schedulePortfolio({...held.plan,projects:held.plan.projects.map(p=>({...p,onHold:false}))});assert.deepEqual(resumed.tasks,original.tasks);assert.equal(resumed.projects[0]!.forecast.withheldReason,undefined);
});
test('on hold keeps active work nonpreemptive and fixed commitments reserved',()=>{
 const input={...base,projects:[{...base.projects[0]!,onHold:true,tasks:[task('A','P1',{status:'active',remaining:{goodCase:2,poorCase:2,estimateStatus:'current'}}),task('L','P1',{locked:{start:2,finish:4}}),task('C','P1')]},base.projects[1]!]};
 const result=schedulePortfolio(input);assert.equal(result.tasks.find(t=>t.id==='A')!.finish,2);assert.equal(result.tasks.find(t=>t.id==='L')!.start,2);assert.equal(result.tasks.find(t=>t.id==='B')!.start,4);assert.ok(!result.tasks.some(t=>t.id==='C'));
});
test('held predecessors block new dependent work across projects but unrelated work proceeds',()=>{
 const result=schedulePortfolio({...base,projects:[{...base.projects[0]!,onHold:true},{...base.projects[1]!,tasks:[task('B','P2',{dependsOn:['A']}),task('C','P2')]}]});
 assert.deepEqual(result.tasks.map(t=>t.id),['C']);assert.equal(result.projects[1]!.forecast.withheldReason,'blocked-by-hold');assert.deepEqual(result.projects[1]!.forecast.unscheduledTaskIds,['B']);
});
test('locked feedback stays fixed and reports missing held predecessor; deadlines withhold promises',()=>{
 const result=schedulePortfolio({...base,projects:[{...base.projects[0]!,onHold:true,deadline:10,tasks:[task('A','P1',{deadline:5})]},{...base.projects[1]!,tasks:[task('B','P2',{dependsOn:['A'],locked:{start:2,finish:4}})]}]});
 assert.equal(result.tasks[0]!.start,2);assert.ok(result.conflicts[0]!.message.includes('suspended task A'));assert.equal(result.projects[1]!.forecast.feasible,false);assert.equal(result.deadlineReport.projects[0]!.assessments.p95.status,'unavailable');assert.equal(result.deadlineReport.tasks[0]!.assessment.status,'unavailable');
});
test('invalid hold values reject and completed historical tasks remain on a held project',()=>{
 assert.throws(()=>parsePortfolio({...base,projects:[{...base.projects[0]!,onHold:'yes'}]}),/onHold/);
 const result=schedulePortfolio({...base,asOf:2,projects:[{...base.projects[0]!,onHold:true,tasks:[task('A','P1',{status:'completed',actuals:{start:0,finish:2}})]},base.projects[1]!]});assert.equal(result.tasks.find(t=>t.id==='A')!.finish,2);assert.equal(result.projects[0]!.forecast.withheldReason,undefined);
});
