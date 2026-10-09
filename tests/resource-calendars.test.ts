import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createCalendar, parseResourceCalendarsCsv, parseDate, validateCalendarSettings, todayDate, type CalendarSettings } from '../src/resource-calendars.js';
import { schedulePortfolio, comparePortfolioVersions, type PortfolioPlan, type PortfolioTask } from '../src/portfolio.js';
import { parsePortfolioCsv } from '../src/portfolio-csv.js';
const weekly=[8,8,8,8,8,0,0];
const config=(exceptions:Record<string,number>={}, startDate='2026-10-09'):CalendarSettings=>({startDate,hoursPerWorkday:8,resources:[{resource:'Alice',weeklyHours:weekly,exceptions}]});
const task=(id:string,extra:Partial<PortfolioTask>={}):PortfolioTask=>({id,projectId:'P1',name:id,resource:'Alice',goodCase:2,poorCase:2,dependsOn:[],priority:1,...extra});
const plan=(tasks:PortfolioTask[], calendar=config()):PortfolioPlan=>({id:'calendar',versionId:'v1',asOf:0,settings:{durationUnit:'days'},resources:['Alice'],projects:[{id:'P1',name:'One',tasks}],calendar});

test('Friday work crosses weekends; five days starting Monday completes Friday',()=>{
 const c=createCalendar(config());assert.equal(c.finish('Alice',0,2),4);assert.equal(c.completionDate(4),'2026-10-12');
 const monday=createCalendar(config({},'2026-10-12'));assert.equal(monday.finish('Alice',0,5),5);assert.equal(monday.completionDate(5),'2026-10-16');
});
test('dated holiday, working Saturday and overtime replace daily capacity',()=>{
 assert.equal(createCalendar(config({'2026-10-12':0})).completionDate(createCalendar(config({'2026-10-12':0})).finish('Alice',0,2)),'2026-10-13');
 const saturday=createCalendar(config({'2026-10-10':8}));assert.equal(saturday.finish('Alice',0,2),2);
 const overtime=createCalendar(config({'2026-10-09':16}));assert.equal(overtime.finish('Alice',0,2),1);
});
test('resource-specific calendars resolve contention across closures and extend another project chain',()=>{
 const p=plan([task('A',{goodCase:1,poorCase:1})]);
 const r=schedulePortfolio({...p,projects:[p.projects[0]!,{id:'P2',name:'Two',tasks:[{...task('B',{goodCase:1,poorCase:1}),projectId:'P2'}]}]});
 assert.equal(r.tasks.find(t=>t.id==='B')!.start,3);assert.equal(r.tasks.find(t=>t.id==='B')!.finish,4);
 assert.deepEqual(r.projects[1]!.forecast.criticalChain,['A','B']);assert.equal(r.projects[1]!.forecast.completionDates!.deterministic,'2026-10-12');
});
test('calendar dispatch waits for resource opening even when there are no task finish events',()=>{
 const r=schedulePortfolio(plan([task('A')],config({},'2026-10-10')));assert.equal(r.tasks[0]!.start,2);assert.equal(r.tasks[0]!.finish,4);
});
test('50% sharing scales effort before applying calendars, and elapsed waiting consumes no crew capacity',()=>{
 const half=schedulePortfolio(plan([task('A',{allocationPercent:50})]));assert.equal(half.projects[0]!.forecast.completionDates!.deterministic,'2026-10-14');
 const r=schedulePortfolio(plan([task('W',{durationMode:'elapsed'}),task('A')]));assert.equal(r.tasks.find(t=>t.id==='W')!.finish,2);assert.equal(r.tasks.find(t=>t.id==='A')!.start,0);assert.equal(r.tasks.find(t=>t.id==='W')!.allocationPercent,0);
});
test('fixed Saturday work stays fixed and reports insufficient calendar capacity; milestones need none',()=>{
 const r=schedulePortfolio(plan([task('L',{goodCase:1,poorCase:1,locked:{start:1,finish:2}}),task('M',{goodCase:0,poorCase:0,locked:{start:2,finish:2}})]));
 assert.equal(r.tasks.find(t=>t.id==='L')!.finish,2);assert.equal(r.conflicts[0]!.kind,'calendar');assert.equal(r.projects[0]!.forecast.feasible,false);
 const allowed=schedulePortfolio(plan([task('L',{goodCase:1,poorCase:1,locked:{start:1,finish:2}})],config({'2026-10-10':8})));assert.equal(allowed.conflicts.length,0);
});
test('fixed appointment downstream of holiday-delayed work reports missed dependency',()=>{
 const r=schedulePortfolio(plan([task('A'),task('L',{resource:'Alice',goodCase:0,poorCase:0,dependsOn:['A'],locked:{start:3,finish:3}})]));
 assert.equal(r.conflicts[0]!.kind,'dependency');assert.equal(r.tasks.find(t=>t.id==='L')!.start,3);
});
test('deterministic fixed-duration chains have percentile dates matching calendar completion',()=>{
 const r=schedulePortfolio(plan([task('A'),task('B',{dependsOn:['A']})]));
 const f=r.projects[0]!.forecast;assert.equal(f.deterministicCompletion,6);
 assert.deepEqual(Object.values(f.completionPercentiles),[6,6,6,6,6]);assert.ok(Object.values(f.completionDates!).every(d=>d==='2026-10-14'));
});
test('uncertain effort produces ordered dates and calendar-aware percentile changes under overtime',()=>{
 const ordinary=schedulePortfolio(plan([task('A',{goodCase:2,poorCase:8})]));
 const extra=schedulePortfolio(plan([task('A',{goodCase:2,poorCase:8})],{...config(),resources:[{resource:'Alice',weeklyHours:[16,16,16,16,16,0,0],exceptions:{}}]}));
 const values=Object.values(ordinary.projects[0]!.forecast.completionPercentiles);assert.ok(values.every((v,i)=>i===0||v>=values[i-1]!));
 assert.ok(extra.projects[0]!.forecast.completionPercentiles.p95<ordinary.projects[0]!.forecast.completionPercentiles.p95);
});
test('calendar settings validate real dates, unique resources, hours and bounded missing availability',()=>{
 assert.throws(()=>parseDate('2026-02-30'),/Invalid/);assert.throws(()=>parseDate('10/09/2026'),/YYYY/);
 assert.throws(()=>validateCalendarSettings({...config(),hoursPerWorkday:0}),/hoursPerWorkday/);
 assert.throws(()=>validateCalendarSettings({...config(),resources:[...config().resources,...config().resources]}),/unique/);
 assert.throws(()=>validateCalendarSettings({...config(),resources:[{resource:'Alice',weeklyHours:[25,0,0,0,0,0,0],exceptions:{}}]}),/weekly/);
 assert.throws(()=>schedulePortfolio({...plan([task('A')]),resources:['Alice','Bob']}),/Missing resource/);
 assert.throws(()=>createCalendar({...config(),resources:[{resource:'Alice',weeklyHours:[0,0,0,0,0,0,0],exceptions:{}}]}).finish('Alice',0,1),/No working/);
});
test('calendar CSV loads weekly schedules and exceptions; rejects duplicate or malformed rows',async()=>{
 const source=await readFile('examples/house-resource-calendars.csv','utf8');const calendars=parseResourceCalendarsCsv(source);assert.equal(calendars.length,21);
 const header=source.replace(/^\uFEFF/,'').split(/\r?\n/)[0]!;
 const weeklyRow='Alice,weekly,,8,8,8,8,8,0,0,,Baseline';
 const exception='Alice,exception,2026-10-10,,,,,,,,8,Saturday';
 assert.equal(parseResourceCalendarsCsv(header+'\n'+weeklyRow+'\n'+exception)[0]!.exceptions['2026-10-10'],8);
 assert.throws(()=>parseResourceCalendarsCsv(header+'\n'+weeklyRow+'\n'+weeklyRow),/Duplicate weekly/);
 assert.throws(()=>parseResourceCalendarsCsv(header+'\n'+weeklyRow+'\n'+exception+'\n'+exception),/Duplicate exception/);
 assert.throws(()=>parseResourceCalendarsCsv(header+'\n'+exception),/requires weekly/);
});
test('two-house calendars yield feasible dated project forecasts and retain the input snapshot',async()=>{
 const input=parsePortfolioCsv(await readFile('examples/house_build_tasks2.csv','utf8'));
 const p={...input,calendar:{startDate:'2026-10-09',hoursPerWorkday:8,resources:parseResourceCalendarsCsv(await readFile('examples/house-resource-calendars.csv','utf8'))}};
 const copy=structuredClone(p);const r=schedulePortfolio(p);assert.deepEqual(p,copy);assert.equal(r.conflicts.length,0);
 assert.ok(r.projects.every(p=>p.forecast.completionDates && p.forecast.feasible));
 assert.ok(r.projects[1]!.forecast.completionDates!.p95>r.projects[1]!.forecast.completionDates!.deterministic);
});
test('portfolio CLI accepts calendar/start-date and stores dated forecasts and calendar settings',()=>{
 const args=['dist/src/portfolio-cli.js','examples/house_build_tasks2.csv','--calendar','examples/house-resource-calendars.csv','--start-date','2026-10-09'];
 const r=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}));assert.equal(r.plan.calendar.resources.length,21);assert.match(r.projects[0].forecast.completionDates.p95,/^\d{4}-\d{2}-\d{2}$/);
 const current=JSON.parse(execFileSync(process.execPath,args.slice(0,-2),{encoding:'utf8'}));assert.equal(current.plan.calendar.startDate,todayDate());
 assert.throws(()=>execFileSync(process.execPath,[...args.slice(0,-2),'--start-date','invalid'],{stdio:'pipe'}),/Command failed/);
});


