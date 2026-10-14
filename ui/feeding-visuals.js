/** Derive visual protection bands from calculated results, never pending edits. */
export function feedingVisuals(result) {
  const entries = new Map(result.tasks.map(task => [task.id, task]));
  const tasks = result.plan.projects.flatMap(project => project.tasks);
  return (result.feedingReport?.changes ?? []).flatMap(change => {
    const entry = entries.get(change.taskId);
    const protectionFinish=change.protectionFinish??change.protectedStart;
    if (change.status !== 'applied' || !entry || protectionFinish === null || protectionFinish < entry.finish - 1e-9) return [];
    return [{
      taskId: change.taskId,
      resource: entry.resource,
      start: entry.finish,
      finish: protectionFinish,
      bufferEffort: change.bufferEffort,
      originalStart: change.originalStart,
      newStart: entry.start,
      downstreamTaskIds: tasks.filter(task => task.dependsOn.includes(entry.id) && entries.has(task.id)).map(task => task.id),
    }];
  });
}
