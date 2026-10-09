# Portfolio engine

A portfolio owns an ordered list of projects and a shared resource pool. Each
project owns its tasks and its current completion forecasts. Every task has exactly
one `projectId` matching its containing project, and a globally unique task ID.
Repeating work requires a new task ID, even when created from a template. Templates
and a graphical UI are future work.

## Try the worked example

From your local repository in Windows PowerShell, after merging and pulling:

```powershell
npm.cmd run portfolio -- examples/portfolio.json --format table
npm.cmd run portfolio -- examples/portfolio-what-if.json --format table
```

Project One is first in the project list. Its design occupies Alice from day 0–2,
then its build occupies Bob from day 2–5. Project Two's design runs from day 2–4,
but its build must wait for Bob and finishes on day 8. Its customer test is locked
at day 7–8, so the engine reports an unmet predecessor and marks Project Two's
forecast infeasible. The test remains at day 7–8; its approval milestone stays at
day 8, and feedback work starts after that milestone. This is a diagnostic schedule,
not a claim that feedback can actually be obtained before its prerequisites.

The What-If puts `P2-design` in `taskOrderOverrides`. That task gets first choice
of Alice; its build finishes on day 5. Project One's build moves to day 5–8.
The customer test and milestone retain their fixed times, and both projects are
feasible. The engine does not optimize or silently reorder the portfolio.

## Project and task input

The top-level JSON requires `id`, a unique `versionId`, `asOf` (day number),
`settings: { "durationUnit": "days" }`, `resources` (unique resource IDs), and
`projects`. Each project requires `id`, `name`, and `tasks`. See the sample files
for complete inputs. Times use an abstract day axis; calendars and date conversion
are not implemented.

Tasks use the existing `id`, `name`, `resource`, `goodCase`, `poorCase`, `priority`,
and `dependsOn` fields, plus:

- `projectId`: exactly one owner, matching the containing project.
- `allocationPercent`: optional, defaults to 100; greater than 0 and at most 100.
- `locked`: optional `{ "start": 7, "finish": 8 }`, both times fixed.
- Existing progress metadata: `status`, `remaining`, and `actuals`.

Ordinary estimates are task P20/P80 durations at 100% allocation. At 50%, the
engine doubles duration and scales distribution moments accordingly. Concurrent
allocations must total no more than 100%. The engine never interrupts a task or
changes its allocation while it is running. Dynamic allocations and automatic task
splitting are not implemented.

A milestone has `goodCase: 0` and `poorCase: 0`, occupies no resource capacity, and
may have dependencies. A locked milestone must have equal start and finish. A
locked work task must have a positive fixed interval. Recorded fixed intervals
remain authoritative even if estimates change; revise the plan explicitly if a
commitment is renegotiated.

Completed tasks require actuals ending on or before `asOf`. Active tasks require
explicit remaining estimates and completed predecessors. Running tasks are reserved
before planned tasks, so an ordering override cannot displace them. Active locked
tasks retain their original fixed interval. Planned work begins at or after `asOf`.
Stale remaining estimates are preserved and listed in each project's forecast.

## Ordering, dependencies, and resource contention

The `projects` array establishes project preference. Within a project, lower task
priority values go first; ties preserve input order. Optional `taskOrderOverrides`
is an ordered list of task IDs that get preference ahead of the ordinary project
order. Reordering projects or changing overrides changes resource preference only;
it does not create a technical dependency. Ineligible tasks do not reserve idle
resources. Technical dependencies can reference tasks from another project, but
must exist and must not form cycles.

The scheduler reserves locked intervals before dispatch. Planned tasks must fit
without interruption around those reservations. Overlapping fixed or running
allocations that exceed capacity produce explicit conflicts; the engine preserves
those intervals. A prerequisite finishing after a fixed start produces a dependency
conflict. Affected tasks and their downstream dependents mark their owning projects
infeasible. An upstream project does not become infeasible just because another
project cannot meet its deadline.

The output distinguishes `technicalPredecessors` from `resourcePredecessors`.
Resource links capture capacity releases that blocked dispatch and can cross project
boundaries. Each project's critical chain traces through those links, including
upstream tasks belonging to other projects. Ties yield one reproducible chain.
These fields are intended for future dependency and critical-chain visualization.

## Project forecasts and immutable versions

`result.projects[].forecast` contains `scheduleVersionId`, `feasible`,
`deterministicCompletion`, `criticalChain`, `completionPercentiles` (P50, P80,
P95, P98, P99), and `staleTaskIds`. Values are completion day numbers, not durations.
A new run returns new project data; it never mutates its input or an earlier run.

Percentiles use independent lognormal task durations and moment matching on the
fixed baseline cross-project critical chain. They remain approximations, without
alternate-chain simulation or resource calendars. A fixed appointment resets the
completion anchor: earlier uncertainty represents risk to the appointment, not
permission to move it. Percentiles after that appointment are conditional on it
being met. Deterministic conflicts mark forecasts infeasible; displayed numbers
then serve diagnosis. Probability of meeting each locked appointment is not yet
calculated.

Use optional `approvalStatus: "approved"` or `"draft"` to label a saved plan.
This is a user label, not an authentication or approval workflow. Save a complete
run as JSON, then revise using a new version ID and the same `asOf` for comparison:

```powershell
npm.cmd run portfolio -- examples/portfolio.json --output portfolio-v1.json --format table
npm.cmd run portfolio -- examples/portfolio-what-if.json --previous portfolio-v1.json --output portfolio-v2.json --format table
```

The second output retains the first plan, schedule, conflicts, and project forecasts
in `previousVersions`, and adds project percentile differences and task timing
changes in `comparison`. Output files refuse overwrite. Use fresh filenames for
further runs. Passing earlier versions preserves them; history is not automatically
stored on a server. Advancing `asOf` also retains history with `--previous`, but omits the same-day
comparison so elapsed time is not presented as a What-If estimate change.

Engine API: `parsePortfolio`, `schedulePortfolio(plan, previous?)`, and
`comparePortfolioVersions(current, whatIf)` from `src/portfolio.ts`. The portfolio
command accepts JSON and exports JSON so ownership, conflicts and version history
are retained. Existing single-project JSON/CSV and progress commands continue to
work with their original formats.
