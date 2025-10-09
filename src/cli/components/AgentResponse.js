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
    {
      flexDirection: 'column',
      marginTop: 1,
      paddingX: 1,
      paddingY: 1,
      width: '100%',
      alignSelf: 'stretch',
      flexGrow: 1,
    },
    h(Text, null, rendered),
  );
}

export default AgentResponse;
