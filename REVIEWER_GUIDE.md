# BufferLogic reviewer walkthrough

This milestone demonstrates how task dependencies, resource contention, and
management priorities determine project completion. It implements a
deterministic TypeScript scheduler with JSON/CSV input, console summaries,
and CSV exports for Excel.

Allow about five minutes after installation. All example files are committed
in `examples/`; no personal files, credentials, UI, or GitLab access are needed.

## Set up on Windows

Install Git and Node.js 24 LTS (Node.js 22 or newer is supported), then open a
new PowerShell window. For a new checkout:

```powershell
git clone https://github.com/kevinakohls/bufferlogic.git
cd bufferlogic
npm.cmd ci
```

If you already have the repository, open PowerShell in its folder and run
`git pull origin main`, then `npm.cmd ci`. Run all remaining commands from
the `bufferlogic` folder. `npm.cmd` avoids PowerShell script execution policy
issues. Each command compiles the TypeScript before running the engine.

## 1. Resource contention determines the Critical Chain

```powershell
npm.cmd run schedule -- examples/project.json --format table
```

Expected schedule in days:

| Task | P50 duration | Start | Finish |
|---|---:|---:|---:|
| A | 3 | 0 | 3 |
| B | 6 | 3 | 9 |
| C | 6 | 3 | 9 |
| D | 4 | 9 | 13 |
| E | 2 | 9 | 11 |
| F | 4 | 13 | 17 |
| G | 2 | 17 | 19 |
| H | 1 | 19 | 20 |

**Project P50: 20 days. Critical Chain: A → B → D → F → G → H.**

B and D both require Developer 1. D depends technically on A, not B, but it
must wait until B releases the resource. That creates the B → D relationship
in the Critical Chain. A technical Critical Path alone would miss it.

## 2. A priority change can make completion later

```powershell
npm.cmd run demo
```

The demo prints the same Current State schedule and computes a separate
What-If that puts D ahead of B by swapping their priorities. It reports:

```text
Critical Chain: A -> B -> D -> F -> G -> H
Current State P50: 20 days
D-before-B What-If P50: 22 days
Impact: +2 days
```

D now finishes earlier (day 7), but B finishes at day 13 and its API tests
finish at day 15. Integration tests therefore start at day 15 instead of
day 13. The What-If chain is A → D → B → E → F → G → H. Moving one task
earlier does not necessarily make the project finish earlier. Current State
remains unchanged; the engine does not optimize away the chosen priorities.

## 3. Relieving resource contention can make completion earlier

```powershell
npm.cmd run compare -- examples/resource-change-current.csv examples/resource-change-what-if.csv --format table
```

The only change in the second CSV is task C's resource: Alice becomes Bob.
Both files use Build One estimates of 6 and 7 days.

| Scenario | Project P50 (days) | Critical Chain |
|---|---:|---|
| Current State | 18.59 | A → B → C → D → E |
| What-If | 15.76 | A → B → D → E |
| Difference (What-If minus Current State) | -2.83 | |

C starts at day 2.83 alongside B instead of waiting until day 9.31 for
Alice. D and E each move 2.83 days earlier, and C leaves the Critical Chain.
This is the resource-change example reviewed manually in Excel and covered
by automated regression tests.

### Open the comparison in Excel

```powershell
npm.cmd run compare -- examples/resource-change-current.csv examples/resource-change-what-if.csv --output reviewer-comparison.csv
Invoke-Item .\reviewer-comparison.csv
```

The file is created in your local `bufferlogic` folder. `Invoke-Item` opens
the default CSV application; if that is not Excel, open the file from Excel
using **File → Open**. If columns do not separate correctly, use
**Data → From Text/CSV** with comma as delimiter and UTF-8 encoding.

The top rows show project P50 and both chains. The task table includes both
resources, durations, timings, differences, and Critical Chain flags. All
CSV numbers use two decimal places; Excel may choose its own display format.
The engine retains full calculation precision.

Exports refuse to overwrite existing files. For a repeat run, choose a new
name such as `reviewer-comparison-2.csv`. Close the file in Excel before
moving or deleting it. The input CSVs are never changed.

## Verify the automated checks

```powershell
npm.cmd test
```

At this milestone, all **117 tests** pass, with none skipped. They cover the
examples above, full-precision timing comparisons, resource and dependency
relationships, invalid inputs/cycles, scenario immutability, stale remaining
estimates, and the command/export workflows. GitHub Actions runs the suite
on Node.js 22 and 24 for pull requests and pushes to `main`.

## Scope and interpretation

- Each task's P50 duration is `sqrt(goodCase * poorCase)` from its approximate
  P20/P80 estimates. Inputs must be finite, positive, and ordered good ≤ poor.
- The schedule/compare commands' Project P50 means completion of the deterministic
  schedule using task P50s. The percentile command below estimates whole-chain
  percentiles separately, under explicit approximation assumptions.
- Examples use elapsed days from time zero. There are no working calendars,
  start dates, or overnight/weekend rules. Future unit settings will default
  to 8 working hours per day; hours/minutes entry is not implemented yet.
- Each named resource handles one task at a time without interruption. Lower
  priorities run first among eligible tasks; ties preserve input order.
- A missing remaining-duration update may be marked stale; it never reduces
  duration automatically. Baseline commands retain lifecycle metadata without
  interpreting it; the separate progress commands below forecast remaining work.
- UI, project/feeding buffers, Commit Date logic, red/green status, Monte Carlo,
  simulated probability calculations, and GitLab/Duo integrations are outside this milestone.

## Whole-project percentiles from the baseline Critical Chain

```powershell
npm.cmd run percentiles -- examples/project.json --format table
```

