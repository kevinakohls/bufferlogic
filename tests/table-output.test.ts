import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { dBeforeB, scenario1 } from "../examples/scenario1.js";
import { parseOptions } from "../src/cli-options.js";
import { compareProjects } from "../src/compare.js";
import { scheduleProject } from "../src/scheduler.js";
import { comparisonToTable, scheduleToTable } from "../src/table-output.js";

test("schedule table includes task details, rounded timings, chain and duration", () => {
  const schedule = scheduleProject(scenario1);
  const snapshot = structuredClone(schedule);
  const text = scheduleToTable(schedule, scenario1);
  assert.match(text, /Build UI\s+\| Developer 2\s+\| 6\.00\s+\| 3\.00\s+\| 9\.00\s+\| No/);
  assert.match(text, /Project P50: 20\.00/);
  assert.match(text, /Critical Chain: A -> B -> D -> F -> G -> H/);
  assert.deepEqual(schedule, snapshot);
});

test("comparison table shows impact directions, both chains, and changed task timings", () => {
  const text = comparisonToTable(compareProjects(scenario1, dBeforeB(scenario1)));
  assert.match(text, /Current State P50: 20\.00/);
  assert.match(text, /What-If P50: 22\.00/);
  assert.match(text, /Impact: \+2\.00/);
  assert.match(text, /What-If Critical Chain: A -> D -> B -> E -> F -> G -> H/);
  assert.match(text, /D\s+\| 9\.00\s+\| 13\.00\s+\| 3\.00\s+\| 7\.00\s+\| -6\.00/);
  assert.match(comparisonToTable(compareProjects(dBeforeB(scenario1), scenario1)), /Impact: -2\.00/);
  assert.match(comparisonToTable(compareProjects(scenario1, scenario1)), /No task timings changed/);
  assert.match(scheduleToTable(scheduleProject([]), []), /Critical Chain: \(none\)/);
});

test("option parsing rejects missing, duplicate, unknown or unsupported values", () => {
  for (const args of [[], ["p", "--format"], ["p", "--format", "xml"], ["p", "--format", "table", "--format", "json"], ["p", "--wrong", "x"]]) {
    assert.throws(() => parseOptions(args, 1, true));
  }
  assert.throws(() => parseOptions(["p", "q", "--output", "x.csv"], 2, false));
});

test("CLIs support table output, explicit JSON, and table alongside CSV export", () => {
  const fixture = fileURLToPath(new URL("../../examples/user-project.json", import.meta.url));
  const alternative = fileURLToPath(new URL("../../examples/user-project-what-if.json", import.meta.url));
  const run = (name: string, args: string[]) => spawnSync(process.execPath, [
    fileURLToPath(new URL(`../src/${name}.js`, import.meta.url)), ...args,
  ], { encoding: "utf8" });
  const directory = mkdtempSync(join(tmpdir(), "bufferlogic-table-"));
  try {
    const output = join(directory, "schedule.csv");
    const schedule = run("cli", [fixture, "--format", "table", "--output", output]);
    assert.equal(schedule.status, 0, schedule.stderr);
    assert.match(schedule.stdout, /Project P50: 14\.76/);
    assert.ok(readFileSync(output, "utf8").includes(",2.83,0.00,2.83,Yes"));
    const comparison = run("compare-cli", [fixture, alternative, "--format", "table"]);
    assert.equal(comparison.status, 0, comparison.stderr);
    assert.match(comparison.stdout, /Impact: 0\.00/);
    for (const [name, args] of [["cli", [fixture]], ["compare-cli", [fixture, alternative]]] as const) {
      const result = run(name, [...args, "--format", "json"]);
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotThrow(() => JSON.parse(result.stdout));
      const invalid = run(name, [...args, "--format", "xml"]);
      assert.equal(invalid.status, 1);
      assert.equal(invalid.stdout, "");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
