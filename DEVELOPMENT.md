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

## Validate the approximation (development tool)

```sh
npm run validate-percentiles -- examples/resource-change-what-if.csv --iterations 100000 --seed 20261008
```

This separate command uses fixed-seed simulation only for validation. It
compares product estimates against a sampled fixed-chain sum and a sampled
full-project schedule, using identical task draws for both. It reports
percentile errors, approximate 95% sampling intervals, sampled chain moments,
and changed controlling-chain frequency. Normal product commands never call it.

Defaults: 100,000 trials and seed 20261008. Trial counts must be 1,000–1,000,000;
seeds are uint32 integers. Input task order is part of reproducibility. The
default output is a text report; `--format json` or `--output report.json`
provides full precision. Reports cannot overwrite existing files.
See [validation/REPORT.md](validation/REPORT.md) for measured errors and limits.
