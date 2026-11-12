import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { scenario1 } from "../examples/scenario1.js";
import { estimateProjectPercentiles, fitTaskLognormal } from "../src/percentiles.js";
import type { Task } from "../src/types.js";

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
const task = (id: string, goodCase: number, poorCase: number, dependsOn: string[] = []): Task => ({
  id, name: id, resource: id, priority: 1, goodCase, poorCase, dependsOn,
});

test("task fit reproduces P20/P80 and geometric median", () => {
  const fit = fitTaskLognormal(3, 12);
  close(Math.exp(fit.mu - .8416212335729143 * fit.sigma), 3);
  close(Math.exp(fit.mu + .8416212335729143 * fit.sigma), 12);
  close(Math.exp(fit.mu), 6);
});

test("single-task project quantiles recover its lognormal distribution", () => {
  // Estimates generated from a known mu=log(10), sigma=.5 distribution.
  const result = estimateProjectPercentiles([task("A", 10 * Math.exp(-.8416212335729143 * .5), 10 * Math.exp(.8416212335729143 * .5))]);
  close(result.projectPercentiles.p50, 10);
  close(result.projectPercentiles.p80, 10 * Math.exp(.8416212335729143 * .5));
  close(result.projectPercentiles.p95, 10 * Math.exp(1.6448536269514722 * .5));
  close(result.projectPercentiles.p98, 10 * Math.exp(2.0537489106318225 * .5));
  close(result.projectPercentiles.p99, 10 * Math.exp(2.3263478740408408 * .5));
});

test("independent chain moments sum before fitting whole-project quantiles", () => {
  const result = estimateProjectPercentiles([task("A", 2, 8), task("B", 2, 8, ["A"])]);
  const sigma2 = (Math.log(4) / (2 * .8416212335729143)) ** 2;
  const expectedMean = 2 * 4 * Math.exp(sigma2 / 2);
  const expectedVariance = 2 * Math.expm1(sigma2) * 16 * Math.exp(sigma2);
  close(result.chainDistribution.mean, expectedMean);
  close(result.chainDistribution.variance, expectedVariance);
  const aggregateSigma2 = Math.log1p(expectedVariance / expectedMean ** 2);
  close(result.projectPercentiles.p50, expectedMean / Math.exp(aggregateSigma2 / 2));
  assert.notEqual(result.projectPercentiles.p50, result.deterministicBaselineDuration);
  assert.ok(result.projectPercentiles.p80 < 16, "project P80 must not simply sum both task P80s");
});

test("baseline resource Critical Chain selects contributing tasks; inputs remain unchanged", () => {
  const before = structuredClone(scenario1);
  const result = estimateProjectPercentiles(scenario1);
  assert.equal(result.deterministicBaselineDuration, 20);
  assert.deepEqual(result.criticalChain, ["A", "B", "D", "F", "G", "H"]);
  const moments = scenario1.filter(task => result.criticalChain.includes(task.id)).map(task => fitTaskLognormal(task.goodCase, task.poorCase));
  close(result.chainDistribution.mean, moments.reduce((sum, task) => sum + task.mean, 0));
  const values = Object.values(result.projectPercentiles);
  assert.ok(values.every((value, index) => index === 0 || value > values[index - 1]!));
  assert.deepEqual(estimateProjectPercentiles(scenario1), result);
  assert.deepEqual(scenario1, before);
});

test("fixed durations, empty projects, and invalid inputs have defined outcomes", () => {
  assert.deepEqual(estimateProjectPercentiles([task("A", 2, 2), task("B", 3, 3, ["A"])]).projectPercentiles,
    { p50: 5, p80: 5, p95: 5, p98: 5, p99: 5 });
  assert.deepEqual(estimateProjectPercentiles([]).projectPercentiles, { p50: 0, p80: 0, p95: 0, p98: 0, p99: 0 });
  assert.throws(() => fitTaskLognormal(0, 8));
  assert.throws(() => fitTaskLognormal(8, 2));
  assert.throws(() => fitTaskLognormal(1e-300, 1e300), /numeric range/);
  assert.throws(() => estimateProjectPercentiles([task("A", 1, 2, ["missing"])]), /missing dependency/);
  assert.throws(() => estimateProjectPercentiles([task("A", 1, 2, ["A"])]), /cycle/);
});

test("percentile CLI accepts JSON/CSV, produces labeled tables/exports, and protects files", () => {
  const cli = fileURLToPath(new URL("../src/percentiles-cli.js", import.meta.url));
  const run = (args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const input = fileURLToPath(new URL("../../examples/project.json", import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), "bufferlogic-percentiles-"));
  try {
    const json = run([input]);
    assert.equal(json.status, 0, json.stderr);
    const result = JSON.parse(json.stdout);
    assert.equal(result.deterministicBaselineDuration, 20);
    assert.equal(result.method, "fixed-critical-chain-lognormal-moment-matching");
    const output = join(directory, "percentiles.csv");
    const table = run([input, "--format", "table", "--output", output]);
    assert.equal(table.status, 0, table.stderr);
    assert.match(table.stdout, /Estimated project percentile/);
    assert.match(table.stdout, /Independent task durations/);
    const csv = readFileSync(output, "utf8");
    assert.match(csv, /Estimated project P99/);
    assert.match(csv, /Estimated project P98/);
    assert.match(table.stdout, /P98/);
    assert.match(csv, /Assumption,"Fixed Critical Chain/);
    assert.equal(run([input, "--output", output]).status, 1);
    assert.equal(readFileSync(output, "utf8"), csv);
    const csvInput = fileURLToPath(new URL("../../examples/resource-change-current.csv", import.meta.url));
    assert.equal(run([csvInput]).status, 0);
    assert.equal(run(["--help"]).status, 0);
    for (const args of [[], ["missing.json"], [input, "--format", "xml"], [input, "--output", "out.txt"]]) {
      const failure = run(args);
      assert.equal(failure.status, 1);
      assert.equal(failure.stdout, "");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


test('deterministic prefix is an additive shift, not part of the lognormal fit',()=>{
 const base=estimateProjectPercentiles([task('A',3,7),task('B',2,7,['A'])]);
 const shifted=estimateProjectPercentiles([task('Fixed',100,100),task('A',3,7,['Fixed']),task('B',2,7,['A'])]);
 for(const key of ['p50','p80','p95','p98','p99'] as const)close(shifted.projectPercentiles[key],base.projectPercentiles[key]+100);
 close(shifted.chainDistribution.deterministicShift,100);
 close(shifted.chainDistribution.mean,base.chainDistribution.mean+100);
});


test('two-task uncertain sum agrees with independent numerical convolution benchmark',()=>{
 const result=estimateProjectPercentiles([task('Fixed',100,100),task('A',3,7,['Fixed']),task('B',2,7,['A'])]);
 // Independent integration of E[F_B(q-A)] using normal-density quadrature;
 // constants are reproduced by scripts/validate-shifted-forecast.py.
 const benchmark={p95:119.463255751144,p98:123.98119227255648,p99:127.75600015867639};
 for(const key of ['p95','p98','p99'] as const){
  assert.ok(Math.abs(result.projectPercentiles[key]-benchmark[key])/(benchmark[key]-100)<.03);
 }
 const single=estimateProjectPercentiles([task('Fixed',103,103),task('B',2,7,['Fixed'])]);
 assert.ok(result.projectPercentiles.p95>single.projectPercentiles.p95,'restoring Punch uncertainty must not reduce P95 in this fixture');
});
