import type { ReactElement } from 'react';
import { Box, Text } from 'ink';

import type { RuntimeProperty } from '@asynkron/openagent-core';

import { renderMarkdownMessage, wrapStructuredContent } from '../render.js';
import theme from '../theme.js';
import { toBoxProps, toTextProps, type BoxStyleProps, type TextStyleProps } from '../styleTypes.js';

const { agent } = theme;
const agentColors = agent.colors;
const agentProps = agent.props;

type AgentResponseProps = {
  message?: RuntimeProperty | null;
};

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

  const containerStyle: BoxStyleProps = { ...(agentProps.container ?? {}) };
  if (!containerStyle.backgroundColor) {
    containerStyle.backgroundColor = agentColors.bg;
  }

  const textStyle: TextStyleProps = { ...(agentProps.text ?? {}) };
  if (!textStyle.color) {
    textStyle.color = agentColors.fg;
  }

  const containerProps = toBoxProps(containerStyle);
  const textProps = toTextProps(textStyle);

  return (
    <Box {...containerProps}>
      <Text {...textProps}>{rendered}</Text>
    </Box>
  );
}

export default AgentResponse;
