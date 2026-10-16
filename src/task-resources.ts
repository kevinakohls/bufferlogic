import {createCalendar, parseDate, type CalendarSettings} from './resource-calendars.js';

export interface ResourceAssignment {
  readonly resource: string;
  readonly allocationPercent: number;
}
interface AssignedWork {
  readonly resource: string;
  readonly allocationPercent?: number;
  readonly supportingResources?: readonly ResourceAssignment[];
  readonly durationMode?: string;
}
/** Primary and supporting reservations; elapsed waiting consumes no capacity. */
export function taskAssignments(task: AssignedWork): ResourceAssignment[] {
  const assignments = [{resource: task.resource, allocationPercent: task.allocationPercent ?? 100}, ...(task.supportingResources ?? [])];
  return task.durationMode === 'elapsed' || task.allocationPercent === 0
    ? assignments.map(a => ({...a, allocationPercent: 0})) : assignments;
}
/** A task works only on common availability. Allocations never scale supporting duration. */
export function taskCalendarSettings(settings: CalendarSettings, task: AssignedWork): CalendarSettings {
  if (!task.supportingResources?.length) return settings;
  const ids = taskAssignments(task).map(a => a.resource);
  const calendars = ids.map(id => {
    const found = settings.resources.find(c => c.resource === id);
    if (!found) throw new Error(`Missing resource calendar: ${id}`);
    return found;
  });
  const weeklyHours = Array.from({length:7}, (_,day) => Math.min(...calendars.map(c => c.weeklyHours[day]!)));
  const dates = new Set(calendars.flatMap(c => Object.keys(c.exceptions)));
  const exceptions = Object.fromEntries([...dates].map(date => {
    const weekday = (new Date(parseDate(date)).getUTCDay()+6)%7;
    return [date, Math.min(...calendars.map(c => c.exceptions[date] ?? c.weeklyHours[weekday]!))];
  }));
  return {...settings, resources:[{resource:task.resource, weeklyHours, exceptions}]};
}
export function createTaskCalendar(settings: CalendarSettings, task: AssignedWork) {
  return createCalendar(taskCalendarSettings(settings,task));
}
