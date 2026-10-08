import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseProjectCsv } from "../src/csv-input.js";
import { scheduleProject } from "../src/scheduler.js";

const header = "ID,Task,Resource,Depends on,Good days,Poor days,Priority";
const csv = '\uFEFF' + header + '\r\nA,Design,Bob,none,2,4,1\r\nB,Build One,Alice,A,6,7,2\r\nC,Build Two,Alice,A,2,4,3\r\nD,Buld Three,Alice,A,2,3,4\r\nE,Test,Bob,"B,C,D",4,4,5\r\n';

test("Excel BOM, CRLF, quoted dependency list, and uploaded estimates schedule correctly", () => {
  const tasks = parseProjectCsv(csv);
  assert.deepEqual(tasks[4]!.dependsOn, ["B", "C", "D"]);
  assert.equal(tasks[1]!.goodCase, 6);
  assert.equal(tasks[1]!.poorCase, 7);
  const result = scheduleProject(tasks);
  assert.ok(Math.abs(result.projectP50 - 18.58708469068342) < 1e-10);
  assert.deepEqual(result.criticalChain, ["A", "B", "C", "D", "E"]);
});

test("quoted names allow commas, escaped quotes and newlines; blank dependencies/rows work", () => {
  const tasks = parseProjectCsv(header + '\nA,"Design, ""API""\nmodule",Bob,,.5,2,1\n\n');
  assert.equal(tasks[0]!.name, 'Design, "API"\nmodule');
  assert.deepEqual(tasks[0]!.dependsOn, []);
  assert.equal(tasks.length, 1);
});

test("columns may be reordered and extra metadata columns are ignored", () => {
  const tasks = parseProjectCsv('Priority,Poor days,Good days,Depends on,Resource,Task,ID,Notes\n1,4,2,NONE,Bob,Design,A,example');
  assert.equal(tasks[0]!.id, "A");
  assert.deepEqual(tasks[0]!.dependsOn, []);
});

test("malformed CSV and invalid numeric fields produce useful errors", () => {
  for (const input of ["", "ID,Task", header + ',ID\n']) assert.throws(() => parseProjectCsv(input));
  for (const row of ['A,"unclosed', 'A,"name"oops,Bob,,2,4,1', 'A,na"me,Bob,,2,4,1', 'A,Design,Bob,,2,4']) {
    assert.throws(() => parseProjectCsv(header + "\n" + row));
  }
  for (const value of ["", "oops", "Infinity", "0x10"]) {
    assert.throws(() => parseProjectCsv(header + `\nA,Design,Bob,,${value},4,1`), /Good days.*finite number/);
  }
  assert.throws(() => scheduleProject(parseProjectCsv(header + '\nA,Design,Bob,missing,2,4,1')), /missing dependency/);
  assert.throws(() => scheduleProject(parseProjectCsv(header + '\nA,Design,Bob,,0,4,1')), /greater than zero/);
});

test("schedule and compare CLIs accept CSV and mixed JSON inputs without modifying files", () => {
  const directory = mkdtempSync(join(tmpdir(), "bufferlogic-csv-"));
  const csvPath = join(directory, "project.CSV");
  const jsonPath = join(directory, "project.json");
  try {
    writeFileSync(csvPath, csv);
    writeFileSync(jsonPath, JSON.stringify({ tasks: parseProjectCsv(csv) }));
    const run = (name: string, args: string[]) => spawnSync(process.execPath, [
      fileURLToPath(new URL(`../src/${name}.js`, import.meta.url)), ...args,
    ], { encoding: "utf8" });
    const schedule = run("cli", [csvPath]);
    assert.equal(schedule.status, 0, schedule.stderr);
    assert.deepEqual(JSON.parse(schedule.stdout).criticalChain, ["A", "B", "C", "D", "E"]);
    const comparison = run("compare-cli", [csvPath, jsonPath]);
    assert.equal(comparison.status, 0, comparison.stderr);
    assert.equal(JSON.parse(comparison.stdout).impactDays, 0);
    assert.equal(readFileSync(csvPath, "utf8"), csv);
    writeFileSync(csvPath, header + '\nA,Design,Bob,,oops,4,1');
    const failure = run("cli", [csvPath]);
    assert.equal(failure.status, 1);
    assert.equal(failure.stdout, "");
    assert.match(failure.stderr, /Good days/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
