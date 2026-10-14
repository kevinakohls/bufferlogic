import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { recommendSaturdayHours } from "../src/resource-recommendations.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  schedulePortfolio,
  parsePortfolio,
  type PortfolioPlan,
  type PortfolioTask,
} from "../src/portfolio.js";
const task = (
  id: string,
  projectId: string,
  resource: string,
  duration: number,
  extra: Partial<PortfolioTask> = {},
): PortfolioTask => ({
  id,
  projectId,
  name: id,
  resource,
  dependsOn: [],
  priority: 1,
  goodCase: duration,
  poorCase: duration,
  ...extra,
});
const base: PortfolioPlan = {
  id: "feeding",
  versionId: "v1",
  asOf: 0,
  settings: { durationUnit: "days" },
  resources: ["Alice", "Bob"],
  projects: [
    {
      id: "P1",
      name: "One",
      tasks: [
        task("C", "P1", "Bob", 20),
        task("F", "P1", "Alice", 4, { goodCase: 3, poorCase: 16 / 3 }),
        task("D", "P1", "Bob", 2, { dependsOn: ["C", "F"] }),
      ],
    },
    { id: "P2", name: "Two", tasks: [task("L", "P2", "Alice", 6)] },
  ],
};
test("latest safe placement frees earlier resources and protects target and critical-chain starts", () => {
  const before = schedulePortfolio(base),
    input = { ...base, feedingTaskIds: ["F"] },
    snapshot = structuredClone(input),
    after = schedulePortfolio(input);
  assert.deepEqual(input, snapshot);
  const change = after.feedingReport!.changes[0]!;
  assert.equal(change.status, "applied");
  assert.ok(change.newStart > change.originalStart);
  assert.ok(Math.abs(change.newStart + change.p99Effort - 20) < 1e-8);
  assert.ok(
    Math.abs(change.p99Effort - change.p50Effort - change.bufferEffort) < 1e-8,
  );
  assert.equal(after.tasks.find((t) => t.id === "L")!.start, 0);
  assert.equal(before.tasks.find((t) => t.id === "L")!.start, 4);
  assert.equal(after.tasks.find((t) => t.id === "D")!.start, 20);
  assert.equal(after.tasks.find((t) => t.id === "C")!.start, 0);
  assert.equal(after.tasks.find((t) => t.id === "F")!.locked, false);
  assert.deepEqual(after.plan.projects[0]!.tasks[1]!.locked, undefined);
  assert.equal(after.feedingReport!.resourceWindows[0]!.finish, 4);
  assert.equal(after.conflicts.length, 0);
  assert.deepEqual(
    schedulePortfolio(parsePortfolio(JSON.parse(JSON.stringify(after.plan))))
      .tasks,
    after.tasks,
  );
});
test("long lower-priority tasks cannot cross the reserved P99 feeding window", () => {
  const after = schedulePortfolio({
    ...base,
    feedingTaskIds: ["F"],
    projects: [
      base.projects[0]!,
      { ...base.projects[1]!, tasks: [task("L", "P2", "Alice", 15)] },
    ],
  });
  assert.equal(after.feedingReport!.changes[0]!.status, "applied");
  assert.equal(after.tasks.find((t) => t.id === "L")!.start, 20);
});
test("insufficient P99 slack keeps the original plan and reports protection cannot fit", () => {
  const input = {
    ...base,
    feedingTaskIds: ["F"],
    projects: [
      {
        ...base.projects[0]!,
        tasks: base.projects[0]!.tasks.map((t) =>
          t.id === "F" ? { ...t, goodCase: 1, poorCase: 16 } : t,
        ),
      },
      base.projects[1]!,
    ],
  };
  const { feedingTaskIds, ...forward } = input;
  const after = schedulePortfolio(input);
  assert.equal(after.feedingReport!.changes[0]!.status, "not-applied");
  assert.match(after.feedingReport!.changes[0]!.reason, /does not fit/);
  assert.deepEqual(after.tasks, schedulePortfolio(forward).tasks);
});
test("critical-chain, active and locked tasks cannot be delayed", () => {
  for (const id of ["C", "D"])
    assert.equal(
      schedulePortfolio({ ...base, feedingTaskIds: [id] }).feedingReport!
        .changes[0]!.status,
      "not-applied",
    );
  for (const extra of [
    {
      status: "active" as const,
      remaining: {
        goodCase: 4,
        poorCase: 4,
        estimateStatus: "current" as const,
      },
    },
    { locked: { start: 0, finish: 4 } },
  ]) {
    const result = schedulePortfolio({
      ...base,
      feedingTaskIds: ["F"],
      projects: [
        {
          ...base.projects[0]!,
          tasks: base.projects[0]!.tasks.map((t) =>
            t.id === "F" ? { ...t, ...extra } : t,
          ),
        },
        base.projects[1]!,
      ],
    });
    assert.equal(result.feedingReport!.changes[0]!.status, "not-applied");
    assert.equal(result.tasks.find((t) => t.id === "F")!.start, 0);
  }
  assert.throws(
    () => schedulePortfolio({ ...base, feedingTaskIds: ["missing"] }),
    /Unknown feeding task/,
  );
});
test("calendar latest starts respect weekends, exceptions and percentage allocations", () => {
  const calendar = {
    startDate: "2026-10-09",
    hoursPerWorkday: 8,
    resources: base.resources.map((resource) => ({
      resource,
      weeklyHours: [8, 8, 8, 8, 8, 0, 0],
      exceptions: { "2026-10-12": 0 },
    })),
  };
  const result = schedulePortfolio({
    ...base,
    calendar,
    feedingTaskIds: ["F"],
    projects: [
      {
        ...base.projects[0]!,
        tasks: base.projects[0]!.tasks.map((t) =>
          t.id === "F" ? { ...t, allocationPercent: 50 } : t,
        ),
      },
      base.projects[1]!,
    ],
  });
  const change = result.feedingReport!.changes[0]!;
  assert.equal(change.status, "applied");
  assert.equal(change.p50Effort, 8);
  assert.ok(change.newStart >= 0);
  assert.equal(
    result.tasks.find((t) => t.id === "D")!.start,
    schedulePortfolio({
      ...base,
      calendar,
      projects: [
        {
          ...base.projects[0]!,
          tasks: base.projects[0]!.tasks.map((t) =>
            t.id === "F" ? { ...t, allocationPercent: 50 } : t,
          ),
        },
        base.projects[1]!,
      ],
    }).tasks.find((t) => t.id === "D")!.start,
  );
});

