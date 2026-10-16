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

## Shared-resource delay example

This separate example shows resource contention extending a project's completion,
without a locked-date violation:

```powershell
npm.cmd run portfolio -- examples/portfolio-contention-isolated.json --format table
npm.cmd run portfolio -- examples/portfolio-contention.json --format table
```

Project Two alone finishes on day **6**. Its design runs on Alice from day 0–2,
build on Bob from day 2–5, and test on Alice from day 5–6.

With Project One present, its long build occupies Bob from day 0–6. Project Two's
design still finishes on day 2, but its build waits four days for Bob. That build
runs from day 6–9, and its test from day 9–10. Project Two therefore finishes on
day **10**, a **four-day delay** caused entirely by another project's resource use.

Its critical chain is `P1-build -> P2-build -> P2-test`. The console task table's
**Resource waits for** column identifies `P1-build` as the resource predecessor
of `P2-build`; the technical predecessor remains `P2-design`. No technical dependency
between the projects was added. This is resolved contention, so both forecasts are
feasible and no capacity-violation warning is expected. Estimates are fixed in this
example, making all project percentiles equal to their deterministic completion day.

## Project and task input

The top-level JSON requires `id`, a unique `versionId`, `asOf` (day number),
`settings: { "durationUnit": "days" }`, `resources` (unique resource IDs), and
`projects`. Each project requires `id`, `name`, and `tasks`. See the sample files
for complete inputs. Times use an abstract day axis unless optional resource calendars are applied;
see [RESOURCE_CALENDARS.md](RESOURCE_CALENDARS.md) for dated scheduling.

Tasks use the existing `id`, `name`, `resource`, `goodCase`, `poorCase`, `priority`,
and `dependsOn` fields, plus:

- `projectId`: exactly one owner, matching the containing project.
- `allocationPercent`: optional, defaults to 100; greater than 0 and at most 100.
- `locked`: optional `{ "start": 7, "finish": 8 }`, both times fixed.
- Existing progress metadata: `status`, `remaining`, and `actuals`.

Ordinary estimates are task P20/P80 durations at 100% primary-resource allocation. At 50%, the
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
P95, P98, P99), and `staleTaskIds`. For fully scheduled projects, completion values
are day numbers, not durations, and `feasible` is boolean. Projects with suspended
work instead return `withheldReason`, `unscheduledTaskIds`, null completion values
and null feasibility; see **Project holds and incomplete forecasts** below.

**API compatibility change:** consumers that assumed completion fields were always
numeric must now narrow `ProjectForecast` using `withheldReason`. Ordinary complete
schedules retain their existing shape. `removedTaskIds` now means removal from the
plan, not merely absence from the schedule; suspension has separate fields.
A new run returns new project data; it never mutates its input or an earlier run.

Percentiles use independent lognormal task durations and moment matching on the
fixed baseline cross-project critical chain. They remain approximations, without
alternate-chain simulation. Optional resource calendars convert the forecasts to
dates using the documented daily-capacity approximation. A fixed appointment resets the
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
command accepts JSON or baseline CSV with a Project column and exports JSON so ownership, conflicts and version history
are retained. Existing single-project JSON/CSV and progress commands continue to
work with their original formats.

## Two-house CSV example

See [HOUSE_BUILD_REVIEW.md](HOUSE_BUILD_REVIEW.md) for the 72-task construction example, dependency corrections and shared-resource results. Run `npm run portfolio -- examples/house_build_tasks2.csv --format table`. CSV imports retain project ownership and share matching resource names across projects.

## Working calendars

Use `--calendar examples/house-resource-calendars.csv` to apply calendars to the house CSV. Start defaults to today. See [RESOURCE_CALENDARS.md](RESOURCE_CALENDARS.md) for workday effort, elapsed waiting, holidays, overtime, fixed commitments and reproducible start-date options.

## Project holds and incomplete forecasts

Projects accept optional `onHold: true` (default false). Holding preserves the
project's position and all task data. Recalculation suspends its unstarted,
unlocked work and transitively suspends new work depending on those tasks, even
in other projects. Completed tasks, active work and locked commitments remain in
the schedule. Active work is nonpreemptive. Locked tasks with suspended
predecessors retain their dates and report conflicts.

Set `onHold: false` and reschedule to restore dispatch at the existing priorities.
Save/open preserves the flag. If all remaining work is active or locked, no tasks
are suspended and a full forecast is still produced despite the hold flag.

A forecast with unscheduled tasks is a distinct TypeScript union variant:

- `withheldReason`: `on-hold` or `blocked-by-hold`.
- `unscheduledTaskIds`: IDs still in the plan but not dispatched.
- `deterministicCompletion`, `completionPercentiles`, `feasible`: `null`.
- `completionDates`: omitted.
- `scheduleVersionId`, `criticalChain`, `staleTaskIds`: retained; the chain covers
  scheduled/reserved work and is not a full-project completion promise.

