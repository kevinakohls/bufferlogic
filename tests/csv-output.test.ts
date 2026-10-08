import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { scenario1 } from "../examples/scenario1.js";
import { scheduleToCsv } from "../src/csv-output.js";
import { scheduleProject } from "../src/scheduler.js";

test("CSV export contains all timings, task names, and Critical Chain membership", () => {
  const result = scheduleToCsv(scheduleProject(scenario1), scenario1);
  assert.ok(result.startsWith("\uFEFFID,Task,Resource,P50 duration,Start,Finish,Critical Chain\r\n"));
  assert.equal(result.split("\r\n").length, 10);
  assert.ok(result.includes('"B","Build API","Developer 1",6,3,9,Yes\r\n'));
  assert.ok(result.includes('"C","Build UI","Developer 2",6,3,9,No\r\n'));
  assert.ok(result.includes('"H","Release Candidate","DevOps",1,19,20,Yes\r\n'));
});

test("CSV export escapes quotes/commas/newlines, preserves Unicode and numeric precision", () => {
  const tasks = [{ ...scenario1[0]!, name: 'Design, "API"\n東京', goodCase: 2, poorCase: 4 }];
  const csv = scheduleToCsv(scheduleProject(tasks), tasks);
  assert.ok(csv.includes('"Design, ""API""\n東京"'));
  assert.ok(csv.includes(",2.8284271247461903,0,2.8284271247461903,Yes"));
  const formula = [{ ...tasks[0]!, id: "=1+1", name: " +SUM(A1)", resource: "@example" }];
  assert.ok(scheduleToCsv(scheduleProject(formula), formula).includes('"\'=1+1","\' +SUM(A1)","\'@example"'));
});

test("empty schedules export a header only", () => {
  assert.equal(scheduleToCsv(scheduleProject([]), []), "\uFEFFID,Task,Resource,P50 duration,Start,Finish,Critical Chain\r\n");
});

test("CLI exports from CSV/JSON, preserves inputs, refuses overwrite, and rejects bad arguments", () => {
  const directory = mkdtempSync(join(tmpdir(), "bufferlogic-export-"));
  const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
  const run = (args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  try {
    const inputs = [
      ["project.json", JSON.stringify({ tasks: scenario1 })],
      ["project.csv", "ID,Task,Resource,Depends on,Good days,Poor days,Priority\nA,Design,Alice,none,2,4,1\n"],
    ];
    for (const [filename, content] of inputs) {
      const input = join(directory, filename!);
      const output = input + ".schedule.csv";
      writeFileSync(input, content!);
      const result = run([input, "--output", output]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Saved schedule CSV/);
      const exported = readFileSync(output, "utf8");
      assert.ok(exported.startsWith("\uFEFFID,Task"));
      assert.equal(run([input, "--output", output]).status, 1);
      assert.equal(readFileSync(output, "utf8"), exported);
      assert.equal(run([input, "--output", input]).status, 1);
      assert.equal(readFileSync(input, "utf8"), content);
      for (const args of [[input, "--output"], [input, "--wrong", output], [input, "--output", "result.txt"]]) {
        const failure = run(args);
        assert.equal(failure.status, 1);
        assert.equal(failure.stdout, "");
      }
    }
    const invalid = join(directory, "invalid.json");
    const output = join(directory, "invalid.csv");
    writeFileSync(invalid, JSON.stringify({ tasks: [{ ...scenario1[0], goodCase: 0 }] }));
    assert.equal(run([invalid, "--output", output]).status, 1);
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
