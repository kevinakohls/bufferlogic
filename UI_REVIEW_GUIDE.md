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
5. In **Resource calendars**, edit weekly availability. For example, give the Framing Crew
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
  resource waits. By default, only links along the selected critical chain are shown.
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
