/** Shared by the review server and browser; scheduling rules remain unchanged. */
export interface TaskEstimateIssue {
  readonly taskId: string;
  readonly taskName: string;
  readonly projectId: string;
  readonly kind: 'original' | 'remaining';
  readonly fields: readonly ['goodCase', 'poorCase'];
  readonly message: string;
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function taskEstimateIssues(input: unknown): TaskEstimateIssue[] {
  if (!object(input)) return [];
  const plan = object(input.plan) ? input.plan : input;
  if (!Array.isArray(plan.projects)) return [];
  const issues: TaskEstimateIssue[] = [];
  for (const project of plan.projects) {
    if (!object(project) || !Array.isArray(project.tasks)) continue;
    for (const task of project.tasks) {
      if (!object(task) || typeof task.id !== 'string' || typeof task.name !== 'string') continue;
      const estimates: ['original' | 'remaining', Record<string, unknown>][] = [['original', task]];
      if (object(task.remaining)) estimates.push(['remaining', task.remaining]);
      for (const [kind, estimate] of estimates) {
        const good = estimate.goodCase, poor = estimate.poorCase;
        const remaining = kind === 'remaining' ? 'remaining ' : '';
        let reason = '';
        if (typeof good !== 'number' || !Number.isFinite(good) || typeof poor !== 'number' || !Number.isFinite(poor)) {
          reason = `Enter a number for both ${remaining}good and poor estimates.`;
        } else if (good > poor) {
          reason = `${remaining ? 'Remaining good' : 'Good'} estimate (${good} days) must be no greater than ${remaining}poor estimate (${poor} days). Adjust either estimate, then recalculate.`;
        } else if (!(kind === 'original' && good === 0 && poor === 0) && (good <= 0 || poor <= 0)) {
          reason = kind === 'remaining'
            ? 'Remaining good and poor estimates must both be greater than zero. Mark finished work Complete in Progress.'
            : 'Good and poor estimates must both be greater than zero, or both zero for a milestone.';
        }
        if (reason) issues.push({taskId: task.id, taskName: task.name,
          projectId: typeof project.id === 'string' ? project.id : '', kind,
          fields: ['goodCase', 'poorCase'], message: `Task ${task.id} — ${task.name}: ${reason}`});
      }
    }
  }
  return issues;
}
export class TaskEstimateValidationError extends Error {
  constructor(readonly issues: readonly TaskEstimateIssue[]) {
    super(issues.map(issue => issue.message).join('\n'));
    this.name = 'TaskEstimateValidationError';
  }
}
