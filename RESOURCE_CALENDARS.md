# Resource-calendar CSV template

The separate file `examples/house-resource-calendars.csv` contains one weekly row
for each of the two-house example's 21 shared resources. Open it in Excel and save
as CSV UTF-8 after editing. Resource names must match the task CSV exactly. Both
houses share each resource's calendar; do not duplicate it per house.

The initial values are assumptions for review: 8 available hours Monday–Friday,
and zero Saturday/Sunday. They are not confirmed crew schedules. Edit availability
to reflect your actual crews. These define capacity, not hours already booked on a
particular project. Percentage task allocations remain a separate task setting.

## Weekly rows

Keep one `weekly` row per resource. Leave `Date` and `Exception hours` empty. Set
hours in the seven weekday columns. For a crew normally working Saturdays, change
its `Saturday hours` from 0 to the appropriate number. Notes are explanatory only.

## Dated exceptions

Add `exception` rows to the same file for holidays, absence, one-off Saturday work
or overtime. Use `Date` in YYYY-MM-DD format. Leave all seven weekday columns empty
and put the total available hours for that date in `Exception hours`.

Examples below are illustrative only; they are not added to the actual template:

| Resource | Row type | Date | Exception hours | Notes |
| --- | --- | --- | ---: | --- |
| Concrete Crew | exception | 2026-10-17 | 8 | One-off Saturday work |
| Framing Crew | exception | 2026-10-19 | 10 | Two extra hours on a normal workday |
| Electrician | exception | 2026-10-20 | 0 | Unavailable |

An exception replaces that day's weekly hours; it does not add to them. For example,
10 means 10 hours total, rather than 8 + 10. Use at most one exception per resource
per date. Available hours should be between 0 and 24. A future importer should reject
missing resource names, duplicate weekly rows or conflicting exceptions rather than
silently choose one.

## Run with resource calendars

The portfolio engine now applies these weekly schedules and exceptions. From your
Windows repository:

```powershell
npm.cmd run portfolio -- examples/house_build_tasks2.csv --calendar examples/house-resource-calendars.csv --format table
```

New CLI calendar runs default to **today on your computer**, using its local timezone.
Use `--time-zone America/New_York` to choose the date in a specific timezone when
running on a cloud computer, or pin a start date for a reproducible review:

```powershell
npm.cmd run portfolio -- examples/house_build_tasks2.csv --calendar examples/house-resource-calendars.csv --start-date 2026-10-09 --format table
```

`--start-date today` explicitly requests the same default. `--hours-per-day 8` is
the default conversion: one estimated workday means eight hours of effort at 100%
allocation. These options require `--calendar`. Stored result JSON retains the actual
start date, timezone, calendar rows and exceptions, so previous versions never drift
when today's date changes.

The console shows task start/finish dates and each project's deterministic and
P50/P80/P95/P98/P99 completion dates. Output JSON includes `plan.calendar`, task
`startDate`/`finishDate` and project `forecast.completionDates`. With calendar mode,
numeric `start`, `finish` and completion values are elapsed **calendar-day offsets**
from the origin, while task estimates remain working-effort days. Without calendars,
existing abstract-day results are unchanged.

A five-day workweek is roughly 260 working days per year before holidays, not
250 automatically. Add holiday/absence exceptions to represent your actual year.
No future calendar is seeded or saved: weekly rules and specific exceptions are
evaluated as needed. A bounded 100-year search reports unavailable resources or
out-of-range effort rather than hanging.

## Task behavior and fixed commitments

Work progresses only when its resource is available. At 50% allocation, twice as
much resource-calendar time is needed for the same effort. A started task retains
its allocation until completion; overnight/weekend closures do not allow another
task to take its reserved share. Dated exceptions replace normal hours, so a holiday
can delay dependencies and a working Saturday or overtime can bring them forward.

For curing or permit waiting, portfolio JSON tasks can specify
`"durationMode": "elapsed"`. Those estimates are elapsed days, proceed through
weekends, and reserve **no resource capacity** while waiting. The named resource
remains the accountable owner. Do not use this mode for work that occupies a crew.
Work defaults to `"durationMode": "working"`. The basic task CSV remains a planned
working-effort input; use JSON for elapsed waits, locks and progress metadata.

Locked start/finish offsets remain unchanged; in calendar mode they are calendar-day
positions relative to the recorded origin. A fixed task receives a calendar conflict
if its interval lacks sufficient available working effort. Predecessors finishing
late produce a dependency conflict. The commitment is preserved and affected
projects are marked infeasible. Milestones need no working capacity. Do not reinterpret
an approved abstract-day plan as a dated commitment without reviewing its offsets.

## Date precision and forecasts

This first implementation is a **daily capacity model**, not clock-time shifts.
Available hours are spread over the date for fractional progress calculations.
Numeric fractional offsets must not be interpreted as actual appointment times.
Work finishing at a date boundary is displayed as completed on the preceding work
or elapsed date; an instantaneous milestone at that boundary belongs to the new date.
The calculations use Gregorian date-only arithmetic, so daylight-saving changes do
not add or remove working hours. Timezone affects the choice of today's date only.
Detailed shifts and within-day locked appointments require a later extension.

Project percentiles retain the independent-duration, fixed-critical-chain
moment-matching approximation. The aggregate quantile is distributed over chain tasks
in proportion to expected effort and then advanced through each resource calendar.
Calendar-only gaps are recalculated; other baseline waits remain conditional on the
baseline chain. This is deterministic, not a stochastic calendar simulation or a
confidence guarantee. Fixed commitments remain anchors, conditional on being met.

`--previous result.json` retains earlier dates and calendars. A What-If comparison
is emitted only for matching portfolio origins and `asOf` values; changes to weekly
hours or exceptions at the same origin can be compared. A run started on a new date
retains history but omits the same-origin comparison.
