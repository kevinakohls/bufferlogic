import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { parseOptions } from "./cli-options.js";
import { forecastProgress, parseProgressSnapshot } from "./progress.js";
import { progressToCsv, progressToTable } from "./progress-output.js";

const usage = "Usage: npm run progress -- <snapshot.json> [--format json|table] [--output progress.csv]";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") console.log(usage);
else {
  try {
    const { files, format, output } = parseOptions(args, 1, true);
    if (output !== undefined && extname(output).toLowerCase() !== ".csv") throw new Error("Output filename must end in .csv");
    const result = forecastProgress(parseProgressSnapshot(JSON.parse(readFileSync(files[0]!, "utf8"))));
    if (output !== undefined) {
      writeFileSync(output, progressToCsv(result), { encoding: "utf8", flag: "wx" });
      console.error(`Saved progress report to ${output}`);
    }
    if (format === "table") console.log(progressToTable(result));
    else if (output === undefined) console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`BufferLogic: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