Without `withheldReason`, normal numeric forecasts and boolean feasibility retain
their previous meaning. Deadline assessments use `unavailable` with `reason:
withheld` for suspended work and `reason: calendar-required` for date targets
without calendars. Resource recommendations score only fully scheduled projects and list withheld
projects in `excludedProjects`. All projects still constrain dispatch through
active work and locked commitments. If every forecast is withheld, the CLI reports
that no fully scheduled projects are available.

Version comparisons use `removedTaskIds` only for tasks absent from the new plan.
`suspendedTaskIds` lists newly suspended tasks relative to the previous schedule;
`unscheduledTaskIds` lists all current planned tasks without a scheduled entry; `resumedTaskIds`
lists entries restored from the previous plan. `taskChanges[].status` distinguishes
`added`, `resumed` and `changed`. Project percentile differences are null if either
side has a withheld forecast.

## Opt-in feeding protection

`PortfolioPlan.feedingTaskIds` lists selected unstarted, unlocked working tasks.
An own-critical-chain task is eligible when it directly feeds a higher-priority
project; lower-priority successor tasks can then reschedule with their project.
Omit it or use an empty array for the existing forward schedule. With selections,
the engine first computes a forward baseline, then derives each eligible feeder's
latest start from its downstream baseline start and its task P99 working effort.
P99 uses the same P20/P80 lognormal fit; allocation scales P50 and P99 inversely.
The feeding buffer is P99 minus P50. Resource calendars are traversed backward.

Protected placements are internal scheduling constraints, not saved user locks or
new fixed percentile anchors. Ordinary feeding preserves higher-priority project
entries, the feeder owner's critical chain and all direct downstream starts.
For a cross-project feeder supplying higher-priority work, protection preserves
higher-priority project entries and higher-priority direct downstream starts;
the owner's critical chain and lower-priority successors may move later.
Active work and user locks remain protected in both cases. The feeder's resource
allocation is reserved across its P50 execution and remaining P99 protection
window. Other work can use earlier capacity only if the entire nonpreemptive task
fits. Actuals and user locks keep their existing behavior. Unsafe attempts fall
back to the forward baseline, with task-level reasons.

`result.feedingReport` contains `changes`, `resourceWindows`, `method` and
`interpretation`. Resource windows describe actual earlier allocation released
from the baseline task interval, not the entire gap before its delayed start or
a promise of idle capacity after other work is dispatched. Buffer reservations
are not additional productive work in utilization. Selections persist in plan
JSON; the report and placements are recomputed each run. Task-level protection
is not aggregate feeding-chain probability, and alternate critical chains are
not simulated. See the UI guide and `examples/feeding-protection.json` for a
worked example. CLI table output includes the feeding report when enabled.

Feeder selections are evaluated deterministically by project order, task priority
and original task order, regardless of checkbox click order. A later feeder does
not overwrite an already moved feeder with a baseline placement. Unknown, duplicate
or malformed feeding IDs are rejected by `parsePortfolio`, including saved-file
loads. The helper receives the forward scheduler as a callback, with no runtime
import cycle.

Resource recommendations intentionally preserve `feedingTaskIds` and recompute
latest-safe placements for each proposed calendar. The result's
`feedingProtection: recomputed-per-scenario` makes this policy explicit. This costs
additional scheduling passes; scores describe the changed calendar plus the same
feeding policy, not a frozen feeder placement. The existing all-or-nothing safety
fallback remains: incompatible combined placements retain the forward schedule.

### Cross-project feeding and time display

A feeder that controls a lower-priority project's finish may supply a direct
successor in a higher-priority project. Its higher-priority successor baseline
starts and higher-priority task placements are protected; the feeder's own
completion promise can move later. Feeding changes expose
`feedsHigherPriorityProject`, `ownerCompletionBefore`, `ownerCompletionAfter` and
`protectionFinish`. The owner fields are deterministic completion offsets, not
confidence-level comparisons. `protectionFinish` is the end of the reserved P99
resource window and may precede `protectedStart` when another protected task
needs the resource first. Resource reservations and timeline bands end at
`protectionFinish`, not at the downstream start if extra unreserved slack remains.
Zero P99−P50 is valid and displayed explicitly; it does not create an extra buffer.

Optional `settings.displayTime` accepts `days` or `dates` and persists a UI display
preference only. It does not affect calculation. Date display requires a calendar;
without one the UI falls back to abstract day numbers. With calendars, day numbers
are elapsed calendar offsets, not workday counts. Existing plans without the
preference retain the previous date-if-calendared behavior. JSON numeric offsets
and completion dates remain available independently of the display preference.

## Resource list reconciliation and draft assignments

`parsePortfolio` and `schedulePortfolio` preserve explicitly listed idle resources and add missing nonempty task resource IDs and calendar-only IDs to `resources`. Existing resource calendars are preserved; missing entries in an existing calendar default to `[8,8,8,8,8,0,0]` with no exceptions. A plan without a calendar remains on the abstract-day axis.

