import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { forecastProgress, compareProgress, parseProgressSnapshot, type ProgressSnapshot } from "../src/progress.js";
import { estimateProjectPercentiles } from "../src/percentiles.js";
import { parseProject } from "../src/project-input.js";

const currentPath = fileURLToPath(new URL("../../examples/progress-current.json", import.meta.url));
const updatedPath = fileURLToPath(new URL("../../examples/progress-updated.json", import.meta.url));
function load(path = currentPath) { return parseProgressSnapshot(JSON.parse(readFileSync(path, "utf8"))); }
function timings(snapshot: ProgressSnapshot) {
  return Object.fromEntries(forecastProgress(snapshot).tasks.map(task => [task.id, [task.start, task.finish]]));
}

test("completed work is retained while active remaining work controls the live schedule", () => {
  const snapshot = load();
  const before = structuredClone(snapshot);
  const result = forecastProgress(snapshot);
  assert.deepEqual(timings(snapshot), { C: [5, 9], B: [5, 11], D: [11, 13], E: [13, 15] });
  assert.equal(result.deterministicRemainingDuration, 10);
  assert.equal(result.deterministicCompletionDay, 15);
  assert.deepEqual(result.remainingCriticalChain, ["B", "D", "E"]);
  assert.deepEqual(result.completedTasks[0]!.actuals, { start: 0, finish: 3 });
  assert.deepEqual(result.staleTaskIds, ["B"]);
  const d = result.tasks.find(task => task.id === "D")!;
  assert.equal(d.resourcePredecessor, "B");
  assert.deepEqual(d.technicalPredecessors, [], "completed/synthetic resource edges must not appear as unfinished technical edges");
  assert.deepEqual(snapshot, before);
  result.completedTasks[0]!.actuals.start = 100;
  assert.equal(snapshot.tasks[0]!.actuals!.start, 0, "output history must not alias input history");
});

test("explicit 2/8 remaining update gives 4 P50, 8 remaining days and completion day 13", () => {
  const snapshot = load(updatedPath);
  const result = forecastProgress(snapshot);
  assert.deepEqual(timings(snapshot), { C: [5, 9], B: [5, 9], D: [9, 11], E: [11, 13] });
  assert.equal(result.tasks.find(task => task.id === "B")!.remainingP50, 4);
  assert.equal(result.deterministicRemainingDuration, 8);
  assert.equal(result.deterministicCompletionDay, 13);
  assert.deepEqual(result.staleTaskIds, []);
});

test("passing a day without an estimate update does not reduce remaining duration", () => {
  const current = load();
  const next = { ...current, asOf: 6 };
  const today = forecastProgress(current);
  const tomorrow = forecastProgress(next);
  assert.equal(tomorrow.tasks.find(task => task.id === "B")!.remainingP50, 6);
  assert.equal(tomorrow.deterministicRemainingDuration, today.deterministicRemainingDuration);
  assert.equal(tomorrow.deterministicCompletionDay, today.deterministicCompletionDay + 1);
  assert.deepEqual(tomorrow.remainingPercentileEstimates.projectPercentiles, today.remainingPercentileEstimates.projectPercentiles);
  assert.deepEqual(tomorrow.staleTaskIds, ["B"]);
});

test("active tasks occupy resources before higher-priority planned tasks without interrupting", () => {
  const result = forecastProgress(load());
  assert.equal(result.tasks.find(task => task.id === "D")!.start, 11);
  const input = load();
  const tasks = input.tasks.map(task => task.id === "C" ? {
    ...task, status: "active" as const, remaining: { goodCase: 2, poorCase: 8, estimateStatus: "current" as const },
  } : task);
  const concurrent = forecastProgress({ ...input, tasks });
  assert.equal(concurrent.tasks.find(task => task.id === "C")!.start, 5);
  assert.equal(concurrent.tasks.find(task => task.id === "B")!.start, 5);
});

test("remaining percentiles exclude completed uncertainty and use active remaining estimates", () => {
  const result = forecastProgress(load(updatedPath));
  const effective = load(updatedPath).tasks.filter(task => task.status !== "completed").map(task => ({
    ...task,
    goodCase: task.remaining?.goodCase ?? task.goodCase,
    poorCase: task.remaining?.poorCase ?? task.poorCase,
    dependsOn: task.id === "D" ? ["B"] : task.dependsOn.filter(id => id !== "A"),
  }));
  const expected = estimateProjectPercentiles(effective);
  assert.deepEqual(result.remainingPercentileEstimates.projectPercentiles, expected.projectPercentiles);
  for (const key of ["p50", "p80", "p95", "p98", "p99"] as const) {
    assert.equal(result.completionPercentiles[key], 5 + expected.projectPercentiles[key]);
    assert.equal(result.wholeDayCompletion[key], Math.ceil(result.completionPercentiles[key]));
  }
});

test("all-completed snapshots have zero remaining work and report historical completion", () => {
  const input = load();
  const actuals = { A: { start: 0, finish: 3 }, B: { start: 3, finish: 9 }, C: { start: 3, finish: 7 }, D: { start: 9, finish: 11 }, E: { start: 11, finish: 13 } };
  const result = forecastProgress({ asOf: 20, tasks: input.tasks.map(task => ({ ...task, status: "completed", actuals: actuals[task.id as keyof typeof actuals] })) });
  assert.equal(result.projectStatus, "completed");
  assert.equal(result.deterministicRemainingDuration, 0);
  assert.equal(result.deterministicCompletionDay, 13);
  assert.deepEqual(result.completionPercentiles, { p50: 13, p80: 13, p95: 13, p98: 13, p99: 13 });
  assert.equal(result.completedTasks.length, 5);
  assert.deepEqual(result.tasks, []);
  assert.equal(forecastProgress({ asOf: 0, tasks: [] }).deterministicCompletionDay, 0);
});

