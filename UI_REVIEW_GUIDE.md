# First review UI

The review screen loads project and calendar files, displays separate project
completion forecasts, and recalculates edits using the existing portfolio engine.
It runs locally on your computer. No account, cloud service, database, or additional
runtime dependencies are required.

## Start on Windows

After merging the review UI branch, from your repository in PowerShell:

```powershell
git pull origin main
npm.cmd ci
npm.cmd run ui
```

Keep that terminal open and open `http://localhost:3000` in your browser. Press
Ctrl+C in PowerShell when finished. If port 3000 is in use, choose another:

```powershell
$env:BUFFERLOGIC_PORT = "3001"
npm.cmd run ui
```

Then use the chosen port in your browser. The server listens only on the local
computer, not the network. Node.js 22 or newer remains required.

## Walk through the two-house example

1. Click **Load two-house example**. It includes 72 tasks and 21 resource calendars.
   The starting date defaults to today on your computer; set another date first for
   a reproducible demonstration.
2. Read each project's completion card. P95 is shown prominently, with P50/P80/P98/P99
   and the deterministic schedule also visible. Dates apply when calendars are loaded;
   otherwise forecasts display abstract days. Infeasible projects are clearly marked.
3. In **Tasks**, filter by project. Edit estimates, dependencies, resources, priorities,
   allocation percentages, or working effort versus elapsed waiting. Task IDs and project
   ownership remain fixed. For active tasks, the estimate inputs edit remaining work and
   mark the update current. Existing progress, actuals, locks and ordering overrides are
   retained; this first UI does not offer editors for all of them.
4. Click **Recalculate schedule**. Edited forecasts replace the previous calculation only
   after successful validation. Changes pending and errors explicitly mark previous
   results as out of date. Invalid edits remain available to correct.
5. In **Resources & calendars**, edit weekly availability. For example, give the Framing Crew
   eight Saturday hours and recalculate. **Add exception** supports dated holidays,
   absences and extra hours; an exception replaces normal hours for that date. Remove
   an exception to restore the weekly rule.
6. In **Calculated schedule**, see task dates, resources and resource-wait predecessors.
   A resource-wait predecessor can belong to the other project. Locked commitments
   stay fixed, and missed dependencies, capacity conflicts or inadequate locked-interval
   availability appear in the attention panel.

All existing forecast assumptions still apply. P95 dates are approximate fixed-chain
forecasts; the UI does not turn them into guaranteed customer commitments. The calendar
model has daily capacity, not clock-time shifts.

## Load your own files

Choose the project CSV and optionally the resource-calendar CSV, then click **Load
files**. Project CSVs use the existing task headers plus `Project`; calendar CSVs use
the format in [RESOURCE_CALENDARS.md](RESOURCE_CALENDARS.md). Alternatively load a
portfolio plan JSON or a saved review JSON. A saved review can contain its own calendars,
so a separate calendar file is unnecessary. You can also load a new calendar file into
an already loaded plan.

Replacing the loaded plan discards its unsaved edits. Source CSV/JSON files are never
modified automatically. Browser file selection reads the file contents and sends them
only to the local engine; it does not save uploads to the repository or a remote service.
Keep an existing dated plan's origin when it contains locked commitments or actuals;
the UI rejects changes that would silently reposition those recorded dates.

## Save and reopen a review

After recalculating, click **Save workspace**. Your browser downloads the current plan,
calendars, calculated tasks, conflicts and project forecasts as a JSON file. Select it
as the project file and click **Load files** to reopen and recalculate it. Unsaved changes
live only in the current browser session. This first screen does not automatically save
history or compare revisions; preserve separate downloaded files if needed.

## Verified in this milestone

The automated suite has **133 passing tests**. New API tests verify static/example
loading, parity with the existing engine, calendar edits, saved-result reload, invalid
input handling, request-origin restrictions and locked-plan origin protection.

