import React from 'react';
import { Box, Text } from 'ink';

import { computeProgressState, type PlanProgress as PlanProgressValue } from './progressUtils.js';

const h = React.createElement;

type PlanProgressProps = {
  progress?: PlanProgressValue | null;
};

/**
 * Compact progress bar that mirrors the text-based renderer but using Ink.
 */
export function PlanProgress({ progress }: PlanProgressProps): React.ReactElement {
  const state = computeProgressState(progress);

  if (state.total <= 0) {
    return h(
      Box,
      { marginTop: 1 },
      h(Text, { color: 'blueBright', key: 'label' }, 'Plan progress: '),
      h(Text, { dimColor: true, key: 'empty' }, 'no active steps yet.'),
    ) as React.ReactElement;
  }

  const filledBar = state.filled > 0 ? '█'.repeat(state.filled) : '';
  const emptyBar = state.empty > 0 ? '░'.repeat(state.empty) : '';
  const percentLabel = `${Math.round(state.normalized * 100)}%`;
  const summary = `${state.completed}/${state.total}`;

  return h(
    Box,
    { marginTop: 1 },
    h(Text, { color: 'blueBright', key: 'label' }, 'Plan progress: '),
    h(Text, { color: 'green', key: 'filled' }, filledBar),
    h(Text, { color: 'gray', key: 'empty' }, emptyBar),
    h(Text, { key: 'space' }, ' '),
    h(Text, { bold: true, key: 'percent' }, percentLabel),
    h(Text, { key: 'summary' }, ` (${summary})`),
  ) as React.ReactElement;
}

export default PlanProgress;
