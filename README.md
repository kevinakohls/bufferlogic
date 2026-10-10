# BufferLogic

**Protect the Buffer. Finish Faster.**

BufferLogic is a TypeScript scheduling prototype for projects that share limited
resources. It calculates resource-constrained critical chains and approximate
project completion forecasts, and provides a local review interface for updating
plans and actual progress.

For the GitLab hackathon, the demonstrated post-code workflow uses **GitLab Duo
Agent Platform's Code Review flow** with human approval and GitLab CI validation.
A controlled deadline regression produced a failing test; Duo identified the
boundary error and proposed a correction. The approved correction was committed,
and both the branch and merge-request pipelines passed. This is a supervised
review-and-fix workflow, not autonomous repair or deployment.

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

## Implemented features

- Projects sharing resources, project order and task order exceptions.
- Nonpreemptive scheduling, resource allocations, locked commitments and milestones.
- Approximate fixed-critical-chain P50/P80/P95/P98/P99 completion forecasts.
- Resource calendars, dated exceptions and project/task deadline warnings.
- CSV templates, editable task notes and checklists.
- Actual progress and explicit remaining estimates.
- Interactive schedule timeline and weekly resource utilization graphs.
- Workspace save/open and Excel-compatible report exports.
- CLI ranking of extra Saturday hours one resource at a time.

Percentile forecasts use independent lognormal task durations and a fixed critical
chain; they are approximations, not simulated guarantees. Deadline targets flag
risk without changing dispatch order or locking dates.

## GitLab automation and demonstration

GitLab CI builds and tests on Node.js 22 and 24. Security scanning is configured
through GitLab's SAST and Secret Detection templates. Job execution can differ
between branch and merge-request pipelines; inspect the actual jobs when checking
evidence.

The Duo-enabled submission repository is intended to be
[darkvole1/BufferLogic](https://gitlab.com/darkvole1/BufferLogic).
The application uses GitLab automation in its development lifecycle; it does not
currently call Duo from its scheduling engine or dispatch AI agents based on
critical-chain priorities.

See [Hackathon submission and demo guide](HACKATHON_SUBMISSION.md) for the draft
submission text, reproduction steps, evidence checklist and video script.
See [Development](DEVELOPMENT.md), [Reviewer Guide](REVIEWER_GUIDE.md) and
[UI Review Guide](UI_REVIEW_GUIDE.md) for detailed commands and behavior.

## Future work

Project baselines, saved progress history, buffer consumption and a CCPM fever
chart are planned but not implemented. Feeding buffers, historical duration
calibration, Monte Carlo simulation, cost/OT optimization and agents acting on
scheduling recommendations are also future work.

## License

MIT. See [LICENSE](LICENSE).

## Multi-project scheduling

The portfolio engine schedules projects against shared resources, with project order, task overrides, percentage allocations, locked commitments and milestones. Projects own their versioned completion forecasts. See [PORTFOLIO_GUIDE.md](PORTFOLIO_GUIDE.md) for the worked example and conflict rules.

```sh
npm run portfolio -- examples/portfolio.json --format table
```

The portfolio command also imports Excel CSV files with a `Project` column. See [HOUSE_BUILD_REVIEW.md](HOUSE_BUILD_REVIEW.md) for the two-house example.

Resource-calendar CSVs now drive dated portfolio schedules. Add `--calendar examples/house-resource-calendars.csv` to the two-house command; start defaults to today. See [RESOURCE_CALENDARS.md](RESOURCE_CALENDARS.md).

Use `--recommend-resources` on a calendar portfolio run to rank additional Saturday hours one resource at a time, without changing the input plan.

## Review UI

Run `npm run ui` and open the printed local address in your browser. Load the two-house example or your CSV/JSON files, edit task estimates and calendars, then recalculate forecasts. See [UI_REVIEW_GUIDE.md](UI_REVIEW_GUIDE.md) for Windows instructions and saving reviews.

The UI **Timeline** tab groups tasks by project and highlights the selected project’s critical chain across project boundaries. Select a task for dependency/resource-wait details; locked tasks and milestones are marked.

The UI also creates project copies from CSV templates, retains project/task/resource descriptions and comments, and reports weekly resource utilization. See [TEMPLATES_AND_UTILIZATION.md](TEMPLATES_AND_UTILIZATION.md).
