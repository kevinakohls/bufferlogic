import { compareProjects } from "./compare.js";
import { readProject } from "./read-project.js";
import { parseOptions } from "./cli-options.js";
import { comparisonToTable } from "./table-output.js";

const usage = "Usage: npm run --silent compare -- <current.json|current.csv> <what-if.json|what-if.csv> [--format json|table]";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log(usage);
} else {
  try {
    const { files, format } = parseOptions(args, 2, false);
    const result = compareProjects(readProject(files[0]!), readProject(files[1]!));
    console.log(format === "table" ? comparisonToTable(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`BufferLogic: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
