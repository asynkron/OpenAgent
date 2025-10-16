import { Box, Text } from 'ink';
import { useMemo, type ReactElement } from 'react';

type StatusLevel = 'warn' | 'error' | 'success' | 'info' | string;

export type StatusPayload = {
  level?: StatusLevel;
  message?: string;
  details?: unknown;
};

function resolveColor(level: StatusLevel | undefined) {
  switch (level) {
    case 'warn':
      return 'yellow';
    case 'error':
      return 'red';
    case 'success':
      return 'green';
    default:
      return undefined;
  }
}

/**
 * Lightweight status line renderer that mirrors the legacy console output.
 */
function StatusMessage({ status }: { status?: StatusPayload | null }): ReactElement | null {
  if (!status || typeof status !== 'object') {
    return null;
  }

  const color = resolveColor(status.level);
  const message = status.message ?? '';
  const details = status.details ? String(status.details) : '';

  const keySuffix = useMemo(() => Math.random().toString(36).slice(2, 10), []);

  return (
    <Box flexDirection="column">
      <Text color={color} key={`message-${keySuffix}`}>
        {message}
      </Text>
      {details ? (
        <Text dimColor key={`details-${keySuffix}`}>
          {details}
        </Text>
      ) : null}
    </Box>
  );
}

export default StatusMessage;
