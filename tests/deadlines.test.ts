import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePortfolio,schedulePortfolio,type PortfolioPlan} from '../src/portfolio.js';
const base:PortfolioPlan={id:'deadlines',versionId:'v1',asOf:0,settings:{durationUnit:'days'},resources:['Alice'],projects:[{id:'P1',name:'House',tasks:[{id:'A',projectId:'P1',name:'Build',resource:'Alice',dependsOn:[],priority:1,goodCase:2,poorCase:8}]}]};
test('project deadlines assess each percentile, survive reload and never affect scheduling',()=>{
 const before=schedulePortfolio(base);
 const plan=parsePortfolio({...base,projects:[{...base.projects[0],deadline:8,tasks:[{...base.projects[0]!.tasks[0],deadline:3}]}]});
 const after=schedulePortfolio(parsePortfolio(JSON.parse(JSON.stringify(plan))));
 assert.deepEqual(after.tasks,before.tasks);assert.deepEqual(after.projects[0]!.forecast,before.projects[0]!.forecast);
 assert.equal(after.deadlineReport.projects[0]!.assessments.p50.status,'met');assert.equal(after.deadlineReport.projects[0]!.assessments.p95.status,'late');
 assert.equal(after.deadlineReport.tasks[0]!.assessment.daysLate,1);
 assert.equal(after.plan.projects[0]!.deadline,8);
});
test('calendar deadlines include their whole date and milestones use their actual date',()=>{
 const plan=parsePortfolio({...base,calendar:{startDate:'2026-10-09',hoursPerWorkday:8,resources:[{resource:'Alice',weeklyHours:[8,8,8,8,8,0,0],exceptions:{}}]},projects:[{...base.projects[0],deadline:'2026-10-12',tasks:[{...base.projects[0]!.tasks[0],goodCase:2,poorCase:2,deadline:'2026-10-12'},{id:'M',projectId:'P1',name:'Meeting',resource:'Alice',goodCase:0,poorCase:0,priority:2,dependsOn:['A'],locked:{start:4,finish:4},deadline:'2026-10-12'}]}]});
 const result=schedulePortfolio(plan);
 assert.equal(result.deadlineReport.tasks[0]!.assessment.status,'met');
 assert.equal(result.deadlineReport.tasks[1]!.assessment.daysLate,1);
 assert.equal(result.deadlineReport.projects[0]!.assessments.deterministic.status,'late');
});
test('invalid deadlines reject; date deadlines require calendars; removing a deadline removes its report',()=>{
 for(const deadline of ['2026-02-30',-1,Infinity,true])assert.throws(()=>parsePortfolio({...base,projects:[{...base.projects[0],deadline}]}),/Deadline|date|Date/);
 const withDate=parsePortfolio({...base,projects:[{...base.projects[0],deadline:'2026-10-12'}]});
 assert.equal(schedulePortfolio(withDate).deadlineReport.projects[0]!.assessments.p95.status,'unavailable');
 assert.equal(schedulePortfolio(base).deadlineReport.projects.length,0);
});
