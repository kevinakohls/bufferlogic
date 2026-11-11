/** Comma-separated records with quoted fields, escaped quotes, and CRLF support. */
export function csvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let state: "plain" | "quoted" | "closed" = "plain";
  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (state === "quoted") {
      if (char === '"') {
        if (input[index + 1] === '"') { field += '"'; index++; }
        else state = "closed";
      } else field += char;
      continue;
    }
    if (char === "," || char === "\n" || char === "\r") {
      row.push(field);
      field = "";
      state = "plain";
      if (char !== ",") {
        rows.push(row);
        row = [];
        if (char === "\r" && input[index + 1] === "\n") index++;
      }
    } else if (state === "closed") {
      throw new Error("CSV has unexpected characters after a closing quote");
    } else if (char === '"') {
      if (field !== "") throw new Error("CSV quote must begin at the start of a field");
      state = "quoted";
    } else field += char;
  }
  if (state === "quoted") throw new Error("CSV has an unclosed quoted field");
  if (field !== "" || row.length > 0 || state === "closed") {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

