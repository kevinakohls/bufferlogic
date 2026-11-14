# Estimate meaning and forecasts

## Entering task durations

New manual tasks, shipped templates, and the in-app two-house example use:

- **Low estimate:** About 1 in 10 similar tasks would finish sooner.
- **High estimate:** About 1 in 10 similar tasks would take longer.

This is a central 80% range (P10 to P90), not a minimum/maximum range or a
90% interval. Estimates remain in days at full primary-resource allocation.
Zero/zero original estimates still create a milestone. There is no third P50
input. The lognormal task median is the geometric mean of Low and High.

Compared with interpreting the same numbers as P20/P80, P10/P90 gives the same
median and a narrower distribution. The wider input percentiles do not mean
there is more duration uncertainty. They describe where the supplied values
sit in the distribution. Project median and upper percentiles can change.
Analytical forecasting, risk simulation, two-task convolution, active remaining
work, and feeding-buffer calculations all use the saved task convention.

## Older plans and imports

Opening an older plan **does not change its forecasts just because the default
for new entries changed**. A missing `estimateBasis` field means legacy
`p20-p80`. Explicit `p20-p80` is also supported. New entries carry
`estimateBasis: "p10-p90"`. Metadata is preserved by save/open, templates,
comparison, and browser recovery. Mixed plans are supported. Remaining estimates
inherit the task basis unless they explicitly specify their own basis.

The Tasks tab identifies legacy plans. Hover over an estimate for its meaning.
Editing legacy numbers preserves their meaning. If you intentionally want to
reinterpret all ranges, save a copy, then choose **Use new estimates** and confirm.
This keeps entered values unchanged and switches original/remaining ranges to
P10/P90. Recalculate afterward. The resulting probability change is deliberate;
this action is not a conversion that preserves the old distribution.

CSV file loads and templates follow the same rules:

| Paired headers | Meaning |
| --- | --- |
| Low estimate / High estimate (with optional `(days)`) | New P10/P90 |
| Low Estimate P10 (days) / High Estimate P90 (days) | Explicit P10/P90 |
| Good days / Poor days | Legacy P20/P80 |
| Low Estimate P20 (days) / High Estimate P80 (days) | Explicit legacy P20/P80 |

Do not mix headers from different conventions. Ambiguous duplicate estimate
columns are rejected. Historical CLI example files retain their original headers;
new shipped `*-template.csv` files and the sample served by the app use Low/High.
Unversioned JSON supplied to the CLI remains legacy for compatibility. To create
new JSON deliberately, specify the basis on each task; it is not inferred from
the filename, labels, or the installed version.

## Three different answers

- **Working schedule:** deterministic task placement using each task's median,
  dependencies, resource capacity, and calendars. Its finish is not necessarily
  the whole project's median, and is not a delivery commitment.
- **Planning forecast:** fast analytical P95 estimate for tracking progress and
  testing changes against a commitment. Designed for execution planning; it may
  differ from full-plan risk simulation. Analytical accuracy still depends on
  chain/calendar approximations. This label does not claim superior accuracy.
- **Risk simulation:** optional Monte Carlo full-plan forecasting to help set a
  commitment or reassess major changes. Sampled durations can change controlling
  paths and resource waits, especially in long interconnected plans. It is not
  a second deadline and does not automatically override target status.

Project P95 remains the planning target; it was not changed to P90. Technical
percentiles remain in Help, tooltips, detailed tables and reports. A model's P95
is conditional on its inputs and assumptions, not independently demonstrated
95% delivery confidence. P99 is a tail/stress-test estimate, not a guarantee or
an assertion that nearly every task goes badly. No P100 is offered.

The simulation does not explicitly compare monitored with unmonitored execution
or quantify the benefits of management intervention. More runs improve sampling
precision, not calibration to real outcomes. The five-minute run limit and
cancellation remain in place.
