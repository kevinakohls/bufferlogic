# Whole-project percentile validation

The deterministic approximation is useful on the narrow-estimate reviewer
example, but it has measurable tail error and cannot be assumed accurate
for every project. The stress test demonstrates both approximation error
and changes in which chain controls completion. The normal product commands
remain deterministic; this benchmark is a separate development tool.

## Method

For each example we ran 100,000 independent trials with each of two seeds,
20261008 and 42. Task durations were drawn from the same lognormal fits as
the product, using Mulberry32 open-interval uniforms and Box-Muller normal
variates. There are no correlations, working calendars, or progress updates.

Each trial uses the same sampled task durations for two benchmarks:

1. Sum only the tasks on the baseline P50 Critical Chain. This isolates the
   error from approximating a sum of lognormals as another lognormal.
2. Schedule every task with the existing dependency/resource/priority rules.
   This additionally captures alternative controlling chains and changes in
   eligibility-driven resource dispatch. Management priorities are not optimized.

Empirical quantiles use nearest rank. The reports include approximate 95%
sampling intervals obtained from binomial rank uncertainty using a normal
approximation. These describe finite-trial variation, not uncertainty about
the input estimates, independence assumption, or distribution choice.

Percentage error is `(approximation / benchmark - 1) * 100`. Positive means
the deterministic estimate is higher; negative means it is lower. Changed
chain frequency compares the selected chain with the baseline, and can also
include tie-breaking changes. Two seeds are a reproducibility/sensitivity
check, not a proof of statistical calibration.

## Reviewer project: C moved to Bob

Input: [`resource-change-what-if.csv`](../examples/resource-change-what-if.csv).
This has the same task estimates and resources as the uploaded reviewer
project. Baseline chain: **A → B → D → E**. Deterministic baseline: **15.76 days**.

Seed 20261008:

| Percentile | Approximation | Fixed-chain benchmark | Full-project benchmark | Error vs full project |
|---|---:|---:|---:|---:|
| P50 | 16.03 | 15.92 | 15.92 | +0.67% |
| P80 | 17.41 | 17.29 | 17.29 | +0.65% |
| P95 | 18.83 | 18.96 | 18.96 | -0.72% |
| P98 | 19.59 | 19.99 | 20.00 | -2.03% |
| P99 | 20.12 | 20.79 | 20.80 | -3.27% |

The chain differs in **0.32%** of trials. With seed 42, it differs in 0.34%,
P95 error is -0.76%, and P99 error is -3.28%. Full-project P99 is 20.81 days.
The first seed's full-project P99 sampling interval is **20.74–20.86 days**;
the deterministic 20.12-day estimate is below it. This is consistent with
approximation bias rather than merely finite-trial noise.

For this example, the fixed-chain assumption is relatively stable. The
moment-matching approximation underestimates the upper tail, by roughly
0.68 days at P99. It should remain labeled as an approximation.

## Broad-estimate stress test

Input: [`project.json`](../examples/project.json). Baseline chain:
**A → B → D → F → G → H**. Deterministic baseline: **20 days**.

Seed 20261008:

| Percentile | Approximation | Fixed-chain benchmark | Full-project benchmark | Error vs full project |
|---|---:|---:|---:|---:|
| P50 | 26.31 | 26.73 | 27.99 | -6.00% |
| P80 | 42.40 | 39.60 | 40.64 | +4.32% |
| P95 | 66.86 | 60.55 | 61.53 | +8.66% |
| P98 | 84.30 | 78.55 | 79.54 | +5.98% |
| P99 | 98.39 | 95.54 | 96.34 | +2.13% |

The chain differs in **38.83%** of trials. With seed 42, it differs in 38.82%,
P95 error is +8.68%, and P99 error is +1.50%. Full-project P99 is 96.93 days.

The first seed's fixed-chain P95 sampling interval is **60.12–61.00 days**,
well below the approximation of 66.86 days. That exposes moment-matching
error even before accounting for alternative chains. The full-project P50
is also higher than the fixed-chain P50, reflecting additional project constraints.

The large P95–P99 gap is not solely caused by moment matching: the full-project
benchmark spans **61.53–96.34 days**. The broad lognormal inputs themselves
produce a long right tail. Selecting P98 instead of P99 does not remove that
uncertainty. The approximation is not uniformly conservative: it is low at
P50 and high at several upper percentiles in this example.

## Reproduce on Windows

From the repository root after `npm.cmd ci`:

```powershell
npm.cmd run validate-percentiles -- examples/resource-change-what-if.csv --iterations 100000 --seed 20261008
npm.cmd run validate-percentiles -- examples/project.json --iterations 100000 --seed 20261008
```

Repeat with `--seed 42` for the sensitivity check. Add `--output report.json`
to save full-precision results and sampling intervals, or `--format json`
for machine-readable stdout. Existing output files are protected.

The four recorded reports are in [results/](results/). All outputs use the
input duration unit; these examples are in days. Empty projects and fixed
durations have exact outcomes. Automated tests also check a single task
against known lognormal quantiles, seeded reproducibility, and an equal-median
parallel-path example that exposes optimistic fixed-chain forecasts.

## What this establishes

The formula implementation passes analytical checks, and the benchmark
confirms how approximation error and chain changes affect these two examples.
It does not validate the realism of estimates or predict real-world outcomes.
Keep the deterministic method and its assumptions visible. Before treating
P95/P99 as calibrated forecasts, validate representative projects and decide
on an acceptable error threshold; no universal threshold has been imposed here.
