import { parseProject } from "./project-input.js";
import type { Task } from "./types.js";

/** Comma-separated records with quoted fields, escaped quotes, and CRLF support. */
function records(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let state: "plain" | "quoted" | "closed" = "plain";
  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (state === "quoted") {
      if (char === '"') {
        if (input[index + 1] === '"') { field += '"'; index++; }
        else state = "closed";
      } else field += char;
      continue;
    }
    if (char === "," || char === "\n" || char === "\r") {
      row.push(field);
      field = "";
      state = "plain";
      if (char !== ",") {
        rows.push(row);
        row = [];
        if (char === "\r" && input[index + 1] === "\n") index++;
      }
    } else if (state === "closed") {
      throw new Error("CSV has unexpected characters after a closing quote");
    } else if (char === '"') {
      if (field !== "") throw new Error("CSV quote must begin at the start of a field");
      state = "quoted";
    } else field += char;
  }
  if (state === "quoted") throw new Error("CSV has an unclosed quoted field");
  if (field !== "" || row.length > 0 || state === "closed") {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const columns = ["ID", "Task", "Resource", "Depends on", "Good days", "Poor days", "Priority"] as const;

export function parseProjectCsv(text: string): Task[] {
  const rows = records(text);
  const header = rows.shift()?.map(cell => cell.trim());
  if (!header) throw new Error("CSV must contain a header row");
  if (new Set(header).size !== header.length) throw new Error("CSV has duplicate column names");
  for (const column of columns) {
    if (!header.includes(column)) throw new Error(`CSV is missing column: ${column}`);
  }
  const tasks = rows.flatMap((row, index) => {
    if (row.every(cell => cell.trim() === "")) return [];
    const label = `CSV record ${index + 2}`;
    if (row.length !== header.length) throw new Error(`${label} has the wrong number of fields`);
    const cell = (column: typeof columns[number]) => row[header.indexOf(column)]!.trim();
    const number = (column: "Good days" | "Poor days" | "Priority") => {
      const value = cell(column);
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
          || !Number.isFinite(Number(value))) {
        throw new Error(`${label}: ${column} must be a finite number`);
      }
      return Number(value);
    };
    const dependencies = cell("Depends on");
    return [{
      id: cell("ID"), name: cell("Task"), resource: cell("Resource"),
      dependsOn: dependencies === "" || dependencies.toLowerCase() === "none"
        ? [] : dependencies.split(",").map(id => id.trim()),
      goodCase: number("Good days"), poorCase: number("Poor days"), priority: number("Priority"),
    }];
  });
  return parseProject({ tasks });
}
