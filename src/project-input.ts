import type { Task } from "./types.js";

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
    // Only baseline fields enter scheduling; additional metadata is allowed.
    return {
      id: item.id as string,
      name: item.name as string,
      resource: item.resource as string,
      goodCase: item.goodCase as number,
      poorCase: item.poorCase as number,
      priority: item.priority as number,
      dependsOn: [...item.dependsOn] as string[],
    };
  });
}
