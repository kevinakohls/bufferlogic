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

## Implementation status

This is an editable calendar template and proposed input format. The scheduling
engine does **not yet load or apply it**. Existing forecasts remain in abstract days.
The next engine change must define a project start date and timezone, the standard
hours per estimated workday (proposed default 8), and task workday versus elapsed-day
behavior. It must then apply weekly availability and dated exceptions when calculating
task and project completion dates, including conflicts with fixed commitments.

This template expresses total daily availability, not clock-time shifts. Shift start
and finish times will need an extension if precise within-day appointments or shifts
are required. Permit lead times and concrete curing should use elapsed-time task
settings rather than consuming a crew's working hours for their entire wait.
