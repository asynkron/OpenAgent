import type { ReactElement } from 'react';
import { Box, Text } from 'ink';

import { computeProgressState, type PlanProgress as PlanProgressValue } from './progressUtils.js';

type PlanProgressProps = {
  progress?: PlanProgressValue | null;
};

/**
 * Compact progress bar that mirrors the text-based renderer but using Ink.
 */
export function PlanProgress({ progress }: PlanProgressProps): ReactElement {
  const state = computeProgressState(progress);

  if (state.total <= 0) {
    return (
      <Box marginTop={1}>
        <Text color="blueBright">Plan progress: </Text>
        <Text dimColor>no active steps yet.</Text>
      </Box>
    );
  }

  const filledBar = state.filled > 0 ? '█'.repeat(state.filled) : '';
  const emptyBar = state.empty > 0 ? '░'.repeat(state.empty) : '';
  const percentLabel = `${Math.round(state.normalized * 100)}%`;
  const summary = `${state.completed}/${state.total}`;

  return (
    <Box marginTop={1}>
      <Text color="blueBright">Plan progress: </Text>
      <Text color="green">{filledBar}</Text>
      <Text color="gray">{emptyBar}</Text>
      <Text> </Text>
      <Text bold>{percentLabel}</Text>
      <Text>{` (${summary})`}</Text>
    </Box>
  );
}

export default PlanProgress;