A real Chromium browser smoke check exercised example loading, task estimate edits,
stale-result labeling, invalid dependency recovery, Saturday changes, dated exceptions,
JSON download/reload, the schedule table and a narrow mobile viewport. No browser page
errors occurred. The browser is a development validation tool, not a project dependency.

Current State/What-If comparison, project reordering, drag-to-reorder, and
resource-recommendation controls are subsequent UI milestones.

## Interactive timeline

Open the **Timeline** tab after loading or calculating a plan.

- **Highlight project** selects which project's critical chain to trace. Both projects
  stay visible, and amber task bars include controlling work belonging to the other
  project. The summary reports how many chain tasks belong to another project.
- Solid blue links represent technical dependencies; dashed purple links represent
  resource waits. The default view includes the selected critical chain and its
  feeding dependencies; applied feeding dependencies use teal arrows.
  **Show links** can instead show connections for the selected task, all links, or none.
- Click a task bar or its label to open its resource, timing, allocation, estimates,
  predecessors and commitment details. Predecessor buttons navigate to those tasks.
  **Find task** also jumps to a task, including one in another project. Keyboard users
  can focus task rows and press Enter or Space to select them.
- Tasks are grouped by owning project and ordered by their calculated start/finish
  within each group. **Zoom** offers an overview or two/four-times detail. Scroll through
  the rows; the date axis stays visible. Calendar inputs produce date labels; abstract
  schedules produce day offsets.
- Diamonds represent zero-duration milestones. **L** and a stronger outline mark locked
  commitments. Infeasible project summaries and selected-task conflicts stay visible.

For a review demonstration, load the houses, highlight P2 and find task 38
(architectural design). It depends on task 37 in P2 but waits for task 2 in P1 to
release the Architect. Click task 2 in the resource-wait list to see how P1's work
contributes to P2's critical chain.

Bars show deterministic start-to-finish spans, including weekends or other nonworking
pauses. They are not P95-duration bars or a working-hours heatmap. The forecast cards
above retain each project's separate percentile dates. Pending edits do not reposition
bars until a successful recalculation. The timeline is for viewing and selection;
it does not drag tasks or alter ordering.

Browser checks also verified the 72-task timeline, cross-project highlighting,
resource/dependency link modes, task and predecessor selection, zoom, locked tasks,
milestones, keyboard focus and the narrow-screen layout.

## Templates, notes and utilization

Use **Create from template** to make named project copies with unique IDs and row-order priorities. **Descriptions & comments** edits project/task/resource notes. **Resource utilization** reports weekly capacity and project allocations, with CSV download. Follow [TEMPLATES_AND_UTILIZATION.md](TEMPLATES_AND_UTILIZATION.md) for the software example and counting rules.

## Update progress

Open **Progress** and set **Progress as of** before entering updates. Dates denote
start-of-day boundaries: work finished at the end of Monday has Tuesday as its
finish boundary. Without a calendar, enter days from schedule start.

Choose **In progress**, record the actual start, and enter remaining P20/P80 work
estimates. New active tasks initially copy original estimates and flag them for
review; replace these with the work still to do. Choose **Reviewed** to confirm an
unchanged estimate. Advancing the progress date preserves remaining estimates and
flags them for review. Choose **Complete** and record actual start and finish.
Completed predecessors must finish before a successor's actual start. Recalculate
and check project forecasts, critical chains and resource utilization, then save
review JSON to retain the updates. Existing locked commitments retain their dates.
Changing status back to Not started clears that task's actuals and remaining estimates.

## Graph resource utilization

Open **Resource utilization**. **All resources** shows a weekly heatmap: dark
green means 80–100% utilization, red means over capacity, and gray means no
availability. Select a resource to see weekly scheduled hours stacked by project
and a dashed available-hours line. Hover or keyboard-focus a cell or bar for exact
values; the tables and CSV export retain the full detail. First and last weeks
are clipped to the reporting period. Graphs use the last calculated schedule until
you recalculate pending edits.

## Order projects and save the workspace

