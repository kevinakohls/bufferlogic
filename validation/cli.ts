import { writeFileSync } from "node:fs";
import { readProject } from "../src/read-project.js";
import { benchmarkTable, validatePercentiles } from "./benchmark.js";

const usage = "Usage: npm run validate-percentiles -- <project.json|project.csv> [--iterations 100000] [--seed 20261008] [--format table|json] [--output report.json]";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") console.log(usage);
else {
  try {
    if (!args[0] || args[0].startsWith("--")) throw new Error(usage);
    let iterations = 100000;
    let seed = 20261008;
    let format = "table";
    let output: string | undefined;
    const seen = new Set<string>();
    for (let index = 1; index < args.length; index += 2) {
      const flag = args[index]!;
      const value = args[index + 1];
      if (!value || value.startsWith("--") || seen.has(flag)) throw new Error(usage);
      seen.add(flag);
      if (flag === "--iterations" || flag === "--seed") {
        if (!/^\d+$/.test(value)) throw new Error(`${flag} must be an unsigned integer`);
        if (flag === "--iterations") iterations = Number(value);
        else seed = Number(value);
      } else if (flag === "--format" && (value === "table" || value === "json")) format = value;
      else if (flag === "--output") output = value;
      else throw new Error(usage);
    }
    const result = validatePercentiles(readProject(args[0]), iterations, seed);
    if (output !== undefined) writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
    console.log(format === "json" ? JSON.stringify(result, null, 2) : benchmarkTable(result));
  } catch (error) {
    console.error(`BufferLogic validation: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
