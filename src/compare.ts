import { scheduleProject } from "./scheduler.js";
import type { Task } from "./types.js";

/** Compare two full-project scenarios, matching task timings by ID. */
export function compareProjects(currentTasks: readonly Task[], whatIfTasks: readonly Task[]) {
  const current = scheduleProject(currentTasks);
  const whatIf = scheduleProject(whatIfTasks);
  const whatIfById = new Map(whatIf.tasks.map(task => [task.id, task]));
  if (current.tasks.length !== whatIf.tasks.length
      || current.tasks.some(task => !whatIfById.has(task.id))) {
    throw new Error("Scenarios must contain the same task IDs for comparison");
  }
  const taskChanges = current.tasks.flatMap(task => {
    const alternative = whatIfById.get(task.id)!;
    if (task.start === alternative.start && task.finish === alternative.finish) return [];
    return [{
      id: task.id,
      currentState: { start: task.start, finish: task.finish },
      whatIf: { start: alternative.start, finish: alternative.finish },
      startDifference: alternative.start - task.start,
      finishDifference: alternative.finish - task.finish,
    }];
  });
  return {
    currentState: { projectP50: current.projectP50, criticalChain: current.criticalChain },
    whatIf: { projectP50: whatIf.projectP50, criticalChain: whatIf.criticalChain },
    impactDays: whatIf.projectP50 - current.projectP50,
    taskChanges,
  };
}
