/** Keep unavailable forecasts distinct from schedules that violate constraints. */
export function forecastState(forecast) {
  const withheld = forecast.withheldReason;
  return {
    badgeText: withheld ? 'Forecast withheld' : forecast.feasible === false ? 'Needs attention' : 'Feasible',
    badgeClass: forecast.feasible === false ? 'feasible infeasible' : withheld ? 'feasible withheld' : 'feasible',
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
