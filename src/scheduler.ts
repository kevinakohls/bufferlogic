import { calculateP50 } from "./duration.js";
import type { Schedule, ScheduledTask, Task } from "./types.js";

function validateTasks(tasks: readonly Task[]): void {
  const byId = new Map<string, Task>();
  for (const task of tasks) {
    if (!task.id.trim() || !task.name.trim() || !task.resource.trim()) {
      throw new Error("Task id, name, and resource must be nonempty");
    }
    if (byId.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
    if (!Number.isFinite(task.priority)) throw new Error(`Invalid priority: ${task.id}`);
    calculateP50(task.goodCase, task.poorCase);
    byId.set(task.id, task);
  }
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!byId.has(dependency)) {
        throw new Error(`Task ${task.id} references missing dependency ${dependency}`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(task: Task): void {
    if (visiting.has(task.id)) throw new Error(`Dependency cycle at ${task.id}`);
    if (visited.has(task.id)) return;
    visiting.add(task.id);
    for (const dependency of task.dependsOn) visit(byId.get(dependency)!);
    visiting.delete(task.id);
    visited.add(task.id);
  }
  for (const task of tasks) visit(task);
}

/** Full-project baseline P50 schedule; lifecycle/actuals metadata is retained in input. */
export function scheduleProject(tasks: readonly Task[]): Schedule {
  validateTasks(tasks);
  // Sort a copy: current management order must never be rewritten by scheduling.
  const pending = [...tasks].sort((a, b) => a.priority - b.priority);
  const scheduled: ScheduledTask[] = [];
  const byId = new Map<string, ScheduledTask>();
  const lastByResource = new Map<string, ScheduledTask>();
  let time = 0;

  while (pending.length > 0) {
    for (let index = 0; index < pending.length;) {
      const task = pending[index]!;
      const previous = lastByResource.get(task.resource);
      const eligible = task.dependsOn.every(id => {
        const predecessor = byId.get(id);
        return predecessor !== undefined && predecessor.finish <= time;
      });
      if (!eligible || (previous !== undefined && previous.finish > time)) {
        index++;
        continue;
      }
      const duration = calculateP50(task.goodCase, task.poorCase);
      const finish = time + duration;
      if (!Number.isFinite(finish) || finish <= time) {
        throw new Error(`Schedule time exceeds numeric precision for task ${task.id}`);
      }
      const entry: ScheduledTask = {
        id: task.id,
        resource: task.resource,
        duration,
        start: time,
        finish,
        technicalPredecessors: [...task.dependsOn],
        ...(previous === undefined ? {} : { resourcePredecessor: previous.id }),
      };
      scheduled.push(entry);
      byId.set(task.id, entry);
      lastByResource.set(task.resource, entry);
      pending.splice(index, 1);
    }
    if (pending.length > 0) {
      const futureFinishes = scheduled.filter(task => task.finish > time).map(task => task.finish);
      if (futureFinishes.length === 0) throw new Error("Unable to advance schedule");
      time = Math.min(...futureFinishes);
    }
  }

  // Backtrack the longest path through the augmented technical + resource graph.
  // Equal-length chains use dispatch order, yielding one reproducible chain.
  const dispatchOrder = new Map(scheduled.map((task, index) => [task.id, index]));
  function latest(candidates: readonly ScheduledTask[]): ScheduledTask | undefined {
    return [...candidates].sort((a, b) =>
      b.finish - a.finish || dispatchOrder.get(a.id)! - dispatchOrder.get(b.id)!
    )[0];
  }
  let controlling = latest(scheduled);
  const projectP50 = controlling?.finish ?? 0;
  const criticalChain: string[] = [];
  while (controlling !== undefined) {
    criticalChain.push(controlling.id);
    const predecessors: string[] = [...controlling.technicalPredecessors];
    if (controlling.resourcePredecessor !== undefined) {
      predecessors.push(controlling.resourcePredecessor);
    }
    controlling = latest(predecessors.map(id => byId.get(id)!));
  }
  criticalChain.reverse();
  return { tasks: scheduled, projectP50, criticalChain };
}
