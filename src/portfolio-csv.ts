import {readTaskCsv,type CsvTaskRecord} from './csv-schema.js';
import {parsePortfolio,type PortfolioPlan} from './portfolio.js';

function buildPlan(records:readonly CsvTaskRecord[],id:string,versionId:string):PortfolioPlan {
  const groups=new Map<string,CsvTaskRecord['task'][]>();
  for(const record of records){const tasks=groups.get(record.projectId)??[];tasks.push(record.task);groups.set(record.projectId,tasks);}
  return parsePortfolio({id,versionId,asOf:0,settings:{durationUnit:'days'},resources:[],
    projects:[...groups].map(([projectId,tasks])=>({id:projectId,name:projectId,tasks:tasks.map(task=>({...task,projectId}))}))});
}
/** Explicit portfolio input requires a unique Project header. */
export function parsePortfolioCsv(text:string,id='csv-portfolio',versionId='csv-v1'):PortfolioPlan {
  return buildPlan(readTaskCsv(text,{requireProject:true}).records,id,versionId);
}
/** UI/portfolio CLI also accept the same schema without Project for one project. */
export function parsePlanCsv(text:string,id='csv-portfolio',versionId='csv-v1'):PortfolioPlan {
  return buildPlan(readTaskCsv(text).records,id,versionId);
}
