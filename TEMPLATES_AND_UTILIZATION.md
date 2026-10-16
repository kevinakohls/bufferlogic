# Templates, notes and resource utilization

This review milestone adds reusable CSV template loading, editable descriptions and
comments, and a weekly resource-capacity report. Ordinary CSV import ordering is preserved. Tasks can reserve a primary resource and multiple supporting resources; template creation does not automatically increase capacity.

## Create projects from templates

Start `npm run ui`, then click **Create from template**. Choose your template CSV or
**Use housing template** or **Use software template**, enter a new project name, and click **Create from template**.
A project is appended to the current workspace. In an empty workspace it starts a
new portfolio. Repeat with another name to demonstrate two software projects sharing
one resource pool.

The software template is the user's 26-task CSV, checked in as
`examples/software-template.csv`. Its original task IDs, resources, dependencies and estimates are preserved. Draft
Description and Comments columns explain the intended work and assumptions for review;
revise them to match the actual project. No Priority
or Project columns are needed in template mode. These software headings are accepted:

| Template heading | Engine field |
| --- | --- |
| Predecessors | Depends on |
| Low Estimate P20 (days) | Good days |
| High Estimate P80 (days) | Poor days |

`Task`, `Resource`, `Good days`, and `Poor days` (or the equivalent headings above)
are required. Dependencies are optional; use comma-separated source IDs or `none`.
If `ID` is omitted, source references default to one-based row numbers. Repeated
identical headers and blank rows are handled. Template IDs must be unique within the
selected source project, and predecessors must stay inside that selected project.

For a house CSV containing both P1 and P2, **Source project** chooses which house to
copy. One template operation creates one project, not both houses. Existing task IDs
serve only as dependency references during copying:

- A new unused project ID is chosen (`P1`, `P2`, etc.).
- Tasks receive IDs such as `P1-T001`, `P1-T002`.
- Priorities are assigned **1, 2, 3... from CSV row order**. Imported Priority values
  are deliberately ignored in template mode.
- Dependencies are remapped to the new task IDs. A second copy has its own IDs and
  belongs only to its new project. Copies begin as planned tasks, without progress
  history or fixed commitments from an earlier schedule.

Normal **Load files** import keeps existing IDs, priorities and project grouping.
Template mode is a separate action, so Excel priority changes do not affect template
defaults. Excel row reordering does change the template's default order.

Resource labels are shared across copies; `Frontend Developer` means the same planned
capacity in both projects. This is not a new developer per project. New resource labels
receive eight-hour Monday–Friday calendars (40 hours per week), independently of the
workspace’s hours-per-estimated-workday conversion. Existing calendars, notes and projects
are preserved. Review those defaults before making customer promises. Naming an actual
person does not add capacity; multiple developers must be modeled as distinct resources
and assigned appropriately.

## Descriptions and comments

Use **Descriptions & comments** and choose the project, task, or resource/person.

| Level | Editable details |
| --- | --- |
| Project | Name, owner, description, comments |
| Task | Description, completion criteria, locked-commitment reason, comments |
| Resource/person | Display name, role/skill, description, comments |

Resource IDs stay stable for task/calendar matching. Display names appear alongside
those IDs in task selectors, calendar and utilization views. Task and resource comments
also appear in the selected task's timeline panel. Comments are plain text, not HTML.
They explain assumptions; they do not change availability, dependencies or allocations.

Recalculate after edits, then **Save review JSON** to retain the plan and its notes.
Reload that JSON to continue. Notes are editable fields, not an author/timestamp audit
log. Production comment history, attachments and approvals remain later work.

Portfolio JSON now preserves optional project `owner`, `description`, `comments`;
task `description`, `comments`, `completionCriteria`, `lockReason`; and
`resourceDetails: [{ id, name?, role?, description?, comments? }]`. Resource detail IDs
must refer to existing resources. Ordinary task CSV and template CSV optionally accept
`Description`, `Comments`, `Completion criteria`, and `Lock reason` columns.

## Resource utilization

