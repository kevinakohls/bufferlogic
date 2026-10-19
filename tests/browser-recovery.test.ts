import {test} from 'node:test';
import assert from 'node:assert/strict';
const {createRecoveryStore,recoveryKey}=await import(new URL('../../ui/browser-recovery.js',import.meta.url).href);
function memory(){const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}
const snapshot={plan:{name:'Pending edits'},calculatedPlan:{name:'Last calculation'},exceptions:[{resource:'Crew',date:'',hours:0}],dirty:true,capturedBaseline:{name:'Original'},unsavedWorkspace:true,unsavedBaseline:true,pendingInput:{id:'workspace-name',value:'Still typing'}};
test('recovery round trips editable state, unfinished exceptions and a captured baseline without modifying inputs',()=>{
 const storage=memory(),store=createRecoveryStore(storage),before=structuredClone(snapshot);
 assert.equal(store.read(),null);store.save(snapshot);
 const restored=createRecoveryStore(storage).read();assert.equal(restored.version,1);assert.deepEqual(restored.state,snapshot);assert.deepEqual(snapshot,before);
 store.clear();assert.equal(createRecoveryStore(storage).read(),null);
});
test('failed writes keep the previous recovery; unavailable storage does not masquerade as success',()=>{
 const storage=memory();createRecoveryStore(storage).save(snapshot);const previous=storage.getItem(recoveryKey);
 const quota={...storage,setItem(){throw new Error('Quota exceeded');}};
 assert.throws(()=>createRecoveryStore(quota).save({...snapshot,dirty:false}),/Quota/);assert.equal(storage.getItem(recoveryKey),previous);
 assert.throws(()=>createRecoveryStore({...storage,getItem(){throw new Error('Blocked');}}),/Blocked/);
});
test('stale tabs cannot overwrite or clear a newer recovery copy',()=>{
 const storage=memory(),first=createRecoveryStore(storage),second=createRecoveryStore(storage);
 first.save(snapshot);const saved=storage.getItem(recoveryKey);
 assert.throws(()=>second.save({...snapshot,dirty:false}),/Another tab/);assert.throws(()=>second.clear(),/Another tab/);assert.equal(storage.getItem(recoveryKey),saved);
});
test('malformed and unsupported recovery records are reported and retained until explicit discard',()=>{
 for(const raw of ['{broken',JSON.stringify({version:8,state:snapshot}),JSON.stringify({version:1,savedAt:'today',state:{}})]){
  const storage=memory();storage.setItem(recoveryKey,raw);const store=createRecoveryStore(storage);
  assert.throws(()=>store.read(),{message:'Recovery data is unreadable or from an unsupported version.'});assert.equal(storage.getItem(recoveryKey),raw);store.clear();assert.equal(storage.getItem(recoveryKey),null);
 }
});