Use **Move up** or **Move down** under **Project order**, then **Recalculate
schedule**. Higher projects get first choice among eligible tasks on shared
resources; dependencies, active tasks, fixed commitments and explicit task-order
exceptions still apply. The displayed forecasts remain from the previous
calculation until you recalculate.

Click **Save workspace** after recalculating. To restore the downloaded file, click
**Open saved workspace** and select it. This restores all projects, their order,
notes, progress and calendars, including the recorded schedule start date. The
file keeps its existing format and older saved workspaces still load. Opening a
workspace asks before discarding pending edits.

## Task checklists

Open **Task checklists** and select a task. Add, edit, remove or check items and
review the completed count. Recalculate before **Save workspace**; **Open saved
workspace** restores the items and their checked state. Checklist completion never
automatically changes task status or forecasts. Work with its own duration,
resource or dependency belongs in a separate task.

Housing and software templates contain three draft items per task; revise these
for the actual project. CSV templates can include a **Checklist** column with one
item per line in a quoted cell (Excel: Alt+Enter). New project copies inherit the
text with all items unchecked. Editing a project's checklist changes that copy
only. Existing saved workspaces keep their existing items; new draft items are
not injected into previously saved tasks.

## Project and task deadlines

Open **Deadlines**. Enter each desired project or task finish date, then
**Recalculate schedule**. With calendars, the whole chosen date is allowed;
without calendars, deadlines are elapsed day numbers from schedule start.
Project rows assess deterministic completion and P50/P80/P95/P98/P99 separately.
Project cards summarize P50 and P95. Task rows assess their deterministic finish,
or recorded finish for completed tasks. Late values are highlighted. These are
calendar days when dated and elapsed days when numeric, not resource workdays.

Clear a field and recalculate to remove its deadline. **Save workspace** and
**Open saved workspace** preserve the targets. Deadlines do not change dispatch,
priorities, forecasts or feasibility; fixed start/finish commitments remain
separate. A forecast marked infeasible is diagnostic even when it meets a target.
Date targets without a calendar show **Calendar required**. Older workspaces
without deadlines continue to load.

## Put a project on hold

Use **Put on hold** beside **Move up / Move down**, then **Recalculate schedule**.
New unstarted, unlocked tasks are excluded from dispatch and resource utilization.
Their IDs, estimates, notes, checklists and dependencies stay in the workspace.
Work already in progress continues nonpreemptively; completed actuals and locked
appointments are retained. A hold does not release fixed reservations.

Full project completion forecasts are withheld while unfinished work is on hold.
New tasks in other projects depending on suspended work are also left unscheduled;
those projects show **Blocked by held work**. Locked commitments depending on
suspended work retain their dates and generate a conflict. Deadlines for
unscheduled work show an unavailable forecast rather than a promise.

Use **Resume project** and recalculate to put the work back into dispatch at its
existing project position and task priorities. Save/open retains hold status.
The JSON forecast `withheldReason` and `unscheduledTaskIds` identify incomplete
schedules. For withheld projects, `deterministicCompletion`,
`completionPercentiles` and `feasible` are `null`, and `completionDates` is omitted.
Consumers must check `withheldReason` before using completion values. A held project
with only active/locked work can still have a complete schedule and forecast;
only suspended tasks cause withholding. CLI tables suppress unavailable promises.
Comparisons distinguish suspended, resumed and removed tasks; percentile changes
are unavailable while either forecast is withheld. Resource improvement ranking
uses fully scheduled projects and explicitly lists excluded held or hold-blocked
projects. Active work and locked commitments still constrain resources. If none
has a full forecast, recommendations are unavailable. A date deadline without a calendar continues to
show **Calendar required**; a suspended task or project shows **Forecast unavailable**.

## Latest-safe-start feeding protection

Load `examples/feeding-protection.json` through **Project plan → Choose File**.
Initially task F starts at day 0 and uses the Platform Engineer until day 4, so
Release Two's environment task L starts at day 4. Open **Feeding tasks**, select
**F latest safe start**, and recalculate. The feeder moves later, while L starts
at day 0 and the downstream release-validation start remains day 20.

