import { readFile, writeFile } from 'node:fs/promises';
import { parseOptions } from './cli-options.js';
import { parsePortfolio, schedulePortfolio, comparePortfolioVersions, type PortfolioResult } from './portfolio.js';

try {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npm run portfolio -- plan.json [--format json|table] [--output result.json]\nRevision history: npm run portfolio -- plan.json --previous previous-result.json [--output result.json]');
  } else {
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
    const result = schedulePortfolio(parsePortfolio(JSON.parse(await readFile(options.files[0]!, 'utf8'))), previous);
    const comparison = previous && previous.plan.asOf === result.plan.asOf ? comparePortfolioVersions(previous, result) : undefined;
    const json = JSON.stringify({ ...result, ...(comparison ? { comparison } : {}) }, null, 2) + '\n';
    if (options.output) {
      if (!options.output.endsWith('.json')) throw new Error('Portfolio output must be .json to preserve projects and version history');
      await writeFile(options.output, json, { flag: 'wx' });
    }
    if (options.format === 'json') console.log(json.trimEnd());
    else {
      console.log(`Portfolio: ${result.plan.id} | Version: ${result.plan.versionId} | Days | As of: ${result.plan.asOf}`);
      console.table(result.projects.map(p=>({ Project:p.name, Feasible:p.forecast.feasible, Completion:p.forecast.deterministicCompletion, ...p.forecast.completionPercentiles, 'Critical chain':p.forecast.criticalChain.join(' -> ') })));
      console.table(result.tasks.map(t=>({ Project:t.projectId, Task:t.id, Resource:t.resource, 'Allocation %':t.allocationPercent, Start:t.start, Finish:t.finish, Locked:t.locked, 'Resource waits for':t.resourcePredecessors.join(' -> ') })));
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
