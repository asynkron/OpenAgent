import React from 'react';
import { Box, Text } from 'ink';

import { wrapStructuredContent } from '../render.js';
import theme from '../theme.js';

const h = React.createElement;

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
export function HumanMessage({ message }: HumanMessageProps): React.ReactElement | null {
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

  return h(Box, containerProps, h(Text, textProps, prepared)) as React.ReactElement;
}

export default HumanMessage;
