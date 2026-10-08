import { writeFileSync } from "node:fs";
import { extname } from "node:path";
import { scheduleToCsv } from "./csv-output.js";
import { readProject } from "./read-project.js";
import { scheduleProject } from "./scheduler.js";

const args = process.argv.slice(2);
const usage = "Usage: npm run --silent schedule -- <project.json|project.csv> [--output schedule.csv]";
if (args.length === 1 && args[0] === "--help") {
  console.log(usage);
} else {
  try {
    if (args.length !== 1 && !(args.length === 3 && args[1] === "--output")) {
      throw new Error(usage);
    }
    const output = args[2];
    if (output !== undefined && extname(output).toLowerCase() !== ".csv") {
      throw new Error("Output filename must end in .csv");
    }
    const tasks = readProject(args[0]!);
    const result = scheduleProject(tasks);
    if (output === undefined) console.log(JSON.stringify(result, null, 2));
    else {
      // Exclusive creation also protects input files, including symlinks/hard links.
      writeFileSync(output, scheduleToCsv(result, tasks), { encoding: "utf8", flag: "wx" });
      console.error(`Saved schedule CSV to ${output}`);
    }
  } catch (error) {
    console.error(`BufferLogic: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
