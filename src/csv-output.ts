import type { Schedule, Task } from "./types.js";
import { compareProjects } from "./compare.js";
import { scheduleProject } from "./scheduler.js";

const decimal = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function textCell(value: string): string {
  // Keep user-entered names/IDs as text when opened in spreadsheet software.
  const text = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
}

export function scheduleToCsv(schedule: Schedule, tasks: readonly Task[]): string {
  const names = new Map(tasks.map(task => [task.id, task.name]));
  const chain = new Set(schedule.criticalChain);
  const rows = ["ID,Task,Resource,P50 duration,Start,Finish,Critical Chain"];
  for (const task of schedule.tasks) {
    const name = names.get(task.id);
    if (name === undefined) throw new Error(`Missing task name for ${task.id}`);
    rows.push([
      textCell(task.id), textCell(name), textCell(task.resource),
      decimal.format(task.duration), decimal.format(task.start), decimal.format(task.finish),
      chain.has(task.id) ? "Yes" : "No",
    ].join(","));
  }
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

/** Excel report with a project summary followed by all task timings. */
export function comparisonToCsv(currentTasks: readonly Task[], whatIfTasks: readonly Task[]): string {
  const comparison = compareProjects(currentTasks, whatIfTasks);
  const current = scheduleProject(currentTasks);
  const whatIf = scheduleProject(whatIfTasks);
  const currentById = new Map(currentTasks.map(task => [task.id, task]));
  const whatIfById = new Map(whatIfTasks.map(task => [task.id, task]));
  const alternativeTimings = new Map(whatIf.tasks.map(task => [task.id, task]));
  const rows = [
    "Metric,Current State,What-If,Difference",
    `Project P50,${decimal.format(current.projectP50)},${decimal.format(whatIf.projectP50)},${decimal.format(comparison.impactDays)}`,
    ["Critical Chain", textCell(current.criticalChain.join(" -> ")), textCell(whatIf.criticalChain.join(" -> ")), ""].join(","),
    "",
    "ID,Current Task,What-If Task,Current Resource,What-If Resource,Current P50,What-If P50,Current Start,Current Finish,What-If Start,What-If Finish,Start Difference,Finish Difference,Current Critical Chain,What-If Critical Chain",
  ];
  const currentChain = new Set(current.criticalChain);
  const whatIfChain = new Set(whatIf.criticalChain);
  for (const task of current.tasks) {
    const alternative = alternativeTimings.get(task.id)!;
    rows.push([
      textCell(task.id), textCell(currentById.get(task.id)!.name), textCell(whatIfById.get(task.id)!.name),
      textCell(task.resource), textCell(alternative.resource),
      ...[task.duration, alternative.duration, task.start, task.finish, alternative.start, alternative.finish,
        alternative.start - task.start, alternative.finish - task.finish].map(value => decimal.format(value)),
      currentChain.has(task.id) ? "Yes" : "No", whatIfChain.has(task.id) ? "Yes" : "No",
    ].join(","));
  }
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}
