# Two-house schedule review

This example imports the user's two-house CSV: **72 tasks, two projects and 21
shared resource types**. The source file is `examples/house_build_tasks2.csv`.
At the user's request, House 2 now follows House 1's dependency pattern using its
own task IDs (House 1 ID + 36). Dependencies changed on tasks 48, 49, 54, 55, 56,
57, 58, 64, 66, 67, 69, 70, 71 and 72. The repeated second header was removed
from the checked-in example; the importer also accepts repeated identical headers.
The original uploaded file remains unchanged in the attachment.

## Run on Windows

From your BufferLogic repository after merging and pulling:

```powershell
npm.cmd run portfolio -- examples/house_build_tasks2.csv --format table
```

CSV input requires the existing task columns plus **Project**. Each distinct Project
value becomes one owning project. Its first appearance establishes project order.
Every distinct Resource value identifies one shared person or crew with 100%
capacity across the houses. Here, House 1 has first preference, but cannot interrupt
work already started on House 2.

## First results

The deterministic schedule is based on each task's geometric-mean P50 duration.
These are abstract elapsed days, without weekends, holidays or construction calendars.

| Project | Alone | With both houses | Shared-resource delay |
| --- | ---: | ---: | ---: |
| House 1 (P1) | 182.73 | 213.52 | 30.79 |
| House 2 (P2) | 182.73 | 236.83 | 54.10 |

Both forecasts are feasible: resource contention is resolved by waiting, and no
locked-date or over-capacity conflicts are present. Both critical chains include
work belonging to the other house. For example, House 2's architectural design
(task 38) must wait for House 1's architectural design (task 2) to release the Architect.
Conversely, work already started on House 2 can hold resources that House 1 needs.
The console's **Resource waits for** column lists these resource predecessor IDs.

Project completion percentiles, rounded upward to whole planning days:

| Project | P50 | P80 | P95 | P98 | P99 |
| --- | ---: | ---: | ---: | ---: | ---: |
| House 1 | 236 | 265 | 296 | 313 | 325 |
| House 2 | 261 | 290 | 321 | 339 | 351 |

These are the existing fixed-critical-chain lognormal approximations, assuming
independent task durations. Aggregate project P50 need not equal the deterministic
sum of task P50s. Alternate-chain switching is not simulated. The numbers are
forecasts under the given order, not a claim of the shortest achievable combined
schedule. Changing project order and selected task preferences is the next useful
What-If exercise.

## Input boundaries

CSV imports are planned baseline schedules at day 0, version `csv-v1`, with 100%
allocations and no locks. The CSV does not specify progress, fixed commitments or
allocation percentages; use the existing portfolio JSON format for those fields.
Use one header plus a Project column when editing in Excel, and retain unique IDs
and valid dependency references.

A complete JSON result can also be saved with a fresh filename:

```powershell
npm.cmd run portfolio -- examples/house_build_tasks2.csv --output houses-result-v1.json --format table
```

The result includes the imported plan under `plan`, the scheduled tasks and each
project's forecasts. It is JSON, not an Excel report. For advanced What-If changes,
copy the `plan` object into a separate plan JSON file and assign a new version ID.
CSV revision runs can use `--previous` with the same input filename; the CLI creates
a new version ID by appending `-revision` to the previous ID.
