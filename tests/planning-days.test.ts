import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { planningDays, planningDayDifference } from "../src/planning-days.js";
import { estimateProjectPercentiles } from "../src/percentiles.js";
import { percentilesToCsv } from "../src/csv-output.js";
import { readProject } from "../src/read-project.js";
import type { Task } from "../src/types.js";

test("planning days round up raw durations, with exact integers and zero unchanged", () => {
  for (const [value, expected] of [[0, 0], [.01, 1], [18, 18], [18.0001, 19], [18.995, 19], [19.59, 20], [20.12, 21]]) {
    assert.equal(planningDays(value!), expected);
  }
  for (const invalid of [-1, NaN, Infinity]) assert.throws(() => planningDays(invalid));
});

test("planning differences subtract each rounded completion day", () => {
  assert.equal(planningDayDifference(5.1, 5.9), 0);
  assert.equal(planningDayDifference(6.1, 5.9), -1);
  assert.equal(planningDayDifference(5.9, 6.1), 1);
});

test("reviewer P95/P98/P99 plan as 19/20/21 days, with full estimates preserved", () => {
  const tasks = readProject(fileURLToPath(new URL("../../examples/resource-change-what-if.csv", import.meta.url)));
  const result = estimateProjectPercentiles(tasks);
  const before = structuredClone(result);
  const csv = percentilesToCsv(result);
  assert.ok(csv.includes("Estimated project P95,18.83,19\r\n"));
  assert.ok(csv.includes("Estimated project P98,19.59,20\r\n"));
  assert.ok(csv.includes("Estimated project P99,20.12,21\r\n"));
  assert.deepEqual(result, before);
  const fixed: Task[] = [{ id: "A", name: "A", resource: "A", priority: 1, dependsOn: [], goodCase: 19.0001, poorCase: 19.0001 }];
  assert.ok(percentilesToCsv(estimateProjectPercentiles(fixed)).includes("Estimated project P95,19.00,20"), "ceiling must use raw values before display rounding");
});

test("percentile and comparison CLIs display/export whole days while JSON stays full precision", () => {
  const current = fileURLToPath(new URL("../../examples/resource-change-current.csv", import.meta.url));
  const whatIf = fileURLToPath(new URL("../../examples/resource-change-what-if.csv", import.meta.url));
  const run = (name: string, args: string[]) => spawnSync(process.execPath, [fileURLToPath(new URL(`../src/${name}.js`, import.meta.url)), ...args], { encoding: "utf8" });
  const directory = mkdtempSync(join(tmpdir(), "bufferlogic-planning-days-"));
  try {
    const output = join(directory, "percentiles.csv");
    const result = run("percentiles-cli", [whatIf, "--format", "table", "--output", output]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Whole days \(round up\)/);
    assert.match(result.stdout, /P95\s+\| 18\.83\s+\| 19/);
    assert.match(readFileSync(output, "utf8"), /Whole-day planning/);
    const comparison = run("compare-cli", [current, whatIf, "--format", "table"]);
    assert.equal(comparison.status, 0, comparison.stderr);
    assert.match(comparison.stdout, /Whole-day difference/);
    assert.match(comparison.stdout, /P95\s+\| 22\.75\s+\| 18\.83\s+\| -3\.92\s+\| 23\s+\| 19\s+\| -4/);
    const json = run("percentiles-cli", [whatIf]);
    assert.equal(json.status, 0, json.stderr);
    assert.equal(JSON.parse(json.stdout).projectPercentiles.p95, estimateProjectPercentiles(readProject(whatIf)).projectPercentiles.p95);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
