import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parsePortfolio,schedulePortfolio} from '../src/portfolio.js';
const {feedingVisuals}=await import(new URL('../../ui/feeding-visuals.js',import.meta.url).href);
test('feeding bands reflect calculated P50 finish, protected target and true downstream dependencies',async()=>{
 const plan=parsePortfolio(JSON.parse(await readFile('examples/feeding-protection.json','utf8')));
 const forward=schedulePortfolio(plan);assert.deepEqual(feedingVisuals(forward),[]);
 const result=schedulePortfolio({...plan,feedingTaskIds:['F']}),snapshot=structuredClone(result),bands=feedingVisuals(result);
 assert.equal(bands.length,1);const band=bands[0];assert.equal(band.taskId,'F');assert.deepEqual(band.downstreamTaskIds,['D']);assert.equal(band.start,result.tasks.find(t=>t.id==='F')!.finish);assert.equal(band.finish,20);assert.equal(band.bufferEffort,result.feedingReport!.changes[0]!.bufferEffort);assert.deepEqual(result,snapshot);
});
test('rejected or missing feeding placements never draw protection bands',async()=>{
 const plan=parsePortfolio(JSON.parse(await readFile('examples/feeding-protection.json','utf8')));
 const rejected=schedulePortfolio({...plan,feedingTaskIds:['C']});assert.deepEqual(feedingVisuals(rejected),[]);
 const applied=schedulePortfolio({...plan,feedingTaskIds:['F']});assert.deepEqual(feedingVisuals({...applied,tasks:applied.tasks.filter(t=>t.id!=='F')}),[]);
});
