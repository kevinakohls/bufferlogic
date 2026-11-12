import {parsePortfolio,schedulePortfolio,type PortfolioPlan,type PlacementConstraints} from './portfolio.js';
import {fitTaskLognormal} from './percentiles.js';
import {taskAssignments} from './task-resources.js';

export interface SimulationOptions {readonly samples?:number;readonly seed?:number;}
const probabilities={p50:.5,p95:.95,p98:.98,p99:.99} as const;
type Percentile=keyof typeof probabilities;
export function simulationOptions(options:SimulationOptions={}){
 const samples=options.samples===undefined?5000:options.samples,seed=options.seed===undefined?2026:options.seed;
 if(!Number.isInteger(samples)||samples<1000||samples>50000)throw new Error('Simulation samples must be an integer from 1,000 to 50,000');
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Simulation seed must be an integer from 0 to 4294967295');
 return {samples,seed};
}
function randomNormal(seed:number){
 let state=seed>>>0,spare:number|undefined;
 const uniform=()=>{state=(state+0x6d2b79f5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return (((t^(t>>>14))>>>0)+.5)/4294967296;};
 return ()=>{
  if(spare!==undefined){const value=spare;spare=undefined;return value;}
  const radius=Math.sqrt(-2*Math.log(uniform())),angle=2*Math.PI*uniform();spare=radius*Math.sin(angle);return radius*Math.cos(angle);
 };
}
interface Completion {value:number;date:string|null;}
export interface SimulationQuantile {value:number;date:string|null;samplingInterval:{lower:number;upper:number;lowerDate:string|null;upperDate:string|null};}
/** Nearest-rank quantile with an approximate 95% binomial-rank sampling interval. */
function quantile(values:readonly Completion[],p:number):SimulationQuantile {
 const n=values.length,index=Math.max(0,Math.ceil(n*p)-1),spread=1.959963984540054*Math.sqrt(n*p*(1-p));
 const lower=values[Math.max(0,Math.floor(n*p-spread)-1)]!,upper=values[Math.min(n-1,Math.ceil(n*p+spread)-1)]!,value=values[index]!;
 return {value:value.value,date:value.date,samplingInterval:{lower:lower.value,upper:upper.value,lowerDate:lower.date,upperDate:upper.date}};
}
/** Fixed baseline feeder release/reservation policy; each draw re-dispatches all tasks. */
function feederPolicy(baseline:ReturnType<typeof schedulePortfolio>):PlacementConstraints {
 const earliestStarts=new Map<string,number>(),bufferReservations:PlacementConstraints['bufferReservations'][number][]=[],tasks=new Map(baseline.plan.projects.flatMap(p=>p.tasks).map(t=>[t.id,t]));
 for(const change of baseline.feedingReport?.changes??[]){
  if(change.status!=='applied')continue;
  earliestStarts.set(change.taskId,change.newStart);
  const finish=change.protectionFinish??change.protectedStart;
  if(finish===null)continue;
  for(const assignment of taskAssignments(tasks.get(change.taskId)!))bufferReservations.push({...assignment,taskId:change.taskId,start:change.newStart,finish});
 }
 return {earliestStarts,protectedPlacements:new Map(),bufferReservations,realizedSample:true};
}
export function simulatePortfolio(input:PortfolioPlan,options:SimulationOptions={}){
 const {samples,seed}=simulationOptions(options),plan=parsePortfolio(input),tasks=plan.projects.flatMap(p=>p.tasks);
 if(!tasks.length)throw new Error('Add tasks before simulating');
 if(tasks.length>300||samples*tasks.length>2000000)throw new Error('Simulation is limited to 300 tasks and 2,000,000 task-draws. Use fewer samples or a smaller plan.');
 const baseline=schedulePortfolio(plan);
 if(baseline.conflicts.length)throw new Error('Resolve schedule conflicts before running Monte Carlo');
 const normal=randomNormal(seed),policy=feederPolicy(baseline);
 const fits=new Map(tasks.filter(t=>t.status!=='completed'&&!t.locked).map(t=>{
  const estimate=t.status==='active'?t.remaining!:t;
  return [t.id,estimate.goodCase===0&&estimate.poorCase===0?null:{...fitTaskLognormal(estimate.goodCase,estimate.poorCase),constant:estimate.goodCase===estimate.poorCase?estimate.goodCase:null}] as const;
 }));
 const completions=new Map(plan.projects.map(p=>[p.id,[] as Completion[]])),invalid=new Map(plan.projects.map(p=>[p.id,0])),critical=new Map(plan.projects.map(p=>[p.id,new Map<string,number>()]));
 let resourceViolationSamples=0,commitmentViolationSamples=0;
 for(let draw=0;draw<samples;draw++){
  const sampled:PortfolioPlan={...plan,projects:plan.projects.map(p=>({...p,tasks:p.tasks.map(t=>{
   if(!fits.has(t.id))return t;const fit=fits.get(t.id)!;
   const value=fit===null?0:fit.constant??Math.exp(fit.mu+fit.sigma*normal());
   if(!Number.isFinite(value)||value<0||(fit!==null&&value===0))throw new Error(`Sampled duration exceeds numeric range: ${t.id}`);
   return t.status==='active'?{...t,remaining:{...t.remaining!,goodCase:value,poorCase:value}}:{...t,goodCase:value,poorCase:value};
  })}))};
  const result=schedulePortfolio(sampled,undefined,policy);
  if(result.conflicts.some(c=>c.kind==='resource'))resourceViolationSamples++;
  if(result.conflicts.length)commitmentViolationSamples++;
  for(const project of result.projects){
   if(project.forecast.withheldReason||!project.tasks.length)continue;
   if(project.forecast.feasible===false){invalid.set(project.id,invalid.get(project.id)!+1);continue;}
   completions.get(project.id)!.push({value:project.forecast.deterministicCompletion!,date:project.forecast.completionDates?.deterministic??null});
   const counts=critical.get(project.id)!;for(const id of project.forecast.criticalChain)counts.set(id,(counts.get(id)??0)+1);
  }
 }
 const projects=baseline.projects.map(project=>{
  const values=completions.get(project.id)!.sort((a,b)=>a.value-b.value),infeasibleSamples=invalid.get(project.id)!;
  const withheldReason=project.forecast.withheldReason??(!project.tasks.length?'empty':infeasibleSamples?'simulated-conflicts':values.length!==samples?'incomplete':null);
  const completionPercentiles=withheldReason?null:Object.fromEntries(Object.entries(probabilities).map(([key,p])=>[key,quantile(values,p)])) as Record<Percentile,SimulationQuantile>;
  return {projectId:project.id,name:project.name,withheldReason,completionPercentiles,infeasibleSamples,
   criticality:[...critical.get(project.id)!].map(([taskId,count])=>({taskId,fraction:count/samples})).sort((a,b)=>b.fraction-a.fraction)};
 });
 return {method:'full-plan-resource-constrained-monte-carlo' as const,sourcePlan:plan,samples,seed,projects,resourceViolationSamples,commitmentViolationSamples,
  interpretation:'Analytical P95 remains the default. These optional empirical quantiles reschedule all paths and shared resources in every draw. Sampling intervals describe Monte Carlo sampling error, not model accuracy or delivery guarantees. P100 is not offered.',
  assumptions:['Independent lognormal task efforts fitted to P20/P80; active work uses remaining estimates',
   'Completed actuals and locked commitments remain fixed; results are conditional on those commitments being met',
   'The same project/task priority, dependency, allocation, supporting-resource and daily-calendar rules apply in each draw',
   'Applied feeder release times and protected resource windows are fixed from the analytical baseline; actual overruns may delay downstream work',
   'Each draw replans using sampled durations; this is not an optimal policy or a calibrated real-world execution model',
   'Project quantiles are withheld if any draw has affected schedule conflicts; unsuccessful outcomes are not silently discarded',
   'Nearest-rank quantiles; approximate 95% binomial-rank sampling intervals. More draws reduce sampling noise, not model bias']};
}
