import type { RemainingEstimate, Task, TaskActuals } from "./types.js";
import { calculateP50 } from "./duration.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the JSON boundary before handing tasks to the typed scheduler. */
export function parseProject(value: unknown): Task[] {
  if (!isObject(value) || !Array.isArray(value.tasks)) {
    throw new Error('Project must be an object with a "tasks" array');
  }
  return value.tasks.map((item: unknown, index: number): Task => {
    const label = `tasks[${index}]`;
    if (!isObject(item)) throw new Error(`${label} must be an object`);
    for (const field of ["id", "name", "resource"] as const) {
      if (typeof item[field] !== "string" || !item[field].trim()) {
        throw new Error(`${label}.${field} must be a nonempty string`);
      }
    }
    for (const field of ["goodCase", "poorCase", "priority"] as const) {
      if (typeof item[field] !== "number" || !Number.isFinite(item[field])) {
        throw new Error(`${label}.${field} must be a finite number`);
      }
    }
    if (!Array.isArray(item.dependsOn)
        || !item.dependsOn.every((id: unknown) => typeof id === "string" && id.trim().length > 0)) {
      throw new Error(`${label}.dependsOn must be an array of nonempty strings`);
    }
    let status: Task["status"];
    if (item.status !== undefined) {
      if (item.status !== "planned" && item.status !== "active" && item.status !== "completed") {
        throw new Error(`${label}.status must be planned, active, or completed`);
      }
      status = item.status;
    }
    let remaining: RemainingEstimate | undefined;
    if (item.remaining !== undefined) {
      const value = item.remaining;
      if (!isObject(value) || typeof value.goodCase !== "number" || typeof value.poorCase !== "number"
          || (value.estimateStatus !== "current" && value.estimateStatus !== "stale")) {
        throw new Error(`${label}.remaining requires numeric goodCase/poorCase and current/stale estimateStatus`);
      }
      calculateP50(value.goodCase, value.poorCase);
      remaining = { goodCase: value.goodCase, poorCase: value.poorCase, estimateStatus: value.estimateStatus };
    }
    let actuals: TaskActuals | undefined;
    if (item.actuals !== undefined) {
      const value = item.actuals;
      if (!isObject(value) || typeof value.start !== "number" || !Number.isFinite(value.start)
          || typeof value.finish !== "number" || !Number.isFinite(value.finish)
          || value.start < 0 || value.finish < value.start) {
        throw new Error(`${label}.actuals requires finite start/finish with 0 <= start <= finish`);
      }
      actuals = { start: value.start, finish: value.finish };
    }
    return {
      id: item.id as string,
      name: item.name as string,
      resource: item.resource as string,
      goodCase: item.goodCase as number,
      poorCase: item.poorCase as number,
      priority: item.priority as number,
      dependsOn: [...item.dependsOn] as string[],
      ...(status === undefined ? {} : { status }),
      ...(remaining === undefined ? {} : { remaining }),
      ...(actuals === undefined ? {} : { actuals }),
    };
  });
}
