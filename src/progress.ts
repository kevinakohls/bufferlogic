import { calculateP50 } from "./duration.js";
import { parseProject } from "./project-input.js";
import { estimateProjectPercentiles } from "./percentiles.js";
import { planningDays } from "./planning-days.js";
import { scheduleProject, validateTasks } from "./scheduler.js";
import type { Task } from "./types.js";

export interface ProgressSnapshot {
  readonly asOf: number;
  readonly tasks: readonly Task[];
}

export function parseProgressSnapshot(value: unknown): ProgressSnapshot {
  if (typeof value !== "object" || value === null || !("asOf" in value)
      || typeof value.asOf !== "number" || !Number.isFinite(value.asOf) || value.asOf < 0) {
    throw new Error("Snapshot requires a finite, nonnegative asOf day");
  }
  return { asOf: value.asOf, tasks: parseProject(value) };
}

function remainingTasks(snapshot: ProgressSnapshot): Task[] {
  if (!Number.isFinite(snapshot.asOf) || snapshot.asOf < 0) throw new Error("Invalid asOf day");
  validateTasks(snapshot.tasks);
  const byId = new Map(snapshot.tasks.map(task => [task.id, task]));
  const activeResources = new Map<string, Task>();
  const completedByResource = new Map<string, Task[]>();
  for (const task of snapshot.tasks) {
    const status = task.status ?? "planned";
    if (!["planned", "active", "completed"].includes(status)) throw new Error(`Invalid status for ${task.id}`);
    if (status === "completed") {
      const actuals = task.actuals;
      if (!actuals || !Number.isFinite(actuals.start) || !Number.isFinite(actuals.finish)
          || actuals.start < 0 || actuals.finish < actuals.start || actuals.finish > snapshot.asOf) {
        throw new Error(`Completed task ${task.id} requires valid actuals finishing by asOf`);
      }
      for (const id of task.dependsOn) {
        const predecessor = byId.get(id)!;
        if (predecessor.status !== "completed" || !predecessor.actuals || predecessor.actuals.finish > actuals.start) {
          throw new Error(`Completed task ${task.id} has inconsistent predecessor actuals: ${id}`);
        }
      }
      const group = completedByResource.get(task.resource) ?? [];
      group.push(task);
      completedByResource.set(task.resource, group);
    } else {
      if (task.actuals !== undefined) throw new Error(`Unfinished task ${task.id} cannot have completed actuals`);
      if (status === "active") {
        if (!task.remaining || !["current", "stale"].includes(task.remaining.estimateStatus)) {
          throw new Error(`Active task ${task.id} requires explicit remaining estimates and estimateStatus`);
        }
        calculateP50(task.remaining.goodCase, task.remaining.poorCase);
        if (activeResources.has(task.resource)) throw new Error(`Multiple active tasks on resource ${task.resource}`);
        if (task.dependsOn.some(id => byId.get(id)!.status !== "completed")) {
          throw new Error(`Active task ${task.id} has an unfinished predecessor`);
        }
        activeResources.set(task.resource, task);
      }
    }
  }
  for (const group of completedByResource.values()) {
    const intervals = group.filter(task => task.actuals!.finish > task.actuals!.start).sort((a, b) => a.actuals!.start - b.actuals!.start);
    for (let index = 1; index < intervals.length; index++) {
      if (intervals[index]!.actuals!.start < intervals[index - 1]!.actuals!.finish) {
        throw new Error(`Completed actuals overlap on resource ${intervals[index]!.resource}`);
      }
    }
  }
  return snapshot.tasks.filter(task => task.status !== "completed").map(task => {
    const estimates = task.status === "active" ? task.remaining! : task;
    const dependsOn = task.dependsOn.filter(id => byId.get(id)!.status !== "completed");
    const active = activeResources.get(task.resource);
    // Explicitly reserve active resources without silently reordering planned work.
    if (active && active.id !== task.id && !dependsOn.includes(active.id)) dependsOn.push(active.id);
    return { ...task, goodCase: estimates.goodCase, poorCase: estimates.poorCase, dependsOn };
  });
}

