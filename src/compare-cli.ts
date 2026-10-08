import { readFileSync } from "node:fs";
import { compareProjects } from "./compare.js";
import { parseProject } from "./project-input.js";

const usage = "Usage: npm run --silent compare -- <current.json> <what-if.json>";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log(usage);
} else {
  try {
    if (args.length !== 2) throw new Error(usage);
    const current = parseProject(JSON.parse(readFileSync(args[0]!, "utf8")));
    const whatIf = parseProject(JSON.parse(readFileSync(args[1]!, "utf8")));
    console.log(JSON.stringify(compareProjects(current, whatIf), null, 2));
  } catch (error) {
    console.error(`BufferLogic: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
