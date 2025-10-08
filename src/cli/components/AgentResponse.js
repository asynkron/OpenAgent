import React from 'react';
import { Box, Text } from 'ink';

import { renderMarkdownMessage, wrapStructuredContent } from '../render.js';

const h = React.createElement;

/**
 * Renders assistant messages using Ink so Markdown formatting carries through to
 * the terminal UI.
 */
export function AgentResponse({ message }) {
  const prepared = wrapStructuredContent(message);

  if (!prepared) {
    return null;
  }

  const rendered = renderMarkdownMessage(prepared);

  return h(
    Box,
    { flexDirection: 'column', marginTop: 1 },
    [
      h(Text, { color: 'magentaBright', bold: true, key: 'heading' }, 'Assistant'),
      h(Box, { marginLeft: 2, key: 'body' }, h(Text, null, rendered)),
    ],
  );
}

export default AgentResponse;
