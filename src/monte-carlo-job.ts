import {Worker} from 'node:worker_threads';
import {simulationOptions,type SimulationOptions} from './monte-carlo.js';
import type {PortfolioPlan} from './portfolio.js';
export async function runSimulationJob(plan:PortfolioPlan,options:SimulationOptions,signal:AbortSignal){
 const checked=simulationOptions(options);
 if(signal.aborted)throw new Error('Simulation cancelled');
 const worker=new Worker(new URL('./monte-carlo-worker.js',import.meta.url),{workerData:{plan,options:checked},resourceLimits:{maxOldGenerationSizeMb:192}});
 let timer:ReturnType<typeof setTimeout>|undefined,abort:()=>void=()=>{};
 try{return await new Promise<ReturnType<typeof import('./monte-carlo.js')['simulatePortfolio']>>((resolve,reject)=>{
  abort=()=>reject(new Error('Simulation cancelled'));signal.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>reject(new Error('Simulation time limit reached (45 seconds). Try fewer samples or a smaller plan.')),45000);
  worker.once('message',(message)=>message.error?reject(new Error(message.error)):resolve(message.result));
  worker.once('error',reject);worker.once('exit',code=>{if(code!==0)reject(new Error(`Simulation worker stopped (${code})`));});
 });}finally{if(timer)clearTimeout(timer);signal.removeEventListener('abort',abort);await worker.terminate();}
}
