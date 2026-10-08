import { scheduleProject } from "../src/scheduler.js";
import type { Task } from "../src/types.js";

export const scenario1: readonly Task[] = [
  { id: "A", name: "Architecture", resource: "Architect", dependsOn: [], goodCase: 1, poorCase: 9, priority: 1 },
  { id: "B", name: "Build API", resource: "Developer 1", dependsOn: ["A"], goodCase: 3, poorCase: 12, priority: 2 },
  { id: "C", name: "Build UI", resource: "Developer 2", dependsOn: ["A"], goodCase: 4, poorCase: 9, priority: 3 },
  { id: "D", name: "Integration Module", resource: "Developer 1", dependsOn: ["A"], goodCase: 2, poorCase: 8, priority: 4 },
  { id: "E", name: "API Tests", resource: "QA", dependsOn: ["B"], goodCase: 1, poorCase: 4, priority: 5 },
  { id: "F", name: "Integration Tests", resource: "QA", dependsOn: ["C", "D", "E"], goodCase: 2, poorCase: 8, priority: 6 },
  { id: "G", name: "Security Review", resource: "Security", dependsOn: ["F"], goodCase: 1, poorCase: 4, priority: 7 },
  { id: "H", name: "Release Candidate", resource: "DevOps", dependsOn: ["G"], goodCase: 0.5, poorCase: 2, priority: 8 },
];

export function dBeforeB(tasks: readonly Task[]): Task[] {
  return tasks.map(task => ({
    ...task,
    dependsOn: [...task.dependsOn],
    priority: task.id === "D" ? 2 : task.id === "B" ? 4 : task.priority,
  }));
}

// Imports supply the acceptance fixture without running the demo.
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const current = scheduleProject(scenario1);
  const whatIf = scheduleProject(dBeforeB(scenario1));
  console.table(current.tasks.map(({ id, duration, start, finish }) => ({ id, duration, start, finish })));
  console.log(`Critical Chain: ${current.criticalChain.join(" -> ")}`);
  console.log(`Current State P50: ${current.projectP50} days`);
  console.log(`D-before-B What-If P50: ${whatIf.projectP50} days`);
  console.log(`Impact: +${whatIf.projectP50 - current.projectP50} days`);
}
