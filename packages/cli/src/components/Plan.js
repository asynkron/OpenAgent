import React from 'react';
import { Box, Text } from 'ink';

import { createPlanNodes } from './planUtils.js';
import { computeProgressState } from './progressUtils.js';
import PlanDetail from './PlanDetail.js';
import theme from '../theme.js';

const h = React.createElement;
const { plan: planTheme } = theme;
const planColors = planTheme?.colors ?? {};
const planProps = planTheme?.props ?? {};

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

  const headingProps = {
    key: 'heading',
    color: 'blueBright',
    bold: true,
    ...(planProps.heading ?? {}),
  };

  if (!headingProps.color) {
    headingProps.color = planColors.heading ?? planColors.fg ?? 'blueBright';
  }

  const children = [h(Text, headingProps, 'Plan')];

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

  const containerProps = {
    flexDirection: 'column',
    marginTop: 1,
    ...(planProps.container ?? {}),
  };

  if (!containerProps.backgroundColor && planColors.bg) {
    containerProps.backgroundColor = planColors.bg;
  }

  return h(Box, containerProps, children);
}

export default Plan;
