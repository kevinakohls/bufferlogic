import { parseProject } from './project-input.js';
import type { Task } from './types.js';
import { readTaskCsv } from './csv-schema.js';
export { csvRecords } from './csv-records.js';

/** Legacy single-project CLI adapter; shares the application CSV schema. */
export function parseProjectCsv(text: string): Task[] {
  return parseProject({tasks:readTaskCsv(text).records.map(record=>record.task)}, {allowUnassignedResource:true});
}