test('today is calculated in the chosen timezone, including a UTC midnight boundary',()=>{
 const now=new Date('2026-10-10T02:00:00Z');
 assert.equal(todayDate('America/New_York',now),'2026-10-09');
 assert.equal(todayDate('UTC',now),'2026-10-10');
 assert.throws(()=>todayDate('Invalid/Zone',now),/time zone/i);
});


test('resource-specific holidays recompute dependencies and deterministic percentile dates',()=>{
 const c={...config(),resources:[...config().resources,{resource:'Bob',weeklyHours:weekly,exceptions:{'2026-10-12':0}}]};
 const p={...plan([task('A',{goodCase:1,poorCase:1}),task('B',{resource:'Bob',dependsOn:['A'],goodCase:1,poorCase:1})],c),resources:['Alice','Bob']};
 const r=schedulePortfolio(p),f=r.projects[0]!.forecast;
 assert.equal(r.tasks.find(t=>t.id==='B')!.start,4);
 assert.equal(f.completionDates!.deterministic,'2026-10-13');
 assert.equal(f.completionPercentiles.p95,f.deterministicCompletion);
});
test('calendar revisions retain dates and settings; mixed time axes cannot be compared',()=>{
 const current=schedulePortfolio(plan([task('A')]));
 const next=schedulePortfolio({...plan([task('A')],config({'2026-10-10':8})),versionId:'v2'},current);
 assert.equal(next.previousVersions[0]!.plan.calendar!.resources[0]!.exceptions['2026-10-10'],undefined);
 assert.equal(next.previousVersions[0]!.projects[0]!.forecast.completionDates!.deterministic,'2026-10-12');
 assert.equal(comparePortfolioVersions(current,next).projects[0]!.percentileDifferences!.p95,-2);
 const moved=schedulePortfolio({...plan([task('A')],config({},'2026-10-10')),versionId:'v3'},next);
 assert.equal(moved.previousVersions.length,2);
 assert.throws(()=>comparePortfolioVersions(current,moved),/calendar origin/);
});


test('instant milestones retain their date at a day boundary, distinct from preceding work completion',()=>{
 const r=schedulePortfolio(plan([task('A',{goodCase:1,poorCase:1}),task('M',{goodCase:0,poorCase:0,dependsOn:['A'],locked:{start:1,finish:1}})]));
 const a=r.tasks.find(t=>t.id==='A')!,m=r.tasks.find(t=>t.id==='M')!;
 assert.equal(a.finishDate,'2026-10-09');assert.equal(m.startDate,'2026-10-10');assert.equal(m.finishDate,'2026-10-10');
 assert.equal(r.projects[0]!.forecast.completionDates!.deterministic,'2026-10-10');
});
