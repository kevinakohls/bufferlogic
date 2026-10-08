import type { compareProgress, forecastProgress } from "./progress.js";

const decimal = new Intl.NumberFormat("en-US", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (value: number) => decimal.format(value);
const cell = (value: string) => `"${(/^[\s]*[=+\-@]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
const keys = ["p50", "p80", "p95", "p98", "p99"] as const;
const text = (value: string) => value.replace(/[\x00-\x1f\x7f]/g, " ");
export function progressToTable(result: ReturnType<typeof forecastProgress>): string {
  return [
    `As of day ${num(result.asOf)}; status: ${result.projectStatus}`,
    `Deterministic remaining: ${num(result.deterministicRemainingDuration)} days; completion day: ${num(result.deterministicCompletionDay)}`,
    `Remaining Critical Chain: ${result.remainingCriticalChain.join(" -> ") || "(none)"}`,
    `Stale active estimates: ${result.staleTaskIds.join(", ") || "(none)"}`,
    "ID | Task | Status | Resource | Remaining P50 | Start day | Finish day",
    ...result.tasks.map(task => [text(task.id), text(task.name), task.status, text(task.resource), num(task.remainingP50), num(task.start), num(task.finish)].join(" | ")),
    "", "Project estimate | Remaining days | Completion day | Whole completion day (round up)",
    ...keys.map(key => [key.toUpperCase(), num(result.remainingPercentileEstimates.projectPercentiles[key]), num(result.completionPercentiles[key]), result.wholeDayCompletion[key]].join(" | ")),
    "Completed actuals (retained history):",
    ...result.completedTasks.map(task => `${text(task.id)}: ${num(task.actuals.start)}-${num(task.actuals.finish)}`),
    `Assumptions: ${result.remainingPercentileEstimates.assumptions.join("; ")}.`,
    result.remainingPercentileEstimates.interpretation,
  ].join("\n");
}
export function progressToCsv(result: ReturnType<typeof forecastProgress>): string {
  const rows = ["Metric,Remaining days,Completion day,Whole completion day (round up)",
    `Deterministic task-P50 baseline,${num(result.deterministicRemainingDuration)},${num(result.deterministicCompletionDay)},${Math.ceil(result.deterministicCompletionDay)}`,
    ...keys.map(key => [key.toUpperCase(), num(result.remainingPercentileEstimates.projectPercentiles[key]), num(result.completionPercentiles[key]), result.wholeDayCompletion[key]].join(",")),
    "", `As of day,${num(result.asOf)}`, `Stale active estimates,${cell(result.staleTaskIds.join(", "))}`,
    `Assumptions,${cell(result.remainingPercentileEstimates.assumptions.join("; "))}`,
    `Interpretation,${cell(result.remainingPercentileEstimates.interpretation)}`, "",
    "ID,Task,Status,Resource,Remaining P50,Start day,Finish day,Estimate status",
    ...result.tasks.map(task => [cell(task.id), cell(task.name), task.status, cell(task.resource), num(task.remainingP50), num(task.start), num(task.finish), task.remaining?.estimateStatus ?? ""].join(",")),
    "", "Completed ID,Task,Resource,Actual start day,Actual finish day",
    ...result.completedTasks.map(task => [cell(task.id), cell(task.name), cell(task.resource), num(task.actuals.start), num(task.actuals.finish)].join(","))];
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}
export function progressComparisonToTable(result: ReturnType<typeof compareProgress>): string {
  return [`As of day ${num(result.asOf)}`,
    `Deterministic completion difference: ${num(result.deterministicCompletionDifference)} days`,
    `Current remaining chain: ${result.currentState.remainingCriticalChain.join(" -> ") || "(none)"}`,
    `What-If remaining chain: ${result.whatIf.remainingCriticalChain.join(" -> ") || "(none)"}`,
    "Percentile | Current completion | What-If completion | Difference | Current whole day | What-If whole day | Whole-day difference",
    ...keys.map(key => [key.toUpperCase(), num(result.currentState.completionPercentiles[key]), num(result.whatIf.completionPercentiles[key]),
      num(result.completionPercentileDifferences[key]), result.currentState.wholeDayCompletion[key], result.whatIf.wholeDayCompletion[key], result.wholeDayDifferences[key]].join(" | ")),
    `Current stale estimates: ${result.currentState.staleTaskIds.join(", ") || "(none)"}`,
    `What-If stale estimates: ${result.whatIf.staleTaskIds.join(", ") || "(none)"}`,
    `Assumptions: ${result.currentState.remainingPercentileEstimates.assumptions.join("; ")}.`,
    result.currentState.remainingPercentileEstimates.interpretation].join("\n");
}
export function progressComparisonToCsv(result: ReturnType<typeof compareProgress>): string {
  const rows = ["Metric,Current completion day,What-If completion day,Difference,Current whole day,What-If whole day,Whole-day difference",
    `Deterministic task-P50 baseline,${num(result.currentState.deterministicCompletionDay)},${num(result.whatIf.deterministicCompletionDay)},${num(result.deterministicCompletionDifference)},${Math.ceil(result.currentState.deterministicCompletionDay)},${Math.ceil(result.whatIf.deterministicCompletionDay)},${Math.ceil(result.whatIf.deterministicCompletionDay) - Math.ceil(result.currentState.deterministicCompletionDay)}`,
    ...keys.map(key => [key.toUpperCase(), num(result.currentState.completionPercentiles[key]), num(result.whatIf.completionPercentiles[key]), num(result.completionPercentileDifferences[key]),
      result.currentState.wholeDayCompletion[key], result.whatIf.wholeDayCompletion[key], result.wholeDayDifferences[key]].join(",")), "",
    `As of day,${num(result.asOf)}`,
    `Current remaining chain,${cell(result.currentState.remainingCriticalChain.join(" -> "))}`,
    `What-If remaining chain,${cell(result.whatIf.remainingCriticalChain.join(" -> "))}`,
    `Current stale estimates,${cell(result.currentState.staleTaskIds.join(", "))}`,
    `What-If stale estimates,${cell(result.whatIf.staleTaskIds.join(", "))}`,
    `Assumptions,${cell(result.currentState.remainingPercentileEstimates.assumptions.join("; "))}`,
    `Interpretation,${cell(result.currentState.remainingPercentileEstimates.interpretation)}`];
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}
