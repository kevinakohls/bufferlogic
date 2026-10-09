import { writeFileSync } from "node:fs";
import { extname } from "node:path";
import { parseOptions } from "./cli-options.js";
import { readProject } from "./read-project.js";
import { estimateProjectPercentiles } from "./percentiles.js";
import { percentilesToCsv } from "./csv-output.js";
import { percentilesToTable } from "./table-output.js";

const usage = "Usage: npm run --silent percentiles -- <project.json|project.csv> [--format json|table] [--output percentiles.csv]";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") console.log(usage);
else {
  try {
    const { files, format, output } = parseOptions(args, 1, true);
    if (output !== undefined && extname(output).toLowerCase() !== ".csv") throw new Error("Output filename must end in .csv");
    const tasks = readProject(files[0]!);
    const result = estimateProjectPercentiles(tasks);
    if (output !== undefined) {
      writeFileSync(output, percentilesToCsv(result), { encoding: "utf8", flag: "wx" });
      console.error(`Saved project percentile estimates to ${output}`);
    }
    if (format === "table") console.log(percentilesToTable(result));
    else if (output === undefined) console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`BufferLogic: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
