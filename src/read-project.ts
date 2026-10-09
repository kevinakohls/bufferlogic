import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parseProjectCsv } from "./csv-input.js";
import { parseProject } from "./project-input.js";
import type { Task } from "./types.js";

export function readProject(path: string): Task[] {
  const text = readFileSync(path, "utf8");
  return extname(path).toLowerCase() === ".csv"
    ? parseProjectCsv(text)
    : parseProject(JSON.parse(text));
}
