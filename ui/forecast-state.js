/** Keep unavailable forecasts distinct from schedules that violate constraints. */
export function forecastState(forecast, deadlineAssessment) {
  const withheld = forecast.withheldReason;
  const late = deadlineAssessment?.status === 'late';
  const targetLabel = deadlineAssessment ? deadlineTargetState(deadlineAssessment).badgeText : 'Feasible';
  return {
    badgeText: withheld ? 'Forecast withheld' : forecast.feasible === false ? 'Needs attention' : targetLabel,
    badgeClass: forecast.feasible === false ? 'feasible infeasible' : withheld ? 'feasible withheld' : late ? 'feasible deadline-missed' : 'feasible',
    timelineWarning: forecast.feasible === false ? ' · Infeasible schedule — review conflicts' : '',
    completionLabel: withheld === 'on-hold' ? 'On hold — forecast withheld' : withheld ? 'Blocked by held work' : null,
  };
}

export function holdAction(onHold) {
  return {label: onHold ? 'Resume project' : 'Put on hold', pressed: String(Boolean(onHold))};
}

export function usesCalendarDates(plan) {
  return Boolean(plan.calendar) && plan.settings.displayTime !== 'days';
}

/** Estimate review applies only to work currently in progress. */
export function estimateReviewValue(task) {
  return task.status === 'active' ? task.remaining?.estimateStatus ?? 'stale' : '';
}

export function daysLateText(daysLate) {
  const days = Math.ceil(daysLate);
  return `${days} ${days === 1 ? 'day' : 'days'} late`;
}

export function deadlineTargetState(assessment) {
  if (!assessment) return {text: 'No deadline', badgeText: 'Feasible', className: ''};
  if (assessment.status === 'unavailable') {
    const text = assessment.reason === 'calendar-required' ? 'Calendar required' : 'Forecast unavailable';
    return {text, badgeText: text, className: ''};
  }
  if (assessment.status === 'late') return {
    text: `Late at P95 · ${daysLateText(assessment.daysLate)}`,
    badgeText: 'Late at P95', className: 'deadline-late',
  };
  return {text: 'On time at P95', badgeText: 'On time at P95', className: 'deadline-met'};
}

export function criticalChainSummary(project) {
  if (project.forecast.criticalChain.length) return `${project.forecast.criticalChain.length} critical-chain tasks`;
  if (project.forecast.withheldReason) return 'No scheduled critical chain while work is on hold or blocked';
  if (!project.tasks.length) return 'No tasks yet — add tasks to calculate a critical chain';
  return 'No calculated critical chain — recalculate and check task assignments';
}
