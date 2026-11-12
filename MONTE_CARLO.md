# Optional full-plan Monte Carlo forecasting

A **plan** contains projects, shared resources, calendars and schedules. Save plan,
Open saved plan and Plan name replace the old Workspace wording. Existing JSON
files, recovery copies, API fields and DOM identifiers remain compatible; existing
user-entered names are not rewritten. Save plan still saves all projects, not an
individual-project CSV export.

## Use it

1. Load or edit a plan, assign resources and Recalculate schedule.
2. Expand **Optional Monte Carlo · P95 / P98 / P99** below the forecast cards.
3. Choose the run count and a whole-number seed, then Run Monte Carlo.
4. Compare the analytical and simulated P95/P98/P99 estimates and sampling intervals.
   Analytical P95, deadline status and the normal schedule remain unchanged.
5. Download simulation report to retain the result and its exact source plan,
   run count, seed, assumptions and observed critical-chain frequencies.

Ordinary scheduling never runs simulations automatically. Simulation is separate
from the analytical result and is invalidated when scheduling inputs change.
Changing the date/day display reformats an existing simulation without rerunning.
Cancel stops the request and worker; a late response cannot replace newer results.
The report is not silently embedded in Save plan or browser recovery. Download it
separately if it matters. Old saved plans can be opened without migration.

## What is simulated

Each draw independently samples task effort from the lognormal distribution fitted
to task P20/P80. Active tasks use remaining estimates; completed actuals and locked
commitments are fixed. The existing scheduler re-dispatches **all** tasks according
to project/task priority, dependencies, fractional allocations, primary/supporting
resource capacity and daily calendars. No fixed critical chain is imposed: a
previously noncritical or feeding path can become controlling.

Feeding policy is evaluated once on the original analytical plan. Applied feeder
release times and their protected resource windows stay fixed across draws,
including every supporting assignment. A feeder can use its own reservation;
other work cannot. A long sampled feeder can overrun its protection and delay
successors. The method does not recompute a perfect P99 feeding policy with each
draw's outcomes. Each draw replans using sampled durations; this models a specified
rescheduling policy, not an optimal real-world execution policy.

Locked work is conditional on meeting its recorded commitments. If a sampled
predecessor misses a fixed start, affected projects get conflict counts and their
simulation percentiles are withheld. Unsuccessful samples are not silently dropped
to produce an optimistic conditional tail. Holds and blocked work also keep their
unavailable-completion labels. Resolve baseline conflicts before simulating.

## Probability and precision

The default remains the existing analytical fixed-chain P95. Optional empirical
P98/P99 account for alternate controlling paths within the simulation model. This
can reveal risks missed by a fixed-chain approximation; it is **not evidence of
higher real-world accuracy** without input calibration and model validation.

The lognormal model is unbounded, so no finite guaranteed P100 is offered. The
report includes P50/P95 diagnostics for statistical comparisons, but they do not
replace the normal cards or deadline decisions. No P100 field is returned.

Quantiles use nearest ranks. Approximate 95% binomial-rank intervals show Monte
Carlo sampling uncertainty around each estimated quantile. They do not include
input-estimation error, correlation, omitted risks or model bias. More draws
reduce simulation noise only. With 1,000 runs, P99 has only about ten observations
in its late tail; prefer 10,000 or more for finer tail precision when performance
permits. P98/P99 estimates may differ between seeds.

## Responsiveness and bounds

The server runs simulation in a worker thread rather than blocking ordinary API
requests. It permits one active simulation per server instance, 1,000–50,000 runs,
up to 300 tasks, and at most 2,000,000 task draws. A 45-second limit and a worker
memory limit bound work; reduce samples or plan size when a job hits a limit.
Cloud Run's existing 60-second request timeout does not need changing. On the next
deployment, set request concurrency to 4 (see [CLOUD_RUN.md](CLOUD_RUN.md)); the
previous setting of 1 queues other requests behind an active simulation even
though the Node worker itself does not block the server.

Calendar-heavy plans cost more. A local check of the 72-task dated housing example
used about 5.5 seconds for 1,000 full reschedules on this development machine;
performance on Cloud Run depends on its CPU. This is a measured example, not a
latency guarantee. Analytical calls use their existing path. The internal sampled
path avoids fitting analytical percentile curves again for already realized draws.

## Reproducible validation

`npm test` covers known single-task lognormal tails, repeatable seeds, switching
parallel paths, shared supporting resources, fractional allocations, calendars,
feeding protection, holds, fixed-commitment failures, API isolation and cancellation.

An independent Python reference uses its own random generator, lognormal sampling
and event scheduler, without importing BufferLogic sampling/scheduling code:

```sh
npm run build
python3 scripts/validate-monte-carlo.py
```

