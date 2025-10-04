function combineStdStreams(filteredStdout, filteredStderr, exitCode) {
  // If the command succeeded (exitCode === 0) and there is stderr content,
  // append stderr to stdout and clear stderr so consumers get a single combined output.
  if (exitCode === 0 && filteredStderr && String(filteredStderr).trim().length > 0) {
    const left = filteredStdout ? String(filteredStdout) : '';
    const right = String(filteredStderr);
    const combined = left ? left + '\n' + right : right;
    return { stdout: combined, stderr: '' };
  }
  return { stdout: filteredStdout || '', stderr: filteredStderr || '' };
}

module.exports = { combineStdStreams };
