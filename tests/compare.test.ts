import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { dBeforeB, scenario1 } from "../examples/scenario1.js";
import { compareProjects } from "../src/compare.js";
import { parseProject } from "../src/project-input.js";

test("comparison reports the acceptance scenario's +2 days and changed timings", () => {
  const whatIf = dBeforeB(scenario1);
  const before = structuredClone({ current: scenario1, whatIf });
  const comparison = compareProjects(scenario1, whatIf);
  assert.equal(comparison.currentState.projectP50, 20);
  assert.equal(comparison.whatIf.projectP50, 22);
  assert.equal(comparison.impactDays, 2);
  assert.deepEqual(comparison.currentState.criticalChain, ["A", "B", "D", "F", "G", "H"]);
  assert.deepEqual(comparison.whatIf.criticalChain, ["A", "D", "B", "E", "F", "G", "H"]);
  assert.deepEqual(comparison.taskChanges.map(task => task.id), ["B", "D", "E", "F", "G", "H"]);
  assert.deepEqual(comparison.taskChanges.find(task => task.id === "D"), {
    id: "D", currentState: { start: 9, finish: 13 }, whatIf: { start: 3, finish: 7 },
    startDifference: -6, finishDifference: -6,
  });
  assert.deepEqual({ current: scenario1, whatIf }, before);
  assert.equal(compareProjects(whatIf, scenario1).impactDays, -2);
});

test("identical scenarios have no impact or changed timings", () => {
  const result = compareProjects(scenario1, [...scenario1].reverse());
  assert.equal(result.impactDays, 0);
  assert.deepEqual(result.taskChanges, []);
  assert.deepEqual(compareProjects([], []).taskChanges, []);
});

test("reviewed priority swap has zero impact but changes chain and B/D timings", () => {
  const load = (name: string) => parseProject(JSON.parse(readFileSync(
    new URL(`../../examples/${name}`, import.meta.url), "utf8"
  )));
  const result = compareProjects(load("user-project.json"), load("user-project-what-if.json"));
  assert.equal(result.impactDays, 0);
  assert.deepEqual(result.whatIf.criticalChain, ["A", "D", "B", "E"]);
  assert.deepEqual(result.taskChanges.map(task => task.id), ["B", "D"]);
});

test("comparison rejects added/removed or replaced task IDs and invalid schedules", () => {
  assert.throws(() => compareProjects(scenario1, []), /same task IDs/);
  assert.throws(() => compareProjects([scenario1[0]!], [{ ...scenario1[0]!, id: "Other" }]), /same task IDs/);
  assert.throws(() => compareProjects(scenario1, [{ ...scenario1[0]!, dependsOn: ["missing"] }]), /missing dependency/);
});

test("comparison CLI returns pure JSON, preserves files, and rejects bad input", () => {
  const cli = fileURLToPath(new URL("../src/compare-cli.js", import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), "bufferlogic-compare-"));
  const current = join(directory, "current.json");
  const alternative = join(directory, "what-if.json");
  const currentText = JSON.stringify({ tasks: scenario1 });
  const alternativeText = JSON.stringify({ tasks: dBeforeB(scenario1) });
  const run = (args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  try {
    writeFileSync(current, currentText);
    writeFileSync(alternative, alternativeText);
    const result = run([current, alternative]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(JSON.parse(result.stdout).impactDays, 2);
    assert.equal(readFileSync(current, "utf8"), currentText);
    assert.equal(readFileSync(alternative, "utf8"), alternativeText);
    assert.equal(run(["--help"]).status, 0);
    for (const args of [[], [current], [current, alternative, "extra"], [current, join(directory, "missing")]]) {
      const failure = run(args);
      assert.equal(failure.status, 1);
      assert.equal(failure.stdout, "");
      assert.match(failure.stderr, /BufferLogic:/);
    }
    for (const invalid of ["{invalid", "null", '{"tasks":[]}']) {
      writeFileSync(alternative, invalid);
      const failure = run([current, alternative]);
      assert.equal(failure.status, 1);
      assert.equal(failure.stdout, "");
      assert.match(failure.stderr, /BufferLogic:/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