The report shows original/new starts, task P50 and P99 effort, their difference
as the feeding buffer, the downstream protected start and actual earlier capacity
freed. The feeder's allocation is reserved through its P99 window, so other tasks
cannot start in a gap if they would cross that reservation. The actual task still
has its P50 planned finish. Buffer reservations are protection, not additional
work counted in utilization. They are described in the feeding report.

Select unstarted, unlocked working tasks. A task on its owning project’s critical
chain is eligible when it directly feeds a higher-priority project. The report
shows its owning project’s before/after deterministic completion. The first version uses individual task P99 values, not aggregate
feeding-chain percentiles. Select independent feeders; immediate feeder-to-feeder
links are rejected. Ordinary feeding protects the owner's critical chain and all
direct downstream starts. For a cross-project feeder supplying higher-priority
work, higher-priority project timings and higher-priority direct downstream starts
stay protected; the owner's critical chain and lower-priority successors may move
later. Active work and user locks remain protected in both cases. If P99 slack or
resource constraints prevent safe placement, the original forward schedule is
retained with a reason. Multiple conflicting selections can cause the complete
attempt to be retained as the forward plan; try one feeder at a time.

Calendars and allocation scale the protected working effort. With calendars,
backward traversal respects weekends and dated exceptions. Clear the checkbox and
recalculate to return to forward scheduling. Save/open retains selections and
recomputes the same deterministic result. P99 is a lognormal model estimate,
not a guarantee or proof of a 99% project completion chance.

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

### See feeding protection on the timeline

After selecting F and recalculating, open **Timeline**. The default **Critical
chain & feeders** view includes technical dependencies feeding the critical
chain, so F → D is visible even though F is not a critical-chain task. Applied
feeding dependencies use teal arrows. The hatched **P99 buffer** band begins at
F's P50 finish and ends at the end of its P99 resource window. This can precede
the protected downstream start when other reserved work requires an earlier slot. It is a reservation,
not additional productive task work.

Click the band, select F, or select D to see the buffer's working effort, dates,
original/new feeder starts and protected dependency links in the details panel.
The band is keyboard-accessible. **No links** hides arrows while retaining buffer
bands. Pending edits do not change the drawing until recalculation; unchecking
F and recalculating removes the band. Forward-only or rejected placements have
no protection band.

## Days or calendar dates

Use **Time display** beside **Save workspace** to switch between **Days from
start** and **Calendar dates**. This changes completion cards, calculated task
schedule, feeding report and timeline immediately, without recalculation. It does
not change estimates, deadlines, locks, actuals or forecasts. Save/open retains
the preference. With calendars, day numbers are elapsed calendar days from the
schedule origin, including weekends and holidays. Without a resource calendar,
date view is unavailable; load a calendar to enable it. Progress input, deadline
editing, resource-calendar editing and weekly utilization retain their calendar
semantics.

### Cross-project feeding example

In `feeding-protection.json`, add L to D's dependencies, then select F and L under
**Feeding tasks**. L is allowed to feed higher-priority Release One even though it
controls Release Two's finish. The scheduler searches backward for a resource-safe
P99 window before other reservations; it does not overwrite F's protection.
Release Two may finish later, shown explicitly in the report. L's 6 / 6 estimates
produce zero uncertainty buffer; a **0d** marker explains this rather than drawing
a fictitious band. Different P20/P80 estimates produce a positive buffer if they
fit. A feeder's P99 window can end earlier than D's start because of shared-resource
reservations. Extra waiting between that window and D is not additional reserved
feeding buffer.

## Manage resources and unassigned tasks

Open **Resources & calendars** to add or delete resources, including when the list is empty. Loading and recalculating reconcile the list with task assignments and existing calendars. Unused resources remain until explicitly deleted. Resources missing a calendar receive eight-hour weekdays (40 hours per week); custom weekly hours and dated exceptions are preserved. Without a calendar, the resource list shows the assumed 40-hour week and scheduling remains in abstract days.

