import assert from "node:assert/strict";
import { test } from "node:test";
import { dBeforeB, scenario1 } from "../examples/scenario1.js";
import { scheduleProject } from "../src/scheduler.js";
import type { Schedule, Task } from "../src/types.js";

function timings(schedule: Schedule): Record<string, readonly number[]> {
  return Object.fromEntries(schedule.tasks.map(task => [task.id, [task.start, task.finish]]));
}

test("Scenario #1 has all expected P50 durations and the 20-day schedule", () => {
  const current = scheduleProject(scenario1);
  assert.deepEqual(Object.fromEntries(current.tasks.map(task => [task.id, task.duration])), {
    A: 3, B: 6, C: 6, D: 4, E: 2, F: 4, G: 2, H: 1,
  });
  assert.deepEqual(timings(current), {
    A: [0, 3], B: [3, 9], C: [3, 9], D: [9, 13],
    E: [9, 11], F: [13, 17], G: [17, 19], H: [19, 20],
  });
  assert.equal(current.projectP50, 20);
});

test("Critical Chain includes the B -> D resource edge", () => {
  const current = scheduleProject(scenario1);
  assert.deepEqual(current.criticalChain, ["A", "B", "D", "F", "G", "H"]);
  const d = current.tasks.find(task => task.id === "D")!;
  assert.equal(d.resourcePredecessor, "B");
  assert.deepEqual(d.technicalPredecessors, ["A"]);
});

test("D-before-B What-If gives 22 days, +2 impact, without mutating Current State", () => {
  const snapshot = structuredClone(scenario1);
  for (const task of scenario1) {
    Object.freeze(task.dependsOn);
    Object.freeze(task);
  }
  Object.freeze(scenario1);
  const current = scheduleProject(scenario1);
  const whatIfTasks = dBeforeB(scenario1);
  const whatIfSnapshot = structuredClone(whatIfTasks);
  const whatIf = scheduleProject(whatIfTasks);
  assert.deepEqual(timings(whatIf), {
    A: [0, 3], D: [3, 7], C: [3, 9], B: [7, 13],
    E: [13, 15], F: [15, 19], G: [19, 21], H: [21, 22],
  });
  assert.equal(whatIf.projectP50, 22);
  assert.equal(whatIf.projectP50 - current.projectP50, 2);
  assert.deepEqual(whatIf.criticalChain, ["A", "D", "B", "E", "F", "G", "H"]);
  assert.deepEqual(scenario1, snapshot);
  assert.deepEqual(whatIfTasks, whatIfSnapshot);
  assert.deepEqual(scheduleProject(scenario1), current);
});

function task(id: string, overrides: Partial<Task> = {}): Task {
  return { id, name: id, resource: id, dependsOn: [], goodCase: 1, poorCase: 1, priority: 1, ...overrides };
}

test("technical dependencies outrank priority and allow unrelated parallel work", () => {
  const result = scheduleProject([
    task("B", { dependsOn: ["A"], priority: 0 }),
    task("A", { goodCase: 2, poorCase: 2 }),
    task("C"),
  ]);
  assert.deepEqual(timings(result), { A: [0, 2], C: [0, 1], B: [2, 3] });
  assert.deepEqual(result.criticalChain, ["A", "B"]);
});

test("resource contention follows priority, runs without splitting, and forms a chain", () => {
  const result = scheduleProject([
    task("B", { resource: "Developer", priority: 2 }),
    task("A", { resource: "Developer", priority: 1, goodCase: 3, poorCase: 3 }),
  ]);
  assert.deepEqual(timings(result), { A: [0, 3], B: [3, 4] });
  assert.deepEqual(result.criticalChain, ["A", "B"]);
});

test("priority chooses eligible work without reserving resources for blocked tasks", () => {
  const result = scheduleProject([
    task("Blocked", { resource: "R", dependsOn: ["Predecessor"], priority: 0 }),
    task("Predecessor", { goodCase: 2, poorCase: 2 }),
    task("Ready", { resource: "R", goodCase: 4, poorCase: 4, priority: 2 }),
  ]);
  assert.deepEqual(timings(result), { Predecessor: [0, 2], Ready: [0, 4], Blocked: [4, 5] });
  assert.deepEqual(result.criticalChain, ["Ready", "Blocked"]);
});

test("equal priorities and equal controlling paths resolve by input/dispatch order", () => {
  assert.deepEqual(scheduleProject([task("B", { resource: "R" }), task("A", { resource: "R" })]).criticalChain, ["B", "A"]);
  assert.deepEqual(scheduleProject([task("B"), task("A")]).criticalChain, ["B"]);
});

test("missing dependency is rejected", () => {
  assert.throws(() => scheduleProject([task("A", { dependsOn: ["missing"] })]), /missing dependency/);
});

test("dependency cycles, including self-dependencies, are rejected", () => {
  assert.throws(() => scheduleProject([task("A", { dependsOn: ["B"] }), task("B", { dependsOn: ["A"] })]), /cycle/);
  assert.throws(() => scheduleProject([task("A", { dependsOn: ["A"] })]), /cycle/);
});

test("duplicate IDs, invalid priorities, blank fields, and invalid durations are rejected", () => {
  assert.throws(() => scheduleProject([task("A"), task("A")]), /Duplicate/);
  assert.throws(() => scheduleProject([task("A", { priority: NaN })]), /priority/);
  for (const overrides of [{ id: " " }, { name: " " }, { resource: " " }]) {
    assert.throws(() => scheduleProject([task("A", overrides)]), /nonempty/);
  }
  assert.throws(() => scheduleProject([task("A", { goodCase: 0 })]), /greater than zero/);
});

test("empty project has zero duration and an empty chain", () => {
  assert.deepEqual(scheduleProject([]), { tasks: [], projectP50: 0, criticalChain: [] });
});

test("completed-task actuals remain available and unchanged", () => {
  const completed = task("A", { status: "completed", actuals: { start: 0, finish: 1.5 } });
  const snapshot = structuredClone(completed);
  scheduleProject([completed]);
  assert.deepEqual(completed, snapshot);
});
