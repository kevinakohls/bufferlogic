export type EstimateBasis = "p10-p90" | "p20-p80";

export interface DurationEstimates {
  /** Missing metadata means the legacy P20/P80 convention. */
  readonly estimateBasis?: EstimateBasis;
  readonly goodCase: number;
  readonly poorCase: number;
}

export interface RemainingEstimate extends DurationEstimates {
  readonly estimateStatus: "current" | "stale";
}

export interface TaskActuals {
  readonly start: number;
  readonly finish: number;
}

export interface Task extends DurationEstimates {
  readonly id: string;
  readonly name: string;
  readonly resource: string;
  readonly dependsOn: readonly string[];
  /** Lower numbers go first; equal priorities preserve input order. */
  readonly priority: number;
  readonly status?: "planned" | "active" | "completed";
  readonly remaining?: RemainingEstimate;
  readonly actuals?: TaskActuals;
}

export interface ScheduledTask {
  readonly id: string;
  readonly resource: string;
  readonly duration: number;
  readonly start: number;
  readonly finish: number;
  readonly technicalPredecessors: readonly string[];
  /** Previous task assigned to this resource, even without a technical edge. */
  readonly resourcePredecessor?: string;
}

export interface Schedule {
  /** Dispatch order, deterministic for the same ordered input. */
  readonly tasks: readonly ScheduledTask[];
  readonly projectP50: number;
  readonly criticalChain: readonly string[];
}