export function forecastProgress(snapshot: ProgressSnapshot) {
  const effectiveTasks = remainingTasks(snapshot);
  const schedule = scheduleProject(effectiveTasks);
  const estimates = estimateProjectPercentiles(effectiveTasks);
  const byId = new Map(snapshot.tasks.map(task => [task.id, task]));
  const completedTasks = snapshot.tasks.filter(task => task.status === "completed").map(task => ({
    ...task, dependsOn: [...task.dependsOn], actuals: { ...task.actuals! },
    ...(task.remaining === undefined ? {} : { remaining: { ...task.remaining } }),
  }));
  const allCompleted = effectiveTasks.length === 0;
  const completionOrigin = allCompleted && completedTasks.length > 0
    ? Math.max(...completedTasks.map(task => task.actuals.finish)) : snapshot.asOf;
  const atCompletion = (duration: number) => {
    const value = completionOrigin + duration;
    if (!Number.isFinite(value) || (duration > 0 && value <= completionOrigin)) throw new Error("Completion time exceeds numeric precision");
    return value;
  };
  const remaining = estimates.projectPercentiles;
  const completionPercentiles = {
    p50: atCompletion(remaining.p50), p80: atCompletion(remaining.p80),
    p95: atCompletion(remaining.p95), p98: atCompletion(remaining.p98), p99: atCompletion(remaining.p99),
  };
  return {
    asOf: snapshot.asOf,
    projectStatus: allCompleted ? "completed" as const : "in-progress" as const,
    deterministicRemainingDuration: schedule.projectP50,
    deterministicCompletionDay: atCompletion(schedule.projectP50),
    remainingCriticalChain: schedule.criticalChain,
    tasks: schedule.tasks.map(task => {
      const source = byId.get(task.id)!;
      return {
        ...task,
        name: source.name,
        status: source.status ?? "planned",
        // The added reservation edge is a resource rule, not a technical dependency.
        technicalPredecessors: task.technicalPredecessors.filter(id => source.dependsOn.includes(id)),
        remainingP50: task.duration,
        start: atCompletion(task.start), finish: atCompletion(task.finish),
        ...(source.remaining === undefined ? {} : { remaining: { ...source.remaining } }),
      };
    }),
    completedTasks,
    staleTaskIds: snapshot.tasks.filter(task => task.status === "active" && task.remaining?.estimateStatus === "stale").map(task => task.id),
    remainingPercentileEstimates: estimates,
    completionPercentiles,
    wholeDayCompletion: {
      p50: planningDays(completionPercentiles.p50), p80: planningDays(completionPercentiles.p80),
      p95: planningDays(completionPercentiles.p95), p98: planningDays(completionPercentiles.p98), p99: planningDays(completionPercentiles.p99),
    },
  };
}

export function compareProgress(current: ProgressSnapshot, whatIf: ProgressSnapshot) {
  if (current.asOf !== whatIf.asOf) throw new Error("Progress comparisons require the same asOf day");
  if (current.tasks.length !== whatIf.tasks.length || current.tasks.some(task => !whatIf.tasks.some(other => other.id === task.id))) {
    throw new Error("Progress comparisons require the same task IDs");
  }
  const currentState = forecastProgress(current);
  const alternative = forecastProgress(whatIf);
  const change = (key: keyof typeof currentState.completionPercentiles) => alternative.completionPercentiles[key] - currentState.completionPercentiles[key];
  const dayChange = (key: keyof typeof currentState.completionPercentiles) => alternative.wholeDayCompletion[key] - currentState.wholeDayCompletion[key];
  return {
    asOf: current.asOf, currentState, whatIf: alternative,
    deterministicCompletionDifference: alternative.deterministicCompletionDay - currentState.deterministicCompletionDay,
    completionPercentileDifferences: { p50: change("p50"), p80: change("p80"), p95: change("p95"), p98: change("p98"), p99: change("p99") },
    wholeDayDifferences: { p50: dayChange("p50"), p80: dayChange("p80"), p95: dayChange("p95"), p98: dayChange("p98"), p99: dayChange("p99") },
  };
}
