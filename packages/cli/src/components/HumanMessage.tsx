import type { ReactElement } from 'react';
import { Box, Text } from 'ink';

import { wrapStructuredContent } from '../render.js';
import theme from '../theme.js';

const { human } = theme;
const humanColors = human.colors;
const humanProps = human.props;

type HumanMessageProps = {
  message?: unknown;
};

type InkBoxProps = Record<string, unknown>;
type InkTextProps = Record<string, unknown>;

/**
 * Renders human-provided inputs within the timeline so conversations stay paired.
 */
function HumanMessage({ message }: HumanMessageProps): ReactElement | null {
  const prepared = wrapStructuredContent(message);

  if (!prepared) {
    return null;
  }

  const containerProps: InkBoxProps = { ...(humanProps.container ?? {}) };
  if (!containerProps.backgroundColor) {
    containerProps.backgroundColor = humanColors.bg;
  }

  const textProps: InkTextProps = { ...(humanProps.text ?? {}) };
  if (!textProps.color) {
    textProps.color = humanColors.fg;
  }

  return (
    <Box {...(containerProps as Record<string, unknown>)}>
      <Text {...(textProps as Record<string, unknown>)}>{prepared}</Text>
    </Box>
  );
}

export default HumanMessage;