Reference scope: planned tasks, 100% resource allocations, serial/parallel paths
and cross-project supporting-resource contention. Calendars, locks and fractional
allocations are covered by separate engine tests, not this reference scheduler.
It compares 100,000 reference draws with 10,000 BufferLogic draws, using an 8%
relative-error acceptance threshold for finite-sample tail estimates. Initial
observed relative errors ranged from 0.18% to 4.04% across fixture P98/P99 values.
This is a numerical regression benchmark, not customer probability calibration.

For CLI use (JSON plan, saved plan, or downloaded simulation report):

```sh
npm run simulate -- examples/feeding-protection.json --samples 10000 --seed 42
```

`POST /api/simulate` accepts `{plan, samples, seed}`. The response contains the
source plan, empirical quantiles, sampling intervals, conflict counts, criticality
fractions and assumptions. Busy instances reject a second simulation while normal
load/schedule requests remain available. A disconnected client terminates its job.

The panel includes analytical and Monte Carlo P95 side by side, with a P95
sampling interval. P95 uses the same draws as P98/P99, so displaying it adds no
simulation work. Deadline status continues to use analytical P95.

## Analytical check: one uncertain final task

When the fixed chain after its last commitment contains exactly one uncertain
task and it is the final task, analytical percentiles now preserve its exact
shifted lognormal distribution: the fixed task start plus its percentile duration,
scaled by allocation and passed through its resource calendar. Fixed preceding
work is not folded into a new lognormal fit or stretched across calendars.
Other multi-task fixed-chain forecasts still use moment matching and approximate
calendar mapping; this correction does not establish accuracy for all plans.
Regression checks cover no calendar, five-day and seven-day calendars, and 50%
and 100% allocation, against explicit fixed-duration reschedules at each percentile.

## Fixed effort and multiple uncertain tasks

Both analytical forecast entry points now separate deterministic effort (P20 equals
P80) from uncertain effort. The deterministic total is an additive shift. Moment
matching fits only the sum of uncertain task durations. During calendar mapping,
fixed task effort stays fixed; only uncertain effort is apportioned across the
uncertain tasks. Allocations and fixed-commitment resets still apply.

This fixes the distortion caused by adding long fixed prefixes to uncertain work.
It does not make the sum of several lognormals exactly lognormal, guarantee
monotonic forecasts for every edit, or remove fixed-chain/calendar approximations.
Forecast dates and deadline status can change because they use the corrected
analytical quantiles; deterministic schedules and Monte Carlo draws are unchanged.

Run `npm run build` followed by
`python3 scripts/validate-shifted-forecast.py` for an independent deterministic
convolution benchmark of two uncertain tasks (P20/P80 of 3/7 and 2/7) after 100
fixed days. The script checks numerical convergence and compares P95/P98/P99
against a 3% tolerance measured on the uncertain portion, excluding the fixed
prefix. This is a synthetic model check, not real-world calibration.

CLI JSON `chainDistribution.mean` remains the total mean. The new
`deterministicShift` is the fixed contribution; `mu` and `sigma` describe only
the uncertain remainder, so reconstruct a quantile as
`deterministicShift + exp(mu + sigma*z)` (or just the shift when `mu` is null).

## Separate calendars for two uncertain tasks

For a fixed chain with two uncertain tasks after its last commitment, where the
second uncertain task ends the chain, portfolio analytical forecasts now use
**deterministic numerical convolution**. They integrate the first task's possible
durations and calculate how much effort the second task can finish by each
candidate completion time. Each task retains its own primary/supporting-resource
calendar, allocation, elapsed mode, and fixed work/gaps between the pair.
No random draws are used, and the result does not depend on a seed.

The numerical integration uses 2,048 Simpson subdivisions over a normal variate
from -6 to +6, and bisection for completion quantiles. It is a numerical
approximation, conditional on the baseline chain and its fixed release/gap rules;
it does not reschedule alternate paths or model new resource contention.
Longer uncertain chains and chains with fixed work after the second uncertain
task retain the existing moment-matching/calendar approximation. This is a
correction for the demonstrated two-task case, not a claim that all analytical
calendar forecasts are now exact. Monte Carlo remains the full-plan comparison.

Per-project `forecast.completionMethod` identifies `fixed-chain-two-task-convolution`
or `fixed-chain-moment-matching` for regular analytical results. The legacy
portfolio `forecastMethod` field remains unchanged for compatibility. The
standalone percentile CLI continues using shifted moment matching.

Run `npm run build` then `python3 scripts/validate-calendar-convolution.py`.
The independent Python benchmark uses 20,000/40,000 integration subdivisions to
check convergence. With a fixed start of 157, first-task estimates 3/6 on seven-day
availability and second-task estimates 2/6 on Monday-Friday availability, reference
P95/P98/P99 are 176.67011336, 179.72354607, and 184.25509775 calendar days.
The app agrees within 0.0001 days for this fixture. Regression tests also cover
seven-day calendars, equivalent fractional allocations, and supporting resources.
A local measurement of the uploaded 72-task plan took about 0.25 seconds; actual
performance depends on plan size, calendars, and hardware.
