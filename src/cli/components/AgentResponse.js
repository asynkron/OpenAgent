import React from 'react';
import { Box, Text } from 'ink';

import { renderMarkdownMessage, wrapStructuredContent } from '../render.js';
import theme from '../theme.js';

const h = React.createElement;
const { agent } = theme;
const { colors: agentColors, props: agentProps = {} } = agent;

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

  const containerProps = {
    ...(agentProps.container ?? {}),
  };
  if (!containerProps.backgroundColor) {
    containerProps.backgroundColor = agentColors.bg;
  }

  const textProps = {
    ...(agentProps.text ?? {}),
  };
  if (!textProps.color) {
    textProps.color = agentColors.fg;
  }

  return h(Box, containerProps, h(Text, textProps, rendered));
}

export default AgentResponse;
