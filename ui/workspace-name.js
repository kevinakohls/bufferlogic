/** A readable filename with a timestamp, safe on Windows as well as other platforms. */
export function workspaceFilename(name, now = new Date()) {
  const slug = (name || 'Untitled plan').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 80) || 'Untitled plan';
  return `bufferlogic-${slug}-${now.toISOString().replace(/[:.]/g, '-')}.json`;
}
