import { readProject } from "./read-project.js";
import { scheduleProject } from "./scheduler.js";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log("Usage: npm run --silent schedule -- <project.json|project.csv>");
} else {
  try {
    if (args.length !== 1) throw new Error("Usage: npm run --silent schedule -- <project.json|project.csv>");
    const result = scheduleProject(readProject(args[0]!));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`BufferLogic: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
