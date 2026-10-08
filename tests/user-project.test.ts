import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseProject } from "../src/project-input.js";
import { scheduleProject } from "../src/scheduler.js";
import type { Schedule } from "../src/types.js";

function loadScenario(file: string) {
  // Read the committed JSON fixtures, not duplicate task definitions in tests.
  return parseProject(JSON.parse(readFileSync(new URL(`../../examples/${file}`, import.meta.url), "utf8")));
}

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-10, `Expected ${expected}, received ${actual}`);
}

function checkTimings(schedule: Schedule, expected: Record<string, readonly [number, number]>): void {
  assert.equal(schedule.tasks.length, Object.keys(expected).length);
  for (const [id, [start, finish]] of Object.entries(expected)) {
    const task = schedule.tasks.find(task => task.id === id);
    assert.ok(task, `Missing task ${id}`);
    close(task.start, start);
    close(task.finish, finish);
  }
}

test("reviewed original project: parallel builds, 14.755-day P50, A-B-D-E chain", () => {
  const schedule = scheduleProject(loadScenario("user-project.json"));
  close(schedule.projectP50, 14.755142442581029);
  assert.deepEqual(schedule.criticalChain, ["A", "B", "D", "E"]);
  checkTimings(schedule, {
    A: [0, 2.8284271247461903],
    B: [2.8284271247461903, 8.305652699797852],
    C: [2.8284271247461903, 5.656854249492381],
    D: [8.305652699797852, 10.755142442581029],
    E: [10.755142442581029, 14.755142442581029],
  });
  assert.equal(schedule.tasks.find(task => task.id === "D")!.resourcePredecessor, "B");
});

test("reviewed D-before-B scenario changes the chain with zero completion impact", () => {
  const currentTasks = loadScenario("user-project.json");
  const whatIfTasks = loadScenario("user-project-what-if.json");
  const before = structuredClone(currentTasks);
  const current = scheduleProject(currentTasks);
  const whatIf = scheduleProject(whatIfTasks);
  close(whatIf.projectP50, 14.755142442581029);
  close(whatIf.projectP50 - current.projectP50, 0);
  assert.deepEqual(whatIf.criticalChain, ["A", "D", "B", "E"]);
  checkTimings(whatIf, {
    A: [0, 2.8284271247461903],
    D: [2.8284271247461903, 5.277916867529369],
    C: [2.8284271247461903, 5.656854249492381],
    B: [5.277916867529369, 10.755142442581029],
    E: [10.755142442581029, 14.755142442581029],
  });
  assert.equal(whatIf.tasks.find(task => task.id === "B")!.resourcePredecessor, "D");
  assert.deepEqual(currentTasks, before);
  assert.deepEqual(scheduleProject(currentTasks), current);
});

test("reviewed single-builder scenario serializes all builds and adds 2.828 days", () => {
  const schedule = scheduleProject(loadScenario("user-project-single-builder.json"));
  const current = scheduleProject(loadScenario("user-project.json"));
  close(schedule.projectP50, 17.58356956732722);
  close(schedule.projectP50 - current.projectP50, 2.8284271247461903);
  assert.deepEqual(schedule.criticalChain, ["A", "B", "C", "D", "E"]);
  checkTimings(schedule, {
    A: [0, 2.8284271247461903],
    B: [2.8284271247461903, 8.305652699797852],
    C: [8.305652699797852, 11.134079824544042],
    D: [11.134079824544042, 13.58356956732722],
    E: [13.58356956732722, 17.58356956732722],
  });
  assert.equal(schedule.tasks.find(task => task.id === "C")!.resourcePredecessor, "B");
  assert.equal(schedule.tasks.find(task => task.id === "D")!.resourcePredecessor, "C");
});
