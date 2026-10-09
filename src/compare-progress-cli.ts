import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { parseOptions } from "./cli-options.js";
import { compareProgress, parseProgressSnapshot } from "./progress.js";
import { progressComparisonToCsv, progressComparisonToTable } from "./progress-output.js";

const usage = "Usage: npm run compare-progress -- <current.json> <what-if.json> [--format json|table] [--output comparison.csv]";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") console.log(usage);
else {
  try {
    const { files, format, output } = parseOptions(args, 2, true);
    if (output !== undefined && extname(output).toLowerCase() !== ".csv") throw new Error("Output filename must end in .csv");
    const load = (path: string) => parseProgressSnapshot(JSON.parse(readFileSync(path, "utf8")));
    const result = compareProgress(load(files[0]!), load(files[1]!));
    if (output !== undefined) {
      writeFileSync(output, progressComparisonToCsv(result), { encoding: "utf8", flag: "wx" });
      console.error(`Saved progress comparison to ${output}`);
    }
    if (format === "table") console.log(progressComparisonToTable(result));
    else if (output === undefined) console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`BufferLogic: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
