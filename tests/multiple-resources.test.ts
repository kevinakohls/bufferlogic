import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePortfolio,schedulePortfolio,comparePortfolioVersions,type PortfolioPlan,type PortfolioTask} from '../src/portfolio.js';
import {resourceUtilization} from '../src/utilization.js';
import {recommendSaturdayHours} from '../src/resource-recommendations.js';
const task=(id:string,resource:string,extra:Partial<PortfolioTask>={}):PortfolioTask=>({id,projectId:'P1',name:id,resource,goodCase:2,poorCase:2,priority:1,dependsOn:[],...extra});
const plan=(tasks:PortfolioTask[]):PortfolioPlan=>({id:'multi',versionId:'v1',asOf:0,settings:{durationUnit:'days'},resources:['Operator','Loader','Spotter','Other'],projects:[{id:'P1',name:'Foundation',tasks}]});
const support=[{resource:'Loader',allocationPercent:100},{resource:'Spotter',allocationPercent:25}];
const calendar=(p:PortfolioPlan):PortfolioPlan=>({...p,calendar:{startDate:'2026-10-12',hoursPerWorkday:8,resources:p.resources.map(resource=>({resource,weeklyHours:[8,8,8,8,8,0,0],exceptions:{}}))}});
const get=(r:ReturnType<typeof schedulePortfolio>,id:string)=>r.tasks.find(t=>t.id===id)!;

