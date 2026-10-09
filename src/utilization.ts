import { createCalendar, parseDate } from './resource-calendars.js';
import type { PortfolioResult } from './portfolio.js';

interface WeeklyUtilization {
 resource:string;weekStart:string;weekEnd:string;periodStart:string;periodFinish:string;
 availableHours:number;scheduledHours:number;remainingHours:number;utilizationPercent:number|null;
 projectHours:{projectId:string;projectName:string;hours:number}[];taskIds:string[];
}
/** Monday-Sunday buckets clipped to the remaining deterministic schedule period. */
export function resourceUtilization(result:PortfolioResult){
 const settings=result.plan.calendar;if(!settings)throw new Error('Resource utilization requires working calendars');
 const calendar=createCalendar(settings),start=result.plan.asOf,end=Math.max(start,...result.tasks.map(t=>t.finish));
 if(end-start>36600)throw new Error('Utilization period exceeds 100 years');
 const origin=parseDate(settings.startDate),weekday=(new Date(origin+Math.floor(start)*86400000).getUTCDay()+6)%7;
 const firstWeek=Math.floor(start)-weekday;
 const weeks:WeeklyUtilization[]=[];
 for(let week=firstWeek;week<end;week+=7){
  const from=Math.max(start,week),to=Math.min(end,week+7);
  for(const resource of result.plan.resources){
   const availableHours=calendar.effortBetween(resource,from,to)*settings.hoursPerWorkday;
   const contributing=result.tasks.filter(t=>t.resource===resource&&t.allocationPercent>0&&t.start<to&&t.finish>from);
   const projectHours=result.plan.projects.map(p=>({projectId:p.id,projectName:p.name,hours:contributing.filter(t=>t.projectId===p.id).reduce((sum,t)=>sum+calendar.effortBetween(resource,Math.max(from,t.start),Math.min(to,t.finish))*settings.hoursPerWorkday*t.allocationPercent/100,0)}));
   const scheduledHours=projectHours.reduce((sum,p)=>sum+p.hours,0);
   weeks.push({resource,weekStart:calendar.date(week),weekEnd:calendar.date(week+6),periodStart:calendar.date(from),periodFinish:calendar.completionDate(to),availableHours,scheduledHours,remainingHours:availableHours-scheduledHours,utilizationPercent:availableHours===0?null:scheduledHours/availableHours*100,projectHours,taskIds:contributing.map(t=>t.id)});
  }
 }
 const resources=result.plan.resources.map(resource=>{
  const rows=weeks.filter(w=>w.resource===resource),availableHours=rows.reduce((s,w)=>s+w.availableHours,0),scheduledHours=rows.reduce((s,w)=>s+w.scheduledHours,0);
  return {resource,availableHours,scheduledHours,remainingHours:availableHours-scheduledHours,utilizationPercent:availableHours===0?null:scheduledHours/availableHours*100,projectHours:result.plan.projects.map(p=>({projectId:p.id,projectName:p.name,hours:rows.reduce((s,w)=>s+w.projectHours.find(h=>h.projectId===p.id)!.hours,0)}))};
 });
 return {startDate:calendar.date(start),finishDate:end===start?calendar.date(start):calendar.completionDate(end),weeks,resources,interpretation:'Remaining deterministic schedule only; Monday-Sunday weeks clipped at the reporting period edges. Working calendar hours multiplied by task allocation; elapsed waits and milestones use no capacity. Utilization is not overtime benefit or a percentile forecast.'};
}
