import { parseDate } from './resource-calendars.js';
import { schedulePortfolio, type PortfolioPlan } from './portfolio.js';

/** Deterministic sensitivity analysis, not an automatic change or a joint portfolio percentile. */
export function recommendSaturdayHours(plan: PortfolioPlan) {
  if (!plan.calendar) throw new Error('Resource recommendations require calendars');
  const baseline = schedulePortfolio(plan);
  const candidates = plan.resources.map(resource => {
    const calendar = baseline.plan.calendar!.resources.find(c => c.resource === resource)!;
    const originalHours = calendar.weeklyHours[5]!;
    const proposedHours = Math.min(24, originalHours + 8);
    const calendars = baseline.plan.calendar!.resources.map(c => c.resource === resource
      ? { ...c, weeklyHours:c.weeklyHours.map((hours,index)=>index===5?proposedHours:hours) } : c);
    const scenario = schedulePortfolio({ ...baseline.plan, calendar:{ ...baseline.plan.calendar!, resources:calendars } });
    const projects = scenario.projects.map(p => {
      const before = baseline.projects.find(b=>b.id===p.id)!.forecast;
      const after = p.forecast;
      const daysEarlier = before.completionPercentiles.p95-after.completionPercentiles.p95;
      const dateDaysEarlier = (parseDate(before.completionDates!.p95)-parseDate(after.completionDates!.p95))/86400000;
      return { projectId:p.id, projectName:p.name, baselineFeasible:before.feasible, scenarioFeasible:after.feasible,
        currentP95Date:before.completionDates!.p95, proposedP95Date:after.completionDates!.p95,
        p95DaysEarlier:Math.abs(daysEarlier)<1e-9?0:daysEarlier, p95DateDaysEarlier:dateDaysEarlier,
        deterministicDaysEarlier:before.deterministicCompletion-after.deterministicCompletion };
    });
    const totalP95DaysEarlier = projects.reduce((sum,p)=>sum+p.p95DaysEarlier,0);
    const eligible = proposedHours>originalHours && totalP95DaysEarlier>1e-9
      && projects.every(p=>p.scenarioFeasible && p.p95DaysEarlier>=-1e-9);
    return { resource, originalSaturdayHours:originalHours, proposedSaturdayHours:proposedHours,
      addedSaturdayHours:proposedHours-originalHours, projects, totalP95DaysEarlier,
      eligible, conflicts:scenario.conflicts,
      reason: proposedHours===originalHours ? 'Saturday is already at the 24-hour limit'
        : !projects.every(p=>p.scenarioFeasible) ? 'Scenario contains infeasible project forecasts'
        : projects.some(p=>p.p95DaysEarlier < -1e-9) ? 'At least one project P95 worsens'
        : totalP95DaysEarlier<=1e-9 ? 'No P95 improvement' : 'Improves P95 without worsening another project' };
  });
  candidates.sort((a,b)=>Number(b.eligible)-Number(a.eligible) || b.totalP95DaysEarlier-a.totalP95DaysEarlier);
  return { method:'one-resource-at-a-time-saturday-sensitivity' as const,
    change:'Add up to eight hours to recurring Saturday availability, capped at 24 hours; dated exceptions remain authoritative',
    ranking:'Eligible changes first, descending sum of separate project P95 elapsed-calendar-day improvements; ties preserve resource input order',
    interpretation:'The score sums individual customer forecast improvements. It is not a joint portfolio percentile or an optimal plan. Accept a change manually and rerun before choosing another.',
    baselineVersionId:baseline.plan.versionId, startDate:baseline.plan.calendar!.startDate,
    recommendedResource:candidates.find(c=>c.eligible)?.resource ?? null, candidates };
}