A portfolio task may have `resource: ""` in an editable JSON draft. Parsing preserves it without adding an empty resource to the list. `schedulePortfolio` rejects these plans with the task IDs requiring assignments. The review API returns `{plan, needsAssignments: true, unassignedTaskIds}` instead of calculated tasks or forecasts for such drafts. Consumers must check this draft response before reading forecast fields. Legacy single-project parsing remains strict by default.

The UI deletes a resource only after confirmation, clears all its task assignments, and removes its calendar and descriptive details. Reassignment does not remove the previous resource automatically.

## Manual project and task creation

The review API supports `POST /api/project` with `name`, optional existing `plan`, and `startDate`/`timeZone` for a new workspace. It appends a blank project with a unique ID, preserving an existing portfolio's calendar and start date. `POST /api/task` accepts `plan`, `projectId`, `name`, `resource` (empty for a draft assignment), numeric `goodCase`/`poorCase`, and `dependsOn` (existing task IDs). Task IDs and priorities are generated; tasks default to planned working effort at 100% allocation. Estimates require positive good days and poor days at least as large, or two zeros for a milestone.

An entirely empty workspace returns `{plan, needsTasks: true}` with no calculated forecasts. Unassigned work still returns the `needsAssignments` draft response. These drafts can be saved and reopened. Once tasks and assignments exist, the response uses the normal calculated result shape.

### Workspace name

The optional top-level `name` is the workspace display name, separate from stable portfolio `id`, project names and schedule `versionId`. `parsePortfolio` preserves trimmed nonempty names and supplies a default for older plans: the first project name plus “workspace”, or “Untitled workspace”. New projects and recalculation preserve an existing name. The UI saves this field and uses a filename-safe name plus timestamp for downloaded workspaces.

### Project deletion

`POST /api/project/delete` accepts `plan` and `projectId`. The immutable `deleteProject` helper removes the selected project and its tasks, filters their IDs from `feedingTaskIds` and `taskOrderOverrides`, and preserves resource definitions, calendars, workspace name and remaining project order. It rejects unknown projects and any surviving task dependency on removed work. The review API recalculates the result, or returns its normal `needsTasks`/`needsAssignments` draft shape when appropriate. User confirmation is provided by the browser before sending the request.

## Multiple resources per task

Existing `resource` and `allocationPercent` remain the primary assignment. Optional `supportingResources` contains `{resource, allocationPercent}` entries; each percentage must be greater than zero and at most 100. Resource IDs must be distinct across primary and supporting assignments. JSON and saved workspaces preserve this field on both plan tasks and scheduled entries; CSV imports and template copies accept an optional `Supporting resources` column containing the same JSON array. Blank cells preserve primary-only behavior.

```json
{
  "resource": "Operator",
  "allocationPercent": 100,
  "supportingResources": [
    {"resource": "Front-end loader", "allocationPercent": 100},
    {"resource": "Spotter", "allocationPercent": 50}
  ]
}
```

P20/P80 estimates, remaining estimates and primary allocation control working effort. Supporting allocations reserve capacity for that same interval, without independently scaling effort. All required resources must fit simultaneously. Calendar conversion uses the minimum available hours of assigned resources per date, with exceptions overriding weekly hours, so there must be common working capacity. Calendars do not express clock-time shifts. Fixed commitments remain fixed and report capacity/calendar conflicts; active work reserves all assignments. Zero-duration milestones consume no capacity; elapsed waiting with supporting reservations is rejected.

Resource-wait predecessors, critical-chain links, calendar percentile conversion, utilization, resource recommendations and feeding reservations include supporting resources. Utilization charges common working hours times each assignment's allocation; feeding buffers remain reservations rather than productive utilization. Version comparison reports assignment changes even if task dates are unchanged. Missing supporting IDs join the resource list and receive default calendars when applicable. Empty supporting IDs can be saved as drafts but block scheduling, just like an empty primary assignment.

Use separate dependent tasks for resources needed during different phases. This version does not support resource pools, interchangeable equipment selection, or different start/finish windows for individual assignments. See `examples/multiple-resources.json` for a complete input.

## Scenario comparison API

`POST /api/compare` accepts `{baseline, scenario}`. Each value may be a portfolio plan or a saved result containing `plan`. `compareScenarios` parses detached snapshots and recalculates both with the current engine. It rejects different portfolio IDs, progress dates or calendar origins; unassigned tasks must be resolved before either scenario can be scheduled. The original inputs remain unchanged.

The result includes project before/after P95 forecasts, target assessments, order and hold state; signed P95 changes; changed task timing, estimates, dependencies, primary/supporting resources, priorities, progress, deadlines and scheduling settings; changed resource calendars/details; global scheduling setting changes; and baseline/current conflicts. Added, removed, suspended and resumed work are distinct. Withheld or empty project forecasts have `p95: null` and cannot produce a numeric improvement. A positive shift means later. Version labels alone do not count as changes.

The UI supports both a session baseline captured from the current plan and a baseline chosen from a saved file. Capture does not automatically persist in workspace downloads; Download baseline saves the original plan separately. Session baselines survive recalculation and are cleared when another workspace opens. This API measures a supplied alternative; it does not optimize or claim a best schedule.
