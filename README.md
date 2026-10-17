# BufferLogic

**Protect the Buffer. Finish Faster.**

BufferLogic is a TypeScript scheduling prototype for projects that share limited
resources. It calculates resource-constrained critical chains and approximate
project completion forecasts, and provides a local review interface for updating
plans and actual progress.

GitLab Duo Code Review flow supports supervised review of proposed changes.
GitLab CI validates the application with build, test and security jobs. The
workflow below explains how to reproduce a controlled deadline-regression demo.

## Run the prototype

Requires Node.js 22 or 24 and npm. From the repository root:

```sh
npm ci
npm test
npm run ui
```

On Windows PowerShell, use `npm.cmd` in place of `npm`. Leave the server running
and open `http://localhost:3000`. Stop it with Ctrl+C. The interface processes
loaded plans locally; save the workspace to retain edits between sessions.

To build a plan without importing a file, choose **New project** in the review UI, add resources in **Resources & calendars**, then use **Add task** in **Tasks**. Blank and unassigned workspaces can be saved as drafts.

## Implemented features

- Projects sharing resources, project order and task order exceptions.
- Nonpreemptive scheduling, primary and multiple supporting resources, allocations, locked commitments and milestones.
- Approximate fixed-critical-chain P50/P80/P95/P98/P99 completion forecasts.
- Resource calendars, dated exceptions and project/task deadline warnings.
- CSV templates, editable task notes and checklists.
- Actual progress and explicit remaining estimates.
- Interactive schedule timeline and weekly resource utilization graphs.
- Workspace save/open, captured or saved-file baseline comparison, and Excel-compatible report exports.
- CLI ranking of extra Saturday hours one resource at a time.

Percentile forecasts use independent lognormal task durations and a fixed critical
chain; they are approximations, not simulated guarantees. Deadline targets flag
risk without changing dispatch order or locking dates.

## Examples and documentation

Load the two-house example in the UI to see projects competing for shared crews.
The **Timeline** highlights a project's critical chain across project boundaries.
Choose **Highlight project** for the project you want to inspect; scrolling or selecting
a task does not change the highlighted project. Use **Show links → All dependencies
and waits** to see connections filtered out by the default view.
Create project copies from housing or software CSV templates (the housing template includes shared equipment and spotting support), update progress and
deadlines, and use **Save workspace** to retain the plan.

The portfolio CLI also supports JSON plans and CSV files with a `Project` column:

```sh
npm run portfolio -- examples/portfolio.json --format table
```

Add `--calendar examples/house-resource-calendars.csv` to a portfolio run for
dated schedules; the start date defaults to today.
The `--recommend-resources` option evaluates extra Saturday hours for one resource
at a time.

- [Development](DEVELOPMENT.md): input formats and development workflow.
- [Reviewer Guide](REVIEWER_GUIDE.md): CLI examples and expected behavior.
- [UI Review Guide](UI_REVIEW_GUIDE.md): Windows startup, editing and workspace save/open.
- [Portfolio Guide](PORTFOLIO_GUIDE.md): shared resources and fixed commitments.
- [House Build Review](HOUSE_BUILD_REVIEW.md): the two-house example.
- [Resource Calendars](RESOURCE_CALENDARS.md): calendars and availability changes.
- [Templates and Utilization](TEMPLATES_AND_UTILIZATION.md): templates, notes and reporting.

## GitLab automation

The project repository is [darkvole1/BufferLogic](https://gitlab.com/darkvole1/BufferLogic).
The CI configuration installs locked dependencies, builds TypeScript and runs
application tests on Node.js 22 and 24. It also includes GitLab's SAST and Secret
Detection templates. Job execution can differ between branch and merge-request
pipelines; inspect the actual jobs and logs for each run.

### Reproduce the supervised review workflow

1. Run `npm test` on the latest `main` and confirm the baseline passes.
2. Enable GitLab Duo's automated Code Review flow for the project/group, with the
   required Duo access and CI runners configured.
3. Create a separate demo branch. In `src/deadlines.ts`, change the calendar-date
   status comparison from `difference>0` to `difference>=0`. Leave tests unchanged.
4. Run `npm test`. The test for whole-date calendar deadlines should fail because
   completion on the deadline date is incorrectly classified as late.
5. Push the branch and create a merge request clearly marked as a controlled
   demonstration. Leave auto-merge off and inspect Duo's review activity.
6. Review and approve a correction that restores inclusive deadline-date behavior
   without weakening tests. Applying a suggestion commits the approved change.
7. Inspect the resulting application and security job results. Merge only after
   validation and human review, preserving the merge request and pipeline history.

This workflow uses agent review, human approval and CI validation. The scheduling
engine does not currently call Duo or dispatch agents based on critical-chain
priorities. The deliberate regression is for demonstration only.

## Future work

Automatic saved progress history, buffer consumption and a CCPM fever chart
remain future work. Historical duration calibration, Monte Carlo simulation,
cost/OT optimization and agents acting on scheduling recommendations are also
future work.

## License

MIT. See [LICENSE](LICENSE).

Cloud hosting preparation and the reviewer deployment checklist are in
[CLOUD_RUN.md](CLOUD_RUN.md). Deployment is separate from running locally.
