import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { validatePercentiles } from "../validation/benchmark.js";
import type { Task } from "../src/types.js";

function task(id: string, goodCase: number, poorCase: number, dependsOn: string[] = []): Task {
  return { id, name: id, resource: id, goodCase, poorCase, dependsOn, priority: 1 };
}

test("fixed durations benchmark exactly; empty projects stay zero", () => {
  const result = validatePercentiles([task("A", 2, 2), task("B", 3, 3, ["A"])], 1000, 0);
  for (const row of result.percentiles) {
    assert.equal(row.approximation, 5);
    assert.equal(row.fixedChain.duration, 5);
    assert.equal(row.fullProject.duration, 5);
    assert.equal(row.errorVsFullProjectPercent, 0);
    assert.deepEqual(row.fullProject.samplingInterval95, { lower: 5, upper: 5 });
  }
  assert.equal(result.changedCriticalChainFraction, 0);
  assert.equal(validatePercentiles([], 1000).percentiles[4]!.fullProject.duration, 0);
});

test("seeded single lognormal benchmarks recover analytical quantiles and moments", () => {
  const tasks = [task("A", Math.exp(-.8416212335729143 * .5), Math.exp(.8416212335729143 * .5))];
  const before = structuredClone(tasks);
  const result = validatePercentiles(tasks, 30000, 12345);
  for (const row of result.percentiles) {
    assert.ok(Math.abs(row.errorVsFixedChainPercent) < 3, `${row.percentile} error ${row.errorVsFixedChainPercent}`);
    assert.equal(row.fixedChain.duration, row.fullProject.duration);
    assert.ok(row.fixedChain.samplingInterval95.lower <= row.fixedChain.duration);
    assert.ok(row.fixedChain.samplingInterval95.upper >= row.fixedChain.duration);
  }
  assert.ok(Math.abs(result.fixedChainSampleMoments.mean / Math.exp(.125) - 1) < .02);
  assert.ok(Math.abs(result.fixedChainSampleMoments.variance / (Math.expm1(.25) * Math.exp(.25)) - 1) < .05);
  assert.deepEqual(validatePercentiles(tasks, 1000, 99), validatePercentiles(tasks, 1000, 99));
  assert.notDeepEqual(validatePercentiles(tasks, 1000, 99).percentiles, validatePercentiles(tasks, 1000, 100).percentiles);
  assert.deepEqual(tasks, before);
});

test("parallel equal-median paths expose switching and optimistic fixed-chain forecasts", () => {
  const result = validatePercentiles([task("A", 1, 4), task("B", 1, 4)], 10000, 42);
  assert.ok(result.changedCriticalChainFraction > .45 && result.changedCriticalChainFraction < .55);
  assert.ok(result.percentiles[0]!.fullProject.duration > result.percentiles[0]!.fixedChain.duration);
  assert.ok(result.percentiles[0]!.errorVsFullProjectPercent < -10);
});

test("benchmark rejects invalid options and bad dependencies", () => {
  for (const count of [999, 1.5, Infinity, 1000001]) assert.throws(() => validatePercentiles([], count));
  for (const seed of [-1, 1.5, 4294967296]) assert.throws(() => validatePercentiles([], 1000, seed));
  assert.throws(() => validatePercentiles([task("A", 1, 2, ["missing"])]), /missing dependency/);
});

test("validation CLI saves a reproducible report and refuses overwrite", () => {
  const directory = mkdtempSync(join(tmpdir(), "bufferlogic-validation-"));
  const cli = fileURLToPath(new URL("../validation/cli.js", import.meta.url));
  const fixture = fileURLToPath(new URL("../../examples/resource-change-what-if.csv", import.meta.url));
  const output = join(directory, "report.json");
  const run = (args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  try {
    const result = run([fixture, "--iterations", "1000", "--seed", "42", "--output", output]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Fixed-chain MC/);
    assert.match(result.stdout, /sampling intervals/);
    const saved = readFileSync(output, "utf8");
    assert.equal(JSON.parse(saved).iterations, 1000);
    assert.equal(run([fixture, "--iterations", "1000", "--output", output]).status, 1);
    assert.equal(readFileSync(output, "utf8"), saved);
    for (const args of [[], [fixture, "--iterations", "oops"], [fixture, "--seed", "-1"], [fixture, "--format", "xml"]]) {
      assert.equal(run(args).status, 1);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
