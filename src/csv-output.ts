import type { Schedule, Task } from "./types.js";

const decimal = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function textCell(value: string): string {
  // Keep user-entered names/IDs as text when opened in spreadsheet software.
  const text = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
}

export function scheduleToCsv(schedule: Schedule, tasks: readonly Task[]): string {
  const names = new Map(tasks.map(task => [task.id, task.name]));
  const chain = new Set(schedule.criticalChain);
  const rows = ["ID,Task,Resource,P50 duration,Start,Finish,Critical Chain"];
  for (const task of schedule.tasks) {
    const name = names.get(task.id);
    if (name === undefined) throw new Error(`Missing task name for ${task.id}`);
    rows.push([
      textCell(task.id), textCell(name), textCell(task.resource),
      decimal.format(task.duration), decimal.format(task.start), decimal.format(task.finish),
      chain.has(task.id) ? "Yes" : "No",
    ].join(","));
  }
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}
