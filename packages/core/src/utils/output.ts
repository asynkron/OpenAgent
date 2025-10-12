/**
 * Output helpers shared across the agent runtime.
 */

export type CombinedStreams = {
  stdout: string;
  stderr: string;
};

export function combineStdStreams(
  filteredStdout: unknown,
  filteredStderr: unknown,
  exitCode: number,
): CombinedStreams {
  const stdoutText = filteredStdout != null ? String(filteredStdout) : '';
  const stderrText = filteredStderr != null ? String(filteredStderr) : '';

  if (exitCode === 0 && stderrText.trim().length > 0) {
    const combined = stdoutText ? `${stdoutText}\n${stderrText}` : stderrText;
    return { stdout: combined, stderr: '' };
  }

  return { stdout: stdoutText, stderr: stderrText };
}

export function buildPreview(text: unknown, maxLines = 20): string {
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
