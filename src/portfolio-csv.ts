import { csvRecords, parseProjectCsv } from './csv-input.js';
import { parsePortfolio, type PortfolioPlan } from './portfolio.js';

/** Baseline portfolio CSV: existing task columns plus Project. First appearance determines project order. */
export function parsePortfolioCsv(text: string, id = 'csv-portfolio', versionId = 'csv-v1'): PortfolioPlan {
  const rows = csvRecords(text);
  const header = rows.shift()?.map(cell => cell.trim());
  if (!header || new Set(header).size !== header.length || !header.includes('Project')) {
    throw new Error('Portfolio CSV requires unique column names including Project');
  }
  const projectIndex = header.indexOf('Project');
  const groups = new Map<string, string[][]>();
  for (const [index,row] of rows.entries()) {
    if (row.every(cell => !cell.trim())) continue;
    // Concatenating Excel project tables often repeats the exact header.
    if (row.length === header.length && row.every((cell,i) => cell.trim() === header[i])) continue;
    if (row.length !== header.length) throw new Error(`CSV record ${index+2} has the wrong number of fields`);
    const projectId = row[projectIndex]!.trim();
    if (!projectId) throw new Error(`CSV record ${index+2} requires a Project`);
    const group = groups.get(projectId) ?? [];
    group.push(row); groups.set(projectId,group);
  }
  const cell = (value:string) => '"' + value.replaceAll('"','""') + '"';
  const projects = [...groups].map(([projectId,records]) => {
    const csv = [header,...records].map(row=>row.map(cell).join(',')).join('\n');
    return { id:projectId,name:projectId,tasks:parseProjectCsv(csv).map(task=>({...task,projectId})) };
  });
  return parsePortfolio({id,versionId,asOf:0,settings:{durationUnit:'days'},resources:[...new Set(projects.flatMap(p=>p.tasks.map(t=>t.resource)))],projects});
}
