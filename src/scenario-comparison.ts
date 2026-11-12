import {parsePortfolio,schedulePortfolio,type PortfolioPlan,type PortfolioTask,type PortfolioResult} from './portfolio.js';

function comparisonPlan(value:unknown):PortfolioPlan {
  const source=typeof value==='object'&&value!==null&&!Array.isArray(value)&&'plan' in value?value.plan:value;
  return parsePortfolio(source);
}
// Object key order is storage detail. Array order stays meaningful unless a field
// is explicitly normalized as a set below (dependencies and supporting resources).
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(typeof value==='object'&&value!==null)return Object.fromEntries(
    Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)]));
  return value;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const ids=<T extends {id:string}>(items:readonly T[])=>new Map(items.map(item=>[item.id,item]));

/** Recalculate both plans under the current engine; keep the live workspace untouched. */
export function compareScenarios(baselineInput:unknown,scenarioInput:unknown){
  const baselinePlan=comparisonPlan(baselineInput),scenarioPlan=comparisonPlan(scenarioInput);
  if(baselinePlan.id!==scenarioPlan.id)throw new Error('Compare versions of the same workspace, not unrelated portfolios.');
  if(baselinePlan.asOf!==scenarioPlan.asOf)throw new Error('Use the same Progress as of value in both versions for a what-if comparison.');
  if(baselinePlan.calendar?.startDate!==scenarioPlan.calendar?.startDate)throw new Error('Use the same schedule start date and calendar mode in both versions.');
  const baseline=schedulePortfolio(baselinePlan),scenario=schedulePortfolio(scenarioPlan);
  const beforeProjects=ids(baseline.plan.projects),afterProjects=ids(scenario.plan.projects);
  const beforeTasks=ids(baseline.plan.projects.flatMap(p=>p.tasks)),afterTasks=ids(scenario.plan.projects.flatMap(p=>p.tasks));
  const beforeEntries=ids(baseline.tasks),afterEntries=ids(scenario.tasks);
  const projectView=(result:PortfolioResult,id:string)=>{
    const project=result.projects.find(p=>p.id===id);
    if(!project)return null;
    const forecast=project.forecast,available=project.tasks.length>0&&!forecast.withheldReason;
    return {name:project.name,order:result.plan.projects.findIndex(p=>p.id===id)+1,onHold:project.onHold??false,
      deadline:project.deadline??null,deadlineStatus:result.deadlineReport.projects.find(p=>p.projectId===id)?.assessments.p95.status??null,
      feasible:forecast.feasible,withheldReason:forecast.withheldReason??null,empty:!project.tasks.length,
      p95:available?forecast.completionPercentiles!.p95:null,p95Date:available?forecast.completionDates?.p95??null:null,
      deterministic:available?forecast.deterministicCompletion:null};
  };
  const taskView=(task:PortfolioTask|undefined,entry:PortfolioResult['tasks'][number]|undefined)=>task?{
    name:task.name,projectId:task.projectId,resource:task.resource,allocationPercent:task.allocationPercent??100,
    supportingResources:[...(task.supportingResources??[])].sort((a,b)=>a.resource<b.resource?-1:a.resource>b.resource?1:0),dependsOn:[...task.dependsOn].sort(),goodCase:task.goodCase,poorCase:task.poorCase,
    deadline:task.deadline??null,priority:task.priority,status:task.status??'planned',durationMode:task.durationMode??'working',remaining:task.remaining??null,
    locked:task.locked??null,start:entry?.start??null,finish:entry?.finish??null,startDate:entry?.startDate??null,finishDate:entry?.finishDate??null,
  }:null;
  // Compare only the task fields represented by the scheduling report. Comments,
  // descriptions and checklist ticks must not mark the project's schedule changed.
  const projectTasks=(result:PortfolioResult,id:string,entries:ReadonlyMap<string,PortfolioResult['tasks'][number]>)=>
    result.plan.projects.find(p=>p.id===id)?.tasks.map(task=>taskView(task,entries.get(task.id)))??null;
  const projects=[...new Set([...beforeProjects.keys(),...afterProjects.keys()])].map(projectId=>{
    const before=projectView(baseline,projectId),after=projectView(scenario,projectId);
    const delta=before?.p95!==null&&before?.p95!==undefined&&after?.p95!==null&&after?.p95!==undefined?after.p95-before.p95:null;
    return {projectId,before,after,status:!before?'added':!after?'removed':!same(before,after)||!same(projectTasks(baseline,projectId,beforeEntries),projectTasks(scenario,projectId,afterEntries))?'changed':'unchanged',
      p95Change:delta===null?null:Math.abs(delta)<1e-9?0:delta};
  });
  const tasks=[...new Set([...beforeTasks.keys(),...afterTasks.keys()])].flatMap(taskId=>{
    const before=taskView(beforeTasks.get(taskId),beforeEntries.get(taskId)),after=taskView(afterTasks.get(taskId),afterEntries.get(taskId));
    if(same(before,after))return [];
    const changes=!before?['Added']:!after?['Removed']:[...new Set([
      ...(before.start!==after.start||before.finish!==after.finish?['Timing']:[]),
      ...(before.resource!==after.resource||before.allocationPercent!==after.allocationPercent||!same(before.supportingResources,after.supportingResources)?['Resources']:[]),
      ...(!same(before.dependsOn,after.dependsOn)?['Dependencies']:[]),
      ...(before.goodCase!==after.goodCase||before.poorCase!==after.poorCase||!same(before.remaining,after.remaining)?['Estimates']:[]),
      ...(before.deadline!==after.deadline?['Deadline']:[]),...(before.priority!==after.priority?['Priority']:[]),...(before.status!==after.status?['Progress']:[]),
      ...(before.durationMode!==after.durationMode||!same(before.locked,after.locked)?['Scheduling settings']:[]),
      ...(before.name!==after.name||before.projectId!==after.projectId?['Task details']:[]),
    ])];
    return [{taskId,before,after,changes,status:!before?'added':!after?'removed':before.start!==null&&after.start===null?'suspended':before.start===null&&after.start!==null?'resumed':'changed'}];
  });
  const beforeResources=new Map(baseline.plan.resources.map(id=>[id,{calendar:baseline.plan.calendar?.resources.find(c=>c.resource===id)??null,details:baseline.plan.resourceDetails?.find(r=>r.id===id)??null}]));
  const afterResources=new Map(scenario.plan.resources.map(id=>[id,{calendar:scenario.plan.calendar?.resources.find(c=>c.resource===id)??null,details:scenario.plan.resourceDetails?.find(r=>r.id===id)??null}]));
  const resources=[...new Set([...beforeResources.keys(),...afterResources.keys()])].flatMap(resource=>{
    const before=beforeResources.get(resource)??null,after=afterResources.get(resource)??null;
    return same(before,after)?[]:[{resource,before,after,status:!before?'added':!after?'removed':'changed'}];
  });
  const settingsChanges=[
    {field:'Hours per estimated workday',before:baseline.plan.calendar?.hoursPerWorkday??null,after:scenario.plan.calendar?.hoursPerWorkday??null},
    {field:'Task order overrides',before:baseline.plan.taskOrderOverrides??[],after:scenario.plan.taskOrderOverrides??[]},
    {field:'Feeding task selections',before:baseline.plan.feedingTaskIds??[],after:scenario.plan.feedingTaskIds??[]},
  ].filter(change=>!same(change.before,change.after));
  return {baselineName:baseline.plan.name,scenarioName:scenario.plan.name,baselineVersion:baseline.plan.versionId,scenarioVersion:scenario.plan.versionId,
    calendarDates:Boolean(scenario.plan.calendar)&&scenario.plan.settings.displayTime!=='days',asOf:scenario.plan.asOf,
    projects,tasks,resources,baselineConflicts:baseline.conflicts,scenarioConflicts:scenario.conflicts,
    settingsChanged:settingsChanges.length>0,settingsChanges,
    interpretation:'Both plans are recalculated with the current engine. Positive P95 change means later; negative means earlier. Comparisons require the same workspace, progress date and calendar origin. Day shifts use elapsed calendar days when calendars are loaded, otherwise abstract days. P95 forecasts remain approximate.'};
}
