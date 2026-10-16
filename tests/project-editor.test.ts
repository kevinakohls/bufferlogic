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

const {deleteProject}=await import('../src/project-editor.js');
test('project deletion removes owned tasks and selection references but retains resources, metadata, calendar and remaining order',()=>{
 const first=createBlankProject('First',undefined,'2026-10-15');
 const named={...first,name:'My portfolio',resources:['Shared','Idle'],resourceDetails:[{id:'Shared',comments:'Keep me'}]};
 const withTask=appendTask(named,{projectId:'P1',name:'Build',resource:'Shared',goodCase:1,poorCase:2,dependsOn:[]});
 const second=appendTask(createBlankProject('Second',withTask),{projectId:'P2',name:'Other',resource:'Shared',goodCase:1,poorCase:1,dependsOn:[]});
 const a=second.projects[0]!.tasks[0]!.id,b=second.projects[1]!.tasks[0]!.id;
 const input={...second,feedingTaskIds:[a,b],taskOrderOverrides:[a,b]},snapshot=structuredClone(input);
 const result=deleteProject(input,'P1');
 assert.deepEqual(input,snapshot);assert.deepEqual(result.projects,[second.projects[1]]);
 assert.equal(result.name,'My portfolio');assert.deepEqual(result.resources,second.resources);
 assert.deepEqual(result.resourceDetails,second.resourceDetails);assert.deepEqual(result.calendar,second.calendar);
 assert.deepEqual(result.feedingTaskIds,[b]);assert.deepEqual(result.taskOrderOverrides,[b]);
 assert.equal(schedulePortfolio(result).tasks.length,1);
 const empty=deleteProject(result,'P2');assert.deepEqual(empty.projects,[]);assert.deepEqual(empty.resources,result.resources);
 assert.throws(()=>deleteProject(result,'missing'),/Project not found/);
});
test('project deletion is blocked by dependencies from another project, including held projects',()=>{
 const first=appendTask({...createBlankProject('First',undefined,'2026-10-15'),resources:['Shared']},{projectId:'P1',name:'Build',resource:'Shared',goodCase:1,poorCase:1,dependsOn:[]});
 const input=appendTask(createBlankProject('Second',first),{projectId:'P2',name:'Dependent',resource:'Shared',goodCase:1,poorCase:1,dependsOn:[first.projects[0]!.tasks[0]!.id]});
 const snapshot=structuredClone(input);assert.throws(()=>deleteProject(input,'P1'),/Cannot delete First.*Second: Dependent/);assert.deepEqual(input,snapshot);
 assert.throws(()=>deleteProject({...input,projects:input.projects.map(p=>({...p,onHold:true}))},'P1'),/dependencies/);
 // Dependencies owned by the deleted project disappear together and do not block deletion.
 assert.equal(deleteProject(input,'P2').projects.length,1);
});

const {deleteTask}=await import('../src/project-editor.js');
test('task deletion retains projects and resources, cleans selections and compares as removed',async()=>{
 const {compareScenarios}=await import('../src/scenario-comparison.js');
 const first=appendTask({...createBlankProject('First',undefined,'2026-10-15'),resources:['Shared','Idle']},{projectId:'P1',name:'Build',resource:'Shared',goodCase:1,poorCase:2,dependsOn:[]});
 const second=appendTask(first,{projectId:'P1',name:'Other',resource:'Shared',goodCase:1,poorCase:1,dependsOn:[]});
 const [a,b]=second.projects[0]!.tasks.map(t=>t.id) as [string,string];
 const input={...second,feedingTaskIds:[a,b],taskOrderOverrides:[a,b]},snapshot=structuredClone(input);
 const result=deleteTask(input,a);
 assert.deepEqual(input,snapshot);assert.deepEqual(result.resources,input.resources);assert.deepEqual(result.calendar,input.calendar);
 assert.deepEqual(result.feedingTaskIds,[b]);assert.deepEqual(result.taskOrderOverrides,[b]);
 assert.equal(result.projects[0]!.tasks.length,1);
 assert.equal(compareScenarios(input,result).tasks.find(t=>t.taskId===a)!.status,'removed');
 const empty=deleteTask(result,b);assert.equal(empty.projects.length,1);assert.deepEqual(empty.projects[0]!.tasks,[]);
 assert.throws(()=>deleteTask(input,'missing'),/Task not found/);
});
test('task deletion blocks same-project and cross-project dependents, including held work',()=>{
 const first=appendTask({...createBlankProject('First'),resources:['Shared']},{projectId:'P1',name:'Build',resource:'Shared',goodCase:1,poorCase:1,dependsOn:[]});
 const id=first.projects[0]!.tasks[0]!.id;
 const same=appendTask(first,{projectId:'P1',name:'Test',resource:'Shared',goodCase:1,poorCase:1,dependsOn:[id]});
 assert.throws(()=>deleteTask(same,id),/Cannot delete Build.*Test/);
 const cross=appendTask(createBlankProject('Second',first),{projectId:'P2',name:'Review',resource:'Shared',goodCase:1,poorCase:1,dependsOn:[id]});
 const snapshot=structuredClone(cross);
 assert.throws(()=>deleteTask({...cross,projects:cross.projects.map(p=>({...p,onHold:true}))},id),/dependencies first: Review/);
 assert.deepEqual(cross,snapshot);
});
