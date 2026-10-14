import { fitTaskLognormal } from "./percentiles.js";
import { createCalendar } from "./resource-calendars.js";
import type {
  PortfolioPlan,
  PortfolioResult,
  PlacementConstraints,
} from "./portfolio.js";

export interface FeedingChange {
  taskId: string;
  resource: string;
  status: "applied" | "unchanged" | "not-applied";
  reason: string;
  originalStart: number;
  originalFinish: number;
  newStart: number;
  newFinish: number;
  p50Effort: number;
  p99Effort: number;
  bufferEffort: number;
  protectedStart: number | null;
  protectionFinish: number | null;
  ownerCompletionBefore: number | null;
  ownerCompletionAfter: number | null;
  feedsHigherPriorityProject: boolean;
}
export interface FeedingReport {
  method: "task-p99-feeding-protection";
  changes: FeedingChange[];
  resourceWindows: {
    resource: string;
    taskId: string;
    start: number;
    finish: number;
    allocationPercent: number;
    meaning: string;
  }[];
  interpretation: string;
}

/** Latest start supplying P99 working effort before the protected downstream start. */
function latestStart(
  plan: PortfolioPlan,
  resource: string,
  end: number,
  effort: number,
): number {
  if (!plan.calendar) return end - effort;
  const calendar = createCalendar(plan.calendar);
  let time = end,
    remaining = effort * plan.calendar.hoursPerWorkday;
  for (let count = 0; count < 36600 && time > plan.asOf; count++) {
    const dayStart = Math.max(plan.asOf, Math.ceil(time - 1e-9) - 1),
      hours = calendar.available(resource, dayStart);
    const capacity = (time - dayStart) * hours;
    if (hours > 0 && remaining <= capacity + 1e-9)
      return time - remaining / hours;
    remaining -= capacity;
    time = dayStart;
  }
  return -1;
}

/** Move left across occupied intervals until the whole P99 window fits. */
function latestResourceWindow(
  plan: PortfolioPlan,
  resource: string,
  target: number,
  effort: number,
  allocation: number,
  occupied: readonly {
    resource: string;
    start: number;
    finish: number;
    allocationPercent: number;
  }[],
): { start: number; finish: number } {
  const calendar = plan.calendar ? createCalendar(plan.calendar) : undefined;
  let boundary = target;
  for (let attempt = 0; attempt <= occupied.length * 2 + 2; attempt++) {
    const start = latestStart(plan, resource, boundary, effort);
    if (start < plan.asOf - 1e-9) return { start: -1, finish: boundary };
    const finish = calendar
      ? calendar.finish(resource, start, effort)
      : start + effort;
    const blocks = occupied.filter(
      (slot) =>
        slot.resource === resource &&
        slot.start < finish - 1e-9 &&
        slot.finish > start + 1e-9,
    );
    const points = [
      start,
      ...blocks.flatMap((slot) => [
        Math.max(start, slot.start),
        Math.min(finish, slot.finish),
      ]),
    ]
      .filter((time) => time < finish - 1e-9)
      .sort((a, b) => a - b);
    const violation = points.find(
      (time) =>
        blocks
          .filter((slot) => slot.start <= time && slot.finish > time + 1e-9)
          .reduce((load, slot) => load + slot.allocationPercent, allocation) >
        100 + 1e-9,
    );
    if (violation === undefined) return { start, finish };
    const active = blocks.filter(
      (slot) => slot.start <= violation && slot.finish > violation + 1e-9,
    );
    const next = Math.max(...active.map((slot) => slot.start));
    if (next >= boundary - 1e-9) return { start: -1, finish: boundary };
    boundary = next;
  }
  return { start: -1, finish: boundary };
}

