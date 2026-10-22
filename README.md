# BufferLogic

**Protect the Buffer. Finish Faster.**

BufferLogic helps teams plan competing projects that share people and equipment.
Change a priority, resource assignment or estimate, then compare how that decision
affects delivery across the portfolio. It combines shared-resource scheduling with approximate completion forecasts.

## Try it online — no installation required

[**Open the live BufferLogic demo**](https://bufferlogic-859125571309.us-central1.run.app)

Hosted on **Google Cloud Run**. No installation or Google account required. Use fictional data. Plans are sent to the server
for calculation, but workspaces are not saved on the server. Visitors have separate
browser state; there are no accounts or automatic cloud saves.

### A two-minute walkthrough

1. Choose **Load two-house example** to see projects sharing construction crews
   and equipment.
2. Open **Compare** and choose **Set current as baseline**.
3. Use **Move up** in Project order to give the other project first choice of
   shared resources, then **Recalculate schedule**.
4. Inspect each project's delivery forecast. Open **Compare → Compare versions**
   to see which projects move earlier or later and which task timings change.
5. Open **Timeline** and select **Highlight project** to trace that project's
   critical chain. Choose **All dependencies and waits** to see every connection.
6. Choose **Save workspace** to download your scenario. Download the baseline
   separately if you want to keep the original too.

The header's **Help** button explains the main workflows. You can also choose **New project** to
start without a file, or create projects from housing and software templates.

## What you can do

- **Coordinate shared resources:** assign a primary person or crew plus supporting
  people or equipment, with allocations, availability calendars and exceptions.
- **Explore priorities:** reorder projects, put projects on hold, and compare a
  captured or saved baseline against a proposed scenario.
- **Protect downstream work:** select eligible feeding tasks for later starts
  with estimated P99 − P50 protection, subject to scheduling safety checks.
- **Review delivery risk:** inspect approximate completion percentiles and
  deadline status based on the project's P95 planning target.
- **Maintain the plan:** add or delete projects/tasks, record actual progress and
  remaining estimates, and keep task notes and checklists.
- **Understand the result:** follow cross-project dependencies and resource waits
  on the timeline, inspect weekly utilization, and export reports for Excel.

Pending edits produce a prominent **Schedule out of date** warning and muted
previous results. Estimate errors identify the task and offer **Go to** navigation.
Adding or deleting tasks/projects recalculates other pending valid edits.

## Save your work

**Save workspace** downloads a JSON file that can be reopened in BufferLogic.
Browser recovery also keeps a local copy of edits and captured baselines when
storage is available; choose **Restore workspace** on return. Recovery belongs to
that browser and site address, and can be lost in private browsing or when browser
data is cleared. Download files as portable backups. Clear recovery on shared
computers and close other editing tabs, which may save another copy.

## GitLab Duo, testing and Google Cloud

Development uses [GitLab merge requests](https://gitlab.com/darkvole1/BufferLogic),
Duo Code Review, human review and CI validation. CI builds TypeScript and runs tests on Node.js 22 and 24, with SAST and secret-detection
configuration. Inspect each pipeline's results.

Our controlled review demonstration deliberately changed a deadline comparison
so finishing on the deadline was incorrectly marked late. Tests failed, Duo
identified the boundary error and suggested the correction, and the corrected
code passed before merging. Historical evidence:

- [Failed regression pipeline](https://gitlab.com/darkvole1/BufferLogic/-/pipelines/2933613176)
- [Passing corrective pipeline](https://gitlab.com/darkvole1/BufferLogic/-/pipelines/2933618810)

Duo supports development; it is not called by the scheduling engine. The hosted
app runs as a container on Cloud Run. Merging code, updating a local installation
and deploying the public demo are separate steps; deployment is currently manual.

## Planning assumptions and limits

Forecasts use independent lognormal task durations and a fixed critical chain.
They are approximate planning estimates, not delivery guarantees. Timeline bars show the calculated task schedule, not P95-duration bars.
Locked commitments are assumed to be met; infeasible forecasts require attention.
Deadlines indicate risk without forcing dispatch order or locking task dates.

Calendars represent daily capacity and date-only commitments, not clock-time
appointments or shift scheduling. Cloud workspace history, multiuser collaboration, historical calibration,
Monte Carlo simulation and AI scenario selection remain future work. The CLI
provides limited Saturday-hours resource sensitivity rankings.

## Optional: run locally for development

The online demo above requires no setup. To run a separate copy on your computer,
see [DEVELOPMENT.md](DEVELOPMENT.md#local-review-ui) for Node.js requirements,
installation, tests and startup commands. Local startup does not update Cloud Run.

## Documentation

- [Development](DEVELOPMENT.md): local setup, CLI commands, GitLab review and updates.
- [UI review guide](UI_REVIEW_GUIDE.md): editing, recovery and manual checks.
- [Reviewer guide](REVIEWER_GUIDE.md): command-line examples and expected behavior.
- [Portfolio guide](PORTFOLIO_GUIDE.md): shared resources, forecasts and commitments.
- [House build review](HOUSE_BUILD_REVIEW.md): the two-house example.
- [Resource calendars](RESOURCE_CALENDARS.md): availability and exceptions.
- [Templates and utilization](TEMPLATES_AND_UTILIZATION.md): templates and reports.
- [Cloud Run](CLOUD_RUN.md): hosting configuration and release instructions.

## License

MIT. See [LICENSE](LICENSE).
