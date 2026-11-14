import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {fitTaskLognormal} from '../src/percentiles.js';
import {parseProject} from '../src/project-input.js';
import {parsePortfolio,schedulePortfolio,type PortfolioPlan,type PortfolioTask} from '../src/portfolio.js';
import {parsePlanCsv} from '../src/portfolio-csv.js';
import {instantiateTemplate} from '../src/templates.js';
import {appendTask} from '../src/project-editor.js';
import {simulatePortfolio} from '../src/monte-carlo.js';
import {compareScenarios} from '../src/scenario-comparison.js';
const task=(id:string,extra:Partial<PortfolioTask>={}):PortfolioTask=>({id,name:id,projectId:'P',resource:'R',goodCase:3,poorCase:9,priority:1,dependsOn:[],...extra});
const plan=(tasks:PortfolioTask[]):PortfolioPlan=>({id:'test',versionId:'v1',asOf:0,settings:{durationUnit:'days'},resources:['R'],projects:[{id:'P',name:'Project',tasks}]});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),`${a} vs ${b}`);

test('new estimate fit recovers P10/P90, narrows tails and preserves task median',()=>{
 const old=fitTaskLognormal(3,9),fresh=fitTaskLognormal(3,9,'p10-p90');
 close(Math.exp(fresh.mu-1.2815515655446004*fresh.sigma),3);
 close(Math.exp(fresh.mu+1.2815515655446004*fresh.sigma),9);
 close(old.mu,fresh.mu);assert.ok(fresh.sigma<old.sigma);
 assert.throws(()=>parseProject({tasks:[{...task('A'),estimateBasis:'p5-p95'}]}),/estimateBasis/);
 assert.throws(()=>parseProject({tasks:[task('A',{remaining:{goodCase:1,poorCase:2,estimateStatus:'current',estimateBasis:'bad' as never}})]}),/estimateBasis/);
});

test('legacy JSON round trips without changing the saved convention or forecast',()=>{
 const legacy=plan([task('A')]),before=schedulePortfolio(legacy);
 const reopened=schedulePortfolio(parsePortfolio(JSON.parse(JSON.stringify(before)).plan));
 assert.deepEqual(reopened.projects,before.projects);assert.deepEqual(reopened.plan,before.plan);
 assert.equal(reopened.plan.projects[0]!.tasks[0]!.estimateBasis,undefined);
 const fresh=plan([task('A',{estimateBasis:'p10-p90'})]);
 const roundTrip=parsePortfolio(JSON.parse(JSON.stringify(schedulePortfolio(fresh))).plan);
 assert.equal(roundTrip.projects[0]!.tasks[0]!.estimateBasis,'p10-p90');
 close(schedulePortfolio(fresh).projects[0]!.forecast.deterministicCompletion!,before.projects[0]!.forecast.deterministicCompletion!);
 assert.ok(schedulePortfolio(fresh).projects[0]!.forecast.completionPercentiles!.p95<before.projects[0]!.forecast.completionPercentiles!.p95);
});

test('CSV and templates distinguish paired Low/High from legacy Good/Poor and explicit percentiles',()=>{
 for(const [head,basis] of [['Low estimate,High estimate','p10-p90'],['Low Estimate P10 (days),High Estimate P90 (days)','p10-p90'],['Good days,Poor days',undefined],['Low Estimate P20 (days),High Estimate P80 (days)',undefined]] as const){
  const csv=`ID,Task,Resource,${head}\n1,Build,R,3,9`;
  const loaded=parsePlanCsv(csv),templated=instantiateTemplate(csv,'Example');
  assert.equal(loaded.projects[0]!.tasks[0]!.estimateBasis,basis);
  assert.equal(templated.projects[0]!.tasks[0]!.estimateBasis,basis);
  close(schedulePortfolio(loaded).projects[0]!.forecast.completionPercentiles!.p95,schedulePortfolio(templated).projects[0]!.forecast.completionPercentiles!.p95);
 }
 for(const head of ['Low estimate,High Estimate P80 (days)','Low Estimate P20 (days),High estimate','Low Estimate P10 (days),Poor days'])assert.throws(()=>parsePlanCsv(`Task,Resource,${head}\nBuild,R,3,9`),/matching pair/);
 assert.throws(()=>parsePlanCsv('Task,Resource,Low estimate,Good days,High estimate\nBuild,R,3,3,9'),/ambiguous/);
});

