import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskEstimateIssues} from '../src/task-estimate-validation.js';
const task={id:'A',name:'Build',projectId:'P1',resource:'Crew',goodCase:8,poorCase:5,priority:1,dependsOn:[]};
const plan={projects:[{id:'P1',tasks:[task]}]};
test('estimate issues identify the task, user-facing values and both affected fields without mutating inputs',()=>{
 const before=structuredClone(plan),issues=taskEstimateIssues(plan);
 assert.equal(issues.length,1);assert.equal(issues[0]!.taskId,'A');assert.equal(issues[0]!.projectId,'P1');assert.deepEqual(issues[0]!.fields,['goodCase','poorCase']);
 assert.match(issues[0]!.message,/Task A — Build: Good estimate \(8 days\).*poor estimate \(5 days\)/);
 assert.doesNotMatch(issues[0]!.message,/goodCase|poorCase/);assert.deepEqual(plan,before);
 assert.deepEqual(taskEstimateIssues({plan}),issues);
});
test('original milestones remain valid; remaining work requires positive ordered estimates',()=>{
 assert.deepEqual(taskEstimateIssues({projects:[{id:'P1',tasks:[{...task,goodCase:0,poorCase:0}]}]}),[]);
 const issues=taskEstimateIssues({projects:[{id:'P1',tasks:[{...task,goodCase:2,poorCase:3,remaining:{goodCase:6,poorCase:4}}]}]});
 assert.equal(issues[0]!.kind,'remaining');assert.match(issues[0]!.message,/Remaining good estimate \(6 days\)/);
 assert.match(taskEstimateIssues({projects:[{tasks:[{...task,goodCase:1,poorCase:2,remaining:{goodCase:0,poorCase:0}}]}]})[0]!.message,/Mark finished work Complete/);
});
test('missing, non-finite, negative and multiple invalid estimates have readable diagnostics',()=>{
 for(const value of [null,undefined,NaN,Infinity,'2']){
  assert.match(taskEstimateIssues({projects:[{tasks:[{...task,goodCase:value}]}]})[0]!.message,/Enter a number/);
 }
 assert.match(taskEstimateIssues({projects:[{tasks:[{...task,goodCase:-2,poorCase:3}]}]})[0]!.message,/greater than zero/);
 assert.equal(taskEstimateIssues({projects:[{tasks:[task,{...task,id:'B'}]}]}).length,2);
 assert.deepEqual(taskEstimateIssues(null),[]);
});

test('an active task with valid remaining work identifies its hidden original estimate error explicitly',()=>{
 const issues=taskEstimateIssues({projects:[{id:'P1',tasks:[{...task,status:'active',remaining:{goodCase:2,poorCase:3}}]}]});
 assert.equal(issues.length,1);assert.equal(issues[0]!.kind,'original');assert.match(issues[0]!.message,/Original estimates: Good estimate/);
});
