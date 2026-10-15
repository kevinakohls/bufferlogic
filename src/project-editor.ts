import { parsePortfolio, type PortfolioPlan } from './portfolio.js';
import { parseDate, todayDate } from './resource-calendars.js';

/** Append a blank project without replacing the existing portfolio or its calendar. */
export function createBlankProject(name: string, existing?: PortfolioPlan, startDate = todayDate(), timeZone?: string): PortfolioPlan {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Give the new project a name');
  const base: PortfolioPlan = existing ? parsePortfolio(existing) : {
    id: 'workspace', versionId: 'workspace-v1', asOf: 0,
    settings: {durationUnit: 'days'}, resources: [], projects: [],
    calendar: {startDate, ...(timeZone === undefined ? {} : {timeZone}), hoursPerWorkday: 8, resources: []},
  };
  if (!existing) parseDate(startDate);
  const ids = new Set(base.projects.map(project => project.id));
  let number = 1;
  while (ids.has(`P${number}`)) number++;
  return parsePortfolio({...base, approvalStatus: 'draft', versionId: `${base.versionId}-project`,
    projects: [...base.projects, {id: `P${number}`, name: name.trim(), tasks: []}]});
}

export interface NewTask {
  readonly projectId: string;
  readonly name: string;
  readonly resource: string;
  readonly goodCase: number;
  readonly poorCase: number;
  readonly dependsOn: readonly string[];
}

/** Generate a globally unique ID and append a planned task after the project's current tasks. */
export function appendTask(input: PortfolioPlan, task: NewTask): PortfolioPlan {
  const plan = parsePortfolio(input);
  const project = plan.projects.find(project => project.id === task.projectId);
  if (!project) throw new Error('Choose a project for the task');
  if (typeof task.name !== 'string' || !task.name.trim()) throw new Error('Give the task a name');
  if (!Number.isFinite(task.goodCase) || !Number.isFinite(task.poorCase) || task.goodCase < 0 || task.poorCase < task.goodCase
      || (task.goodCase === 0 && task.poorCase !== 0)) throw new Error('Good and poor estimates must be positive with poor days at least good days, or both zero for a milestone');
  if (task.resource !== '' && !plan.resources.includes(task.resource)) throw new Error('Choose an existing resource or leave the task unassigned');
  const ids = new Set(plan.projects.flatMap(project => project.tasks.map(task => task.id)));
  if (!Array.isArray(task.dependsOn) || new Set(task.dependsOn).size !== task.dependsOn.length
      || task.dependsOn.some(id => !ids.has(id))) throw new Error('Dependencies must be unique existing task IDs');
  let number = 1;
  while (ids.has(`${project.id}-T${String(number).padStart(3, '0')}`)) number++;
  const id = `${project.id}-T${String(number).padStart(3, '0')}`;
  const priority = Math.max(0, ...project.tasks.map(task => task.priority)) + 1;
  return parsePortfolio({...plan, approvalStatus: 'draft', versionId: `${plan.versionId}-task`,
    projects: plan.projects.map(p => p.id !== project.id ? p : {...p, tasks: [...p.tasks, {
      ...task, id, name: task.name.trim(), priority, status: 'planned', allocationPercent: 100, durationMode: 'working',
    }]})});
}
