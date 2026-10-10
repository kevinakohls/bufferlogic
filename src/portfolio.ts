import {assessDeadlines,validateDeadline,type Deadline} from './deadlines.js';
import { createCalendar, validateCalendarSettings, type CalendarSettings } from './resource-calendars.js';
import { calculateP50 } from './duration.js';
import { fitTaskLognormal } from './percentiles.js';
import { parseProject } from './project-input.js';
import type { Task } from './types.js';

export interface Notes {
  readonly description?: string;
  readonly comments?: string;
}
export interface ResourceDetails extends Notes {
  readonly id: string;
  readonly name?: string;
  readonly role?: string;
}
export interface PortfolioTask extends Task, Notes {
  readonly deadline?: Deadline;
  readonly checklist?: readonly { readonly text:string; readonly completed:boolean }[];
  readonly actualStart?: number;
  readonly completionCriteria?: string;
  readonly lockReason?: string;
  readonly projectId: string;
  /** Percentage of one resource's capacity; default 100. */
  readonly allocationPercent?: number;
  readonly durationMode?: 'working' | 'elapsed';
  readonly locked?: { readonly start: number; readonly finish: number };
}
export interface Project extends Notes {
  readonly deadline?: Deadline;
  readonly owner?: string;
  readonly id: string;
  readonly name: string;
  readonly tasks: readonly PortfolioTask[];
}
export interface PortfolioPlan {
  readonly id: string;
  readonly versionId: string;
  readonly asOf: number;
  readonly approvalStatus?: 'draft' | 'approved';
  readonly calendar?: CalendarSettings;
  readonly settings: { readonly durationUnit: 'days' };
  readonly resources: readonly string[];
  readonly resourceDetails?: readonly ResourceDetails[];
  /** Array order is management's resource preference. */
  readonly projects: readonly Project[];
  /** Explicit first-choice tasks, in order, ahead of ordinary project ordering. */
  readonly taskOrderOverrides?: readonly string[];
}
export interface PortfolioEntry {
  readonly id: string;
  readonly projectId: string;
  readonly resource: string;
  readonly allocationPercent: number;
  readonly start: number;
  readonly finish: number;
  readonly locked: boolean;
  readonly status: 'planned' | 'active' | 'completed';
  readonly technicalPredecessors: readonly string[];
  readonly resourcePredecessors: readonly string[];
  readonly startDate?: string;
  readonly finishDate?: string;
}
export interface PortfolioConflict {
  readonly kind: 'dependency' | 'resource' | 'calendar';
  readonly taskIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly message: string;
}
export interface ProjectForecast {
  readonly scheduleVersionId: string;
  readonly feasible: boolean;
  readonly deterministicCompletion: number;
  readonly criticalChain: readonly string[];
  readonly completionPercentiles: { readonly p50: number; readonly p80: number; readonly p95: number; readonly p98: number; readonly p99: number };
  readonly staleTaskIds: readonly string[];
  readonly completionDates?: { readonly deterministic: string; readonly p50: string; readonly p80: string; readonly p95: string; readonly p98: string; readonly p99: string };
}
export interface PortfolioVersion {
  readonly plan: PortfolioPlan;
  readonly tasks: readonly PortfolioEntry[];
  readonly conflicts: readonly PortfolioConflict[];
  readonly projects: readonly (Project & { readonly forecast: ProjectForecast })[];
}
export interface PortfolioResult extends PortfolioVersion {
  readonly deadlineReport: ReturnType<typeof assessDeadlines>;
  readonly previousVersions: readonly PortfolioVersion[];
  readonly forecastMethod: string;
  readonly assumptions: readonly string[];
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const day = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function strings(value: Record<string,unknown>, fields:readonly string[]):Record<string,string> {
  const result:Record<string,string>={};
  for(const field of fields)if(value[field]!==undefined){if(typeof value[field]!=='string')throw new Error(`${field} must be text`);result[field]=value[field] as string;}
  return result;
}

/** JSON boundary, including zero-duration milestones (legacy task commands remain unchanged). */
export function parsePortfolio(value: unknown): PortfolioPlan {
  if (!object(value) || !text(value.id) || !text(value.versionId) || !day(value.asOf)
      || !object(value.settings) || value.settings.durationUnit !== 'days'
      || !Array.isArray(value.resources) || !value.resources.every(text) || !Array.isArray(value.projects)) {
    throw new Error('Portfolio requires id, versionId, asOf, settings.durationUnit=days, resources and projects');
  }
  if (value.approvalStatus !== undefined && value.approvalStatus !== 'draft' && value.approvalStatus !== 'approved') throw new Error('Invalid approvalStatus');
  const projects = value.projects.map((p: unknown): Project => {
    if (!object(p) || !text(p.id) || !text(p.name) || !Array.isArray(p.tasks)) throw new Error('Invalid project');
    const tasks = p.tasks.map((t: unknown): PortfolioTask => {
      if (!object(t) || t.projectId !== p.id) throw new Error('Each task must name its single owning projectId');
      if (t.durationMode !== undefined && t.durationMode !== 'working' && t.durationMode !== 'elapsed') throw new Error('durationMode must be working or elapsed');
      if(t.checklist!==undefined&&(!Array.isArray(t.checklist)||!t.checklist.every((item:unknown)=>object(item)&&text(item.text)&&typeof item.completed==='boolean')))throw new Error('Checklist items require nonempty text and completed true/false');
      if(t.actualStart!==undefined&&!day(t.actualStart))throw new Error('Invalid actualStart');
      const milestone = t.goodCase === 0 && t.poorCase === 0;
      const parsed = parseProject({ tasks: [{ ...t, ...(milestone ? { goodCase: 1, poorCase: 1 } : {}) }] })[0]!;
      if (t.allocationPercent !== undefined && (typeof t.allocationPercent !== 'number'
          || !Number.isFinite(t.allocationPercent) || t.allocationPercent <= 0 || t.allocationPercent > 100)) throw new Error('Allocation must be greater than 0 and at most 100');
      let locked: PortfolioTask['locked'];
      if (t.locked !== undefined) {
        if (!object(t.locked) || !day(t.locked.start) || !day(t.locked.finish) || t.locked.finish < t.locked.start) throw new Error('Invalid locked start/finish');
        if (milestone !== (t.locked.start === t.locked.finish)) throw new Error('A milestone lock must have zero duration; a work task lock must have positive duration');
        locked = { start: t.locked.start, finish: t.locked.finish };
      }
      return { ...parsed, ...(t.deadline===undefined?{}:{deadline:validateDeadline(t.deadline)}), ...(t.checklist===undefined?{}:{checklist:(t.checklist as {text:string;completed:boolean}[]).map(item=>({text:item.text,completed:item.completed}))}), ...(t.actualStart===undefined?{}:{actualStart:t.actualStart as number}), ...strings(t,['description','comments','completionCriteria','lockReason']), ...(milestone ? { goodCase: 0, poorCase: 0 } : {}), projectId: p.id as string,
        ...(t.durationMode === undefined ? {} : { durationMode: t.durationMode }),
        ...(t.allocationPercent === undefined ? {} : { allocationPercent: t.allocationPercent as number }),
        ...(locked === undefined ? {} : { locked }) };
    });
    return { id: p.id, name: p.name, tasks, ...(p.deadline===undefined?{}:{deadline:validateDeadline(p.deadline)}), ...strings(p,['description','comments','owner']) };
  });
  let resourceDetails:ResourceDetails[]|undefined;
  if(value.resourceDetails!==undefined){
    if(!Array.isArray(value.resourceDetails))throw new Error('resourceDetails must be an array');
    const seen=new Set<string>();
    resourceDetails=value.resourceDetails.map((r:unknown)=>{
      if(!object(r)||!text(r.id)||!(value.resources as string[]).includes(r.id)||seen.has(r.id))throw new Error('Resource details require unique existing resource IDs');
      seen.add(r.id);return {id:r.id,...strings(r,['name','role','description','comments'])};
    });
  }
  if (value.taskOrderOverrides !== undefined && (!Array.isArray(value.taskOrderOverrides) || !value.taskOrderOverrides.every(text))) throw new Error('Invalid taskOrderOverrides');
  return { id: value.id, versionId: value.versionId, asOf: value.asOf, settings: { durationUnit: 'days' },
    resources: [...value.resources] as string[], projects,
    ...(resourceDetails===undefined?{}:{resourceDetails}),
    ...(value.calendar === undefined ? {} : { calendar: validateCalendarSettings(value.calendar) }),
    ...(value.approvalStatus === undefined ? {} : { approvalStatus: value.approvalStatus }),
    ...(value.taskOrderOverrides === undefined ? {} : { taskOrderOverrides: [...value.taskOrderOverrides] as string[] }) };
}

/** Non-preemptive capacity scheduling with fixed reservations and immutable schedule history. */
export function schedulePortfolio(input: PortfolioPlan, previous?: PortfolioResult): PortfolioResult {
  const plan = parsePortfolio(input); // detached snapshot, validate typed callers too
  const calendar = plan.calendar ? createCalendar(plan.calendar) : undefined;
  if (calendar) for (const resource of plan.resources) calendar.available(resource, plan.asOf);
  const tasks = plan.projects.flatMap(p => p.tasks);
  const byId = new Map(tasks.map(t => [t.id, t]));
  if (byId.size !== tasks.length) throw new Error('Task IDs must be globally unique');
  if (new Set(plan.projects.map(p => p.id)).size !== plan.projects.length) throw new Error('Duplicate project ID');
  if (new Set(plan.resources).size !== plan.resources.length) throw new Error('Duplicate resource ID');
  const overrides = plan.taskOrderOverrides ?? [];
  if (new Set(overrides).size !== overrides.length || overrides.some(id => !byId.has(id))) throw new Error('Invalid or duplicate task override');
  if (previous && (previous.plan.id !== plan.id || [previous.plan.versionId, ...previous.previousVersions.map(v => v.plan.versionId)].includes(plan.versionId))) throw new Error('Revision requires the same portfolio and a new versionId');
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(t: PortfolioTask): void {
    if (visiting.has(t.id)) throw new Error(`Dependency cycle at ${t.id}`);
    if (visited.has(t.id)) return;
    if (!(t.goodCase === 0 && t.poorCase === 0)) calculateP50(t.goodCase, t.poorCase);
    if (!plan.resources.includes(t.resource)) throw new Error(`Unknown resource: ${t.resource}`);
    visiting.add(t.id);
    for (const id of t.dependsOn) { const d = byId.get(id); if (!d) throw new Error(`Missing dependency: ${id}`); visit(d); }
    visiting.delete(t.id); visited.add(t.id);
    if(t.actualStart!==undefined){
      if(t.status!=='active'&&t.status!=='completed')throw new Error(`Actual start requires active/completed status: ${t.id}`);
      if(t.actualStart>plan.asOf)throw new Error(`Actual start must be through asOf: ${t.id}`);
      if(t.status==='completed'&&t.actuals?.start!==t.actualStart)throw new Error(`Actual start disagrees with completed actuals: ${t.id}`);
      if(t.dependsOn.some(id=>byId.get(id)!.status!=='completed'||byId.get(id)!.actuals!.finish>t.actualStart!))throw new Error(`Actual start precedes dependency completion: ${t.id}`);
    }
    if (t.status === 'completed') {
      if (!t.actuals || t.actuals.finish > plan.asOf) throw new Error(`Completed task requires actuals through asOf: ${t.id}`);
      if (t.locked && (t.actuals.start !== t.locked.start || t.actuals.finish !== t.locked.finish)) throw new Error(`Actuals disagree with locked plan: ${t.id}`);
    } else {
      if (t.actuals) throw new Error(`Only completed tasks may have actuals: ${t.id}`);
      if (t.locked && t.locked.start < plan.asOf && t.status !== 'active') throw new Error(`Past locked task requires active/completed status: ${t.id}`);
      if (t.status === 'active') {
        if (!t.remaining) throw new Error(`Active task requires remaining estimates: ${t.id}`);
        if (t.dependsOn.some(id => byId.get(id)!.status !== 'completed')) throw new Error(`Active task has unfinished predecessor: ${t.id}`);
        if (t.locked && !(t.locked.start <= plan.asOf && t.locked.finish > plan.asOf)) throw new Error(`Active lock must span asOf: ${t.id}`);
      }
    }
  }
  tasks.forEach(visit);
  const entries = new Map<string, PortfolioEntry>();
  const conflicts: PortfolioConflict[] = [];
  function entry(t: PortfolioTask, start: number, finish: number): PortfolioEntry {
    return { id: t.id, projectId: t.projectId, resource: t.resource, allocationPercent: t.durationMode === 'elapsed' ? 0 : t.allocationPercent ?? 100,
      start, finish, locked: t.locked !== undefined, status: t.status ?? 'planned', technicalPredecessors: [...t.dependsOn], resourcePredecessors: [],
      ...(calendar ? {startDate:calendar.date(start),finishDate:start===finish?calendar.date(finish):calendar.completionDate(finish)} : {}) };
  }
  function duration(t: PortfolioTask): number {
    const estimates = t.status === 'active' ? t.remaining! : t;
    const value = estimates.goodCase === 0 && estimates.poorCase === 0 ? 0 : calculateP50(estimates.goodCase, estimates.poorCase) / (t.durationMode === 'elapsed' ? 1 : ((t.allocationPercent ?? 100) / 100));
    if (!Number.isFinite(value)) throw new Error(`Duration exceeds numeric range: ${t.id}`);
    return value;
  }
  function taskFinish(t:PortfolioTask,start:number,effort=duration(t)):number {
    return calendar && t.durationMode !== 'elapsed' ? calendar.finish(t.resource,start,effort) : start+effort;
  }
  // Reserve all commitments and running work before dispatching planned work.
  for (const t of tasks) {
    if (t.status === 'completed') entries.set(t.id, entry(t, t.actuals!.start, t.actuals!.finish));
    else if (t.locked) entries.set(t.id, entry(t, t.locked.start, t.locked.finish));
    else if (t.status === 'active') {
      const finish = taskFinish(t,plan.asOf);
      if (!Number.isFinite(finish) || finish <= plan.asOf) throw new Error(`Schedule exceeds numeric precision: ${t.id}`);
      entries.set(t.id, entry(t, plan.asOf, finish));
    }
  }
  const projectOrder = new Map(plan.projects.map((p, i) => [p.id, i]));
  const overrideOrder = new Map(overrides.map((id, i) => [id, i]));
  const pending = tasks.filter(t => !entries.has(t.id)).sort((a, b) =>
    (overrideOrder.get(a.id) ?? Infinity) - (overrideOrder.get(b.id) ?? Infinity)
    || projectOrder.get(a.projectId)! - projectOrder.get(b.projectId)! || a.priority - b.priority);
  function overlaps(e: PortfolioEntry, start: number, finish: number) { return e.start < finish && e.finish > start && e.finish > e.start; }
  function fits(t: PortfolioTask, start: number, finish: number): boolean {
    if (start === finish || t.durationMode === 'elapsed') return true; // milestone requires no resource capacity
    const existing = [...entries.values()].filter(e => e.resource === t.resource && overlaps(e, start, finish));
    const events = [start, ...existing.flatMap(e => [Math.max(start, e.start), Math.min(finish, e.finish)])].filter(v => v < finish);
    return events.every(time => existing.filter(e => e.start <= time && e.finish > time).reduce((sum, e) => sum + e.allocationPercent, t.allocationPercent ?? 100) <= 100 + 1e-9);
  }
  // Event dispatch: an ineligible high-order task does not reserve idle capacity.
  let time = plan.asOf;
  while (pending.length) {
    let progressed = false;
    for (let i = 0; i < pending.length;) {
      const t = pending[i]!;
      if (!t.dependsOn.every(id => entries.has(id) && entries.get(id)!.finish <= time)) { i++; continue; }
      if (calendar && t.durationMode !== 'elapsed' && duration(t)>0 && calendar.nextWorking(t.resource,time) > time+1e-9) { i++; continue; }
      const finish = taskFinish(t,time);
      if (!Number.isFinite(finish) || (duration(t) > 0 && finish <= time)) throw new Error(`Schedule exceeds numeric precision: ${t.id}`);
      if (!fits(t, time, finish)) { i++; continue; }
      entries.set(t.id, entry(t, time, finish)); pending.splice(i, 1); progressed = true;
    }
    if (!pending.length) break;
    if (progressed) continue; // newly completed zero-duration milestones at this event
    const events = [...entries.values()].flatMap(e => [e.start, e.finish]).filter(v => v > time);
    if (calendar) for (const t of pending) {
      if (t.durationMode === 'elapsed' || duration(t)===0) continue;
      if (t.dependsOn.every(id=>entries.has(id) && entries.get(id)!.finish<=time)) {
        const next=calendar.nextWorking(t.resource,time);
        if (next>time+1e-9) events.push(next);
      }
    }
    if (!events.length) throw new Error('Unable to advance portfolio schedule');
    time = Math.min(...events);
  }
  const scheduled = [...entries.values()];
  function conflict(kind: PortfolioConflict['kind'], ids: string[], message: string) {
    conflicts.push({ kind, taskIds: [...new Set(ids)], projectIds: [...new Set(ids.map(id => byId.get(id)!.projectId))], message });
  }
  for (const e of scheduled) {
    for (const id of e.technicalPredecessors) if (entries.get(id)!.finish > e.start) conflict('dependency', [id, e.id], `${id} finishes after ${e.id}'s fixed start`);
  }
  if (calendar) for (const t of tasks) {
    if (!t.locked || t.status==='completed' || t.durationMode==='elapsed' || t.goodCase===0) continue;
    const required=duration(t);
    if (calendar.effortBetween(t.resource,Math.max(plan.asOf,t.locked.start),t.locked.finish)+1e-9 < required)
      conflict('calendar',[t.id],`${t.id} has insufficient working availability inside its fixed interval`);
  }
  for (const resource of plan.resources) {
    const occupants = scheduled.filter(e => e.resource === resource && e.finish > e.start);
    const times = [...new Set(occupants.flatMap(e => [e.start, e.finish]))].sort((a,b) => a-b);
    for (const time of times) {
      const active = occupants.filter(e => e.start <= time && e.finish > time);
      if (active.reduce((sum,e) => sum+e.allocationPercent,0) > 100 + 1e-9) conflict('resource', active.map(e=>e.id), `${resource} exceeds 100% allocation at day ${time}`);
    }
  }
  // Resource links at dispatch boundaries capture cross-project capacity releases.
  for (const e of scheduled) {
    if (e.status === 'completed' || e.locked || e.start === plan.asOf || e.start === e.finish || e.allocationPercent===0) continue;
    const releases = scheduled.filter(p => p.id !== e.id && p.resource === e.resource && p.start < p.finish && p.finish <= e.start && p.allocationPercent > 0 && (calendar ? calendar.nextWorking(e.resource,p.finish) <= e.start+1e-9 && calendar.nextWorking(e.resource,p.finish) >= e.start-1e-9 : p.finish === e.start));
    const priorLoad = scheduled.filter(p => p.id !== e.id && p.resource === e.resource && p.start < e.start && (p.finish >= e.start || releases.includes(p))).reduce((sum,p)=>sum+p.allocationPercent,0);
    if (priorLoad + e.allocationPercent <= 100 + 1e-9) continue;
    const links = releases.map(p => p.id);
    entries.set(e.id, { ...e, resourcePredecessors: links });
  }
  function chainTo(id: string, seen = new Set<string>()): string[] {
    if (seen.has(id)) return []; // conflicts can make the augmented graph cyclic; retain warnings
    const e = entries.get(id)!;
    const candidates = [...e.technicalPredecessors, ...e.resourcePredecessors].filter(p => entries.get(p)!.finish <= e.start);
    candidates.sort((a,b) => entries.get(b)!.finish - entries.get(a)!.finish);
    return [...(candidates[0] ? chainTo(candidates[0], new Set([...seen,id])) : []), id];
  }
  const affected = new Set(conflicts.flatMap(c => c.kind === 'dependency' ? [c.taskIds[c.taskIds.length-1]!] : c.taskIds));
  let changed = true;
  while (changed) { changed = false; for (const e of entries.values()) if (!affected.has(e.id) && [...e.technicalPredecessors,...e.resourcePredecessors].some(id=>affected.has(id))) { affected.add(e.id); changed=true; } }
  const projects = plan.projects.map(p => {
    const own = p.tasks.map(t => entries.get(t.id)!);
    own.sort((a,b) => b.finish-a.finish || (calendar ? Number(b.start===b.finish)-Number(a.start===a.finish) : 0));
    const completion = own[0]?.finish ?? plan.asOf;
    const forecastDate = calendar ? (own[0]?.start===own[0]?.finish || own.length===0 ? calendar.date : calendar.completionDate) : undefined;
    const criticalChain = own[0] ? chainTo(own[0].id) : [];
    // Fixed appointments reset the completion anchor. Prior uncertainty is a deadline risk,
    // not permission to move the appointment. Only subsequent uncertain work shifts completion.
    let anchor = plan.asOf, mean = 0, variance = 0;
    for (const id of criticalChain) {
      const e = entries.get(id)!, t = byId.get(id)!;
      if (e.locked || e.status === 'completed') { anchor = e.finish; mean = 0; variance = 0; continue; }
      const estimates = t.status === 'active' ? t.remaining! : t;
      if (estimates.goodCase === 0) continue;
      const moments = fitTaskLognormal(estimates.goodCase, estimates.poorCase), fraction = t.durationMode === 'elapsed' ? 1 : e.allocationPercent / 100;
      mean += moments.mean/fraction; variance += moments.variance/(fraction*fraction);
    }
    // Preserve idle gaps after the last fixed anchor, including resource availability gaps.
    const suffix = criticalChain.slice(Math.max(-1, ...criticalChain.map((id,i)=> {const e=entries.get(id)!;return e.locked||e.status==='completed'?i:-1;}))+1);
    const suffixDuration = suffix.reduce((sum,id)=>sum+entries.get(id)!.finish-entries.get(id)!.start,0);
    const offset = Math.max(anchor, completion-suffixDuration);
    const sigmaSquared = mean === 0 ? 0 : Math.log1p((variance/mean)/mean);
    const quantile = (z:number) => {
      const effort = mean===0 ? 0 : variance===0 ? mean : Math.exp(Math.log(mean)-sigmaSquared/2+Math.sqrt(sigmaSquared)*z);
      if (!calendar) return offset+effort;
      // Distribute the aggregate chain quantile by task expected effort, then traverse
      // each resource calendar. This stays deterministic; alternate chains are not sampled.
      let finish=anchor, priorBaseline=anchor;
      for (const id of suffix) {
        const e=entries.get(id)!, t=byId.get(id)!;
        const estimates=t.status==='active'?t.remaining!:t;
        const baselineReady=t.durationMode==='elapsed'||estimates.goodCase===0 ? priorBaseline : calendar.nextWorking(t.resource,priorBaseline);
        const gap=Math.max(0,e.start-baselineReady);
        finish+=gap;
        if (estimates.goodCase>0) {
          const moments=fitTaskLognormal(estimates.goodCase,estimates.poorCase);
          const fraction=t.durationMode==='elapsed'?1:e.allocationPercent/100;
          finish=taskFinish(t,finish,mean===0?0:effort*(moments.mean/fraction)/mean);
        }
        priorBaseline=e.finish;
      }
      return finish;
    };
    const completionPercentiles = { p50:quantile(0), p80:quantile(.8416212335729143), p95:quantile(1.6448536269514722), p98:quantile(2.0537489106318225), p99:quantile(2.3263478740408408) };
    if (!Object.values(completionPercentiles).every(Number.isFinite)) throw new Error('Portfolio forecast exceeds numeric range');
    return { ...p, forecast: { scheduleVersionId: plan.versionId, feasible: !p.tasks.some(t=>affected.has(t.id)), deterministicCompletion: completion, criticalChain,
      completionPercentiles,
      ...(calendar ? { completionDates: { deterministic:forecastDate!(completion),p50:forecastDate!(completionPercentiles.p50),p80:forecastDate!(completionPercentiles.p80),p95:forecastDate!(completionPercentiles.p95),p98:forecastDate!(completionPercentiles.p98),p99:forecastDate!(completionPercentiles.p99) } } : {}),
      staleTaskIds: p.tasks.filter(t=>t.status==='active'&&t.remaining?.estimateStatus==='stale').map(t=>t.id) } };
  });
  const previousVersions = previous ? structuredClone([...previous.previousVersions, { plan:previous.plan,tasks:previous.tasks,conflicts:previous.conflicts,projects:previous.projects }]) : [];
  return { plan, tasks:[...entries.values()],conflicts,projects,previousVersions,deadlineReport:assessDeadlines({plan,tasks:[...entries.values()],conflicts,projects}),
    forecastMethod:'fixed-critical-chain-lognormal-moment-matching',
    assumptions:['Independent task durations; fixed baseline cross-project critical chain', 'Allocation scales duration inversely; tasks run without preemption', 'Locked start/finish are fixed anchors; percentiles are conditional on meeting commitments', 'Infeasible forecasts are diagnostic, not achievable commitments; alternate chains are not simulated', ...(calendar ? ['Daily resource capacity calendars; dates are date-only, not clock-time shifts', 'Calendar percentile dates are approximate: aggregate fixed-chain quantiles distributed by task expected effort'] : ['No resource calendars applied'])] };
}

/** Compare saved runs without recalculating or changing either version. */
export function comparePortfolioVersions(current: PortfolioVersion, whatIf: PortfolioVersion) {
  if (current.plan.id !== whatIf.plan.id || current.plan.asOf !== whatIf.plan.asOf || current.plan.calendar?.startDate !== whatIf.plan.calendar?.startDate) throw new Error('Compare the same portfolio at the same asOf day and calendar origin');
  return {
    portfolioId: current.plan.id, currentVersionId: current.plan.versionId, whatIfVersionId: whatIf.plan.versionId,
    projects: whatIf.projects.map(p => {
      const before = current.projects.find(c => c.id === p.id)?.forecast;
      const differences = before ? Object.fromEntries(Object.entries(p.forecast.completionPercentiles).map(([key,value]) => [key,value-before.completionPercentiles[key as keyof typeof before.completionPercentiles]])) : null;
      return { projectId:p.id, current:before ?? null, whatIf:p.forecast, percentileDifferences:differences };
    }),
    taskChanges: whatIf.tasks.flatMap(t => {
      const before = current.tasks.find(c => c.id === t.id);
      return !before || before.start !== t.start || before.finish !== t.finish || before.resource !== t.resource || before.allocationPercent !== t.allocationPercent ? [{ taskId:t.id, current:before ?? null, whatIf:t }] : [];
    }),
    removedTaskIds: current.tasks.filter(t=>!whatIf.tasks.some(w=>w.id===t.id)).map(t=>t.id),
    removedProjectIds: current.projects.filter(p=>!whatIf.projects.some(w=>w.id===p.id)).map(p=>p.id),
  };
}
