# Deterministic P50 engine (v0.1)

Requires Node.js 22 or newer and npm. There are no runtime dependencies.
TypeScript and Node type declarations are development dependencies; tests use
Node's built-in `node:test` runner, so no separate test framework is needed.

From the repository root:

```sh
npm ci
npm test
npm run demo
```

If the default npm cache is unwritable in the cloud environment, use
`npm ci --cache /workspace/.npm-cache`. `npm test` compiles with strict
TypeScript settings before running the tests. Generated files go into ignored
`dist/`; the runnable demo is `examples/scenario1.ts`.

## Scheduling contract

`scheduleProject(tasks)` returns dispatch-ordered task timings, `projectP50`,
and one deterministic `criticalChain`. It does not mutate task inputs.

- All durations use the same unit (days in the example). P50 is
  `sqrt(goodCase * poorCase)`. Estimates must be finite, positive, and
  `goodCase <= poorCase`.
- Lower numeric priorities go first among tasks whose dependencies are complete
  and whose resource is available. Equal priorities preserve input order.
  Blocked tasks do not reserve resources. There is no order optimization.
- Tasks run without interruption. Each resource has capacity one; different
  resources can run concurrently. Resources are available from time zero;
  calendars, external workloads, and switching overhead are outside v0.1.
- Dependency references and cycles are validated before dispatch. Duplicate
  IDs, blank identifiers/names/resources, and nonfinite priorities are rejected.
- Each dispatch records its technical predecessors and the previous task on
  its resource. Backtracking from the latest finish through this combined graph
  produces the Critical Chain. Equal-length alternatives use dispatch order;
  the result is one controlling chain, not an enumeration of all tied chains.
- The scheduler computes a full-project baseline from original estimates.
  Optional task status, remaining estimates, and completed-task actuals are
  retained as metadata, not interpreted as a live rescheduling model.

`markEstimateStale` preserves remaining estimates exactly. Only an explicit
`updateRemainingEstimate` changes them and marks them current. Neither helper
infers progress from elapsed time or implements notifications.

## Acceptance results

Scenario #1 gives 20 days and `A -> B -> D -> F -> G -> H`.
The `B -> D` edge comes from Developer 1 contention, not a technical dependency.
Swapping B and D priorities gives 22 days, a +2 day impact. Automated tests
verify both complete schedules and that Current State is unchanged.

## Schedule your own project

Run the supplied JSON example from the repository root:

```sh
npm run schedule -- examples/project.json
```

Copy `examples/project.json` to your own file and edit its `tasks` array. Each
task requires `id`, `name`, `goodCase`, `poorCase`, `resource`, `dependsOn`
(an array, empty for no dependencies), and numeric `priority`. Use the same
duration unit for every task. Additional metadata is allowed but does not
affect baseline scheduling. The input file is never modified.

The output includes task durations/start/finish times, technical and resource
predecessors, `criticalChain`, and `projectP50`. To save pure JSON without npm's
command banner:

```sh
npm run --silent schedule -- examples/project.json > schedule.json
```

Invalid JSON, malformed tasks, missing files, invalid estimates/dependencies,
or dependency cycles produce an error on stderr and a nonzero exit code.
Use `npm run --silent schedule -- --help` for usage.

## Compare Current State and What-If

```sh
npm run compare -- examples/user-project.json examples/user-project-what-if.json
```

The two paths identify existing JSON files; `current.json` and `what-if.json`
are placeholder names, not files created automatically. Both inputs must
contain the same task IDs. Comparison matches by ID, allows changes to
estimates/resources/dependencies/priorities, and leaves both files unchanged.

Output is JSON with each scenario's P50 and Critical Chain, `impactDays`
(What-If minus Current State), and `taskChanges` containing start/finish
differences for tasks with changed timings. Positive impact means later
completion; negative means earlier completion. Units must be days in both
inputs for `impactDays` to represent days. Values retain full precision.
Use `npm run --silent compare -- <current.json> <what-if.json>` for pure JSON
output or `npm run --silent compare -- --help` for usage.

## Excel CSV input

Save the sheet as **CSV UTF-8 (Comma delimited)**. Both `schedule` and
`compare` accept `.csv` paths as well as JSON (including mixed-format
comparisons). No additional packages are needed.

```sh
npm run schedule -- project.csv
npm run compare -- current.csv what-if.csv
```

Required column names are `ID`, `Task`, `Resource`, `Depends on`, `Good days`,
`Poor days`, and `Priority`. Column order may vary; extra metadata columns
are ignored. Use a blank dependency cell or `none` for no dependencies.
Multiple dependencies are comma-separated IDs within a quoted CSV field,
such as `"B,C,D"`; Excel adds the quotes when exporting. Numbers must use
a decimal point. UTF-8 markers, Windows line endings, quoted commas,
escaped quotes, and multiline quoted task names are supported.

