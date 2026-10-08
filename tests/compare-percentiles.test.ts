import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { compareProjects } from "../src/compare.js";
import { estimateProjectPercentiles } from "../src/percentiles.js";
import { readProject } from "../src/read-project.js";
import type { Task } from "../src/types.js";

const currentPath = fileURLToPath(new URL("../../examples/resource-change-current.csv", import.meta.url));
const whatIfPath = fileURLToPath(new URL("../../examples/resource-change-what-if.csv", import.meta.url));
const keys = ["p50", "p80", "p95", "p98", "p99"] as const;

test("comparison estimates each scenario's own chain and reports whole-project percentile changes", () => {
  const current = readProject(currentPath);
  const whatIf = readProject(whatIfPath);
  const before = structuredClone({ current, whatIf });
  const result = compareProjects(current, whatIf);
  assert.deepEqual(result.percentileEstimates.currentState, estimateProjectPercentiles(current));
  assert.deepEqual(result.percentileEstimates.whatIf, estimateProjectPercentiles(whatIf));
  assert.deepEqual(result.percentileEstimates.currentState.criticalChain, ["A", "B", "C", "D", "E"]);
  assert.deepEqual(result.percentileEstimates.whatIf.criticalChain, ["A", "B", "D", "E"]);
  const reverse = compareProjects(whatIf, current);
  for (const key of keys) {
    const expected = result.percentileEstimates.whatIf.projectPercentiles[key] - result.percentileEstimates.currentState.projectPercentiles[key];
    assert.equal(result.percentileEstimates.differences[key], expected);
    assert.ok(expected < 0);
    assert.equal(reverse.percentileEstimates.differences[key], -expected);
  }
  assert.notEqual(result.percentileEstimates.differences.p99, result.impactDays);
  assert.deepEqual({ current, whatIf }, before);
  assert.deepEqual(compareProjects(current, current).percentileEstimates.differences, { p50: 0, p80: 0, p95: 0, p98: 0, p99: 0 });
});

test("uncertainty changes appear even when deterministic task timings are identical", () => {
  const current: Task[] = [{ id: "A", name: "A", resource: "R", dependsOn: [], goodCase: 3, poorCase: 12, priority: 1 }];
  const whatIf = [{ ...current[0]!, goodCase: 6, poorCase: 6 }];
  const result = compareProjects(current, whatIf);
  assert.equal(result.impactDays, 0);
  assert.deepEqual(result.taskChanges, []);
  assert.ok(Math.abs(result.percentileEstimates.differences.p50) < 1e-12);
  assert.ok(result.percentileEstimates.differences.p80 < 0);
  assert.ok(result.percentileEstimates.differences.p99 < result.percentileEstimates.differences.p80);
});

test("JSON, console and Excel comparisons agree on the same percentile estimates", () => {
  const cli = fileURLToPath(new URL("../src/compare-cli.js", import.meta.url));
  const run = (args: string[]) => spawnSync(process.execPath, [cli, currentPath, whatIfPath, ...args], { encoding: "utf8" });
  const directory = mkdtempSync(join(tmpdir(), "bufferlogic-percentile-compare-"));
  try {
    const json = run([]);
    assert.equal(json.status, 0, json.stderr);
    const result: ReturnType<typeof compareProjects> = JSON.parse(json.stdout);
    const output = join(directory, "comparison.csv");
    const table = run(["--format", "table", "--output", output]);
    assert.equal(table.status, 0, table.stderr);
    assert.match(table.stdout, /deterministic task-P50 baseline/);
    assert.match(table.stdout, /Estimated project percentile/);
    const csv = readFileSync(output, "utf8");
    const format = (value: number) => new Intl.NumberFormat("en-US", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    for (const key of keys) {
      assert.ok(csv.includes(`Estimated project ${key.toUpperCase()},${format(result.percentileEstimates.currentState.projectPercentiles[key])},${format(result.percentileEstimates.whatIf.projectPercentiles[key])},${format(result.percentileEstimates.differences[key])}\r\n`));
      assert.ok(table.stdout.includes(key.toUpperCase()));
    }
    assert.match(csv, /Assumptions,"Independent task durations; Fixed Critical Chain/);
    assert.match(csv, /Interpretation,/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