/** Protect baseline targets, fit selected feeder windows, then dispatch other work into safe gaps. */
type ForwardScheduler = (
  plan: PortfolioPlan,
  previous?: PortfolioResult,
  placement?: PlacementConstraints,
) => PortfolioResult;
export function scheduleFeedingPortfolio(
  plan: PortfolioPlan,
  previous: PortfolioResult | undefined,
  forwardSchedule: ForwardScheduler,
): PortfolioResult {
  const { feedingTaskIds, ...forwardPlan } = plan;
  const baseline = forwardSchedule(forwardPlan);
  const tasks = plan.projects.flatMap((project) => project.tasks),
    byId = new Map(tasks.map((task) => [task.id, task]));
  const projectOrder = new Map(
    plan.projects.map((project, index) => [project.id, index]),
  );
  const taskOrder = new Map(tasks.map((task, index) => [task.id, index]));
  for (const id of feedingTaskIds ?? [])
    if (!byId.has(id)) throw new Error(`Unknown feeding task: ${id}`);
  const orderedFeeders = [...(feedingTaskIds ?? [])].sort((a, b) => {
    const first = byId.get(a)!,
      second = byId.get(b)!;
    return (
      projectOrder.get(first.projectId)! -
        projectOrder.get(second.projectId)! ||
      first.priority - second.priority ||
      taskOrder.get(a)! - taskOrder.get(b)!
    );
  });
  const entries = new Map(baseline.tasks.map((task) => [task.id, task]));
  const calendar = plan.calendar ? createCalendar(plan.calendar) : undefined;
  const report: FeedingReport = {
    method: "task-p99-feeding-protection",
    changes: [],
    resourceWindows: [],
    interpretation:
      "Task-level lognormal P99 minus P50 working effort is protection, not a guarantee. Higher-priority project timings and downstream starts are protected. Active work and user locks remain fixed. Free windows are capacity freed from the feeder, not necessarily idle after other work is dispatched.",
  };
  const placement: PlacementConstraints = {
    earliestStarts: new Map(),
    protectedPlacements: new Map(),
    bufferReservations: [],
  };
  const starts = placement.earliestStarts as Map<string, number>,
    protectedSlots = placement.protectedPlacements as Map<
      string,
      { start: number; finish: number }
    >;
  const reservations = placement.bufferReservations as {
    resource: string;
    start: number;
    finish: number;
    allocationPercent: number;
  }[];
  for (const id of orderedFeeders) {
    const task = byId.get(id)!,
      original = entries.get(id),
      owner = baseline.projects.find(
        (project) => project.id === task.projectId,
      )!;
    const change: FeedingChange = {
      taskId: id,
      resource: task.resource,
      status: "not-applied",
      reason: "",
      originalStart: original?.start ?? 0,
      originalFinish: original?.finish ?? 0,
      newStart: original?.start ?? 0,
      newFinish: original?.finish ?? 0,
      p50Effort: 0,
      p99Effort: 0,
      bufferEffort: 0,
      protectedStart: null,
      protectionFinish: null,
      ownerCompletionBefore: owner.forecast.deterministicCompletion,
      ownerCompletionAfter: owner.forecast.deterministicCompletion,
      feedsHigherPriorityProject: false,
    };
    report.changes.push(change);
    if (!original || owner.forecast.withheldReason) {
      change.reason = "Task is unscheduled or its project forecast is withheld";
      continue;
    }
    if (
      task.status === "active" ||
      task.status === "completed" ||
      task.locked ||
      task.goodCase === 0 ||
      task.durationMode === "elapsed"
    ) {
      change.reason = "Only unstarted, unlocked working tasks can be moved";
      continue;
    }
    const successors = tasks
      .filter((other) => other.dependsOn.includes(id))
      .map((other) => entries.get(other.id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const ownerIndex = projectOrder.get(task.projectId)!;
    const higherSuccessors = successors.filter(
      (successor) => projectOrder.get(successor.projectId)! < ownerIndex,
    );
    const crossProjectFeeder = higherSuccessors.length > 0;
    change.feedsHigherPriorityProject = crossProjectFeeder;
    if (owner.forecast.criticalChain.includes(id) && !crossProjectFeeder) {
      change.reason =
        "Task is on its project critical chain and does not feed a higher-priority project";
      continue;
    }
    const protectedSuccessors = crossProjectFeeder
      ? higherSuccessors
      : successors;
    if (!successors.length) {
      change.reason = "No scheduled downstream task to protect";
      continue;
    }
    if (
      successors.some((successor) => feedingTaskIds?.includes(successor.id)) ||
      task.dependsOn.some((predecessor) =>
        feedingTaskIds?.includes(predecessor),
      )
    ) {
      change.reason =
        "Select independent feeders; feeding-chain aggregation is not supported";
      continue;
    }
    const moments = fitTaskLognormal(task.goodCase, task.poorCase),
      fraction = (task.allocationPercent ?? 100) / 100;
    change.p50Effort = Math.exp(moments.mu) / fraction;
    change.p99Effort =
      Math.exp(moments.mu + 2.3263478740408408 * moments.sigma) / fraction;
    change.bufferEffort = change.p99Effort - change.p50Effort;
    if (!Number.isFinite(change.p99Effort))
      throw new Error(`Feeding P99 exceeds numeric range: ${id}`);
    const target = Math.min(
      ...protectedSuccessors.map((successor) => successor.start),
    );
    change.protectedStart = target;
    if (baseline.conflicts.length) {
      change.reason =
        "Resolve baseline conflicts before applying feeding protection";
      continue;
    }
    const proposedSlots = new Map(protectedSlots);
    for (const entry of baseline.tasks) {
      if (entry.id === id || starts.has(entry.id)) continue;
      if (
        projectOrder.get(entry.projectId)! < ownerIndex ||
        (!crossProjectFeeder &&
          owner.forecast.criticalChain.includes(entry.id)) ||
        protectedSuccessors.some((successor) => successor.id === entry.id) ||
        entry.locked ||
        entry.status === "active" ||
        entry.status === "completed"
      )
        proposedSlots.set(entry.id, {
          start: entry.start,
          finish: entry.finish,
        });
    }
    const occupied = [...proposedSlots].map(([id, slot]) => ({
      ...entries.get(id)!,
      ...slot,
    }));
    const window = latestResourceWindow(
      plan,
      task.resource,
      target,
      change.p99Effort,
      task.allocationPercent ?? 100,
      [...occupied, ...reservations],
    );
    const start = window.start;
    change.protectionFinish = window.finish;
    const ready = Math.max(
      plan.asOf,
      ...task.dependsOn.map((predecessor) => entries.get(predecessor)!.finish),
    );
    if (start < original.start - 1e-9 || start < ready - 1e-9) {
      change.reason =
        "P99 protection does not fit available slack/resource capacity; no backward placement for this task";
      continue;
    }
    if (start <= original.start + 1e-9) {
      change.status = "unchanged";
      change.reason = "Already at the latest protected start";
      continue;
    }
    const finish = calendar
      ? calendar.finish(task.resource, start, change.p50Effort)
      : start + change.p50Effort;
    for (const [id, slot] of proposedSlots) protectedSlots.set(id, slot);
    protectedSlots.set(id, { start, finish });
    starts.set(id, start);
    reservations.push({
      resource: task.resource,
      start: finish,
      finish: window.finish,
      allocationPercent: task.allocationPercent ?? 100,
    });
    change.newStart = start;
    change.newFinish = finish;
    change.status = "applied";
    change.reason = crossProjectFeeder
      ? "Cross-project feeder delayed to protect higher-priority delivery; its owning project may finish later"
      : "Delayed while protecting downstream start with task P99 effort";
    if (change.bufferEffort < 1e-9)
      change.reason += "; P20 equals P80, so P99 minus P50 is zero";
  }
  let result: PortfolioResult;
  if (starts.size) {
    result = forwardSchedule(plan, previous, placement);
    const reservationConflict = reservations.some((slot) => {
      const overlaps = result.tasks.filter(
        (task) =>
          task.resource === slot.resource &&
          task.start < slot.finish &&
          task.finish > slot.start,
      );
      const otherBuffers = reservations.filter(
        (other) =>
          other !== slot &&
          other.resource === slot.resource &&
          other.start < slot.finish &&
          other.finish > slot.start,
      );
      const points = [
        slot.start,
        ...overlaps.flatMap((task) => [
          Math.max(slot.start, task.start),
          Math.min(slot.finish, task.finish),
        ]),
        ...otherBuffers.flatMap((other) => [
          Math.max(slot.start, other.start),
          Math.min(slot.finish, other.finish),
        ]),
      ].filter((time) => time < slot.finish);
      return points.some(
        (time) =>
          overlaps
            .filter((task) => task.start <= time && task.finish > time)
            .reduce(
              (sum, task) => sum + task.allocationPercent,
              slot.allocationPercent,
            ) +
            otherBuffers
              .filter((other) => other.start <= time && other.finish > time)
              .reduce((sum, other) => sum + other.allocationPercent, 0) >
          100 + 1e-9,
      );
    });
    const unsafe =
      reservationConflict ||
      result.conflicts.length > baseline.conflicts.length ||
      [...protectedSlots].some(([id, slot]) => {
        const entry = result.tasks.find((task) => task.id === id);
        return (
          !entry ||
          Math.abs(entry.start - slot.start) > 1e-9 ||
          Math.abs(entry.finish - slot.finish) > 1e-9
        );
      }) ||
      report.changes.some(
        (change) =>
          change.status === "applied" &&
          Math.abs(
            (result.tasks.find((task) => task.id === change.taskId)?.start ??
              -1) - change.newStart,
          ) > 1e-9,
      );
    if (unsafe) {
      for (const change of report.changes)
        if (change.status === "applied") {
          change.status = "not-applied";
          change.reason =
            "Resource/dependency constraints prevent safe placement; original schedule retained";
          change.newStart = change.originalStart;
          change.newFinish = change.originalFinish;
        }
      result = forwardSchedule(forwardPlan, previous);
    }
  } else result = forwardSchedule(forwardPlan, previous);
  for (const change of report.changes) {
    const actual = result.tasks.find((task) => task.id === change.taskId);
    if (actual) {
      change.newStart = actual.start;
      change.newFinish = actual.finish;
    }
    change.ownerCompletionAfter = result.projects.find(
      (project) => project.id === byId.get(change.taskId)!.projectId,
    )!.forecast.deterministicCompletion;
  }
  for (const change of report.changes)
    if (change.status === "applied")
      report.resourceWindows.push({
        resource: change.resource,
        taskId: change.taskId,
        start: change.originalStart,
        finish: Math.min(change.originalFinish, change.newStart),
        allocationPercent: byId.get(change.taskId)!.allocationPercent ?? 100,
        meaning:
          "Feeder allocation released before its delayed start; other work may use this gap if it fits protected reservations",
      });
  return {
    ...result,
    plan: { ...result.plan, feedingTaskIds: orderedFeeders },
    feedingReport: report,
  };
}
