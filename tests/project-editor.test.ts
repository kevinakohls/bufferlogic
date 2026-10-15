import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBlankProject,appendTask} from '../src/project-editor.js';
import {schedulePortfolio} from '../src/portfolio.js';

test('blank projects start with an empty dated workspace and append without replacing existing work',()=>{
 const first=createBlankProject(' First ',undefined,'2026-10-12','America/New_York');
 assert.equal(first.projects[0]!.name,'First');assert.deepEqual(first.resources,[]);
 assert.deepEqual(first.calendar!.resources,[]);assert.equal(first.calendar!.startDate,'2026-10-12');
 const snapshot=structuredClone(first),second=createBlankProject('Second',first,'2030-01-01');
 assert.deepEqual(first,snapshot);assert.deepEqual(second.projects.map(p=>p.id),['P1','P2']);
 assert.deepEqual(second.projects[0],first.projects[0]);assert.deepEqual(second.calendar,first.calendar);
 assert.throws(()=>createBlankProject(' '),/name/);assert.throws(()=>createBlankProject('Bad',undefined,'2026-02-30'),/Invalid/);
});
test('manual task entry generates unique IDs, validates estimates and dependencies, and preserves draft assignments',()=>{
 const initial=createBlankProject('First',undefined,'2026-10-12');
 const input={projectId:'P1',name:'Build',resource:'',goodCase:1,poorCase:2,dependsOn:[]};
 const first=appendTask(initial,input),id=first.projects[0]!.tasks[0]!.id;
 assert.equal(first.projects[0]!.tasks[0]!.resource,'');assert.deepEqual(initial.projects[0]!.tasks,[]);
 const second=appendTask(first,{...input,name:'Test',dependsOn:[id]});
 assert.notEqual(second.projects[0]!.tasks[1]!.id,id);assert.equal(second.projects[0]!.tasks[1]!.priority,2);
 assert.throws(()=>appendTask(first,{...input,projectId:'missing'}),/Choose a project/);
 assert.throws(()=>appendTask(first,{...input,resource:'unknown'}),/existing resource/);
 assert.throws(()=>appendTask(first,{...input,poorCase:.5}),/poorCase|Good|good|Poor|poor/);
 assert.throws(()=>appendTask(first,{...input,dependsOn:['missing']}),/Dependencies/);
 assert.throws(()=>appendTask(first,{...input,dependsOn:[id,id]}),/Dependencies/);
 const assigned={...second,resources:['Developer'],projects:second.projects.map(p=>({...p,tasks:p.tasks.map(t=>({...t,resource:'Developer'}))}))};
 assert.equal(schedulePortfolio(assigned).tasks.length,2);
 const cross=createBlankProject('Other',assigned);
 const milestone=appendTask(cross,{...input,projectId:'P2',goodCase:0,poorCase:0,resource:'Developer',dependsOn:[id]});
 assert.equal(schedulePortfolio(milestone).tasks.length,3);
});
