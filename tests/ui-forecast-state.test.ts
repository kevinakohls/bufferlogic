import {test} from 'node:test';
import assert from 'node:assert/strict';
// Import the exact module served to the browser, without adding browser dependencies.
const {forecastState,holdAction}=await import(new URL('../../ui/forecast-state.js',import.meta.url).href);
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
