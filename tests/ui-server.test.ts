import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { createReviewServer } from '../src/ui-server.js';
import { schedulePortfolio } from '../src/portfolio.js';

async function withServer(run:(base:string)=>Promise<void>){
 const server=createReviewServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try{await run(base);}finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
const post=(base:string,path:string,data:unknown)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});

test('review UI serves its files and two-house example without accepting arbitrary paths',async()=>withServer(async base=>{
 const response=await fetch(base);assert.equal(response.status,200);assert.match(await response.text(),/Project completion forecasts/);
 assert.match(response.headers.get('content-security-policy')!,/frame-ancestors 'none'/);
 const sample=await (await fetch(base+'/api/example')).json();assert.match(sample.projectText,/Project/);assert.match(sample.calendarText,/Monday hours/);
 assert.equal((await fetch(base+'/package.json')).status,404);
}));
test('file loading and edited calendars use the existing engine and return separate project forecasts',async()=>withServer(async base=>{
 const source=await (await fetch(base+'/api/example')).json();
 const response=await post(base,'/api/load',{...source,format:'csv',startDate:'2026-10-09',timeZone:'America/New_York'});
 assert.equal(response.status,200);const loaded=await response.json();assert.equal(loaded.tasks.length,72);
 assert.deepEqual(loaded.projects,schedulePortfolio(loaded.plan).projects);
 const draft=structuredClone(loaded.plan);draft.versionId='edited';draft.calendar.resources.forEach((r:{weeklyHours:number[]})=>r.weeklyHours[5]=8);
 const edited=await (await post(base,'/api/schedule',{plan:draft})).json();
 assert.ok(edited.projects[0].forecast.completionDates.p95<loaded.projects[0].forecast.completionDates.p95);
 assert.ok(edited.projects[1].forecast.completionDates.p95<loaded.projects[1].forecast.completionDates.p95);
}));
test('UI reloads saved result JSON and reports invalid dependencies without modifying the source',async()=>withServer(async base=>{
 const source=await readFile('examples/portfolio-contention.json','utf8');
 const loaded=await (await post(base,'/api/load',{projectText:source,format:'json'})).json();
 const reloaded=await (await post(base,'/api/load',{projectText:JSON.stringify(loaded),format:'json'})).json();assert.deepEqual(reloaded.projects,loaded.projects);
 const draft=structuredClone(loaded.plan);draft.projects[0].tasks[0].dependsOn=['missing'];
 const failed=await post(base,'/api/schedule',{plan:draft});assert.equal(failed.status,400);assert.match((await failed.json()).error,/Missing dependency/);
 assert.deepEqual(loaded.plan.projects[0].tasks[0].dependsOn,[]);
}));
test('review API rejects cross-origin requests and moving a dated locked plan origin',async()=>withServer(async base=>{
 const rejected=await fetch(base+'/api/schedule',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:'{}'});assert.equal(rejected.status,403);
 const plan=JSON.parse(await readFile('examples/portfolio.json','utf8'));
 plan.calendar={startDate:'2026-10-09',hoursPerWorkday:8,resources:plan.resources.map((resource:string)=>({resource,weeklyHours:[8,8,8,8,8,0,0],exceptions:{}}))};
 const calendar='Resource,Row type,Date,Monday hours,Tuesday hours,Wednesday hours,Thursday hours,Friday hours,Saturday hours,Sunday hours,Exception hours\nAlice,weekly,,8,8,8,8,8,0,0,';
 const response=await post(base,'/api/load',{projectText:JSON.stringify(plan),format:'json',calendarText:calendar,startDate:'2026-10-10'});
 assert.equal(response.status,400);assert.match((await response.json()).error,/fixed commitments/);
}));
