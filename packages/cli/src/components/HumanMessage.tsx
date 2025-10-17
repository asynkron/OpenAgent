import type { ReactElement } from 'react';
import { Box, Text } from 'ink';

import { wrapStructuredContent } from '../render.js';
import theme from '../theme.js';
import { toBoxProps, toTextProps, type BoxStyleProps, type TextStyleProps } from '../styleTypes.js';

const { human } = theme;
const humanColors = human.colors;
const humanProps = human.props;

type HumanMessageProps = {
  message?: unknown;
};

/**
 * Renders human-provided inputs within the timeline so conversations stay paired.
 */
function HumanMessage({ message }: HumanMessageProps): ReactElement | null {
  const prepared = wrapStructuredContent(message);

  if (!prepared) {
    return null;
  }

  const containerStyle: BoxStyleProps = { ...(humanProps.container ?? {}) };
  if (!containerStyle.backgroundColor) {
    containerStyle.backgroundColor = humanColors.bg;
  }

  const textStyle: TextStyleProps = { ...(humanProps.text ?? {}) };
  if (!textStyle.color) {
    textStyle.color = humanColors.fg;
  }

  const containerProps = toBoxProps(containerStyle);
  const textProps = toTextProps(textStyle);

  return (
    <Box {...containerProps}>
      <Text {...textProps}>{prepared}</Text>
    </Box>
  );
}

export default HumanMessage;
