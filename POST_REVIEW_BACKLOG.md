# BufferLogic post-review backlog

Recorded November 4, 2026. These are proposed additions for after the current
review is complete. Recording this list does not change the application.

## 1. Save one project

Add a project-level Save project action without exporting the entire workspace.
Include a reusable task-list CSV option, covering estimates, primary/supporting
resources, priorities and dependencies. Define a project JSON option for richer
information that cannot be represented faithfully in the task-list CSV.

Identify dependencies on other projects explicitly when exporting. A standalone
file must not silently contain unusable external references. Workspace saving
continues to retain the full portfolio.

## 2. Turn an entered project into a template

Export a project created or edited in BufferLogic as a reusable template, with no
manual spreadsheet reconstruction. Preserve its task structure, estimates,
resource requirements, notes and checklist definitions. Reset actual progress,
completion states and completed checklist ticks for new work. Decide how to handle
deadlines and locked commitments rather than copying old dates silently.

Creating a project from that template must assign fresh project/task IDs and
remap internal dependencies. Require an explicit policy for external dependencies.

## 3. Duplicate an entered project

Add Duplicate project, ask for the new project name, and copy it into the current
workspace. Generate fresh IDs and remap dependencies within the copy. Make clear
whether matching resources are shared with the original (recommended default).

Default to a new planned project with progress and actuals reset; preserve the
original unchanged. Resolve cross-project dependencies explicitly, using the same
rules as template creation. Duplicating must not reuse retired identities.

## 4. Collapse projects

Allow project groups to be collapsed/expanded so users can focus on the projects
they are interested in, especially on the timeline. Provide Expand all and
Collapse all. Settle which other project-grouped views should support this too.

This is a display control. Hidden projects must continue to participate in
scheduling and resource contention. Explain cross-project links when one endpoint
is collapsed, and allow task navigation to expand the relevant group.

## 5. Show only critical-chain tasks

Add a Show only critical-chain tasks display filter. On the timeline, use the
project selected in Highlight project and include controlling tasks from other
projects when they belong to its chain. This filters task rows, unlike the current
Show links control, which filters connections.

Provide a clear way back to all tasks, indicate when filtering is active, and
explain an empty/withheld chain. Keep necessary dependency context understandable
when non-chain tasks are hidden. Filtering must not change scheduling, resources,
forecasts or saved task data. Decide whether Tasks and Calculated schedule should
also offer the filter.

## Suggested sequence

Implement project export and reusable-template rules first, then reuse that work
for duplication. Add collapse/expand and critical-chain filtering as focused view
improvements. Test export/import round trips, fresh identities, dependency remaps,
reset progress and unchanged scheduling under display filters before release.
