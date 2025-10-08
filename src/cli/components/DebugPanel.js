import React from 'react';
import { Box, Text } from 'ink';

const h = React.createElement;

/**
 * Displays debug payloads emitted by the agent when the debug flag is active.
 */
export function DebugPanel({ events = [] }) {
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }

  const children = [h(Text, { color: 'gray', bold: true, key: 'heading' }, 'Debug')];
  events.forEach((event, index) => {
    children.push(h(Text, { color: 'gray', key: `debug-${index}` }, event));
  });

  return h(Box, { flexDirection: 'column', marginTop: 1 }, children);
}

export default DebugPanel;
