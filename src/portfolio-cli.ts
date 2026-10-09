import { readFile, writeFile } from 'node:fs/promises';
import { parseResourceCalendarsCsv, parseDate, todayDate } from './resource-calendars.js';
import { basename, extname } from 'node:path';
import { parsePortfolioCsv } from './portfolio-csv.js';
import { parseOptions } from './cli-options.js';
import { parsePortfolio, schedulePortfolio, comparePortfolioVersions, type PortfolioResult } from './portfolio.js';

try {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npm run portfolio -- plan.json|tasks.csv [--format json|table] [--output result.json] [--calendar calendars.csv] [--start-date today|YYYY-MM-DD] [--hours-per-day 8] [--time-zone Area/City] (start defaults to today)\nRevision history: npm run portfolio -- plan.json --previous previous-result.json [--output result.json]');
  } else {
    function take(flag:string):string|undefined {
      const index=args.indexOf(flag);
      if(index===-1)return undefined;
      const value=args[index+1];
      if(!value||value.startsWith('--'))throw new Error(`Missing value for ${flag}`);
      args.splice(index,2);
      if(args.includes(flag))throw new Error(`Duplicate option: ${flag}`);
      return value;
    }
    const calendarFile=take('--calendar'),requestedDate=take('--start-date'),hoursPerDay=take('--hours-per-day'),requestedZone=take('--time-zone');
    if(!calendarFile&&(requestedDate||hoursPerDay||requestedZone))throw new Error('Calendar options require --calendar');
    const timeZone=requestedZone??Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startDate=calendarFile ? (!requestedDate||requestedDate==='today' ? todayDate(timeZone) : requestedDate) : undefined;
    if(startDate)parseDate(startDate);
    const previousIndex = args.indexOf('--previous');
    let previous: PortfolioResult | undefined;
    if (previousIndex !== -1) {
      const file = args[previousIndex + 1];
      if (!file || file.startsWith('--')) throw new Error('Missing previous result file');
      previous = JSON.parse(await readFile(file, 'utf8')) as PortfolioResult;
      if (!previous.plan || !Array.isArray(previous.previousVersions) || !Array.isArray(previous.tasks) || !Array.isArray(previous.projects) || !Array.isArray(previous.conflicts)) throw new Error('Invalid previous portfolio result');
      args.splice(previousIndex, 2);
    }
    const options = parseOptions(args, 1, true);
    const inputFile = options.files[0]!;
    const source = await readFile(inputFile, 'utf8');
    const plan = extname(inputFile).toLowerCase() === '.csv'
      ? parsePortfolioCsv(source, basename(inputFile, extname(inputFile)), previous ? `${previous.plan.versionId}-revision` : 'csv-v1')
      : parsePortfolio(JSON.parse(source));
    const configuredPlan=calendarFile ? { ...plan, calendar:{ startDate:startDate!, timeZone, hoursPerWorkday:hoursPerDay===undefined?8:Number(hoursPerDay), resources:parseResourceCalendarsCsv(await readFile(calendarFile,'utf8')) } } : plan;
    const result = schedulePortfolio(configuredPlan, previous);
    const comparison = previous && previous.plan.asOf === result.plan.asOf && previous.plan.calendar?.startDate === result.plan.calendar?.startDate ? comparePortfolioVersions(previous, result) : undefined;
    const json = JSON.stringify({ ...result, ...(comparison ? { comparison } : {}) }, null, 2) + '\n';
    if (options.output) {
      if (!options.output.endsWith('.json')) throw new Error('Portfolio output must be .json to preserve projects and version history');
      await writeFile(options.output, json, { flag: 'wx' });
    }
    if (options.format === 'json') console.log(json.trimEnd());
    else {
      console.log(`Portfolio: ${result.plan.id} | Version: ${result.plan.versionId} | Days | As of: ${result.plan.asOf}`);
      console.table(result.projects.map(p=>({ Project:p.name, Feasible:p.forecast.feasible, [result.plan.calendar ? 'Elapsed calendar days' : 'Completion']:p.forecast.deterministicCompletion, ...p.forecast.completionPercentiles, 'Critical chain':p.forecast.criticalChain.join(' -> ') })));
      if (result.plan.calendar) {
        console.log(`Calendar start: ${result.plan.calendar.startDate}; ${result.plan.calendar.hoursPerWorkday} hours per estimated workday`);
        console.table(result.projects.map(p=>({ Project:p.name, Feasible:p.forecast.feasible, ...p.forecast.completionDates })));
      }
      console.table(result.tasks.map(t=>({ Project:t.projectId, Task:t.id, Resource:t.resource, 'Allocation %':t.allocationPercent, Start:t.start, Finish:t.finish, Locked:t.locked, 'Resource waits for':t.resourcePredecessors.join(' -> '), ...(result.plan.calendar ? { 'Start date':t.startDate, 'Finish date':t.finishDate } : {}) })));
      if (comparison) console.table(comparison.projects.map(p => ({ Project:p.projectId, 'Completion change': p.current ? p.whatIf.deterministicCompletion-p.current.deterministicCompletion : 'new', ...p.percentileDifferences })));
      for (const conflict of result.conflicts) console.log(`CONFLICT: ${conflict.message} [${conflict.taskIds.join(', ')}]`);
      console.log(result.assumptions.join('\n'));
    }
    if (options.output) console.log(`Saved ${options.output}`);
  }
} catch (error) {
  console.error(`BufferLogic: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
