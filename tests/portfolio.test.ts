import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parsePortfolio, schedulePortfolio, comparePortfolioVersions, type PortfolioPlan, type PortfolioTask } from '../src/portfolio.js';

function task(id:string, projectId:string, extra:Partial<PortfolioTask>={}):PortfolioTask {
  return {id,projectId,name:id,resource:'Alice',goodCase:2,poorCase:2,dependsOn:[],priority:1,...extra};
}
function plan(one:PortfolioTask[], two:PortfolioTask[]=[]):PortfolioPlan {
  return {id:'portfolio',versionId:'v1',asOf:0,settings:{durationUnit:'days'},resources:['Alice','Bob'],projects:[{id:'P1',name:'One',tasks:one},{id:'P2',name:'Two',tasks:two}]};
}
const get = (result:ReturnType<typeof schedulePortfolio>,id:string) => result.tasks.find(t=>t.id===id)!;

test('project order creates cross-project critical chain and owned percentiles',()=>{
  const p=plan([task('A','P1')],[task('B','P2')]);const snapshot=structuredClone(p);const r=schedulePortfolio(p);
  assert.equal(get(r,'A').start,0);assert.equal(get(r,'B').start,2);
  assert.deepEqual(r.projects[1]!.forecast.criticalChain,['A','B']);
  assert.equal(r.projects[1]!.forecast.completionPercentiles.p99,4);
  assert.equal(r.projects[1]!.forecast.scheduleVersionId,'v1');assert.deepEqual(p,snapshot);
});
test('reordering projects and task overrides changes resource preference without new dependencies',()=>{
  const p=plan([task('A','P1'),task('C','P1')],[task('B','P2')]);
  const overridden=schedulePortfolio({...p,taskOrderOverrides:['B']});assert.equal(get(overridden,'B').start,0);
  assert.deepEqual(get(overridden,'A').technicalPredecessors,[]);
  assert.equal(get(schedulePortfolio({...p,projects:[p.projects[1]!,p.projects[0]!]}),'B').start,0);
  const different=schedulePortfolio(plan([task('A','P1')],[task('B','P2',{resource:'Bob'})]));assert.equal(get(different,'B').start,0);
});
test('ineligible override does not block available resources; running tasks cannot be displaced',()=>{
  const p=plan([task('A','P1',{status:'active',remaining:{goodCase:3,poorCase:3,estimateStatus:'stale'}})],[task('B','P2')]);
  const r=schedulePortfolio({...p,asOf:5,taskOrderOverrides:['B']});assert.equal(get(r,'B').start,8);assert.deepEqual(r.projects[0]!.forecast.staleTaskIds,['A']);
  const blocked=plan([task('A','P1')],[task('B','P2',{dependsOn:['C']}),task('C','P2',{resource:'Bob',goodCase:4,poorCase:4})]);
  const s=schedulePortfolio({...blocked,taskOrderOverrides:['B']});assert.equal(get(s,'A').start,0);assert.equal(get(s,'B').start,4);
});
test('50% allocation doubles duration; concurrent load stays within 100%',()=>{
  const r=schedulePortfolio(plan([task('A','P1',{allocationPercent:50}),task('C','P1',{allocationPercent:50})],[task('B','P2',{allocationPercent:50})]));
  assert.equal(get(r,'A').finish,4);assert.equal(get(r,'C').start,0);assert.equal(get(r,'B').start,4);assert.equal(r.conflicts.length,0);
  assert.equal(r.projects[0]!.forecast.deterministicCompletion,4);
});
test('resource provenance excludes capacity releases that did not block a task',()=>{
  const r=schedulePortfolio(plan([task('A','P1',{allocationPercent:50}),task('D','P1',{resource:'Bob'})],[task('B','P2',{allocationPercent:50,dependsOn:['D']})]));
  assert.deepEqual(get(r,'B').resourcePredecessors,[]);assert.deepEqual(r.projects[1]!.forecast.criticalChain,['D','B']);
});
test('locked appointments reserve resources and fixed finish gates feedback; milestone takes no capacity',()=>{
  const p=plan([task('A','P1',{goodCase:3,poorCase:3})],[task('L','P2',{locked:{start:2,finish:3},goodCase:1,poorCase:1}),task('M','P2',{goodCase:0,poorCase:0,locked:{start:3,finish:3},dependsOn:['L']}),task('F','P2',{resource:'Bob',dependsOn:['M']})]);
  const r=schedulePortfolio(p);assert.equal(get(r,'A').start,3);assert.equal(get(r,'L').start,2);assert.equal(get(r,'F').start,3);assert.equal(r.conflicts.length,0);
});
test('missed locked prerequisite returns fixed schedule, conflict and downstream infeasibility',()=>{
  const r=schedulePortfolio(plan([task('A','P1',{resource:'Bob',goodCase:4,poorCase:4})],[task('L','P2',{locked:{start:2,finish:3},dependsOn:['A']}),task('F','P2',{dependsOn:['L']})]));
  assert.equal(get(r,'L').start,2);assert.equal(get(r,'L').finish,3);assert.equal(get(r,'F').start,3);
  assert.equal(r.projects[0]!.forecast.feasible,true);assert.equal(r.conflicts[0]!.kind,'dependency');assert.equal(r.projects[1]!.forecast.feasible,false);
});
test('overlapping locked tasks return capacity conflict; 50% locks can overlap',()=>{
  const p=plan([task('A','P1',{locked:{start:1,finish:3}})],[task('B','P2',{locked:{start:2,finish:4}})]);
  const r=schedulePortfolio(p);assert.equal(r.conflicts[0]!.kind,'resource');assert.ok(r.projects.every(p=>!p.forecast.feasible));
  assert.equal(schedulePortfolio(plan([task('A','P1',{allocationPercent:50,locked:{start:1,finish:3}})],[task('B','P2',{allocationPercent:50,locked:{start:2,finish:4}})])).conflicts.length,0);
});
test('completed actuals and active remaining estimates survive portfolio scheduling',()=>{
  const p=plan([task('A','P1',{status:'completed',actuals:{start:0,finish:2}}),task('B','P1',{status:'active',dependsOn:['A'],remaining:{goodCase:2,poorCase:8,estimateStatus:'current'}})]);
  const r=schedulePortfolio({...p,asOf:3});assert.equal(get(r,'A').finish,2);assert.equal(get(r,'B').finish,7);assert.ok(r.projects[0]!.forecast.completionPercentiles.p95>7);
  assert.throws(()=>schedulePortfolio({...p,asOf:3,projects:[{...p.projects[0]!,tasks:[p.projects[0]!.tasks[0]!,task('B','P1',{status:'active'})]}]}),/remaining/);
});
test('fixed anchors do not acquire duration uncertainty; zero milestones and empty projects supported',()=>{
  const r=schedulePortfolio(plan([task('L','P1',{goodCase:1,poorCase:100,locked:{start:10,finish:11}}),task('M','P1',{goodCase:0,poorCase:0,dependsOn:['L']})]));
  assert.deepEqual(r.projects[0]!.forecast.completionPercentiles,{p50:11,p80:11,p95:11,p98:11,p99:11});assert.equal(r.projects[1]!.forecast.deterministicCompletion,0);
});
test('moment-matched portfolio forecasts include upstream project uncertainty',()=>{
  const r=schedulePortfolio(plan([task('A','P1',{goodCase:2,poorCase:8})],[task('B','P2',{goodCase:2,poorCase:8})]));
  assert.deepEqual(r.projects[1]!.forecast.criticalChain,['A','B']);
  assert.ok(r.projects[1]!.forecast.completionPercentiles.p95>r.projects[0]!.forecast.completionPercentiles.p95);
  const half=schedulePortfolio(plan([task('A','P1',{goodCase:2,poorCase:8,allocationPercent:50})]));assert.ok(Math.abs(half.projects[0]!.forecast.completionPercentiles.p95-2*r.projects[0]!.forecast.completionPercentiles.p95)<1e-10);
});
test('approved snapshots and their forecasts are retained across revisions and compared',()=>{
  const p={...plan([task('A','P1')],[task('B','P2')]),approvalStatus:'approved' as const};
  const current=schedulePortfolio(p);const before=structuredClone(current);
  const next=schedulePortfolio({...p,versionId:'v2',approvalStatus:'draft',taskOrderOverrides:['B']},current);
  assert.deepEqual(current,before);assert.equal(next.previousVersions[0]!.plan.approvalStatus,'approved');assert.equal(next.previousVersions[0]!.projects[0]!.forecast.completionPercentiles.p50,2);
  const comparison=comparePortfolioVersions(current,next);assert.equal(comparison.taskChanges.length,2);assert.equal(comparison.projects[0]!.percentileDifferences!.p50,2);
  const third=schedulePortfolio({...p,versionId:'v3'},next);assert.equal(third.previousVersions.length,2);
  assert.throws(()=>schedulePortfolio(p,next),/new versionId/);
});
test('ownership, IDs, dependencies, percentages, milestones and units are validated',()=>{
  assert.throws(()=>schedulePortfolio(plan([task('A','P2')])),/owning/);
  assert.throws(()=>schedulePortfolio(plan([task('A','P1')],[task('A','P2')])),/unique/);
  assert.throws(()=>schedulePortfolio(plan([task('A','P1',{dependsOn:['missing']})])),/Missing/);
  assert.throws(()=>schedulePortfolio(plan([task('A','P1',{dependsOn:['B']}),task('B','P1',{dependsOn:['A']})])),/cycle/);
  for(const allocationPercent of [0,-1,101,NaN]) assert.throws(()=>schedulePortfolio(plan([task('A','P1',{allocationPercent})])),/Allocation/);
  assert.throws(()=>schedulePortfolio(plan([task('M','P1',{goodCase:0,poorCase:1})])),/greater than zero/);
  assert.throws(()=>schedulePortfolio(plan([task('M','P1',{goodCase:0,poorCase:0,locked:{start:1,finish:2}})])),/milestone/);
  assert.throws(()=>parsePortfolio({...plan([]),settings:{durationUnit:'hours'}}),/days/);
  assert.throws(()=>schedulePortfolio({...plan([]),taskOrderOverrides:['missing']}),/override/);
});
test('sample portfolio demonstrates a missed commitment and task override resolves it',async()=>{
  const p=parsePortfolio(JSON.parse(await readFile('examples/portfolio.json','utf8')));const w=parsePortfolio(JSON.parse(await readFile('examples/portfolio-what-if.json','utf8')));
  const current=schedulePortfolio(p),whatIf=schedulePortfolio(w,current);
  assert.equal(current.projects[1]!.forecast.feasible,false);assert.equal(whatIf.conflicts.length,0);assert.ok(whatIf.projects.every(p=>p.forecast.feasible));
  assert.equal(get(current,'P2-test').start,get(whatIf,'P2-test').start);
});
test('portfolio CLI exports versioned JSON, retains previous runs and refuses overwrite',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'portfolio-'));const output=join(dir,'v1.json');const second=join(dir,'v2.json');
  try {
    const cli=['dist/src/portfolio-cli.js','examples/portfolio.json','--output',output,'--format','table'];
    const stdout=execFileSync(process.execPath,cli,{encoding:'utf8'});assert.match(stdout,/CONFLICT/);
    execFileSync(process.execPath,['dist/src/portfolio-cli.js','examples/portfolio-what-if.json','--previous',output,'--output',second]);
    const result=JSON.parse(await readFile(second,'utf8'));assert.equal(result.previousVersions.length,1);assert.equal(result.projects[1].forecast.feasible,true);
    assert.throws(()=>execFileSync(process.execPath,cli,{stdio:'pipe'}),/Command failed/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
