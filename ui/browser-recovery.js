/** Browser-only recovery. No workspace data is sent anywhere by this module. */
export const recoveryKey='bufferlogic.recovery.v1';
export function createRecoveryStore(storage){
 let expected=storage.getItem(recoveryKey);
 return {
  read(){
   if(!expected)return null;
   const record=JSON.parse(expected);
   if(record?.version!==1||typeof record.savedAt!=='string'||!record.state?.plan||!record.state?.calculatedPlan||!Array.isArray(record.state.exceptions))throw new Error('Recovery data is unreadable or from an unsupported version.');
   return record;
  },
  save(state){
   if(storage.getItem(recoveryKey)!==expected)throw new Error('Another tab changed the recovery copy. This tab will not overwrite it. Download your workspace before leaving.');
   const next=JSON.stringify({version:1,savedAt:new Date().toISOString(),state});
   storage.setItem(recoveryKey,next);expected=next;
  },
  clear(){
   if(storage.getItem(recoveryKey)!==expected)throw new Error('Another tab changed the recovery copy. Refresh before clearing it.');
   storage.removeItem(recoveryKey);expected=null;
  },
 };
}
