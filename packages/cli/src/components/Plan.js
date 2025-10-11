import React from 'react';
import { Box, Text } from 'ink';

import { createPlanNodes } from './planUtils.js';
import PlanDetail from './PlanDetail.js';
import theme from '../theme.js';

const h = React.createElement;
const { plan: planTheme } = theme;
const planColors = planTheme?.colors ?? {};
const planProps = planTheme?.props ?? {};

/**
 * High-level plan renderer that lists every step using `PlanDetail` rows.
 */
export function Plan({ plan }) {
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
