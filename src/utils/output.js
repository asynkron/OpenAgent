/**
 * Output helpers shared across the agent runtime.
 */

export function combineStdStreams(filteredStdout, filteredStderr, exitCode) {
  if (exitCode === 0 && filteredStderr && String(filteredStderr).trim().length > 0) {
    const left = filteredStdout ? String(filteredStdout) : '';
    const right = String(filteredStderr);
    const combined = left ? `${left}\n${right}` : right;
    return { stdout: combined, stderr: '' };
  }
  return { stdout: filteredStdout || '', stderr: filteredStderr || '' };
}

export function buildPreview(text, maxLines = 20) {
  if (text === undefined || text === null) {
    return '';
  }

  const normalized = String(text);
  if (!normalized) {
    return '';
  }

  const lines = normalized.split('\n');
  if (lines.length <= maxLines) {
    return normalized;
  }

  const head = lines.slice(0, maxLines).join('\n');
  return `${head}\n…`;
}

export default { combineStdStreams, buildPreview };