import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { compareProjects } from "../src/compare.js";
import { readProject } from "../src/read-project.js";
import { scheduleProject } from "../src/scheduler.js";
import type { Schedule } from "../src/types.js";

const currentPath = fileURLToPath(new URL("../../examples/resource-change-current.csv", import.meta.url));
const whatIfPath = fileURLToPath(new URL("../../examples/resource-change-what-if.csv", import.meta.url));

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

test("reviewed resource change moves C to Bob, improves P50 by 2.828 days, and removes C from chain", () => {
  const currentTasks = readProject(currentPath);
  const whatIfTasks = readProject(whatIfPath);
  const before = structuredClone({ currentTasks, whatIfTasks });
  // Confirm this is a resource-only change, with the reviewed 6/7 estimates for B.
  assert.deepEqual(whatIfTasks, currentTasks.map(task => task.id === "C" ? { ...task, resource: "Bob" } : task));
  const current = scheduleProject(currentTasks);
  const whatIf = scheduleProject(whatIfTasks);
  const comparison = compareProjects(currentTasks, whatIfTasks);
  close(current.projectP50, 18.58708469068342);
  close(whatIf.projectP50, 15.75865756593723);
  close(comparison.impactDays, -2.8284271247461903);
  assert.deepEqual(current.criticalChain, ["A", "B", "C", "D", "E"]);
  assert.deepEqual(whatIf.criticalChain, ["A", "B", "D", "E"]);
  checkTimings(current, {
    A: [0, 2.8284271247461903],
    B: [2.8284271247461903, 9.30916782315405],
    C: [9.30916782315405, 12.13759494790024],
    D: [12.13759494790024, 14.587084690683419],
    E: [14.587084690683419, 18.58708469068342],
  });
  checkTimings(whatIf, {
    A: [0, 2.8284271247461903],
    B: [2.8284271247461903, 9.30916782315405],
    C: [2.8284271247461903, 5.656854249492381],
    D: [9.30916782315405, 11.75865756593723],
    E: [11.75865756593723, 15.75865756593723],
  });
  assert.equal(current.tasks.find(task => task.id === "D")!.resourcePredecessor, "C");
  assert.equal(whatIf.tasks.find(task => task.id === "D")!.resourcePredecessor, "B");
  assert.deepEqual(comparison.taskChanges.map(task => task.id), ["C", "D", "E"]);
  close(comparison.taskChanges.find(task => task.id === "C")!.startDifference, -6.48074069840786);
  assert.deepEqual({ currentTasks, whatIfTasks }, before);
  assert.deepEqual(scheduleProject(currentTasks), current);
});

test("CLI comparison export reproduces the resource-change report reviewed in Excel", () => {
  const directory = mkdtempSync(join(tmpdir(), "bufferlogic-resource-change-"));
  const currentBefore = readFileSync(currentPath, "utf8");
  const whatIfBefore = readFileSync(whatIfPath, "utf8");
  try {
    const output = join(directory, "comparison.csv");
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("../src/compare-cli.js", import.meta.url)),
      currentPath, whatIfPath, "--output", output,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const csv = readFileSync(output, "utf8");
    assert.ok(csv.includes("Project P50,18.59,15.76,-2.83\r\n"));
    assert.ok(csv.includes('Critical Chain,"A -> B -> C -> D -> E","A -> B -> D -> E",'));
    assert.ok(csv.includes('"C","Build Two","Build Two","Alice","Bob",2.83,2.83,9.31,12.14,2.83,5.66,-6.48,-6.48,Yes,No\r\n'));
    assert.ok(csv.includes('"D","Build Three","Build Three","Alice","Alice",2.45,2.45,12.14,14.59,9.31,11.76,-2.83,-2.83,Yes,Yes\r\n'));
    assert.ok(csv.includes('"E","Test","Test","Bob","Bob",4.00,4.00,14.59,18.59,11.76,15.76,-2.83,-2.83,Yes,Yes\r\n'));
    assert.equal(readFileSync(currentPath, "utf8"), currentBefore);
    assert.equal(readFileSync(whatIfPath, "utf8"), whatIfBefore);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
