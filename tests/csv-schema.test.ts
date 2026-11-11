import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readTaskCsv,CsvValidationError} from '../src/csv-schema.js';
import {parsePlanCsv,parsePortfolioCsv} from '../src/portfolio-csv.js';
import {parseProjectCsv} from '../src/csv-input.js';
import {instantiateTemplate} from '../src/templates.js';
import {parseResourceCalendarsCsv} from '../src/resource-calendars.js';
const source='\uFEFFID,Task,Resource,Predecessors,Low Estimate P20 (days),High Estimate P80 (days)\r\n1,A,Mechanical,,5,7\r\n2,B,Electrical,1,2,3\r\n3,C,Machinist,2,6,9';

test('the same BOM/alias CSV loads as a project and as a fresh template, without Priority or Project',()=>{
 const loaded=parsePlanCsv(source),copy=instantiateTemplate(source,'Copy'),legacy=parseProjectCsv(source);
 assert.deepEqual(loaded.projects[0]!.tasks.map(t=>t.priority),[1,2,3]);
 assert.deepEqual(copy.projects[0]!.tasks.map(t=>t.priority),[1,2,3]);
 assert.deepEqual(loaded.projects[0]!.tasks.map(t=>t.id),['1','2','3']);
 assert.deepEqual(copy.projects[0]!.tasks[2]!.dependsOn,['P1-T002']);assert.equal(legacy[0]!.goodCase,5);
});
test('explicit Priority is honored in both modes; blank Priority defaults to project row order',()=>{
 const csv='ID,Task,Resource,Good days,Poor days,Priority,Project\nA,A,Crew,1,2,9,P1\nB,B,Crew,2,3,,P2\nC,C,Crew,2,3,-1,P1';
 const loaded=parsePortfolioCsv(csv),copy=instantiateTemplate(csv,'Copy',undefined,'P1');
 assert.deepEqual(loaded.projects[0]!.tasks.map(t=>t.priority),[9,-1]);assert.equal(loaded.projects[1]!.tasks[0]!.priority,1);
 assert.deepEqual(copy.projects[0]!.tasks.map(t=>t.priority),[9,-1]);
});
test('IDs may be generated when absent; present blank IDs and missing project ownership are rejected',()=>{
 assert.deepEqual(parsePlanCsv('Task,Resource,Good days,Poor days\nA,Crew,1,2\nB,Crew,2,3').projects[0]!.tasks.map(t=>t.id),['1','2']);
 assert.throws(()=>parsePlanCsv('ID,Task,Resource,Good days,Poor days\n,A,Crew,1,2'),/ID cannot be blank/);
 assert.throws(()=>parsePortfolioCsv(source),/missing column: Project/);
 assert.throws(()=>parsePlanCsv('ID,Task,Resource,Good days,Poor days,Project\n1,A,Crew,1,2,'),/Project cannot be blank/);
});
test('duplicate/ambiguous headers including Project and aliases are rejected together',()=>{
 const csv='Task,Resource,Good days,Low Estimate P20 (days),Project,Project';
 assert.throws(()=>parsePortfolioCsv(csv),(error:unknown)=>error instanceof CsvValidationError&&error.problems.some(p=>p.includes('ambiguous column Good days'))&&error.problems.some(p=>p.includes('ambiguous column Project'))&&error.problems.some(p=>p.includes('missing column: Poor days')));
 assert.throws(()=>parsePlanCsv('Task,Resource,Good days,Poor days,Predecessors,Depends on'),/ambiguous column Depends on/);
});
test('record errors are accumulated across tasks, row widths, estimates, priorities, names and dependencies',()=>{
 const csv='ID,Task,Resource,Good days,Poor days,Priority,Depends on\nA,,Crew,no,4,bad,missing\nB,B,Crew,8,3,1,other\nC,short\nA,Duplicate,Crew,1,2,2,';
 assert.throws(()=>readTaskCsv(csv),(error:unknown)=>{
  assert.ok(error instanceof CsvValidationError);for(const text of ['record 2','record 3','record 4','Task cannot be blank','Good days must be a finite number','Priority must be a finite number','must not exceed','missing dependency missing','missing dependency other','duplicate ID A'])assert.ok(error.message.includes(text),text);
  return true;
 });
});
test('dependency cycles, supporting resources and milestone rules are checked without accepting partial data',()=>{
 assert.throws(()=>parsePlanCsv('ID,Task,Resource,Good days,Poor days,Depends on\nA,A,Crew,1,2,B\nB,B,Crew,1,2,A'),/Dependency cycle/);
 assert.equal(parsePlanCsv('ID,Task,Resource,Good days,Poor days\nM,Milestone,,0,0').projects[0]!.tasks[0]!.goodCase,0);
 assert.throws(()=>parsePlanCsv('Task,Resource,Good days,Poor days,Supporting resources\nA,Crew,1,2,bad\nB,Crew,0,2,bad'),(e:unknown)=>e instanceof CsvValidationError&&e.problems.filter(p=>p.includes('Supporting resources')).length===2&&e.message.includes('greater than zero'));
});
test('calendar header validation reports all missing/duplicate columns before indexing records',()=>{
 assert.throws(()=>parseResourceCalendarsCsv('\uFEFFResource,Row type,Date,Date\nCrew,weekly,,') ,(e:unknown)=>e instanceof CsvValidationError&&e.message.includes('ambiguous column Date')&&e.message.includes('Monday hours')&&e.message.includes('Sunday hours')&&e.message.includes('Exception hours'));
});
test('calendar errors aggregate invalid hours, dates, duplicates and orphaned exceptions with record locations',()=>{
 const header='Resource,Row type,Date,Monday hours,Tuesday hours,Wednesday hours,Thursday hours,Friday hours,Saturday hours,Sunday hours,Exception hours';
 const csv='\uFEFF'+header+'\nCrew,weekly,,bad,25,8,8,8,0,0,\nCrew,weekly,,8,8,8,8,8,0,0,\nCrew,exception,2026-02-30,,,,,,,,bad\nOther,exception,2026-11-11,,,,,,,,0\nOther,exception,2026-11-11,,,,,,,,0';
 assert.throws(()=>parseResourceCalendarsCsv(csv),(e:unknown)=>{
  assert.ok(e instanceof CsvValidationError);for(const text of ['record 2','Monday hours','Tuesday hours','Duplicate weekly','record 4','2026-02-30','Exception hours','Duplicate exception','requires weekly'])assert.ok(e.message.includes(text),text);return true;
 });
});

test('the eight-task manufacturing sheet works unchanged for normal loads and template copies',async()=>{
 const {readFile}=await import('node:fs/promises');const csv=await readFile('examples/manufacturing-template.csv','utf8');
 const loaded=parsePlanCsv(csv),copy=instantiateTemplate(csv,'Manufacturing');
 assert.equal(loaded.projects[0]!.tasks.length,8);assert.equal(copy.projects[0]!.tasks.length,8);
 for(let i=0;i<8;i++){
  const a=loaded.projects[0]!.tasks[i]!,b=copy.projects[0]!.tasks[i]!;
  assert.deepEqual([a.name,a.resource,a.goodCase,a.poorCase,a.priority],[b.name,b.resource,b.goodCase,b.poorCase,b.priority]);
 }
 assert.deepEqual(loaded.projects[0]!.tasks[7]!.dependsOn,['7']);assert.deepEqual(copy.projects[0]!.tasks[7]!.dependsOn,['P1-T007']);
});
