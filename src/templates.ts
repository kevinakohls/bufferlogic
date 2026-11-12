import {taskAssignments} from './task-resources.js';
import { readTaskCsv } from './csv-schema.js';
import { parsePortfolio, type PortfolioPlan } from './portfolio.js';

function templateRows(text:string){return readTaskCsv(text,{template:true});}
export function templateProjects(text:string):string[]{
 const {header,records}=templateRows(text);
 return header.includes('Project')?[...new Set(records.map(record=>record.projectId))]:['Template'];
}

/** Instantiate fresh identities using the same CSV columns/defaults as file loads. */
export function instantiateTemplate(text:string, name:string, existing?:PortfolioPlan, sourceProjectId?:string):PortfolioPlan {
 if(typeof name!=='string'||!name.trim())throw new Error('Give the new project a name');
 const {header,records}=templateRows(text),sources=header.includes('Project')?[...new Set(records.map(record=>record.projectId))]:['Template'];
 const selected=sourceProjectId??(sources.length===1?sources[0]:undefined);
 if(!selected||!sources.includes(selected))throw new Error('Choose one source project from the template');
 const rows=records.filter(record=>!header.includes('Project')||record.projectId===selected);
 const base:PortfolioPlan=existing?parsePortfolio(existing):{id:'template-portfolio',versionId:'template-v1',asOf:0,settings:{durationUnit:'days' as const},resources:[],projects:[]};
 const usedProjects=new Set([...base.projects.map(p=>p.id),...base.retiredProjectIds??[]]),usedTasks=new Set([...base.projects.flatMap(p=>p.tasks.map(t=>t.id)),...base.retiredTaskIds??[]]);
 let number=1;while(usedProjects.has(`P${number}`)||rows.some((_,i)=>usedTasks.has(`P${number}-T${String(i+1).padStart(3,'0')}`)))number++;
 const projectId=`P${number}`;
 const remap=new Map(rows.map((record,index)=>[record.task.id,`${projectId}-T${String(index+1).padStart(3,'0')}`]));
 const tasks=rows.map(({task})=>({...task,id:remap.get(task.id)!,projectId,status:'planned' as const,
  dependsOn:task.dependsOn.map(id=>remap.get(id)!)}));
 const resources=[...new Set([...base.resources,...tasks.flatMap(t=>taskAssignments(t).map(a=>a.resource)).filter(Boolean)])];
 // New resources default to 40-hour weeks; hoursPerWorkday is an estimate conversion, not availability.
 const calendar=base.calendar?{...base.calendar,resources:[...base.calendar.resources,...resources.filter(r=>!base.calendar!.resources.some(c=>c.resource===r)).map(resource=>({resource,weeklyHours:[8,8,8,8,8,0,0],exceptions:{}}))]}:undefined;
 return parsePortfolio({...base,approvalStatus:'draft',versionId:existing?`${base.versionId}-template-${projectId}`:'template-v1',resources,projects:[...base.projects,{id:projectId,name:name.trim(),tasks}],...(calendar?{calendar}:{})});
}
