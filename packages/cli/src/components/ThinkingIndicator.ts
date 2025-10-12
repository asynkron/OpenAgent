import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

const h = React.createElement;

type ThinkingIndicatorProps = {
  active: boolean;
};

/**
 * Spinner shown while the agent waits on the model or command execution.
 */
export function ThinkingIndicator({ active }: ThinkingIndicatorProps): React.ReactElement | null {
  if (!active) {
    return null;
  }

  return h(
    Box,
    { marginTop: 1 },
    h(
      Text,
      { dimColor: true },
      h(Spinner, { type: 'dots', key: 'spinner' }),
      ' Thinking…',
    ),
  ) as React.ReactElement;
}

export default ThinkingIndicator;
