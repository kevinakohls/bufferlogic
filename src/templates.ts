import { csvRecords } from './csv-input.js';
import { parsePortfolio, type PortfolioPlan } from './portfolio.js';

const aliases:Record<string,string>={'Predecessors':'Depends on','Low Estimate P20 (days)':'Good days','High Estimate P80 (days)':'Poor days'};
function templateRows(text:string){
 const rows=csvRecords(text),raw=rows.shift()?.map(c=>c.trim());
 if(!raw)throw new Error('Template CSV requires a header');
 const header=raw.map(c=>aliases[c]??c);
 if(new Set(header).size!==header.length)throw new Error('Template CSV has duplicate or ambiguous columns');
 for(const column of ['Task','Resource','Good days','Poor days'])if(!header.includes(column))throw new Error(`Template is missing ${column}`);
 const records=rows.filter(row=>row.some(c=>c.trim())&&!(row.length===raw.length&&row.every((c,i)=>c.trim()===raw[i])));
 for(const row of records)if(row.length!==header.length)throw new Error('Template row has the wrong number of fields');
 if(!records.length)throw new Error('Template has no tasks');
 return {header,records};
}
export function templateProjects(text:string):string[]{const {header,records}=templateRows(text);const index=header.indexOf('Project');return index===-1?['Template']:[...new Set(records.map(r=>{const id=r[index]!.trim();if(!id)throw new Error('Template Project cannot be blank');return id;}))];}

/** Instantiate one selected template project; row order, never imported priority, controls defaults. */
export function instantiateTemplate(text:string, name:string, existing?:PortfolioPlan, sourceProjectId?:string):PortfolioPlan {
 if(typeof name!=='string'||!name.trim())throw new Error('Give the new project a name');
 const {header,records}=templateRows(text),sources=templateProjects(text);
 const selected=sourceProjectId??(sources.length===1?sources[0]:undefined);
 if(!selected||!sources.includes(selected))throw new Error('Choose one source project from the template');
 const projectColumn=header.indexOf('Project');
 const rows=records.filter(row=>projectColumn===-1||row[projectColumn]!.trim()===selected);
 const base=existing?parsePortfolio(existing):{id:'template-portfolio',versionId:'template-v1',asOf:0,settings:{durationUnit:'days' as const},resources:[],projects:[]};
 const usedProjects=new Set(base.projects.map(p=>p.id)),usedTasks=new Set(base.projects.flatMap(p=>p.tasks.map(t=>t.id)));
 let number=1;while(usedProjects.has(`P${number}`)||rows.some((_,i)=>usedTasks.has(`P${number}-T${String(i+1).padStart(3,'0')}`)))number++;
 const projectId=`P${number}`;
 const cell=(row:string[],column:string)=>header.includes(column)?row[header.indexOf(column)]!.trim():'';
 const ids=rows.map((row,index)=>header.includes('ID')?cell(row,'ID'):String(index+1));
 if(ids.some(id=>!id)||new Set(ids).size!==ids.length)throw new Error('Template task references must be nonempty and unique within the selected project');
 const remap=new Map(ids.map((id,index)=>[id,`${projectId}-T${String(index+1).padStart(3,'0')}`]));
 const numeric=(value:string)=>{if(!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)||!Number.isFinite(Number(value)))throw new Error('Template estimates must be finite numbers');return Number(value);};
 const tasks=rows.map((row,index)=>{
  const predecessors=cell(row,'Depends on');
  const dependsOn=!predecessors||predecessors.toLowerCase()==='none'?[]:predecessors.split(',').map(id=>{const mapped=remap.get(id.trim());if(!mapped)throw new Error(`Template dependency ${id} is outside the selected project or missing`);return mapped;});
  return {id:remap.get(ids[index]!)!,projectId,name:cell(row,'Task'),resource:cell(row,'Resource'),goodCase:numeric(cell(row,'Good days')),poorCase:numeric(cell(row,'Poor days')),dependsOn,priority:index+1,status:'planned' as const,
   ...Object.fromEntries([['Description','description'],['Comments','comments'],['Completion criteria','completionCriteria'],['Lock reason','lockReason']].filter(([column])=>header.includes(column!)).map(([column,field])=>[field,cell(row,column!)]))};
 });
 const resources=[...new Set([...base.resources,...tasks.map(t=>t.resource)])];
 const calendar=base.calendar?{...base.calendar,resources:[...base.calendar.resources,...resources.filter(r=>!base.calendar!.resources.some(c=>c.resource===r)).map(resource=>({resource,weeklyHours:[base.calendar!.hoursPerWorkday,base.calendar!.hoursPerWorkday,base.calendar!.hoursPerWorkday,base.calendar!.hoursPerWorkday,base.calendar!.hoursPerWorkday,0,0],exceptions:{}}))]}:undefined;
 return parsePortfolio({...base,approvalStatus:'draft',versionId:existing?`${base.versionId}-template-${projectId}`:'template-v1',resources,projects:[...base.projects,{id:projectId,name:name.trim(),tasks}],...(calendar?{calendar}:{})});
}