The deterministic baseline remains **20.00 days**, with chain
**A → B → D → F → G → H**. The separate whole-chain approximation reports:

| Estimated project percentile | Days |
|---|---:|
| P50 | 26.31 |
| P80 | 42.40 |
| P95 | 66.86 |
| P98 | 84.30 |
| P99 | 98.39 |

Each task's P20/P80 inputs fit a lognormal curve. Means and variances are
combined across the baseline Critical Chain, then a lognormal approximation
to that total gives project percentiles. There is no random sampling and no
sum of individual task P80/P95/P98/P99 durations. The long upper tail comes from
the broad duration estimates and assumed lognormal distributions.

These are approximate whole-project estimates assuming independent tasks
and that the baseline chain remains controlling. They do not account for
another chain becoming controlling or correlated delays. The deterministic
baseline and estimated whole-chain P50 are different quantities; neither
should be relabeled to match the other.

Export for Excel with:

```powershell
npm.cmd run percentiles -- examples/project.json --output reviewer-percentiles.csv
Invoke-Item .\reviewer-percentiles.csv
```

As with other exports, use a new filename on repeat runs. See
[DEVELOPMENT.md](DEVELOPMENT.md#estimate-whole-project-completion-percentiles)
for formulas and assumptions.

The existing comparison commands also report whole-project P50/P80/P95/P98/P99
for Current State and What-If, plus a difference at each percentile. Each
scenario uses its own baseline Critical Chain. The deterministic baseline
and task timing rows remain separately labeled. The Excel summary includes
the percentile estimates and assumptions, so the report can be reviewed
without running two separate percentile commands.

Percentile and comparison console/CSV reports also include whole-day planning
columns, assuming the input estimates are in days. Each completion duration
is rounded up, while raw values remain available. On the resource-change
What-If, P95/P98/P99 plan as **19/20/21 days**. Whole-day comparison differences
subtract the rounded scenario values. This view does not imply day-level
accuracy for every project or add calendars and dates.

## Forecast from a live progress snapshot

Use the committed JSON snapshots so no input preparation is required:

```powershell
npm.cmd run progress -- examples/progress-current.json --format table
npm.cmd run compare-progress -- examples/progress-current.json examples/progress-updated.json --format table
```

At **day 5**, A is completed with actuals 0–3. B is active on Alice with stale
remaining estimates 3/12 (P50 = 6). C is planned on Bob. D is planned on Alice
and has higher priority than B, but must wait for the already-active B. E waits
for B, C, and D.

| Task | Status | Current start–finish | After explicit B update |
|---|---|---|---|
| A | Completed | Actual 0–3 (history) | Actual 0–3 (history) |
| B | Active | Remaining segment 5–11 | Remaining segment 5–9 |
| C | Planned | 5–9 | 5–9 |
| D | Planned | 11–13 | 9–11 |
| E | Planned | 13–15 | 11–13 |

Current deterministic remaining work is **10 days**, completion **day 15**,
with remaining chain **B → D → E**. The second snapshot explicitly updates
B to remaining estimates 2/8 (P50 = 4), reducing remaining work to **8 days**
and completion to **day 13**. The comparison impact is **-2 days**.

If no update arrives and `asOf` advances to day 6, B still has 6 P50 days
remaining, the project still has 10 days remaining, and predicted completion
moves to day 16. Stale does not mean progress. No timers or messages are built.

Percentiles use remaining work on the snapshot's own Critical Chain, excluding
completed tasks' uncertainty. Reports distinguish remaining duration from
absolute completion day and retain the independent/fixed-chain assumptions.
Snapshot inputs are JSON only for now; no UI has been added.

Export the worked comparison for Excel:

```powershell
npm.cmd run compare-progress -- examples/progress-current.json examples/progress-updated.json --output reviewer-progress-comparison.csv
Invoke-Item .\reviewer-progress-comparison.csv
```

Use a fresh filename on repeat runs. See [Development](DEVELOPMENT.md#live-progress-engine)
for snapshot fields and validation rules.

For your own inputs and all command options, see [DEVELOPMENT.md](DEVELOPMENT.md).

## Portfolio acceptance review

Run `npm run portfolio -- examples/portfolio.json --format table`, then the same command with `examples/portfolio-what-if.json`. The first reports a missed locked customer test; the task-order override resolves it without moving the test. See [PORTFOLIO_GUIDE.md](PORTFOLIO_GUIDE.md) for ownership, allocation, milestone and schedule-version rules. Portfolio regression tests also verify cross-project critical chains and project-owned forecasts.

For a direct cross-project delay, run the portfolio command with `examples/portfolio-contention-isolated.json`, then `examples/portfolio-contention.json`. Project Two moves from day 6 to day 10 because Project One occupies Bob. Its critical chain includes Project One’s build, and the task table names that resource wait.

A larger acceptance case is the user-supplied two-house project: `npm run portfolio -- examples/house_build_tasks2.csv --format table`. See [HOUSE_BUILD_REVIEW.md](HOUSE_BUILD_REVIEW.md) for the dependency alignment requested by the user and completion forecasts.

For dated schedules, add `--calendar examples/house-resource-calendars.csv` to the two-house command. Start defaults to today; pin `--start-date 2026-10-09` for the documented review dates. Calendar regression tests cover weekends, holidays, Saturday work, overtime, resource-specific availability, allocations, elapsed waits, locked conflicts, forecast dates, timezone boundaries and immutable versions.

Add `--recommend-resources` to a calendar run to rank individual resource Saturday changes. The report keeps the baseline intact, lists separate project P95 gains, preserves exceptions and excludes infeasible or worsening outcomes from recommendations. See the resource-calendar guide for the ranking rule.
