export const appendLine = (output: string, line: string): string => {
  if (!line) {
    return output;
  }
  const needsNewline = output && !output.endsWith('\n');
  return `${output || ''}${needsNewline ? '\n' : ''}${line}`;
};

export const createDetailMessage = (
  kind: 'timeout' | 'canceled' | null,
  timeoutSec: number | null | undefined,
  commandLabel: string,
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

export const getCommandLabel = (providedLabel: string, trimmedCommand: string): string => {
  const normalized = providedLabel.trim();
  return normalized ? normalized : trimmedCommand;
};

export const getOperationDescription = (
  providedDescription: string,
  commandLabel: string,
): string => {
  const normalized = providedDescription.trim();
  if (normalized) {
    return normalized;
  }
  return commandLabel ? `shell: ${commandLabel}` : 'shell command';
};
