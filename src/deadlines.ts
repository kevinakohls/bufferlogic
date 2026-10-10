import {parseDate} from './resource-calendars.js';
import type {PortfolioVersion} from './portfolio.js';
/** Calendar deadlines include the entire named date; numeric deadlines are elapsed day boundaries. */
export type Deadline = string | number;
export function validateDeadline(value:unknown):Deadline {
 if(typeof value==='string'){parseDate(value);return value;}
 if(typeof value==='number'&&Number.isFinite(value)&&value>=0)return value;
 throw new Error('Deadline must be a valid YYYY-MM-DD date or nonnegative day number');
}
export interface DeadlineAssessment {status:'met'|'late'|'unavailable';daysLate:number|null;completion:Deadline|null;}
function assess(deadline:Deadline,day:number,date?:string):DeadlineAssessment {
 if(typeof deadline==='string'){
  if(!date)return {status:'unavailable',daysLate:null,completion:null};
  const difference=(parseDate(date)-parseDate(deadline))/86400000;
  return {status:difference>0?'late':'met',daysLate:Math.max(0,difference),completion:date};
 }
 const difference=day-deadline;
 return {status:difference>1e-9?'late':'met',daysLate:Math.max(0,difference),completion:day};
}
export function assessDeadlines(version:PortfolioVersion){
 return {
  projects:version.projects.filter(p=>p.deadline!==undefined).map(p=>({projectId:p.id,deadline:p.deadline!,feasible:p.forecast.feasible,assessments:Object.fromEntries(['deterministic','p50','p80','p95','p98','p99'].map(key=>[key,assess(p.deadline!,key==='deterministic'?p.forecast.deterministicCompletion:p.forecast.completionPercentiles[key as keyof typeof p.forecast.completionPercentiles],p.forecast.completionDates?.[key as keyof NonNullable<typeof p.forecast.completionDates>])])) as Record<'deterministic'|'p50'|'p80'|'p95'|'p98'|'p99',DeadlineAssessment>})),
  tasks:version.plan.projects.flatMap(p=>p.tasks).filter(t=>t.deadline!==undefined).map(t=>{const entry=version.tasks.find(e=>e.id===t.id)!;return {taskId:t.id,projectId:t.projectId,deadline:t.deadline!,assessment:assess(t.deadline!,entry.finish,entry.finishDate)};})
 };
}
