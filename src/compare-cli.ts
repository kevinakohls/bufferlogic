import { compareProjects } from "./compare.js";
import { readProject } from "./read-project.js";

const usage = "Usage: npm run --silent compare -- <current.json|current.csv> <what-if.json|what-if.csv>";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log(usage);
} else {
  try {
    if (args.length !== 2) throw new Error(usage);
    const current = readProject(args[0]!);
    const whatIf = readProject(args[1]!);
    console.log(JSON.stringify(compareProjects(current, whatIf), null, 2));
  } catch (error) {
    console.error(`BufferLogic: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
