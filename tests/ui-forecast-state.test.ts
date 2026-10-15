import {test} from 'node:test';
import assert from 'node:assert/strict';
// Import the exact module served to the browser, without adding browser dependencies.
const {forecastState,holdAction,usesCalendarDates}=await import(new URL('../../ui/forecast-state.js',import.meta.url).href);
test('held and blocked UI forecasts have unavailable labels without infeasible badges or timeline warnings',()=>{
 for(const withheldReason of ['on-hold','blocked-by-hold']){
  const state=forecastState({withheldReason,feasible:null});
  assert.equal(state.badgeText,'Forecast withheld');assert.equal(state.badgeClass,'feasible withheld');assert.equal(state.timelineWarning,'');
  assert.equal(state.completionLabel,withheldReason==='on-hold'?'On hold — forecast withheld':'Blocked by held work');
 }
});
test('UI constraint failures stay infeasible while ordinary forecasts stay feasible',()=>{
 const bad=forecastState({feasible:false});assert.equal(bad.badgeClass,'feasible infeasible');assert.match(bad.timelineWarning,/Infeasible schedule/);
 const good=forecastState({feasible:true});assert.equal(good.badgeText,'Feasible');assert.equal(good.timelineWarning,'');assert.equal(good.completionLabel,null);
});
test('hold control labels and pressed state describe hold/resume transitions',()=>{
 assert.deepEqual(holdAction(undefined),{label:'Put on hold',pressed:'false'});
 assert.deepEqual(holdAction(true),{label:'Resume project',pressed:'true'});
 assert.deepEqual(holdAction(false),{label:'Put on hold',pressed:'false'});
});

test('days/date display respects the saved preference and requires calendars for dates',()=>{
 assert.equal(usesCalendarDates({settings:{durationUnit:'days'}}),false);
 assert.equal(usesCalendarDates({settings:{displayTime:'dates'}}),false);
 assert.equal(usesCalendarDates({calendar:{},settings:{}}),true);
 assert.equal(usesCalendarDates({calendar:{},settings:{displayTime:'days'}}),false);
 assert.equal(usesCalendarDates({calendar:{},settings:{displayTime:'dates'}}),true);
});

const {estimateReviewValue,deadlineTargetState,criticalChainSummary}=await import(new URL('../../ui/forecast-state.js',import.meta.url).href);
test('estimate review is blank for planned and completed tasks, even with old remaining metadata',()=>{
 for(const status of [undefined,'planned','completed'])assert.equal(estimateReviewValue({status,remaining:{estimateStatus:'stale'}}),'');
 assert.equal(estimateReviewValue({status:'active',remaining:{estimateStatus:'stale'}}),'stale');
 assert.equal(estimateReviewValue({status:'active',remaining:{estimateStatus:'current'}}),'current');
});
test('project headline status uses P95 deadline assessment while schedule conflicts and holds remain distinct',()=>{
 const late={status:'late',daysLate:9};
 assert.equal(forecastState({feasible:true},late).badgeText,'Late at P95');
 assert.equal(forecastState({feasible:true},late).badgeClass,'feasible deadline-missed');
 assert.equal(forecastState({feasible:true},{status:'met'}).badgeText,'On time at P95');
 assert.equal(forecastState({feasible:false},late).badgeText,'Needs attention');
 assert.equal(forecastState({withheldReason:'on-hold',feasible:null},late).badgeText,'Forecast withheld');
 assert.equal(deadlineTargetState(late).text,'Late at P95 · 9 days late');
 assert.equal(deadlineTargetState({status:'unavailable',reason:'calendar-required'}).text,'Calendar required');
 assert.match(criticalChainSummary({tasks:[],forecast:{criticalChain:[]}}),/No tasks yet/);
 assert.match(criticalChainSummary({tasks:[{}],forecast:{criticalChain:[],withheldReason:'on-hold'}}),/on hold or blocked/);
});
