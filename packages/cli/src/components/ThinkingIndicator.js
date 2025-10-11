import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

const h = React.createElement;

/**
 * Spinner shown while the agent waits on the model or command execution.
 */
export function ThinkingIndicator({ active }) {
  if (!active) {
    return null;
  }

  return h(
    Box,
    { marginTop: 1 },
    h(Text, { dimColor: true }, [h(Spinner, { type: 'dots', key: 'spinner' }), ' Thinking…']),
  );
}

export default ThinkingIndicator;
