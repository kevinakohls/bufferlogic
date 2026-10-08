import { estimateProjectPercentiles, fitTaskLognormal } from "../src/percentiles.js";
import { scheduleProject } from "../src/scheduler.js";
import type { Task } from "../src/types.js";

const levels = { p50: .5, p80: .8, p95: .95, p98: .98, p99: .99 };

/** Mulberry32, with open-interval uniforms suitable for Box-Muller. */
function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return (((value ^ (value >>> 14)) >>> 0) + .5) / 4294967296;
  };
}

function summarize(sorted: readonly number[], probability: number) {
  const count = sorted.length;
  const rank = Math.ceil(count * probability);
  const uncertainty = 1.96 * Math.sqrt(count * probability * (1 - probability));
  const atRank = (value: number) => sorted[Math.max(0, Math.min(count - 1, Math.ceil(value) - 1))]!;
  return {
    duration: atRank(rank),
    // Normal approximation to binomial rank uncertainty, not model uncertainty.
    samplingInterval95: { lower: atRank(count * probability - uncertainty), upper: atRank(count * probability + uncertainty) },
  };
}

/** Development-only benchmark; normal product commands do not use simulation. */
export function validatePercentiles(tasks: readonly Task[], iterations = 100000, seed = 20261008) {
  if (!Number.isSafeInteger(iterations) || iterations < 1000 || iterations > 1000000) {
    throw new Error("Iterations must be an integer from 1000 to 1000000");
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error("Seed must be a uint32 integer");
  const approximation = estimateProjectPercentiles(tasks);
  const chain = new Set(approximation.criticalChain);
  const baselineChain = JSON.stringify(approximation.criticalChain);
  const fits = tasks.map(task => fitTaskLognormal(task.goodCase, task.poorCase));
  const random = randomSource(seed);
  const chainTimes: number[] = [];
  const projectTimes: number[] = [];
  let changedChain = 0;
  let chainMean = 0;
  let chainM2 = 0;
  for (let trial = 0; trial < iterations; trial++) {
    let chainDuration = 0;
    const sampled = tasks.map((task, index) => {
      const fit = fits[index]!;
      const normal = Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
      const duration = fit.sigma === 0 ? task.goodCase : Math.exp(fit.mu + fit.sigma * normal);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Sample exceeds numeric range for task ${task.id}`);
      if (chain.has(task.id)) chainDuration += duration;
      return { ...task, goodCase: duration, poorCase: duration };
    });
    const schedule = scheduleProject(sampled);
    chainTimes.push(chainDuration);
    projectTimes.push(schedule.projectP50);
    if (JSON.stringify(schedule.criticalChain) !== baselineChain) changedChain++;
    const delta = chainDuration - chainMean;
    chainMean += delta / (trial + 1);
    chainM2 += delta * (chainDuration - chainMean);
  }
  chainTimes.sort((a, b) => a - b);
  projectTimes.sort((a, b) => a - b);
  const error = (estimate: number, benchmark: number) => benchmark === 0 ? 0 : 100 * (estimate / benchmark - 1);
  const percentiles = Object.entries(levels).map(([key, probability]) => {
    const estimate = approximation.projectPercentiles[key as keyof typeof levels];
    const fixedChain = summarize(chainTimes, probability);
    const fullProject = summarize(projectTimes, probability);
    return { percentile: key.toUpperCase(), approximation: estimate, fixedChain, fullProject,
      errorVsFixedChainPercent: error(estimate, fixedChain.duration),
      errorVsFullProjectPercent: error(estimate, fullProject.duration) };
  });
  return {
    iterations, seed, rng: "mulberry32-box-muller", empiricalQuantile: "nearest-rank",
    approximation,
    fixedChainSampleMoments: { mean: chainMean, variance: chainM2 / (iterations - 1) },
    changedCriticalChainFraction: changedChain / iterations,
    percentiles,
    interpretation: "Simulation benchmark only, using independent lognormal inputs. Positive error means the approximation is higher than the benchmark. Rank intervals describe sampling error, not model accuracy. A changed chain includes tie-breaking changes; dispatch follows the existing priority policy and may change when tasks become eligible at different times.",
  };
}

export function benchmarkTable(result: ReturnType<typeof validatePercentiles>): string {
  const num = (value: number) => value.toFixed(2);
  const lines = [
    `Validation only: ${result.iterations} trials; seed ${result.seed}`,
    `Baseline chain: ${result.approximation.criticalChain.join(" -> ") || "(none)"}`,
    "Percentile | Approximation | Fixed-chain MC | Error % | Full-project MC | Error %",
    ...result.percentiles.map(row => [row.percentile, num(row.approximation), num(row.fixedChain.duration),
      num(row.errorVsFixedChainPercent), num(row.fullProject.duration), num(row.errorVsFullProjectPercent)].join(" | ")),
    `Trials with a different controlling chain: ${num(100 * result.changedCriticalChainFraction)}%`,
    "Approximate 95% sampling intervals (fixed chain / full project):",
    ...result.percentiles.map(row => `${row.percentile}: ${num(row.fixedChain.samplingInterval95.lower)}-${num(row.fixedChain.samplingInterval95.upper)} / ${num(row.fullProject.samplingInterval95.lower)}-${num(row.fullProject.samplingInterval95.upper)}`),
    result.interpretation,
  ];
  return lines.join("\n");
}