Open **Resource utilization** after a calendar calculation. The report includes:

- Available, scheduled and remaining hours per resource.
- Utilization percentage: scheduled hours divided by available hours.
- Monday–Sunday weekly detail, with scheduled hours broken down by owning project.
- Task IDs showing what occupies each resource, for tracing in the timeline.

The reporting period is the **remaining deterministic schedule**, from `asOf` through
the last scheduled finish, not through P95 or P99. All resources use this same period.
The first and last weeks are clipped to the reporting edges; week labels remain Monday.
Calendar holidays, exceptions, Saturday work and overtime affect availability.

Scheduled hours are available calendar hours inside the task's remaining scheduled
span multiplied by its allocation percentage. This includes only actual working
availability, not weekends or the full elapsed span. A 50% allocation consumes half
of the available hours it spans. Elapsed waiting and zero-duration milestones consume
none. Completed history before `asOf` is excluded. Fixed tasks count available-hours
reservations inside their fixed interval; insufficient work capacity still appears as
an engine conflict rather than being invented as overtime.

With no available hours, utilization is shown as an em dash. Overbooking can exceed
100%, with negative remaining hours; the report does not hide conflicts. A high total
utilization is not proof of critical-chain impact, and spare hours early in a project
may not help later work. Use the timeline and separate resource recommendation analysis
when deciding where extra hours matter.

Filter a resource to inspect weekly project allocation. **Download report CSV** exports
the displayed resource selection (or all resources) with per-project columns. It includes
an Excel UTF-8 BOM, quoted cells and formula protection for text. Notes are retained in
review JSON, not in the utilization CSV.

Engine APIs: `instantiateTemplate`, `templateProjects` in `src/templates.ts` and
`resourceUtilization(result)` in `src/utilization.ts`. UI result JSON now also includes
`utilization` when a working calendar is present. Calendar-free plans can still be
loaded and edited; their utilization tab asks for a calendar.

The housing template and two-house example also include draft task descriptions and
comments for both houses. Review these assumptions for the actual build, especially
permit approval, inspections and curing or drying waits. Notes do not change estimates,
dependencies or resource assignments. New template copies inherit the notes; saved
projects retain their existing notes.

## Housing equipment demonstration

**Use housing template** loads `examples/housing-template.csv`, a 36-task house template with draft equipment assignments. Create House One, then repeat for House Two. Both copies share the same named equipment and crew resources.

| Task | Primary crew | Supporting resources |
| --- | --- | --- |
| Site clearing & grading | Excavation Crew | Loader 1, 100% |
| Excavate foundation | Excavation Crew | Backhoe 1, 100%; Equipment spotter, 50% |
| Backfill | Excavation Crew | Loader 1, 100% |
| Pour slab / basement floor | Concrete Crew | Concrete pump 1, 100% |
| Floor framing & subfloor | Framing Crew | Telehandler 1, 100% |
| Final grading & landscaping | Landscaper | Loader 1, 100% |

These are demonstration assumptions. Primary crews include their operator, equipment is reserved for the complete assigned task, and new resources start with eight-hour weekdays. Review the task comments and checklists. Split tasks when equipment is needed for only part of the work. A backhoe is the chosen excavating machine here; no additional excavator is reserved as an alternative. Supplier-operated ready-mix trucks are not modeled as company-owned shared equipment.

The optional **Supporting resources** CSV column contains a JSON array matching the saved-workspace schema, for example `[{"resource":"Backhoe 1","allocationPercent":100},{"resource":"Equipment spotter","allocationPercent":50}]`. A blank cell means no supporting assignments. Normal CSV quoting applies; spreadsheet tools should retain the entire JSON array in one cell. Both template creation and portfolio CSV loading validate and preserve it. Matching names share one resource and preserve any existing custom calendar.

For a reviewer demonstration, create two houses, show excavation's two supporting assignments, then find Loader 1 across clearing, backfill and final grading. Use Timeline and Resource utilization to inspect shared capacity. New template copies receive these defaults; use existing task editors to add equivalent assignments to saved projects.
