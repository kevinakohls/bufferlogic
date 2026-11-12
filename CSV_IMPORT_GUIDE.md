# CSV project loads and templates

Choose **Load files** to open a CSV as a workspace, replacing the current workspace
after confirmation when there is undownloaded work. Choose **Create from template**
to add a named project alongside existing projects. Both actions use the same task
columns, aliases, numeric rules and priority defaults.

Save spreadsheets as **CSV UTF-8 (Comma delimited)**, not XLSX or Markdown tables.
A UTF-8 BOM, CRLF, quoted commas, escaped quotes and quoted multiline text are
accepted. Numbers use decimal points, without thousands separators. Unknown extra
columns are ignored; duplicate or ambiguous headings are rejected.

## Task columns

| Column | Requirement / behavior |
| --- | --- |
| Task | Required heading and nonempty task name. |
| Resource | Required heading. A blank assignment makes an unassigned draft in the app; assign it before scheduling. |
| Good days | Required numeric estimate, no greater than Poor days. Alias: Low Estimate P20 (days). |
| Poor days | Required numeric estimate. Alias: High Estimate P80 (days). |
| ID | Optional heading. If present, every ID must be nonempty. If absent, source IDs are generated as 1, 2, 3… across nonblank data records. |
| Depends on | Optional; alias: Predecessors. Blank or none means no predecessors. Multiple IDs need a quoted comma-separated cell. |
| Priority | Optional. Supplied finite numbers are honored in loads and templates. Missing/blank values default to row order within each project. Lower numbers are preferred among eligible tasks. |
| Project | Optional for a single-project app/portfolio-CLI load. When present, every row must identify its project; first appearance determines project order. Explicit parsePortfolioCsv callers require this heading. |
| Supporting resources | Optional JSON array of resource/allocationPercent assignments; quote the CSV cell and escape its JSON quotes. |
| Checklist | Optional newline-separated checklist definitions, initially unchecked. |
| Description, Comments, Completion criteria, Lock reason | Optional task text. |

Task headings and recognized aliases are case-insensitive and trimmed. Good/Poor
estimates must both be positive, or both zero for a milestone. The legacy single-
project CLI engine still requires positive durations and assigned resources when
scheduling; use the portfolio engine/app for milestones and supporting resources.
Blank lines and repeated header records are skipped. No tasks is an import error.

For example, [manufacturing-template.csv](examples/manufacturing-template.csv)
contains the eight-task manufacturing chain and uses the software estimate aliases,
without Priority or Project. It can be used with either Load files or Create from
template. A minimal canonical example is:

```csv
ID,Task,Resource,Depends on,Good days,Poor days
1,Prepare,Mechanical,,5,7
2,Build,Electrical,1,2,3
```

Loads preserve source task IDs and allow cross-project dependencies. IDs must be
unique across the loaded portfolio. Templates create fresh project/task IDs and
remap internal dependencies. Source IDs may repeat across different template
projects, but each selected project's dependencies must stay within that project.
Templates honor supplied Priority values; this replaces the older behavior that
ignored them. Omit Priority to continue using row-order defaults.

## Calendar CSV

The calendar uses a separate capacity schema. All headings below are required,
even when only weekly rows are present:

```csv
Resource,Row type,Date,Monday hours,Tuesday hours,Wednesday hours,Thursday hours,Friday hours,Saturday hours,Sunday hours,Exception hours
Crew,weekly,,8,8,8,8,8,0,0,
Crew,exception,2026-12-25,,,,,,,,0
```

Weekly rows require seven hour values from 0 through 24, with Date and Exception
hours blank. Exception rows require a real YYYY-MM-DD date and Exception hours,
with weekday hours blank. Each resource needs one weekly row; duplicate weekly
rows or resource/date exceptions are errors. An exception requires a matching
weekly calendar. Header matching is case-insensitive; a BOM is accepted here too.

## Validation and preservation

Imports report all identifiable header problems together, then all identifiable
record problems after the header is usable. Errors name CSV record numbers,
columns or task IDs where available. Malformed quoting is a fatal syntax error;
fix it before record-level validation can continue. Missing dependency references,
duplicate IDs, cycles, invalid estimates/priorities, and supporting assignments are
validated before applying any data. A cycle report can include work blocked by it.

When both project and calendar files are submitted, errors from both are collected.
Failed file loads and template imports preserve the existing workspace and captured
baseline; no partial project or calendar is installed. The app displays the errors
and confirms that the existing workspace was kept. Correct the files and retry.
