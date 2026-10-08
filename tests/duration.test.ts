import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateP50, markEstimateStale, updateRemainingEstimate } from "../src/duration.js";

test("P20/P80 estimates produce the geometric-mean P50", () => {
  for (const [good, poor, expected] of [[1, 9, 3], [3, 12, 6], [4, 9, 6], [2, 8, 4], [1, 4, 2], [0.5, 2, 1]]) {
    assert.equal(calculateP50(good!, poor!), expected);
  }
});

test("reject zero, negative, nonfinite, and reversed estimates", () => {
  for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
    assert.throws(() => calculateP50(invalid, 12), /finite and greater than zero/);
    assert.throws(() => calculateP50(3, invalid), /finite and greater than zero/);
  }
  assert.throws(() => calculateP50(12, 3), /must not exceed/);
});

test("geometric mean handles extreme finite estimates", () => {
  for (const value of [1e200, 1e-200]) {
    assert.ok(Math.abs(calculateP50(value, value) / value - 1) < 1e-14);
  }
});

test("missing daily update marks the estimate stale without inventing progress", () => {
  const current = Object.freeze(updateRemainingEstimate({ goodCase: 3, poorCase: 12 }));
  const stale = markEstimateStale(current);
  const anotherMissedUpdate = markEstimateStale(stale);
  assert.deepEqual(anotherMissedUpdate, { goodCase: 3, poorCase: 12, estimateStatus: "stale" });
  assert.equal(calculateP50(stale.goodCase, stale.poorCase), 6);
  assert.equal(current.estimateStatus, "current");
});

test("an explicit remaining-duration update of 2/8 gives P50 4", () => {
  const updated = updateRemainingEstimate({ goodCase: 2, poorCase: 8 });
  assert.equal(calculateP50(updated.goodCase, updated.poorCase), 4);
  assert.equal(updated.estimateStatus, "current");
  assert.throws(() => updateRemainingEstimate({ goodCase: 0, poorCase: 8 }));
});
