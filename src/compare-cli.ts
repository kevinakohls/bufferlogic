import { compareProjects } from "./compare.js";
import { readProject } from "./read-project.js";
import { parseOptions } from "./cli-options.js";
import { comparisonToTable } from "./table-output.js";

const usage = "Usage: npm run --silent compare -- <current.json|current.csv> <what-if.json|what-if.csv> [--format json|table] [--output comparison.csv]";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log(usage);
} else {
  try {
    const { files, format, output } = parseOptions(args, 2, true);
    if (output !== undefined && extname(output).toLowerCase() !== ".csv") {
      throw new Error("Output filename must end in .csv");
    }
    const current = readProject(files[0]!);
    const whatIf = readProject(files[1]!);
    const result = compareProjects(current, whatIf);
    if (output !== undefined) {
      writeFileSync(output, comparisonToCsv(current, whatIf), { encoding: "utf8", flag: "wx" });
      console.error(`Saved comparison CSV to ${output}`);
    }
    if (format === "table") console.log(comparisonToTable(result));
    else if (output === undefined) console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`BufferLogic: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
import { writeFileSync } from "node:fs";
import { extname } from "node:path";
import { comparisonToCsv } from "./csv-output.js";