**Delete** asks “Are you sure?” and explains that affected tasks become unassigned. Confirming removes the resource, its calendar, dated exceptions and descriptive details; all affected task resource fields become blank. Cancelling leaves everything intact. Assign replacements in **Tasks**. The engine refuses to schedule any unassigned task, including active, held or completed work; it never invents a replacement resource.

You may **Save workspace** with unassigned tasks before recalculating. That file is a draft containing the edited plan and no calculated forecasts. Reopening it keeps tasks unassigned and displays a request to assign resources. Normal workspaces still require recalculation before saving edited results.

Manual check: load a plan with task resources missing from its resource array; verify they appear. Add an idle resource, reassign tasks, and recalculate; verify it remains. Cancel a deletion, then confirm it; verify the task dropdowns say Unassigned. Save and reopen the draft, add a replacement, reassign the tasks and recalculate. Delete all resources and verify Add resource still works. In calendar mode verify new resources have eight-hour weekdays, custom hours survive, and deleted-resource exceptions are removed.

## Create a project without importing files

Click **New project**, enter a name, and click **Create project**. In a fresh workspace, **Schedule starts** sets the calendar origin; the calendar uses eight hours per estimated workday. An empty project displays “No tasks yet” instead of a zero-day completion forecast. Adding another project appends it to the existing portfolio without changing its start date, resources, tasks or custom calendars.

Open **Resources & calendars** and add the people or resource types you need (40-hour weekdays by default). In **Tasks**, click **Add task**. Choose its project, enter a name, good/P20 and poor/P80 days, resource, and optional comma-separated predecessor IDs from the task table. IDs are generated uniquely across the portfolio and tasks get increasing priorities within the project. New tasks start as planned working effort at 100% allocation; edit those fields afterward as needed. Two zero estimates create a milestone. Predecessors may belong to another project but must already exist.

You can add tasks before assigning resources. Save/reopen preserves the draft; scheduling waits until every task has a resource. Empty workspaces are also saveable. Adding a task or project submits current edits and refreshes the calculation when assignments are complete. Use **Recalculate schedule** after later table edits.

Manual check: create a blank project, save/reopen it, add an unassigned task, and save/reopen again. Add a resource, assign it, and add a dependent task. Check the resulting timeline and forecasts. Add a second blank project, confirm the first remains unchanged, and add another task sharing the resource. Check Cancel and invalid names, estimates and dependency IDs.

## Workspace names and manual project entry

Use **Add blank project** beside **Project order** (or **Add project** at the top) to create Release Two manually. The manual form hides the template form and has a distinct **Create blank project** button. **Create from template** remains the CSV-template workflow, with a **Start a blank project instead** shortcut. Adding a blank project keeps existing tasks, resources, calendar and workspace name.

The editable **Workspace name** defaults to the first project name followed by “workspace”, or “Untitled workspace” when there are no projects. Renaming updates the browser-tab title and saved plan metadata without recalculating. Downloads include the workspace name and a timestamp, with filename-unsafe characters replaced. Reopening restores the name. The browser tab also uses the BufferLogic link-symbol icon.

## P95 target status and remaining-estimate review

Project cards and the **P95 target status** column in Deadlines use the P95 completion forecast. A P95 completion of November 11 is late against November 2, and on time against November 11 or any later date. Calendar deadlines include the whole named date. The other percentile columns remain available for comparison; an earlier P50 does not make a late P95 target on time. Schedule conflicts are separate and still show Needs attention. Task deadline checks continue to use each task's calculated finish.

In Progress, **Estimate review** is blank and disabled for not-started and completed tasks. It applies only to in-progress tasks. Advancing progress still marks active remaining estimates Needs review; completing a task clears its displayed review field.

The timeline explains when no critical chain is calculated because a project is empty, a workspace has unassigned tasks, or work is held/blocked. If a populated, scheduled project unexpectedly loses its critical chain, save that workspace before further edits so the state can be reproduced.
