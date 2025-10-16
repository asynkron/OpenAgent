export const appendLine = (output: string, line: unknown): string => {
  if (!line) {
    return output;
  }
  const normalized = String(line);
  if (!normalized) {
    return output;
  }
  const needsNewline = output && !output.endsWith('\n');
  return `${output || ''}${needsNewline ? '\n' : ''}${normalized}`;
};

export const createDetailMessage = (
  kind: 'timeout' | 'canceled' | null,
  timeoutSec: number | null | undefined,
  commandLabel: string | null,
): string | null => {
  if (!kind) {
    return null;
  }
  const suffix = commandLabel ? ` (${commandLabel})` : '';
  if (kind === 'timeout') {
    const seconds = timeoutSec ?? 60;
    return `Command timed out after ${seconds}s${suffix}.`;
  }
  if (kind === 'canceled') {
    return `Command was canceled${suffix}.`;
  }
  return null;
};

export const getCommandLabel = (
  providedLabel: unknown,
  trimmedCommand: string,
): string => {
  return providedLabel ? String(providedLabel).trim() : trimmedCommand;
};

export const getOperationDescription = (
  providedDescription: unknown,
  commandLabel: string,
): string => {
  return providedDescription && String(providedDescription).trim()
    ? String(providedDescription).trim()
    : commandLabel
      ? `shell: ${commandLabel}`
      : 'shell command';
};
