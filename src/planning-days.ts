/** Display-only ceiling of a duration measured in days. No calendar conversion. */
export function planningDays(duration: number): number {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new Error("Planning duration must be finite and nonnegative");
  }
  return Math.ceil(duration);
}

/** Subtract rounded completion days, rather than rounding the raw difference. */
export function planningDayDifference(currentDuration: number, whatIfDuration: number): number {
  return planningDays(whatIfDuration) - planningDays(currentDuration);
}

export const planningDayNote = "Whole-day planning assumes input estimates are in days and rounds each completion duration up before comparison. It is a display view, not a calendar date or an added accuracy guarantee.";
