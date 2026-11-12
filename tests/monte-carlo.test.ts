import {test} from 'node:test';import assert from 'node:assert/strict';
import {simulatePortfolio} from '../src/monte-carlo.js';
import {schedulePortfolio,type PortfolioPlan,type PortfolioTask} from '../src/portfolio.js';
import {readFile} from 'node:fs/promises';
const task=(id:string,extra:Partial<PortfolioTask>={}):PortfolioTask=>({id,projectId:'P1',name:id,resource:'Crew',goodCase:2,poorCase:4,priority:1,dependsOn:[],...extra});
function plan(tasks:PortfolioTask[]):PortfolioPlan{return {id:'mc',versionId:'v1',asOf:0,settings:{durationUnit:'days'},resources:[...new Set(tasks.flatMap(t=>[t.resource,...t.supportingResources?.map(a=>a.resource)??[]]))],projects:[{id:'P1',name:'First',tasks}]};}

test('single-task empirical tails match known lognormal quantiles and the same seed reproduces results',()=>{
 const p=plan([task('A')]),before=structuredClone(p),options={samples:10000,seed:42};const result=simulatePortfolio(p,options);
 const sigma=(Math.log(4)-Math.log(2))/(2*.8416212335729143),mu=(Math.log(4)+Math.log(2))/2;
 for(const [key,z]of [['p98',2.0537489106318225],['p99',2.3263478740408408]] as const){const q=result.projects[0]!.completionPercentiles![key],expected=Math.exp(mu+sigma*z);assert.ok(Math.abs(q.value/expected-1)<.06);assert.ok(q.samplingInterval.lower<=q.value&&q.samplingInterval.upper>=q.value);}
 assert.deepEqual(simulatePortfolio(p,options),result);assert.deepEqual(p,before);
 assert.ok(!('p100' in result.projects[0]!.completionPercentiles!));assert.equal(result.resourceViolationSamples,0);
 assert.deepEqual(schedulePortfolio(p).plan,schedulePortfolio(before).plan);
});
test('parallel noncritical paths can become controlling and exceed the analytical fixed-chain tail',()=>{
 const p=plan([task('Stable',{resource:'One',goodCase:8,poorCase:8}),task('Feeding',{resource:'Two',goodCase:2,poorCase:6}),task('Merge',{resource:'Three',goodCase:0,poorCase:0,dependsOn:['Stable','Feeding']})]);
 const baseline=schedulePortfolio(p),result=simulatePortfolio(p,{samples:5000,seed:99}).projects[0]!;
 assert.equal(baseline.projects[0]!.forecast.completionPercentiles!.p99,8);assert.ok(result.completionPercentiles!.p99.value>12);
 assert.ok(result.criticality.find(t=>t.taskId==='Stable')!.fraction>0);assert.ok(result.criticality.find(t=>t.taskId==='Feeding')!.fraction>0);
});
test('shared supporting resources, fractional allocations and calendar availability remain enforced',()=>{
 const p=plan([task('A',{resource:'Operator1',goodCase:2,poorCase:2,supportingResources:[{resource:'Machine',allocationPercent:100}]}),task('B',{resource:'Operator2',goodCase:2,poorCase:2,supportingResources:[{resource:'Machine',allocationPercent:100}]})]);
 const fixed=simulatePortfolio(p,{samples:1000});assert.equal(fixed.projects[0]!.completionPercentiles!.p99.value,4);assert.equal(fixed.resourceViolationSamples,0);
 const fractional=plan([task('A',{goodCase:1,poorCase:1,allocationPercent:50}),task('B',{goodCase:1,poorCase:1,allocationPercent:50})]);assert.equal(simulatePortfolio(fractional,{samples:1000}).projects[0]!.completionPercentiles!.p99.value,2);
 const dated={...p,calendar:{startDate:'2026-11-16',hoursPerWorkday:8,resources:p.resources.map(resource=>({resource,weeklyHours:[8,8,8,8,8,0,0],exceptions:{'2026-11-16':0}}))}};
 const baseline=schedulePortfolio(dated);const mc=simulatePortfolio(dated,{samples:1000});assert.equal(mc.projects[0]!.completionPercentiles!.p99.date,baseline.projects[0]!.forecast.completionDates!.deterministic);
});
test('fixed commitments are conditional, and failed draws are not silently excluded from tail estimates',()=>{
 const p=plan([task('A',{goodCase:1,poorCase:3}),task('Appointment',{resource:'Room',goodCase:1,poorCase:1,dependsOn:['A'],locked:{start:3,finish:4}})]);
 const result=simulatePortfolio(p,{samples:1000});assert.ok(result.commitmentViolationSamples>0);assert.equal(result.projects[0]!.completionPercentiles,null);assert.equal(result.projects[0]!.withheldReason,'simulated-conflicts');
});
test('feeding policy reservations survive stochastic scheduling and feeder paths remain variable',async()=>{
 const p=JSON.parse(await readFile('examples/feeding-protection.json','utf8')) as PortfolioPlan;
 const selected={...p,feedingTaskIds:['F']},before=structuredClone(selected),baseline=schedulePortfolio(selected);
 assert.ok(baseline.feedingReport!.changes.some(c=>c.status==='applied'));
 const mc=simulatePortfolio(selected,{samples:2000,seed:10});assert.equal(mc.resourceViolationSamples,0);assert.ok(mc.projects[0]!.completionPercentiles!.p99.value>=baseline.projects[0]!.forecast.deterministicCompletion!);assert.ok(mc.projects[0]!.criticality.find(task=>task.taskId==='F')!.fraction>0);assert.deepEqual(selected,before);
});
test('holds withhold completion and simulation inputs/work are bounded',()=>{
 const p=plan([task('A')]);assert.equal(simulatePortfolio({...p,projects:p.projects.map(p=>({...p,onHold:true}))},{samples:1000}).projects[0]!.completionPercentiles,null);
 for(const samples of [0,100,50001,NaN,1.2])assert.throws(()=>simulatePortfolio(p,{samples}),/samples/);
 assert.throws(()=>simulatePortfolio(p,{samples:1000,seed:-1}),/seed/);
 assert.throws(()=>simulatePortfolio(plan(Array.from({length:301},(_,i)=>task(String(i)))),{samples:1000}),/limited/);
});
