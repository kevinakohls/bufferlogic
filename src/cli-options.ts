export function parseOptions(args: readonly string[], fileCount: number, allowOutput: boolean) {
  const files = args.slice(0, fileCount);
  if (files.length !== fileCount || files.some(file => file.startsWith("--"))) {
    throw new Error(`Expected ${fileCount} input file${fileCount === 1 ? "" : "s"}`);
  }
  let format: "json" | "table" = "json";
  let output: string | undefined;
  const seen = new Set<string>();
  for (let index = fileCount; index < args.length; index += 2) {
    const flag = args[index]!;
    const value = args[index + 1];
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--format") {
      if (value !== "json" && value !== "table") throw new Error("Format must be json or table");
      format = value;
    } else if (flag === "--output" && allowOutput) output = value;
    else throw new Error(`Unknown option: ${flag}`);
  }
  return { files, format, output };
}
