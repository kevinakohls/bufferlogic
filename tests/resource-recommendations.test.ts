import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { recommendSaturdayHours } from '../src/resource-recommendations.js';
import { parseResourceCalendarsCsv } from '../src/resource-calendars.js';
import { parsePortfolioCsv } from '../src/portfolio-csv.js';
import type { PortfolioPlan, PortfolioTask } from '../src/portfolio.js';
const task=(id:string,resource:string,days:number,extra:Partial<PortfolioTask>={}):PortfolioTask=>({id,projectId:'P1',name:id,resource,goodCase:days,poorCase:days,dependsOn:[],priority:1,...extra});
function plan(tasks:PortfolioTask[]):PortfolioPlan{return {id:'test',versionId:'v1',asOf:0,settings:{durationUnit:'days'},resources:['Alice','Bob'],projects:[{id:'P1',name:'One',tasks}],calendar:{startDate:'2026-10-09',hoursPerWorkday:8,resources:['Alice','Bob'].map(resource=>({resource,weeklyHours:[8,8,8,8,8,0,0],exceptions:{}}))}};}

test('resource analysis ranks the controlling resource first without mutating the plan',()=>{
 const p=plan([task('A','Alice',2),task('B','Bob',1)]),copy=structuredClone(p);
 const r=recommendSaturdayHours(p);assert.deepEqual(p,copy);assert.equal(r.recommendedResource,'Alice');
 assert.equal(r.candidates[0]!.projects[0]!.p95DaysEarlier,2);assert.equal(r.candidates[0]!.projects[0]!.proposedP95Date,'2026-10-10');
 assert.equal(r.candidates.find(c=>c.resource==='Bob')!.eligible,false);
});
test('Saturday exceptions are preserved and already maximum hours are not recommended',()=>{
 const p=plan([task('A','Alice',2)]);
 const c=p.calendar!;
 const holiday=recommendSaturdayHours({...p,calendar:{...c,resources:c.resources.map(r=>({...r,exceptions:{'2026-10-10':0}}))}});
 assert.equal(holiday.recommendedResource,null);
 const max=recommendSaturdayHours({...p,calendar:{...c,resources:c.resources.map(r=>({...r,weeklyHours:[8,8,8,8,8,24,0]}))}});
 assert.ok(max.candidates.every(c=>c.addedSaturdayHours===0&&!c.eligible));
});
test('fixed commitments remain unchanged; infeasible outcomes cannot be recommendations',()=>{
 const r=recommendSaturdayHours(plan([task('L','Alice',3,{locked:{start:0,finish:1}})]));
 assert.equal(r.recommendedResource,null);assert.ok(r.candidates.every(c=>!c.eligible&&c.conflicts.length>0));
});
test('calendar input is required; separate project gains remain separate',()=>{
 const p=plan([task('A','Alice',2)]);
 const {calendar,...without}=p;assert.throws(()=>recommendSaturdayHours(without),/require calendars/);
 const r=recommendSaturdayHours({...p,projects:[...p.projects,{id:'P2',name:'Two',tasks:[{...task('B','Alice',2),projectId:'P2'}]}]});
 const c=r.candidates.find(c=>c.resource==='Alice')!;assert.equal(c.projects.length,2);
 assert.equal(c.totalP95DaysEarlier,c.projects.reduce((sum,p)=>sum+p.p95DaysEarlier,0));
});
test('two-house analysis ranks each resource and CLI returns unchanged baseline plus recommendations',async()=>{
 const p=parsePortfolioCsv(await readFile('examples/house_build_tasks2.csv','utf8'));
 const calendars=parseResourceCalendarsCsv(await readFile('examples/house-resource-calendars.csv','utf8'));
 const r=recommendSaturdayHours({...p,calendar:{startDate:'2026-10-09',hoursPerWorkday:8,resources:calendars}});
 assert.equal(r.candidates.length,21);assert.ok(r.recommendedResource);
 for(const c of r.candidates)assert.equal(c.projects.length,2);
 const args=['dist/src/portfolio-cli.js','examples/house_build_tasks2.csv','--calendar','examples/house-resource-calendars.csv','--start-date','2026-10-09'];
 const baseline=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}));
 const analyzed=JSON.parse(execFileSync(process.execPath,[...args,'--recommend-resources'],{encoding:'utf8'}));
 assert.deepEqual(analyzed.projects,baseline.projects);assert.deepEqual(analyzed.plan,baseline.plan);
 assert.equal(analyzed.resourceRecommendations.recommendedResource,r.recommendedResource);
});