test("feeding placement moves before higher-priority reservations when a safe earlier slot exists", () => {
  const high = {
    id: "P0",
    name: "Higher",
    tasks: [
      task("H0", "P0", "Charlie", 17),
      task("H1", "P0", "Alice", 2, { dependsOn: ["H0"] }),
    ],
  };
  const input = {
    ...base,
    resources: [...base.resources, "Charlie"],
    projects: [high, ...base.projects],
    feedingTaskIds: ["F"],
  };
  const { feedingTaskIds, ...forward } = input;
  const after = schedulePortfolio(input);
  assert.equal(after.feedingReport!.changes[0]!.status, "applied");
  assert.ok(after.feedingReport!.changes[0]!.protectionFinish! <= 17 + 1e-9);
  assert.equal(after.tasks.find((task) => task.id === "H1")!.start, 17);
  assert.equal(after.tasks.find((task) => task.id === "D")!.start, 20);
  assert.equal(after.conflicts.length, 0);
});

test("multiple feeders are independent of selection/click order and moved higher-priority slots stay protected", () => {
  const input = {
    ...base,
    resources: [...base.resources, "Charlie", "Dana"],
    projects: [
      base.projects[0]!,
      {
        id: "P2",
        name: "Two",
        tasks: [
          task("C2", "P2", "Charlie", 24),
          task("F2", "P2", "Dana", 4, { goodCase: 3, poorCase: 16 / 3 }),
          task("D2", "P2", "Charlie", 2, { dependsOn: ["C2", "F2"] }),
          task("L", "P2", "Alice", 6),
        ],
      },
    ],
  };
  const first = schedulePortfolio({ ...input, feedingTaskIds: ["F", "F2"] }),
    second = schedulePortfolio({ ...input, feedingTaskIds: ["F2", "F"] });
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.feedingReport!.changes.map((change) => change.status),
    ["applied", "applied"],
  );
  assert.equal(first.tasks.find((task) => task.id === "D")!.start, 20);
  assert.equal(first.tasks.find((task) => task.id === "D2")!.start, 24);
});
test("feeding IDs are validated during parsing including stale IDs, duplicates and malformed lists", () => {
  for (const feedingTaskIds of [["missing"], ["F", "F"], [42], [""], true])
    assert.throws(() => parsePortfolio({ ...base, feedingTaskIds }), /feeding/);
  assert.deepEqual(
    parsePortfolio({ ...base, feedingTaskIds: ["F"] }).feedingTaskIds,
    ["F"],
  );
});
test("CLI tables include feeding changes and resource release windows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "feeding-cli-"));
  try {
    const file = join(dir, "plan.json");
    await writeFile(file, JSON.stringify({ ...base, feedingTaskIds: ["F"] }));
    const output = execFileSync(
      process.execPath,
      ["dist/src/portfolio-cli.js", file, "--format", "table"],
      { encoding: "utf8" },
    );
    assert.match(output, /applied/);
    assert.match(output, /bufferEffort/);
    assert.match(output, /Feeder allocation released/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("resource recommendations intentionally recompute feeder placement under each changed calendar", () => {
  const input = {
    ...base,
    feedingTaskIds: ["F"],
    calendar: {
      startDate: "2026-10-09",
      hoursPerWorkday: 8,
      resources: base.resources.map((resource) => ({
        resource,
        weeklyHours: [8, 8, 8, 8, 8, 0, 0],
        exceptions: {},
      })),
    },
  };
  const snapshot = structuredClone(input),
    baseline = schedulePortfolio(input),
    recommendations = recommendSaturdayHours(input);
  assert.deepEqual(input, snapshot);
  assert.equal(recommendations.feedingProtection, "recomputed-per-scenario");
  for (const candidate of recommendations.candidates) {
    const calendar = {
      ...input.calendar,
      resources: input.calendar.resources.map((resource) =>
        resource.resource === candidate.resource
          ? {
              ...resource,
              weeklyHours: resource.weeklyHours.map((hours, index) =>
                index === 5 ? candidate.proposedSaturdayHours : hours,
              ),
            }
          : resource,
      ),
    };
    const scenario = schedulePortfolio({ ...input, calendar });
    for (const project of candidate.projects) {
      const forecast = scenario.projects.find(
        (item) => item.id === project.projectId,
      )!.forecast;
      assert.equal(project.proposedP95Date, forecast.completionDates!.p95);
      assert.equal(
        project.currentP95Date,
        baseline.projects.find((item) => item.id === project.projectId)!
          .forecast.completionDates!.p95,
      );
    }
  }
});

test("a task controlling its own lower-priority project can feed higher-priority work", () => {
  const projects = base.projects.map((project) => ({
    ...project,
    tasks: project.tasks.map((task) =>
      task.id === "D" ? { ...task, dependsOn: ["C", "F", "L"] } : task,
    ),
  }));
  const input = { ...base, projects, feedingTaskIds: ["L"] },
    result = schedulePortfolio(input),
    change = result.feedingReport!.changes[0]!;
  assert.equal(change.status, "applied");
  assert.equal(change.feedsHigherPriorityProject, true);
  assert.equal(change.bufferEffort, 0);
  assert.equal(change.newStart, 14);
  assert.equal(change.ownerCompletionBefore, 10);
  assert.equal(change.ownerCompletionAfter, 20);
  assert.equal(result.tasks.find((task) => task.id === "D")!.start, 20);
});
test("shared-resource cross-project feeders fit together with a zero buffer rather than a fictitious band", () => {
  const projects = base.projects.map((project) => ({
    ...project,
    tasks: project.tasks.map((task) =>
      task.id === "D" ? { ...task, dependsOn: ["C", "F", "L"] } : task,
    ),
  }));
  const result = schedulePortfolio({
      ...base,
      projects,
      feedingTaskIds: ["F", "L"],
    }),
    f = result.feedingReport!.changes.find((change) => change.taskId === "F")!,
    l = result.feedingReport!.changes.find((change) => change.taskId === "L")!;
  assert.equal(f.status, "applied");
  assert.equal(l.status, "applied");
  assert.ok(Math.abs(l.newFinish - f.newStart) < 1e-9);
  assert.equal(l.protectionFinish, l.newFinish);
  assert.equal(l.bufferEffort, 0);
  assert.equal(result.tasks.find((task) => task.id === "D")!.start, 20);
  assert.equal(result.conflicts.length, 0);
});
test("cross-project feeders receive positive uncertainty buffers when P20 and P80 differ", () => {
  const projects = base.projects.map((project) => ({
    ...project,
    tasks: project.tasks.map((task) =>
      task.id === "D"
        ? { ...task, dependsOn: ["C", "F", "L"] }
        : task.id === "L"
          ? { ...task, resource: "Charlie", goodCase: 4, poorCase: 9 }
          : task,
    ),
  }));
  const result = schedulePortfolio({
    ...base,
    resources: [...base.resources, "Charlie"],
    projects,
    feedingTaskIds: ["L"],
  });
  const change = result.feedingReport!.changes[0]!;
  assert.equal(change.status, "applied");
  assert.ok(change.bufferEffort > 0);
  assert.ok(change.protectionFinish! > change.newFinish);
  assert.equal(result.tasks.find((task) => task.id === "D")!.start, 20);
});
test("time display preferences persist but never change scheduling or percentiles", () => {
  const before = schedulePortfolio(base),
    input = parsePortfolio({
      ...base,
      settings: { durationUnit: "days", displayTime: "days" },
    }),
    after = schedulePortfolio(input);
  assert.equal(
    parsePortfolio(JSON.parse(JSON.stringify(after.plan))).settings.displayTime,
    "days",
  );
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.projects, before.projects);
  assert.throws(
    () =>
      parsePortfolio({
        ...base,
        settings: { durationUnit: "days", displayTime: "hours" },
      }),
    /displayTime/,
  );
});
