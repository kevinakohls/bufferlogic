/** Browser-only recovery. No workspace data is sent anywhere by this module. */
export const recoveryKey='bufferlogic.recovery.v1';
export function createRecoveryStore(storage){
 let expected=storage.getItem(recoveryKey);
 return {
  read(){
   if(!expected)return null;
   let record;
   try{record=JSON.parse(expected);}
   catch{throw new Error('Recovery data is unreadable or from an unsupported version.');}
   if(record?.version!==1||typeof record.savedAt!=='string'||!record.state?.plan||!record.state?.calculatedPlan||!Array.isArray(record.state.exceptions))throw new Error('Recovery data is unreadable or from an unsupported version.');
   return record;
  },
  save(state){
   if(storage.getItem(recoveryKey)!==expected)throw new Error('Another tab changed the recovery copy. This tab will not overwrite it. Download your workspace before leaving.');
   const savedAt=new Date().toISOString();
   const next=JSON.stringify({version:1,savedAt,state});
   storage.setItem(recoveryKey,next);expected=next;return savedAt;
  },
  resume(){
   const current=storage.getItem(recoveryKey);
   if(current!==null&&current!==expected)throw new Error('Another tab has a recovery copy. This tab will not overwrite it. Download your work instead.');
   expected=current;
  },
  clear(){
   if(storage.getItem(recoveryKey)!==expected)throw new Error('Another tab changed the recovery copy. Refresh before clearing it.');
   storage.removeItem(recoveryKey);expected=null;
  },
 };
}
