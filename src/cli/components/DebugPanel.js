import React from 'react';
import { Box, Text } from 'ink';

import { renderMarkdownMessage } from '../render.js';

const h = React.createElement;

/**
 * Displays debug payloads emitted by the agent when the debug flag is active.
 */
export function DebugPanel({ events = [] }) {
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }

  const renderedEvents = events
    .map((event, index) => {
      const content = typeof event === 'string' ? event : String(event ?? '');
      if (!content.trim()) {
        return null;
      }

      const markdown = `\`\`\`json\n${content}\n\`\`\``;
      const rendered = renderMarkdownMessage(markdown);
      return h(Text, { key: `debug-${index}` }, rendered);
    })
    .filter(Boolean);

  if (renderedEvents.length === 0) {
    return null;
  }

  const children = [
    h(Text, { color: 'gray', bold: true, key: 'heading' }, 'Debug'),
    ...renderedEvents,
  ];

  return h(Box, { flexDirection: 'column', marginTop: 1 }, children);
}

export default DebugPanel;
