import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parsePortfolioCsv } from '../src/portfolio-csv.js';
import { schedulePortfolio } from '../src/portfolio.js';
const header='ID,Task,Resource,Depends on,Good days,Poor days,Priority,Project';

test('portfolio CSV retains ownership, shared resources and first-appearance project order',()=>{
  const plan=parsePortfolioCsv(header+'\nA,Design,Alice,none,2,4,1,P2\nB,Build,Alice,A,3,5,1,P1');
  assert.deepEqual(plan.projects.map(p=>p.id),['P2','P1']);
  assert.deepEqual(plan.resources,['Alice']);
  assert.equal(plan.projects[0]!.tasks[0]!.projectId,'P2');
  assert.deepEqual(plan.projects[1]!.tasks[0]!.dependsOn,['A']);
  assert.equal(schedulePortfolio(plan).tasks.length,2);
});
test('portfolio CSV handles Excel BOM, repeated exact headers, blank rows and quoted commas',()=>{
  const csv='\uFEFF'+header+'\r\nA,"Design, phase one",Alice,none,2,4,1,P1\r\n\r\n'+header+'\r\nB,Build,Alice,A,3,5,1,P2\r\n';
  const plan=parsePortfolioCsv(csv);
  assert.equal(plan.projects[0]!.tasks[0]!.name,'Design, phase one');
  assert.equal(plan.projects.flatMap(p=>p.tasks).length,2);
});
test('invalid CSV ownership, numeric estimates, missing columns and duplicate task IDs are rejected',()=>{
  assert.throws(()=>parsePortfolioCsv(header+'\nA,Design,Alice,none,2,4,1,'),/Project/);
  assert.throws(()=>parsePortfolioCsv(header+'\nA,Design,Alice,none,two,4,1,P1'),/finite/);
  assert.throws(()=>parsePortfolioCsv(header.replace(',Project','')),/Project/);
  assert.throws(()=>parsePortfolioCsv(header+'\nA,Design,Alice,none,2,4,1'),/fields/);
  assert.throws(()=>schedulePortfolio(parsePortfolioCsv(header+'\nA,Design,Alice,none,2,4,1,P1\nA,Build,Alice,none,2,4,1,P2')),/unique/);
});
test('two-house fixture uses distinct IDs and matching dependency patterns',async()=>{
  const plan=parsePortfolioCsv(await readFile('examples/house_build_tasks2.csv','utf8'));
  assert.equal(plan.projects.length,2);assert.equal(plan.resources.length,21);
  const first=plan.projects[0]!.tasks, second=plan.projects[1]!.tasks;
  assert.equal(first.length,36);assert.equal(second.length,36);
  for(let i=0;i<36;i++){
    assert.equal(Number(second[i]!.id),Number(first[i]!.id)+36);
    assert.deepEqual(second[i]!.dependsOn,first[i]!.dependsOn.map(id=>String(Number(id)+36)));
  }
});
test('realistic houses stay feasible with shared-resource delay and cross-project critical chains',async()=>{
  const plan=parsePortfolioCsv(await readFile('examples/house_build_tasks2.csv','utf8'));
  const combined=schedulePortfolio(plan);assert.equal(combined.conflicts.length,0);
  for(const project of plan.projects){
    const alone=schedulePortfolio({...plan,projects:[project]});
    const forecast=combined.projects.find(p=>p.id===project.id)!.forecast;
    assert.ok(forecast.feasible);
    assert.ok(forecast.deterministicCompletion>alone.projects[0]!.forecast.deterministicCompletion);
    assert.ok(forecast.criticalChain.some(id=>plan.projects.find(p=>p.tasks.some(t=>t.id===id))!.id!==project.id));
  }
  for(const resource of plan.resources){
    const tasks=combined.tasks.filter(t=>t.resource===resource).sort((a,b)=>a.start-b.start);
    for(let i=1;i<tasks.length;i++)assert.ok(tasks[i]!.start>=tasks[i-1]!.finish);
  }
});
test('portfolio CLI directly loads the Excel CSV and reports both project forecasts',()=>{
  const output=JSON.parse(execFileSync(process.execPath,['dist/src/portfolio-cli.js','examples/house_build_tasks2.csv'],{encoding:'utf8'}));
  assert.equal(output.projects.length,2);assert.equal(output.tasks.length,72);
  assert.equal(output.plan.id,'house_build_tasks2');assert.ok(output.projects.every((p:{forecast:{feasible:boolean}})=>p.forecast.feasible));
});