test("snapshot parsing preserves lifecycle metadata and rejects malformed values", () => {
  assert.equal(parseProject(JSON.parse(readFileSync(currentPath, "utf8")))[1]!.remaining!.estimateStatus, "stale");
  for (const asOf of [-1, "5", Infinity, null]) assert.throws(() => parseProgressSnapshot({ asOf, tasks: [] }));
  const valid = JSON.parse(readFileSync(currentPath, "utf8"));
  for (const overrides of [{ status: "unknown" }, { remaining: { goodCase: 0, poorCase: 8, estimateStatus: "stale" } }, { actuals: { start: 4, finish: 3 } }]) {
    assert.throws(() => parseProject({ tasks: [{ ...valid.tasks[1], ...overrides }] }));
  }
});

test("active conflicts, missing remaining estimates and unfinished predecessors are rejected", () => {
  const input = load();
  assert.throws(() => forecastProgress({ ...input, tasks: input.tasks.map(task => task.id === "D" ? { ...task, status: "active", remaining: { goodCase: 1, poorCase: 4, estimateStatus: "current" } } : task) }), /Multiple active/);
  assert.throws(() => forecastProgress({ ...input, tasks: input.tasks.map(task => task.id === "B" ? { ...task, dependsOn: ["C"] } : task) }), /unfinished predecessor/);
  const withoutRemaining = JSON.parse(readFileSync(currentPath, "utf8"));
  delete withoutRemaining.tasks[1].remaining;
  assert.throws(() => forecastProgress(parseProgressSnapshot(withoutRemaining)), /explicit remaining/);
});

test("history must respect dependency completion, actual bounds and resource capacity", () => {
  const input = load();
  assert.throws(() => forecastProgress({ ...input, tasks: input.tasks.map(task => task.id === "A" ? { ...task, actuals: { start: 0, finish: 6 } } : task) }), /actuals finishing by asOf/);
  assert.throws(() => forecastProgress({ ...input, tasks: input.tasks.map(task => task.id === "D" ? { ...task, status: "completed", actuals: { start: 1, finish: 2 } } : task) }), /inconsistent predecessor/);
  assert.throws(() => forecastProgress({ ...input, tasks: input.tasks.map(task => task.id === "C" ? { ...task, status: "completed", resource: "Alice", dependsOn: [], actuals: { start: 1, finish: 4 } } : task) }), /overlap/);
  assert.throws(() => forecastProgress({ ...input, tasks: input.tasks.map(task => task.id === "C" ? { ...task, dependsOn: ["missing"] } : task) }), /missing dependency/);
  assert.throws(() => forecastProgress({ ...input, tasks: input.tasks.map(task => task.id === "C" ? { ...task, dependsOn: ["C"] } : task) }), /cycle/);
});

test("progress comparison preserves Current State and compares the same snapshot day", () => {
  const current = load();
  const before = structuredClone(current);
  const result = compareProgress(current, load(updatedPath));
  assert.equal(result.deterministicCompletionDifference, -2);
  assert.ok(result.completionPercentileDifferences.p95 < 0);
  assert.equal(result.wholeDayDifferences.p95, result.whatIf.wholeDayCompletion.p95 - result.currentState.wholeDayCompletion.p95);
  assert.deepEqual(current, before);
  assert.throws(() => compareProgress(current, { ...load(updatedPath), asOf: 6 }), /same asOf/);
  assert.throws(() => compareProgress(current, { asOf: 5, tasks: [] }), /same task IDs/);
});

test("progress CLIs output forecasts and Excel reports, preserve files, and refuse overwrite", () => {
  const directory = mkdtempSync(join(tmpdir(), "bufferlogic-progress-"));
  const run = (name: string, args: string[]) => spawnSync(process.execPath, [fileURLToPath(new URL(`../src/${name}.js`, import.meta.url)), ...args], { encoding: "utf8" });
  try {
    const output = join(directory, "progress.csv");
    const table = run("progress-cli", [currentPath, "--format", "table", "--output", output]);
    assert.equal(table.status, 0, table.stderr);
    assert.match(table.stdout, /Deterministic remaining: 10\.00 days; completion day: 15\.00/);
    assert.match(table.stdout, /Stale active estimates: B/);
    const saved = readFileSync(output, "utf8");
    assert.match(saved, /"A","Design","Alice",0\.00,3\.00/);
    assert.equal(run("progress-cli", [currentPath, "--output", output]).status, 1);
    assert.equal(readFileSync(output, "utf8"), saved);
    const json = run("progress-cli", [currentPath]);
    assert.equal(json.status, 0, json.stderr);
    assert.equal(JSON.parse(json.stdout).deterministicRemainingDuration, 10);
    const comparison = run("compare-progress-cli", [currentPath, updatedPath, "--format", "table", "--output", join(directory, "comparison.csv")]);
    assert.equal(comparison.status, 0, comparison.stderr);
    assert.match(comparison.stdout, /Deterministic completion difference: -2\.00/);
    for (const args of [[], [currentPath, "--format", "xml"], [currentPath, "--output", "output.txt"]]) {
      assert.equal(run("progress-cli", args).status, 1);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