Inputs remain unchanged. Malformed CSV, missing/duplicate headers, invalid
numbers, and invalid schedules fail with an error and nonzero exit code.

## Export a schedule for Excel

```sh
npm run schedule -- project.csv --output schedule.csv
```

JSON inputs also support `--output`. The CSV includes ID, task name, resource,
P50 duration, start, finish, and a Yes/No Critical Chain flag, in dispatch
order. CSV numeric values use two decimal places, without scientific notation
or thousands separators. This rounds display values only; scheduling and JSON
output retain full precision. Very small durations can therefore display as
0.00. Start and finish are elapsed units from project time zero, not calendar
dates. Excel may apply its own cell display format when opening a CSV.

The reviewer examples use days. Future explicit unit support will default to
8 working hours per day; hours/minutes input and a settings UI are deferred.

Exports use UTF-8 with an Excel-compatible marker and Windows line endings.
Quoted text handles commas, quotes, and newlines. Text beginning with a
spreadsheet formula character is prefixed with an apostrophe so it is treated
as text. The command refuses to overwrite an existing file: choose a new
output filename or remove the old output yourself. Input files remain unchanged.
Without `--output`, the existing JSON-on-stdout behavior is preserved.

## Readable console summaries

```sh
npm run schedule -- project.csv --format table
npm run compare -- current.csv what-if.csv --format table
```

Schedule tables include names, resources, durations, timings, and Critical
Chain membership, followed by project P50 and chain. Comparison tables show
both P50 values and chains, signed completion impact, and changed task
timings. All displayed numbers use two decimal places; calculations remain
at full precision. Units are the consistent units supplied in the input
(days in the reviewer examples). JSON remains the default; `--format json`
can also request it explicitly.

Combine `--format table --output schedule.csv` to display a summary and
export CSV in the same command. Options follow the input filenames and may
appear in either order. Existing output files remain protected.

## Export a comparison for Excel

```sh
npm run compare -- current.csv what-if.csv --output comparison.csv
```

JSON and mixed CSV/JSON inputs work too. The report starts with project P50
and Critical Chain summaries, followed by a blank row and a table of every
task (including unchanged tasks) matched by ID, in Current State dispatch
order. It includes both names/resources, durations, start/finish times,
signed timing differences, and Critical Chain membership for each scenario.
Differences are What-If minus Current State: positive means later, negative
means earlier. Values display two decimals; calculations retain precision.
Both scenarios must use the same units and task IDs.

Add `--format table` to show a console summary while exporting. Otherwise an
export writes only the file, with a status message on stderr. Existing files
are never overwritten. The report uses the same Excel-compatible UTF-8,
quoting, and text protection as schedule exports.

## Estimate whole-project completion percentiles

```sh
npm run percentiles -- project.csv --format table
npm run percentiles -- project.csv --output project-percentiles.csv
```

JSON input also works; JSON output is the default. This command estimates
the entire baseline Critical Chain's P50, P80, P95, P98, and P99 using a deterministic
lognormal moment-matching approximation. It does not sum task percentiles
or run separate schedules with every task set to P80/P95/P98/P99. It does not
use Monte Carlo. The existing schedule/compare commands remain unchanged.

For each chain task, with `z80 = 0.8416212335729143`:

```text
mu = (ln(P20) + ln(P80)) / 2
sigma = (ln(P80) - ln(P20)) / (2 * z80)
mean = exp(mu + sigma²/2)
variance = expm1(sigma²) * mean²
```

Sum the means and variances of the independent tasks on the deterministic
P50 Critical Chain. For total mean M and variance V, approximate the sum as
lognormal with `sigmaCC² = ln(1 + V/M²)` and
`muCC = ln(M) - sigmaCC²/2`. Its percentile is `exp(muCC + sigmaCC*z)`.
Standard normal z values are 0, z80, 1.6448536269514722,
2.0537489106318225, and 2.3263478740408408 for P50/P80/P95/P98/P99 respectively.

Assumptions are independent task durations and a fixed baseline Critical
Chain. Tasks outside that chain, correlations, changing resource order,
alternate controlling chains, calendars, and progress are not modeled.
The sum of lognormals is generally not lognormal, so these are approximate
project completion percentiles conditional on the baseline chain remaining
controlling, not calibrated probability guarantees. Tail estimates, especially
P99, are sensitive to the estimates and assumed lognormal shape.

The deterministic sum of task P50s is reported separately and may differ
from the approximated whole-chain P50. Empty projects return zero; a chain
of fixed-duration tasks returns the same duration at all percentiles.
Unsupported numeric ranges are rejected instead of exporting infinity.
CSV shows two decimals and includes assumptions; JSON retains full precision
and the fitted aggregate moments. Existing output files are protected.

