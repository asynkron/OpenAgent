import React from 'react';
import { Box, Text } from 'ink';

import { wrapStructuredContent } from '../render.js';
import theme from '../theme.js';

const h = React.createElement;
const { human } = theme;
const {
  colors: humanColors,
  props: humanProps = {},
} = human;

/**
 * Renders human-provided inputs within the timeline so conversations stay paired.
 */
export function HumanMessage({ message }) {
  const prepared = wrapStructuredContent(message);

  if (!prepared) {
    return null;
  }

  const containerProps = {
    ...(humanProps.container ?? {}),
  };
  if (!containerProps.backgroundColor) {
    containerProps.backgroundColor = humanColors.bg;
  }

  const textProps = {
    ...(humanProps.text ?? {}),
  };
  if (!textProps.color) {
    textProps.color = humanColors.fg;
  }

  return h(
    Box,
    containerProps,
    h(Text, textProps, prepared),
  );
}

export default HumanMessage;