test('manually added tasks and current shipped templates explicitly use the new convention',async()=>{
 const p=appendTask(plan([]),{projectId:'P',name:'New',resource:'R',goodCase:3,poorCase:9,dependsOn:[]});
 assert.equal(p.projects[0]!.tasks[0]!.estimateBasis,'p10-p90');
 for(const name of ['housing','software','manufacturing']){
  const p=instantiateTemplate(await readFile(`examples/${name}-template.csv`,'utf8'),'Demo',undefined,name==='housing'?'P1':undefined);
  assert.ok(p.projects[0]!.tasks.every(t=>t.estimateBasis==='p10-p90'));
 }
});

test('active remaining estimates inherit task convention and can explicitly retain a different basis',()=>{
 const active=task('A',{status:'active',estimateBasis:'p10-p90',remaining:{goodCase:2,poorCase:6,estimateStatus:'current'}});
 const inherited=schedulePortfolio(plan([active])).projects[0]!.forecast;
 const explicit=schedulePortfolio(plan([{...active,remaining:{...active.remaining!,estimateBasis:'p10-p90'}}])).projects[0]!.forecast;
 assert.deepEqual(inherited.completionPercentiles,explicit.completionPercentiles);
 const legacy=schedulePortfolio(plan([{...active,remaining:{...active.remaining!,estimateBasis:'p20-p80'}}])).projects[0]!.forecast;
 assert.ok(legacy.completionPercentiles!.p95>inherited.completionPercentiles!.p95);
});

test('risk simulation and analytical fits use the same explicit estimate convention',()=>{
 for(const basis of ['p10-p90','p20-p80'] as const){
  const p=plan([task('A',{estimateBasis:basis})]);
  const analytical=schedulePortfolio(p).projects[0]!.forecast.completionPercentiles!;
  const mc=simulatePortfolio(p,{samples:10000,seed:42}).projects[0]!.completionPercentiles!;
  for(const k of ['p50','p95','p98','p99'] as const)assert.ok(Math.abs(mc[k].value/analytical[k]-1)<.06);
 }
});

test('two-task convolution respects the new convention and basis-only changes are compared',()=>{
 const p=plan([task('A',{estimateBasis:'p10-p90'}),task('B',{estimateBasis:'p10-p90',dependsOn:['A'],goodCase:2,poorCase:6})]);
 const equivalent=plan(p.projects[0]!.tasks.map(t=>{
  const m=fitTaskLognormal(t.goodCase,t.poorCase,t.estimateBasis);
  return {...t,estimateBasis:'p20-p80',goodCase:Math.exp(m.mu-.8416212335729143*m.sigma),poorCase:Math.exp(m.mu+.8416212335729143*m.sigma)};
 }));
 const a=schedulePortfolio(p).projects[0]!.forecast,b=schedulePortfolio(equivalent).projects[0]!.forecast;
 for(const k of ['p50','p95','p98','p99'] as const)close(a.completionPercentiles![k],b.completionPercentiles![k]);
 const legacy=plan([task('A')]),fresh=plan([task('A',{estimateBasis:'p10-p90'})]);
 const compared=compareScenarios(legacy,fresh);
 assert.equal(compared.tasks[0]!.status,'changed');assert.ok(compared.tasks[0]!.changes.includes('Estimates'));
});


test('feeding protection fits P99 using the saved convention',async()=>{
 const source=JSON.parse(await readFile('examples/feeding-protection.json','utf8')) as PortfolioPlan;
 const run=(basis:'p10-p90'|'p20-p80')=>schedulePortfolio({...source,feedingTaskIds:['F'],projects:source.projects.map(p=>({...p,tasks:p.tasks.map(t=>({...t,estimateBasis:basis}))}))}).feedingReport!.changes.find(c=>c.taskId==='F')!;
 const old=run('p20-p80'),fresh=run('p10-p90');
 assert.equal(old.status,'applied');assert.equal(fresh.status,'applied');
 close(old.p50Effort!,fresh.p50Effort!);assert.ok(fresh.p99Effort!<old.p99Effort!);assert.ok(fresh.bufferEffort!<old.bufferEffort!);
});
