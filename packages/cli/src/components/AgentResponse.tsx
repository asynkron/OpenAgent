import type { ReactElement } from 'react';
import { Box, Text } from 'ink';

import { renderMarkdownMessage, wrapStructuredContent } from '../render.js';
import theme from '../theme.js';

const { agent } = theme;
const agentColors = agent.colors;
const agentProps = agent.props;

type AgentResponseProps = {
  message?: unknown;
};

type InkBoxProps = Record<string, unknown>;
type InkTextProps = Record<string, unknown>;

/**
 * Renders assistant messages using Ink so Markdown formatting carries through to
 * the terminal UI.
 */
function AgentResponse({ message }: AgentResponseProps): ReactElement | null {
  const prepared = wrapStructuredContent(message);

  if (!prepared) {
    return null;
  }

  const rendered = renderMarkdownMessage(prepared);

  const containerProps: InkBoxProps = { ...(agentProps.container ?? {}) };
  if (!containerProps.backgroundColor) {
    containerProps.backgroundColor = agentColors.bg;
  }

  const textProps: InkTextProps = { ...(agentProps.text ?? {}) };
  if (!textProps.color) {
    textProps.color = agentColors.fg;
  }

  return (
    <Box {...(containerProps as Record<string, unknown>)}>
      <Text {...(textProps as Record<string, unknown>)}>{rendered}</Text>
    </Box>
  );
}

export default AgentResponse;
