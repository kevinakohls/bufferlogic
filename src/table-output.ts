import type { compareProjects } from "./compare.js";
import type { Schedule, Task } from "./types.js";
import type { estimateProjectPercentiles } from "./percentiles.js";

const decimal = new Intl.NumberFormat("en-US", {
  useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const number = (value: number) => decimal.format(value);
const difference = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;

function table(headers: readonly string[], rows: readonly string[][]): string {
  // Keep user text on one line so multiline names cannot break the table.
  const clean = (cell: string) => cell.replace(/[\x00-\x1f\x7f]/g, " ");
  const lines = [headers.map(clean), ...rows.map(row => row.map(clean))];
  const widths = headers.map((_, index) => Math.max(...lines.map(row => row[index]!.length)));
  const render = (row: readonly string[]) => row.map((cell, index) => cell.padEnd(widths[index]!)).join(" | ").trimEnd();
  return [render(lines[0]!), widths.map(width => "-".repeat(width)).join("-+-"),
    ...lines.slice(1).map(render)].join("\n");
}

export function percentilesToTable(result: ReturnType<typeof estimateProjectPercentiles>): string {
  return [`Deterministic P50-task baseline: ${number(result.deterministicBaselineDuration)}`,
    `Baseline Critical Chain: ${result.criticalChain.join(" -> ") || "(none)"}`, "",
    table(["Estimated project percentile", "Duration (input units)"], Object.entries(result.projectPercentiles).map(([key, value]) => [key.toUpperCase(), number(value)])),
    "", `Assumptions: ${result.assumptions.join("; ")}.`, result.interpretation].join("\n");
}

export function scheduleToTable(schedule: Schedule, tasks: readonly Task[]): string {
  const names = new Map(tasks.map(task => [task.id, task.name]));
  const chain = new Set(schedule.criticalChain);
  const rows = schedule.tasks.map(task => [task.id, names.get(task.id) ?? task.id,
    task.resource, number(task.duration), number(task.start), number(task.finish),
    chain.has(task.id) ? "Yes" : "No"]);
  return [table(["ID", "Task", "Resource", "P50", "Start", "Finish", "Critical Chain"], rows),
    "", `Project P50: ${number(schedule.projectP50)} (input units)`,
    `Critical Chain: ${schedule.criticalChain.join(" -> ") || "(none)"}`].join("\n");
}

export function comparisonToTable(result: ReturnType<typeof compareProjects>): string {
  const summary = [
    `Current State P50: ${number(result.currentState.projectP50)} (deterministic task-P50 baseline)`,
    `What-If P50: ${number(result.whatIf.projectP50)} (deterministic task-P50 baseline)`,
    `Impact: ${difference(result.impactDays)} (input units; positive = later, negative = earlier)`,
    `Current State Critical Chain: ${result.currentState.criticalChain.join(" -> ") || "(none)"}`,
    `What-If Critical Chain: ${result.whatIf.criticalChain.join(" -> ") || "(none)"}`,
    "",
    table(["Estimated project percentile", "Current State", "What-If", "Difference"],
      Object.entries(result.percentileEstimates.differences).map(([key, change]) => {
        const percentile = key as keyof typeof result.percentileEstimates.differences;
        return [key.toUpperCase(), number(result.percentileEstimates.currentState.projectPercentiles[percentile]),
          number(result.percentileEstimates.whatIf.projectPercentiles[percentile]), difference(change)];
      })),
    "",
    `Assumptions: ${result.percentileEstimates.currentState.assumptions.join("; ")}.`,
    result.percentileEstimates.currentState.interpretation,
    "",
  ];
  return summary.concat(result.taskChanges.length === 0 ? "No task timings changed." : table(
    ["ID", "Current start", "Current finish", "What-If start", "What-If finish", "Start change", "Finish change"],
    result.taskChanges.map(task => [task.id, number(task.currentState.start), number(task.currentState.finish),
      number(task.whatIf.start), number(task.whatIf.finish), difference(task.startDifference), difference(task.finishDifference)])
  )).join("\n");
}
