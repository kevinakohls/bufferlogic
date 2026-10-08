# Deterministic P50 engine (v0.1)

Requires Node.js 22 or newer and npm. There are no runtime dependencies.
TypeScript and Node type declarations are development dependencies; tests use
Node's built-in `node:test` runner, so no separate test framework is needed.

From the repository root:

```sh
npm ci
npm test
npm run demo
```

If the default npm cache is unwritable in the cloud environment, use
`npm ci --cache /workspace/.npm-cache`. `npm test` compiles with strict
TypeScript settings before running the tests. Generated files go into ignored
`dist/`; the runnable demo is `examples/scenario1.ts`.

## Scheduling contract

`scheduleProject(tasks)` returns dispatch-ordered task timings, `projectP50`,
and one deterministic `criticalChain`. It does not mutate task inputs.

- All durations use the same unit (days in the example). P50 is
  `sqrt(goodCase * poorCase)`. Estimates must be finite, positive, and
  `goodCase <= poorCase`.
- Lower numeric priorities go first among tasks whose dependencies are complete
  and whose resource is available. Equal priorities preserve input order.
  Blocked tasks do not reserve resources. There is no order optimization.
- Tasks run without interruption. Each resource has capacity one; different
  resources can run concurrently. Resources are available from time zero;
  calendars, external workloads, and switching overhead are outside v0.1.
- Dependency references and cycles are validated before dispatch. Duplicate
  IDs, blank identifiers/names/resources, and nonfinite priorities are rejected.
- Each dispatch records its technical predecessors and the previous task on
  its resource. Backtracking from the latest finish through this combined graph
  produces the Critical Chain. Equal-length alternatives use dispatch order;
  the result is one controlling chain, not an enumeration of all tied chains.
- The scheduler computes a full-project baseline from original estimates.
  Optional task status, remaining estimates, and completed-task actuals are
  retained as metadata, not interpreted as a live rescheduling model.

`markEstimateStale` preserves remaining estimates exactly. Only an explicit
`updateRemainingEstimate` changes them and marks them current. Neither helper
infers progress from elapsed time or implements notifications.

## Acceptance results

Scenario #1 gives 20 days and `A -> B -> D -> F -> G -> H`.
The `B -> D` edge comes from Developer 1 contention, not a technical dependency.
Swapping B and D priorities gives 22 days, a +2 day impact. Automated tests
verify both complete schedules and that Current State is unchanged.