The `compare` command now includes estimated project P50/P80/P95/P98/P99
for both scenarios and differences (What-If minus Current State), using each
scenario's own baseline Critical Chain. JSON adds `percentileEstimates`
alongside the original deterministic fields. Console and CSV summaries label
the deterministic task-P50 baseline separately from estimated project P50.
Task timings remain from the deterministic baseline, not percentile schedules.
Both output formats include the approximation assumptions. Even a change
that leaves baseline timing unchanged can change estimated upper percentiles.

### Whole-day planning view

Percentile console and CSV reports add a **Whole days (round up)** column.
Comparison reports show both scenarios' whole-day values and their difference.
This view assumes inputs are in days; it does not convert hours or apply
working calendars. Choose day estimates when using this view.

Each completion duration is rounded up from its full-precision value, before
two-decimal display formatting. A value just above 19 may display as 19.00
but correctly plan as 20 days. Exact integers and zero remain unchanged.
Differences subtract the two rounded completion days, rather than rounding
the raw difference. For example, 5.1 and 5.9 both plan as 6 days, so the
whole-day impact is zero. Raw estimates, calculations, JSON, and deterministic
task timings retain their precision. Rounding is a planning display choice,
not a claim of improved prediction accuracy.

## Live progress engine

Progress commands accept a JSON snapshot with `asOf` (elapsed project day)
and the existing `tasks` array. Example files are committed and ready to run:

```sh
npm run progress -- examples/progress-current.json --format table
npm run progress -- examples/progress-current.json --output progress.csv
npm run compare-progress -- examples/progress-current.json examples/progress-updated.json --format table
npm run compare-progress -- examples/progress-current.json examples/progress-updated.json --output progress-comparison.csv
```

Use `npm.cmd` in PowerShell. JSON output is the default; CSV exports are
Excel-compatible with two-decimal values, whole-day completion columns, and
protection against overwriting existing files. Snapshot inputs are JSON only
for this milestone; the original CSV input format remains a baseline format.

Task `status` is `planned` (default), `active`, or `completed`:

- Completed tasks require `actuals: { "start": 0, "finish": 3 }`. Times must
  be finite, nonnegative, ordered, and finish no later than `asOf`. Their
  predecessors must also be completed before the recorded start, and actuals
  on a shared resource cannot overlap. Actuals and estimates remain in history
  but contribute no remaining duration or uncertainty.
- Active tasks require `remaining: { "goodCase": 3, "poorCase": 12,
  "estimateStatus": "stale" }`. These are remaining P20/P80 estimates, not
  total original estimates. Both must be positive and ordered. All technical
  predecessors must be completed, and only one active task may occupy each
  resource. Active tasks continue immediately at `asOf`; planned work on that
  resource waits, even if it has higher priority. No splitting or interruption
  is modeled. Active-task start in the report means the start of the remaining
  forecast segment, not its historical start.
- Planned tasks use their original P20/P80 estimates. Completed dependencies
  are satisfied; unfinished dependencies still gate dispatch. Priority chooses
  among eligible tasks without silently optimizing the project's order.

`remaining.estimateStatus` may be `current` or `stale`. Stale estimates are
flagged and used unchanged. Advancing `asOf` never subtracts duration or
automatically changes a status; the resource must explicitly report progress.
This milestone has no daily notifications, timers, percent-complete inference,
or actual start tracking for active tasks. `actuals` represents completed work
and is rejected on unfinished tasks. Optional remaining metadata on planned
tasks is retained but not used until they become active.

`forecastProgress` returns deterministic remaining duration, completion day,
remaining Critical Chain, unfinished task timings, completed history, stale
active task IDs, and fixed-chain percentile estimates based on remaining work.
Remaining durations start at zero internally; reported start/finish/completion
days add `asOf`. Whole-day planning rounds absolute completion days up.
Independent-duration and fixed-chain approximation limits still apply.

When all tasks are complete, remaining duration and uncertainty are zero;
completion reports the latest actual finish (not the later snapshot day).
An empty project reports zero remaining work and its snapshot time.

Progress comparisons require the same `asOf` day and task IDs. They keep both
snapshots unchanged and compare deterministic completion, whole-project
remaining-based P50/P80/P95/P98/P99 completion days, and rounded-day impacts.
JSON includes both complete forecasts/history; comparison CSV summarizes
completion differences, chains, stale estimates, and assumptions. Export each
individual progress report to inspect all task timing details in Excel.

The existing `schedule`, `compare`, and `percentiles` commands remain full-project
baseline commands: they use original estimates regardless of lifecycle status.
The JSON parser now preserves and validates lifecycle metadata, so a future UI
can use the same typed task model without duplicating scheduling logic.

## Portfolio engine

`src/portfolio.ts` exposes parsing, immutable multi-project scheduling and saved-version comparison. `tests/portfolio.test.ts` covers resource contention, task overrides, allocations, locked deadlines, milestones, progress, ownership validation and CLI version history. No additional dependencies or services are required. See [PORTFOLIO_GUIDE.md](PORTFOLIO_GUIDE.md).