test('supporting resources reserve simultaneous capacity and create cross-project critical-chain waits',()=>{
 const input=plan([task('Foundation','Operator',{supportingResources:support})]);
 const p={...input,projects:[input.projects[0]!,{id:'P2',name:'Other job',tasks:[{...task('Other','Other',{supportingResources:[{resource:'Loader',allocationPercent:100}]}),projectId:'P2'}]}]};
 const snapshot=structuredClone(p),r=schedulePortfolio(p);
 assert.equal(get(r,'Foundation').finish,2);assert.equal(get(r,'Other').start,2);
 assert.deepEqual(get(r,'Other').resourcePredecessors,['Foundation']);
 assert.deepEqual(r.projects[1]!.forecast.criticalChain,['Foundation','Other']);assert.deepEqual(p,snapshot);
 assert.deepEqual(get(r,'Foundation').supportingResources,support);
});
test('supporting allocation shares capacity without changing duration; only primary allocation scales effort',()=>{
 const r=schedulePortfolio(plan([task('A','Operator',{supportingResources:[{resource:'Loader',allocationPercent:50}]}),task('B','Other',{supportingResources:[{resource:'Loader',allocationPercent:50}]}),task('C','Spotter',{supportingResources:[{resource:'Loader',allocationPercent:25}]})]));
 assert.equal(get(r,'A').finish,2);assert.equal(get(r,'B').start,0);assert.equal(get(r,'C').start,2);
 const scaled=schedulePortfolio(plan([task('A','Operator',{allocationPercent:50,supportingResources:support})]));assert.equal(get(scaled,'A').finish,4);
});
test('support-only resources are reconciled and malformed, duplicate, blank and elapsed assignments are handled',()=>{
 const input={...plan([task('A','Operator',{supportingResources:support})]),resources:['Operator']};
 assert.deepEqual(parsePortfolio(input).resources,['Operator','Loader','Spotter']);
 for(const supportingResources of [[{resource:'Operator',allocationPercent:100}],[support[0]!,support[0]!],[{resource:'Loader',allocationPercent:0}],[{resource:'Loader',allocationPercent:101}],[{resource:'Loader',allocationPercent:NaN}]])assert.throws(()=>parsePortfolio(plan([task('A','Operator',{supportingResources})])),/Supporting resources/);
 const draft=parsePortfolio(plan([task('A','Operator',{supportingResources:[{resource:'',allocationPercent:100}]})]));assert.throws(()=>schedulePortfolio(draft),/Assign a resource before scheduling: A/);
 assert.throws(()=>parsePortfolio(plan([task('A','Operator',{durationMode:'elapsed',supportingResources:support})])),/Elapsed waiting/);
});
test('support calendar holidays and shorter days constrain joint work and percentile forecasts',()=>{
 const p=calendar(plan([task('A','Operator',{supportingResources:support})]));
 const delayed={...p,calendar:{...p.calendar!,resources:p.calendar!.resources.map(c=>c.resource==='Loader'?{...c,exceptions:{'2026-10-12':0}}:c)}};
 const r=schedulePortfolio(delayed);assert.equal(get(r,'A').start,1);assert.equal(get(r,'A').finish,3);assert.equal(r.projects[0]!.forecast.completionDates!.p95,'2026-10-14');
 const shorter={...p,calendar:{...p.calendar!,resources:p.calendar!.resources.map(c=>c.resource==='Loader'?{...c,weeklyHours:[4,4,4,4,4,0,0]}:c)}};
 const half=schedulePortfolio(shorter);assert.equal(get(half,'A').finish,4);
 const report=resourceUtilization(half);assert.equal(report.resources.find(r=>r.resource==='Operator')!.scheduledHours,16);assert.equal(report.resources.find(r=>r.resource==='Loader')!.scheduledHours,16);assert.equal(report.resources.find(r=>r.resource==='Spotter')!.scheduledHours,4);
});
test('active and fixed tasks reserve supporting resources and conflicting locks are reported',()=>{
 const running=schedulePortfolio({...plan([task('A','Operator',{status:'active',remaining:{goodCase:2,poorCase:2,estimateStatus:'current'},supportingResources:support}),task('B','Loader')]),asOf:1});assert.equal(get(running,'B').start,3);
 const locked=schedulePortfolio(plan([task('A','Operator',{locked:{start:0,finish:2},supportingResources:support}),task('B','Loader',{locked:{start:0,finish:2}})]));assert.ok(locked.conflicts.some(c=>c.kind==='resource'&&c.message.includes('Loader')));
 const p=calendar(plan([task('A','Operator',{locked:{start:0,finish:2},supportingResources:support})]));
 const r=schedulePortfolio({...p,calendar:{...p.calendar!,resources:p.calendar!.resources.map(c=>c.resource==='Loader'?{...c,exceptions:{'2026-10-12':0}}:c)}});assert.ok(r.conflicts.some(c=>c.kind==='calendar'));
});
test('supporting assignments survive round trip and appear in version comparisons even without timing changes',()=>{
 const a=schedulePortfolio(plan([task('A','Operator')]));const b=schedulePortfolio({...a.plan,versionId:'v2',projects:[{...a.plan.projects[0]!,tasks:[task('A','Operator',{supportingResources:support})]}]});
 assert.equal(comparePortfolioVersions(a,b).taskChanges.length,1);assert.deepEqual(schedulePortfolio(parsePortfolio(JSON.parse(JSON.stringify(b.plan)))).tasks,b.tasks);
});
test('feeding reserves both primary and supporting capacity through the P99 buffer',()=>{
 const p=plan([task('Core','Operator',{goodCase:20,poorCase:20}),task('Feed','Other',{goodCase:3,poorCase:16/3,supportingResources:[{resource:'Loader',allocationPercent:100}]}),task('Finish','Operator',{dependsOn:['Core','Feed']}),task('Lower','Loader',{goodCase:12,poorCase:12,priority:10})]);
 const r=schedulePortfolio({...p,feedingTaskIds:['Feed']});assert.equal(r.feedingReport!.changes[0]!.status,'applied');
 assert.equal(r.feedingReport!.resourceWindows.length,2);
 const change=r.feedingReport!.changes[0]!;assert.ok(get(r,'Lower').finish<=change.newStart+1e-9||get(r,'Lower').start>=change.protectionFinish!-1e-9);
});
test('resource recommendations account for supporting calendars and require joint availability',()=>{
 const p=calendar(plan([task('A','Operator',{goodCase:8,poorCase:8,supportingResources:[{resource:'Loader',allocationPercent:100}]})]));
 const r=recommendSaturdayHours(p);assert.equal(r.candidates.find(c=>c.resource==='Loader')!.totalP95DaysEarlier,0);assert.equal(r.candidates.find(c=>c.resource==='Operator')!.totalP95DaysEarlier,0);
});

test('a supporting resource fixed booking constrains backward feeder placement and its calendar',()=>{
 const p=calendar(plan([task('Core','Operator',{goodCase:20,poorCase:20}),task('Feed','Other',{goodCase:3,poorCase:16/3,supportingResources:[{resource:'Loader',allocationPercent:100}]}),task('Finish','Operator',{dependsOn:['Core','Feed']}),task('Booking','Loader',{goodCase:3,poorCase:3,locked:{start:14,finish:17}})]));
 const r=schedulePortfolio({...p,feedingTaskIds:['Feed']});assert.equal(r.feedingReport!.changes[0]!.status,'applied');
 const change=r.feedingReport!.changes[0]!;
 assert.ok(change.protectionFinish!<=14+1e-9||change.newStart>=17-1e-9);
 assert.ok(r.feedingReport!.resourceWindows.some(window=>window.resource==='Loader'));
});
