import {test} from 'node:test';
import assert from 'node:assert/strict';
import {instantiateTemplate} from '../src/templates.js';
import {parsePortfolio,schedulePortfolio} from '../src/portfolio.js';
import {parsePortfolioCsv} from '../src/portfolio-csv.js';
const csv='ID,Task,Resource,Depends on,Good days,Poor days,Priority,Project,Checklist\nA,Design,Alice,none,2,2,1,P1,"Review scope\nApprove drawings"';
test('checklists survive saved workspaces and do not alter status, forecasts or template copies',()=>{
 const baseline=parsePortfolioCsv(csv);const copy=instantiateTemplate(csv,'Copy');
 assert.deepEqual(copy.projects[0]!.tasks[0]!.checklist,[{text:'Review scope',completed:false},{text:'Approve drawings',completed:false}]);
 const original=schedulePortfolio(baseline);const updated=structuredClone(baseline);
 const items=updated.projects[0]!.tasks[0]!.checklist as {text:string;completed:boolean}[];items[0]!.completed=true;items[1]!.text='Approve final drawings';
 const restored=parsePortfolio(JSON.parse(JSON.stringify(updated)));const result=schedulePortfolio(restored);
 assert.equal(result.plan.projects[0]!.tasks[0]!.checklist![0]!.completed,true);
 assert.equal(result.plan.projects[0]!.tasks[0]!.checklist![1]!.text,'Approve final drawings');
 assert.deepEqual(result.tasks,original.tasks);assert.deepEqual(result.projects[0]!.forecast,original.projects[0]!.forecast);
 assert.equal(baseline.projects[0]!.tasks[0]!.checklist![0]!.completed,false);
 const appended=instantiateTemplate(csv,'New copy',restored);
 assert.equal(appended.projects[0]!.tasks[0]!.checklist![0]!.completed,true);
 assert.equal(appended.projects[1]!.tasks[0]!.checklist![0]!.completed,false);
 assert.equal(appended.projects[1]!.tasks[0]!.status,'planned');
});
test('checklist metadata rejects blank items and nonboolean completion',()=>{
 const plan=structuredClone(parsePortfolioCsv(csv)) as any;
 plan.projects[0].tasks[0].checklist=[{text:' ',completed:false}];assert.throws(()=>parsePortfolio(plan),/Checklist/);
 plan.projects[0].tasks[0].checklist=[{text:'Review',completed:'yes'}];assert.throws(()=>parsePortfolio(plan),/Checklist/);
});
