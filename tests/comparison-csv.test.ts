import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { dBeforeB, scenario1 } from "../examples/scenario1.js";
import { comparisonToCsv } from "../src/csv-output.js";
import { parseProject } from "../src/project-input.js";

test("comparison CSV includes +2 impact, both chains, all tasks and signed timing changes", () => {
  const whatIf = dBeforeB(scenario1);
  const before = structuredClone({ current: scenario1, whatIf });
  const csv = comparisonToCsv(scenario1, whatIf);
  assert.ok(csv.startsWith("\uFEFFMetric,Current State,What-If,Difference\r\n"));
  assert.ok(csv.includes("Deterministic P50-task baseline,20.00,22.00,2.00\r\n"));
  assert.ok(csv.includes('Critical Chain,"A -> B -> D -> F -> G -> H","A -> D -> B -> E -> F -> G -> H",'));
  assert.ok(csv.includes('"D","Integration Module","Integration Module","Developer 1","Developer 1",4.00,4.00,9.00,13.00,3.00,7.00,-6.00,-6.00,Yes,Yes\r\n'));
  assert.ok(csv.includes('"C","Build UI","Build UI","Developer 2","Developer 2",6.00,6.00,3.00,9.00,3.00,9.00,0.00,0.00,No,No\r\n'));
  assert.equal(csv.split("\r\n").length, 22);
  assert.deepEqual({ current: scenario1, whatIf }, before);
  assert.ok(comparisonToCsv(whatIf, scenario1).includes("Deterministic P50-task baseline,22.00,20.00,-2.00"));
});

test("reviewed zero-impact swap and empty/identical comparisons remain useful", () => {
  const load = (name: string) => parseProject(JSON.parse(readFileSync(new URL(`../../examples/${name}`, import.meta.url), "utf8")));
  const csv = comparisonToCsv(load("user-project.json"), load("user-project-what-if.json"));
  assert.ok(csv.includes("Deterministic P50-task baseline,14.76,14.76,0.00"));
  assert.ok(csv.includes('Critical Chain,"A -> B -> D -> E","A -> D -> B -> E",'));
  assert.ok(comparisonToCsv([], []).includes("Deterministic P50-task baseline,0.00,0.00,0.00"));
  assert.ok(comparisonToCsv(scenario1, scenario1).includes("Deterministic P50-task baseline,20.00,20.00,0.00"));
});

test("comparison CSV escapes user text and shows resource/name changes on both sides", () => {
  const current = [{ ...scenario1[0]!, name: 'Design, "API"\n東京' }];
  const whatIf = [{ ...current[0]!, name: "=1+1", resource: "Bob" }];
  const csv = comparisonToCsv(current, whatIf);
  assert.ok(csv.includes('"Design, ""API""\n東京","\'=1+1","Architect","Bob"'));
});

test("comparison CLI exports CSV/JSON inputs, supports table, protects files and rejects errors", () => {
  const cli = fileURLToPath(new URL("../src/compare-cli.js", import.meta.url));
  const run = (args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const directory = mkdtempSync(join(tmpdir(), "bufferlogic-comparison-export-"));
  const current = join(directory, "current.csv");
  const alternative = join(directory, "alternative.json");
  const original = "ID,Task,Resource,Depends on,Good days,Poor days,Priority\nA,Design,Alice,none,2,4,1\n";
  const output = join(directory, "comparison.csv");
  try {
    writeFileSync(current, original);
    writeFileSync(alternative, JSON.stringify({ tasks: [{ ...scenario1[0], goodCase: 2, poorCase: 4 }] }));
    const result = run([current, alternative, "--output", output]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Saved comparison CSV/);
    const saved = readFileSync(output, "utf8");
    assert.ok(saved.includes("Deterministic P50-task baseline,2.83,2.83,0.00"));
    const table = run([current, alternative, "--format", "table", "--output", join(directory, "table.csv")]);
    assert.equal(table.status, 0, table.stderr);
    assert.match(table.stdout, /Impact: 0\.00/);
    for (const args of [
      [current, alternative, "--output", output], [current, alternative, "--output", current],
      [current, alternative, "--output"], [current, alternative, "--output", "out.txt"],
    ]) {
      const failure = run(args);
      assert.equal(failure.status, 1);
      assert.equal(failure.stdout, "");
    }
    assert.equal(readFileSync(current, "utf8"), original);
    assert.equal(readFileSync(output, "utf8"), saved);
    writeFileSync(alternative, '{"tasks":[]}');
    const invalidOutput = join(directory, "invalid.csv");
    assert.equal(run([current, alternative, "--output", invalidOutput]).status, 1);
    assert.equal(existsSync(invalidOutput), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
