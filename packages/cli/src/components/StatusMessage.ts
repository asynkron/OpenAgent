// @ts-nocheck
import React from 'react';
import { Box, Text } from 'ink';

const h = React.createElement;

function resolveColor(level) {
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
export function StatusMessage({ status }) {
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

  return h(Box, { flexDirection: 'column' }, children);
}

export default StatusMessage;
