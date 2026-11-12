import {csvRecords} from './csv-records.js';
import {supportingResourcesCell} from './supporting-resources-input.js';
import type {Task} from './types.js';
import type {ResourceAssignment} from './task-resources.js';

export class CsvValidationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`CSV validation failed (${problems.length} ${problems.length===1?'problem':'problems'}):\n${problems.map(problem=>`• ${problem}`).join('\n')}`);
    this.name='CsvValidationError';
  }
}
const taskColumns=['ID','Task','Resource','Depends on','Good days','Poor days','Priority','Project','Supporting resources','Checklist','Description','Comments','Completion criteria','Lock reason'];
const names=new Map(taskColumns.map(name=>[name.toLowerCase(),name]));
names.set('predecessors','Depends on');
names.set('low estimate p20 (days)','Good days');
names.set('high estimate p80 (days)','Poor days');
export function canonicalColumn(value:string):string {const trimmed=value.trim();return names.get(trimmed.toLowerCase())??trimmed;}

/** Reject ambiguous headers before accessing cells; collect all identifiable header errors. */
export function csvTable(text:string,required:readonly string[],label='Task CSV') {
  let rows:string[][];
  try{rows=csvRecords(text);}catch(error){throw new CsvValidationError([`${label}: ${(error as Error).message}`]);}
  const raw=rows.shift();
  if(!raw)throw new CsvValidationError([`${label} requires a header row`]);
  const requiredNames=new Map(required.map(name=>[name.toLowerCase(),name]));
  const normalize=(value:string)=>requiredNames.get(value.trim().toLowerCase())??canonicalColumn(value);
  const header=raw.map(normalize),problems:string[]=[],seen=new Map<string,string>();
  header.forEach((column,index)=>{
    if(!column)problems.push(`${label}: column ${index+1} has no heading`);
    const key=column.toLowerCase();
    if(seen.has(key))problems.push(`${label}: duplicate or ambiguous column ${column} (${seen.get(key)} and ${raw[index]})`);
    else seen.set(key,raw[index]!);
  });
  for(const column of required)if(!header.includes(column))problems.push(`${label} is missing column: ${column}`);
  if(problems.length)throw new CsvValidationError(problems);
  const records=rows.flatMap((row,index)=>{
    if(row.every(cell=>!cell.trim()))return [];
    if(row.length===header.length&&row.every((cell,i)=>normalize(cell).toLowerCase()===header[i]!.toLowerCase()))return [];
    if(row.length!==header.length){problems.push(`${label} record ${index+2} has the wrong number of fields: expected ${header.length}, received ${row.length}`);return [];}
    return [{row,record:index+2,cell:(name:string)=>{const column=header.indexOf(name);return column<0?'':row[column]!.trim();}}];
  });
  return {header,records,problems};
}
export interface CsvTask extends Task {
  readonly supportingResources?:readonly ResourceAssignment[];
  readonly checklist?:readonly {text:string;completed:boolean}[];
  readonly description?:string;
  readonly comments?:string;
  readonly completionCriteria?:string;
  readonly lockReason?:string;
}
export interface CsvTaskRecord { readonly record:number;readonly projectId:string;readonly task:CsvTask; }
export function readTaskCsv(text:string,options:{requireProject?:boolean;template?:boolean}={}) {
  const table=csvTable(text,['Task','Resource','Good days','Poor days',...(options.requireProject?['Project']:[])],options.requireProject?'Portfolio CSV':'Task CSV');
  const {header,problems}=table,records:CsvTaskRecord[]=[],ordinals=new Map<string,number>();
  const numeric=(raw:string,label:string)=>{
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)||!Number.isFinite(Number(raw))){problems.push(`${label} must be a finite number`);return NaN;}
    return Number(raw);
  };
  for(const entry of table.records){
    const {cell,record}=entry,label=`CSV record ${record}`,projectId=header.includes('Project')?cell('Project'):'P1';
    if(!projectId)problems.push(`${label}: Project cannot be blank`);
    const ordinal=(ordinals.get(projectId)??0)+1;ordinals.set(projectId,ordinal);
    const id=header.includes('ID')?cell('ID'):String(records.length+1),name=cell('Task'),resource=cell('Resource');
    if(!id)problems.push(`${label}: ID cannot be blank`);
    if(!name)problems.push(`${label}: Task cannot be blank`);
    const goodCase=numeric(cell('Good days'),`${label}: Good days`),poorCase=numeric(cell('Poor days'),`${label}: Poor days`);
    const priority=cell('Priority')?numeric(cell('Priority'),`${label}: Priority`):ordinal;
    if(Number.isFinite(goodCase)&&Number.isFinite(poorCase)){
      if(goodCase>poorCase)problems.push(`${label} (${id}): Good days (${goodCase}) must not exceed Poor days (${poorCase})`);
      if((goodCase<=0||poorCase<=0)&&!(goodCase===0&&poorCase===0))problems.push(`${label} (${id}): estimates must be greater than zero, or both zero for a milestone`);
    }
    const raw=cell('Depends on'),dependsOn=!raw||raw.toLowerCase()==='none'?[]:raw.split(',').map(id=>id.trim());
    if(dependsOn.some(id=>!id))problems.push(`${label} (${id}): Depends on contains an empty task ID`);
    if(new Set(dependsOn).size!==dependsOn.length)problems.push(`${label} (${id}): Depends on must contain unique task IDs`);
    let supporting:{supportingResources?:readonly ResourceAssignment[]}={};
    try{
      supporting=supportingResourcesCell(cell('Supporting resources'));
      const assignments=new Set(resource?[resource]:[]);
      for(const assignment of supporting.supportingResources??[]){
        if(assignment.resource&&assignments.has(assignment.resource))problems.push(`${label} (${id}): Supporting resources must be distinct from the primary resource and each other`);
        assignments.add(assignment.resource);
      }
    }catch(error){problems.push(`${label} (${id}): ${(error as Error).message}`);}
    const notes=Object.fromEntries([['Description','description'],['Comments','comments'],['Completion criteria','completionCriteria'],['Lock reason','lockReason']].filter(([column])=>header.includes(column!)).map(([column,field])=>[field,cell(column!)]));
    records.push({record,projectId,task:{id,name,resource,goodCase,poorCase,priority,dependsOn,...supporting,...notes,
      ...(header.includes('Checklist')?{checklist:cell('Checklist').split(/\r?\n/).map(text=>text.trim()).filter(Boolean).map(text=>({text,completed:false}))}:{})}});
  }
  if(!records.length)problems.push('CSV has no tasks');
  // Templates may repeat source IDs in different projects; loaded portfolios may not.
  const scope=(record:CsvTaskRecord)=>options.template?record.projectId:'';
  const groups=new Map<string,CsvTaskRecord[]>();
  for(const record of records){const key=scope(record),group=groups.get(key)??[];group.push(record);groups.set(key,group);}
  for(const group of groups.values()){
    const ids=new Map<string,CsvTaskRecord>();
    for(const record of group){
      if(ids.has(record.task.id))problems.push(`CSV record ${record.record}: task IDs must be unique; duplicate ID ${record.task.id}`);
      else ids.set(record.task.id,record);
    }
    for(const record of group)for(const id of record.task.dependsOn)if(id&&!ids.has(id))problems.push(`CSV record ${record.record} (${record.task.id}): missing dependency ${id}${options.template?' (outside the selected project or missing)':''}`);
    if(group.length!==ids.size)continue; // A cycle cannot be interpreted reliably until duplicate IDs are fixed.
    // Kahn traversal is linear and avoids recursion limits on long dependency chains.
    const incoming=new Map(group.map(record=>[record.task.id,0])),next=new Map<string,string[]>();
    for(const record of group)for(const id of new Set(record.task.dependsOn))if(ids.has(id)){
      incoming.set(record.task.id,(incoming.get(record.task.id)??0)+1);
      const children=next.get(id)??[];children.push(record.task.id);next.set(id,children);
    }
    const ready=[...incoming].filter(([,count])=>count===0).map(([id])=>id);
    for(let i=0;i<ready.length;i++)for(const child of next.get(ready[i]!)??[]){const count=incoming.get(child)!-1;incoming.set(child,count);if(count===0)ready.push(child);}
    const blocked=[...incoming].filter(([,count])=>count>0).map(([id])=>id);
    if(blocked.length)problems.push(`Dependency cycle (or work blocked by it): ${blocked.join(', ')}`);
  }
  if(problems.length)throw new CsvValidationError(problems);
  return {header,records};
}
