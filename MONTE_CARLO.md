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
