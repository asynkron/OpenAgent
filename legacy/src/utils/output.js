export function combineStdStreams(filteredStdout, filteredStderr, exitCode) {
  if (exitCode === 0 && filteredStderr && String(filteredStderr).trim().length > 0) {
    const left = filteredStdout ? String(filteredStdout) : '';
    const right = String(filteredStderr);
    const combined = left ? `${left}\n${right}` : right;
    return { stdout: combined, stderr: '' };
  }
  return { stdout: filteredStdout || '', stderr: filteredStderr || '' };
}

export default { combineStdStreams };
