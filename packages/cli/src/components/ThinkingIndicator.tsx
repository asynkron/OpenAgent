import type { ReactElement } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

type ThinkingIndicatorProps = {
  active: boolean;
};

/**
 * Spinner shown while the agent waits on the model or command execution.
 */
export function ThinkingIndicator({ active }: ThinkingIndicatorProps): ReactElement | null {
  if (!active) {
    return null;
  }

  return (
    <Box marginTop={1}>
      <Text dimColor>
        <Spinner type="dots" key="spinner" /> Thinking…
      </Text>
    </Box>
  );
}

export default ThinkingIndicator;
