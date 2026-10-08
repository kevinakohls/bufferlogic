import { readFileSync } from "node:fs";
import { parseProject } from "./project-input.js";
import { scheduleProject } from "./scheduler.js";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log("Usage: npm run --silent schedule -- <project.json>");
} else {
  try {
    if (args.length !== 1) throw new Error("Usage: npm run --silent schedule -- <project.json>");
    const project: unknown = JSON.parse(readFileSync(args[0]!, "utf8"));
    const result = scheduleProject(parseProject(project));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`BufferLogic: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
