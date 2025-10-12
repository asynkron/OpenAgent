import React from 'react';
import { Box, Text } from 'ink';

const h = React.createElement;

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
export function StatusMessage({
  status,
}: {
  status?: StatusPayload | null;
}): React.ReactElement | null {
  if (!status || typeof status !== 'object') {
    return null;
  }

  const color = resolveColor(status.level);
  const message = status.message ?? '';
  const details = status.details ? String(status.details) : '';

  const keySuffix = React.useMemo(() => Math.random().toString(36).slice(2, 10), []);

  const children = [h(Text, { color, key: `message-${keySuffix}` }, message)];

  if (details) {
    children.push(h(Text, { dimColor: true, key: `details-${keySuffix}` }, details));
  }

  return h(Box, { flexDirection: 'column' }, children) as React.ReactElement;
}

export default StatusMessage;
