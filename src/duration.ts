import type { DurationEstimates, RemainingEstimate } from "./types.js";

/** P20 and P80 are symmetric lognormal quantiles, so P50 is their geometric mean. */
export function calculateP50(goodCase: number, poorCase: number): number {
  if (!Number.isFinite(goodCase) || !Number.isFinite(poorCase)
      || goodCase <= 0 || poorCase <= 0) {
    throw new Error("Duration estimates must be finite and greater than zero");
  }
  if (goodCase > poorCase) {
    throw new Error("goodCase must not exceed poorCase");
  }
  const product = goodCase * poorCase;
  // Use the direct formula normally, and roots first for extreme magnitudes.
  return Number.isFinite(product) && product > 0
    ? Math.sqrt(product)
    : Math.sqrt(goodCase) * Math.sqrt(poorCase);
}

export function updateRemainingEstimate(estimates: DurationEstimates): RemainingEstimate {
  calculateP50(estimates.goodCase, estimates.poorCase);
  return { ...estimates, estimateStatus: "current" };
}

/** No response is not progress: retain both estimates without subtracting time. */
export function markEstimateStale(estimate: RemainingEstimate): RemainingEstimate {
  calculateP50(estimate.goodCase, estimate.poorCase);
  return { ...estimate, estimateStatus: "stale" };
}
