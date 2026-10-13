import {recommendSaturdayHours} from '../src/resource-recommendations.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {comparePortfolioVersions,parsePortfolio,schedulePortfolio,type PortfolioPlan,type PortfolioTask} from '../src/portfolio.js';
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

const calendar={startDate:'2026-10-09',hoursPerWorkday:8,resources:[{resource:'Alice',weeklyHours:[8,8,8,8,8,0,0],exceptions:{}}]};
test('withheld calendar forecasts have nullable values, no dates and no resource ranking',()=>{
 const input={...base,calendar,projects:[{...base.projects[0]!,onHold:true},base.projects[1]!]};const result=schedulePortfolio(input);const forecast=result.projects[0]!.forecast;
 assert.equal(forecast.deterministicCompletion,null);assert.equal(forecast.completionPercentiles,null);assert.equal(forecast.feasible,null);assert.equal(forecast.completionDates,undefined);
 assert.throws(()=>recommendSaturdayHours(input),/full project|Resume held/);
});
test('holds distinguish suspensions and resumptions from removals and additions',()=>{
 const before=schedulePortfolio(base);const held=schedulePortfolio({...base,projects:[{...base.projects[0]!,onHold:true},base.projects[1]!]});
 const paused=comparePortfolioVersions(before,held);assert.deepEqual(paused.removedTaskIds,[]);assert.deepEqual(paused.suspendedTaskIds,['A']);assert.equal(paused.projects[0]!.percentileDifferences,null);
 const resumed=comparePortfolioVersions(held,before);assert.deepEqual(resumed.resumedTaskIds,['A']);assert.equal(resumed.taskChanges.find(t=>t.taskId==='A')!.status,'resumed');
 const removed=schedulePortfolio({...base,projects:[base.projects[1]!]});assert.deepEqual(comparePortfolioVersions(before,removed).removedTaskIds,['A']);
});
test('all-active or locked held projects retain full forecasts with no unscheduled work',()=>{
 const result=schedulePortfolio({...base,projects:[{...base.projects[0]!,onHold:true,tasks:[task('A','P1',{status:'active',remaining:{goodCase:2,poorCase:2,estimateStatus:'current'}}),task('L','P1',{locked:{start:2,finish:4}})]},base.projects[1]!]});
 assert.equal(result.projects[0]!.forecast.withheldReason,undefined);assert.equal(result.projects[0]!.forecast.deterministicCompletion,4);
});
test('suspension propagates down a reverse-ordered long dependency chain',()=>{
 const tasks=Array.from({length:200},(_,i)=>task(`D${i}`,'P2',{dependsOn:[i===0?'A':`D${i-1}`]})).reverse();const result=schedulePortfolio({...base,projects:[{...base.projects[0]!,onHold:true},{...base.projects[1]!,tasks}]});
 assert.equal(result.tasks.length,0);assert.equal(result.projects[1]!.forecast.unscheduledTaskIds!.length,200);
});
test('deadline unavailable reasons distinguish missing calendars from suspended work',()=>{
 const result=schedulePortfolio({...base,projects:[{...base.projects[0]!,deadline:'2026-10-20'},{...base.projects[1]!,onHold:true,deadline:10,tasks:[task('B','P2',{deadline:5})]}]});
 assert.equal(result.deadlineReport.projects[0]!.assessments.p95.reason,'calendar-required');assert.equal(result.deadlineReport.projects[1]!.assessments.p95.reason,'withheld');assert.equal(result.deadlineReport.tasks[0]!.assessment.reason,'withheld');
});
test('CLI tables withhold held project completion rather than reporting zero-day promises',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hold-cli-'));try{const file=join(dir,'plan.json');await writeFile(file,JSON.stringify({...base,projects:[{...base.projects[0]!,onHold:true},base.projects[1]!]}));
 const output=execFileSync(process.execPath,['dist/src/portfolio-cli.js',file,'--format','table'],{encoding:'utf8'});assert.match(output,/on-hold/);assert.match(output,/withheld/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
