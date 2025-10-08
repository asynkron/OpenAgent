import React from 'react';
import { Box, Text } from 'ink';

import { createPlanNodes } from './planUtils.js';
import { computeProgressState } from './progressUtils.js';
import PlanDetail from './PlanDetail.js';

const h = React.createElement;

function renderProgressBar(progress) {
  const state = computeProgressState(progress);
  if (state.total <= 0) {
    return null;
  }

  const filledBar = state.filled > 0 ? '█'.repeat(state.filled) : '';
  const emptyBar = state.empty > 0 ? '░'.repeat(state.empty) : '';
  const percentLabel = `${Math.round(state.normalized * 100)}%`;
  const summary = `${state.completed}/${state.total}`;

  return h(Box, { marginTop: 1, key: 'progress-row' }, [
    h(Text, { color: 'blueBright', key: 'label' }, 'Progress: '),
    h(Text, { color: 'green', key: 'filled' }, filledBar),
    h(Text, { color: 'gray', key: 'empty' }, emptyBar),
    h(Text, { key: 'space' }, ' '),
    h(Text, { bold: true, key: 'percent' }, percentLabel),
    h(Text, { key: 'summary' }, ` (${summary})`),
  ]);
}

/**
 * High-level plan renderer that lists every step using `PlanDetail` rows and
 * includes a compact progress bar when steps are present.
 */
export function Plan({ plan, progress }) {
  const nodes = createPlanNodes(plan);
  const hasSteps = nodes.length > 0;

  const children = [h(Text, { color: 'blueBright', bold: true, key: 'heading' }, 'Plan')];

  if (hasSteps) {
    const progressRow = renderProgressBar(progress);
    if (progressRow) {
      children.push(progressRow);
    }
    for (const node of nodes) {
      children.push(h(PlanDetail, { key: node.id, node }));
    }
  } else {
    children.push(h(Text, { dimColor: true, key: 'empty' }, 'No plan yet.'));
  }

  return h(Box, { flexDirection: 'column', marginTop: 1 }, children);
}

export default Plan;
