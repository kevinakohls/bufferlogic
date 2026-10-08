import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { dBeforeB, scenario1 } from "../examples/scenario1.js";
import { parseProject } from "../src/project-input.js";
import type { Schedule } from "../src/types.js";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
function runJson(text: string) {
  const directory = mkdtempSync(join(tmpdir(), "bufferlogic-cli-"));
  const path = join(directory, "project.json");
  try {
    writeFileSync(path, text);
    const result = spawnSync(process.execPath, [cli, path], { encoding: "utf8" });
    assert.equal(readFileSync(path, "utf8"), text, "input file must remain unchanged");
    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("CLI returns JSON for the 20-day Current State and 22-day What-If", () => {
  const results = [scenario1, dBeforeB(scenario1)].map(tasks => {
    const result = runJson(JSON.stringify({ tasks }));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    return JSON.parse(result.stdout) as Schedule;
  });
  assert.equal(results[0]!.projectP50, 20);
  assert.deepEqual(results[0]!.criticalChain, ["A", "B", "D", "F", "G", "H"]);
  assert.equal(results[1]!.projectP50, 22);
  assert.equal(results[1]!.projectP50 - results[0]!.projectP50, 2);
});

test("JSON boundary rejects malformed field types with useful errors", () => {
  for (const value of [null, [], {}, { tasks: null }]) {
    assert.throws(() => parseProject(value), /tasks.*array/);
  }
  assert.throws(() => parseProject({ tasks: [null] }), /tasks\[0\].*object/);
  for (const [field, value] of [
    ["id", 42], ["name", ""], ["resource", null],
    ["goodCase", "3"], ["poorCase", null], ["priority", "1"],
    ["dependsOn", "A"], ["dependsOn", [42]],
  ] as const) {
    assert.throws(() => parseProject({ tasks: [{ ...scenario1[0], [field]: value }] }), new RegExp(field));
  }
});

test("CLI errors use stderr, exit nonzero, and do not emit schedule JSON", () => {
  for (const input of [
    "{invalid", "null", JSON.stringify({ tasks: [{ ...scenario1[0], goodCase: 0 }] }),
    JSON.stringify({ tasks: [{ ...scenario1[0], dependsOn: ["missing"] }] }),
    JSON.stringify({ tasks: [{ ...scenario1[0], dependsOn: ["A"] }] }),
  ]) {
    const result = runJson(input);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /BufferLogic:/);
    assert.doesNotMatch(result.stderr, /at .*\.js:/);
  }
});

test("CLI handles help, missing files, and incorrect argument counts", () => {
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
  for (const args of [[], ["one", "two"], ["/missing-bufferlogic-project.json"]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /BufferLogic:/);
  }
});
