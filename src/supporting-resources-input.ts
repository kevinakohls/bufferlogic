import type {ResourceAssignment} from './task-resources.js';

/** Optional CSV cell: a JSON array, using the same schema as saved workspaces. */
export function supportingResourcesCell(value: string): {supportingResources?: readonly ResourceAssignment[]} {
  if (!value.trim()) return {};
  let parsed: unknown;
  try { parsed=JSON.parse(value); } catch {
    throw new Error('Supporting resources must be a JSON array of resource and allocationPercent entries');
  }
  if (!Array.isArray(parsed)) throw new Error('Supporting resources must be a JSON array');
  const supportingResources=parsed.map((entry:unknown):ResourceAssignment=>{
    if(typeof entry!=='object'||entry===null||Array.isArray(entry))throw new Error('Supporting resources entries require resource and allocationPercent');
    const a=entry as Record<string,unknown>;
    if(typeof a.resource!=='string'||(a.resource!==''&&!a.resource.trim())||typeof a.allocationPercent!=='number'||!Number.isFinite(a.allocationPercent)||a.allocationPercent<=0||a.allocationPercent>100)
      throw new Error('Supporting resources entries require a resource and allocationPercent greater than 0 and at most 100');
    return {resource:a.resource,allocationPercent:a.allocationPercent};
  });
  // parsePortfolio additionally rejects duplicate primary/supporting assignments.
  return {supportingResources};
}
