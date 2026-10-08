import { calculateP50 } from "./duration.js";
import { scheduleProject } from "./scheduler.js";
import type { Task } from "./types.js";

const z80 = 0.8416212335729143;
const normalQuantiles = { p50: 0, p80: z80, p95: 1.6448536269514722, p99: 2.3263478740408408 };

/** Lognormal parameters and moments fitted to task P20/P80 estimates. */
export function fitTaskLognormal(goodCase: number, poorCase: number) {
  calculateP50(goodCase, poorCase);
  const mu = (Math.log(goodCase) + Math.log(poorCase)) / 2;
  const sigma = (Math.log(poorCase) - Math.log(goodCase)) / (2 * z80);
  const sigmaSquared = sigma * sigma;
  const mean = sigma === 0 ? goodCase : Math.exp(mu + sigmaSquared / 2);
  const variance = sigma === 0 ? 0 : Math.expm1(sigmaSquared) * mean * mean;
  if (!Number.isFinite(mean) || !Number.isFinite(variance) || mean <= 0) {
    throw new Error("Task lognormal moments exceed numeric range");
  }
  return { mu, sigma, mean, variance };
}

/** Moment-match a fixed baseline Critical Chain sum; no random sampling. */
export function estimateProjectPercentiles(tasks: readonly Task[]) {
  const baseline = scheduleProject(tasks);
  const byId = new Map(tasks.map(task => [task.id, task]));
  let mean = 0;
  let variance = 0;
  for (const id of baseline.criticalChain) {
    const task = byId.get(id)!;
    const moments = fitTaskLognormal(task.goodCase, task.poorCase);
    mean += moments.mean;
    variance += moments.variance;
  }
  if (!Number.isFinite(mean) || !Number.isFinite(variance)) {
    throw new Error("Critical Chain moments exceed numeric range");
  }
  const sigmaSquared = mean === 0 ? 0 : Math.log1p((variance / mean) / mean);
  const mu = mean === 0 ? null : Math.log(mean) - sigmaSquared / 2;
  const sigma = Math.sqrt(sigmaSquared);
  const quantile = (z: number) => {
    const value = mu === null ? 0 : variance === 0 ? mean : Math.exp(mu + sigma * z);
    if (!Number.isFinite(value)) throw new Error("Project percentile exceeds numeric range");
    return value;
  };
  return {
    method: "fixed-critical-chain-lognormal-moment-matching" as const,
    assumptions: ["Independent task durations", "Fixed Critical Chain from the deterministic P50 schedule"],
    interpretation: "Approximate whole-project completion percentiles conditional on the baseline Critical Chain remaining controlling; alternate chains, correlations, and calendars are not modeled.",
    deterministicBaselineDuration: baseline.projectP50,
    criticalChain: baseline.criticalChain,
    chainDistribution: { mean, variance, mu, sigma },
    projectPercentiles: {
      p50: quantile(normalQuantiles.p50), p80: quantile(normalQuantiles.p80),
      p95: quantile(normalQuantiles.p95), p99: quantile(normalQuantiles.p99),
    },
  };
}
