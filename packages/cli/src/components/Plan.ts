import React from 'react';
import { Box, Text } from 'ink';

import { createPlanNodes, type PlanNode, type PlanStep } from './planUtils.js';
import PlanDetail from './PlanDetail.js';
import theme, { type Theme } from '../theme.js';

const h = React.createElement;
const planTheme: Theme['plan'] | undefined = theme?.plan;
type PlanColors = Theme['plan']['colors'];
type PlanPropsConfig = Theme['plan']['props'];
const planColors: Partial<PlanColors> = planTheme?.colors ?? {};
const planProps: Partial<PlanPropsConfig> = planTheme?.props ?? {};

type PlanProps = {
  plan?: PlanStep[] | null;
};

/**
 * High-level plan renderer that lists every step using `PlanDetail` rows.
 */
export function Plan({ plan }: PlanProps): React.ReactElement {
  const nodes: PlanNode[] = createPlanNodes(plan ?? []);
  const hasSteps = nodes.length > 0;

  const headingProps: Record<string, unknown> = {
    key: 'heading',
    ...(planProps.heading ?? {}),
  };

  if (headingProps.color === undefined) {
    headingProps.color = planColors.heading ?? planColors.fg ?? 'blueBright';
  }
  if (headingProps.bold === undefined) {
    headingProps.bold = true;
  }

  const children: React.ReactElement[] = [h(Text, headingProps, 'Plan') as React.ReactElement];

  if (hasSteps) {
    for (const node of nodes) {
      children.push(h(PlanDetail, { key: node.id, node }) as React.ReactElement);
    }
  } else {
    children.push(
      h(Text, { dimColor: true, key: 'empty' }, 'No plan yet.') as React.ReactElement,
    );
  }

  const containerProps: Record<string, unknown> = {
    ...(planProps.container ?? {}),
  };

  if (containerProps.flexDirection === undefined) {
    containerProps.flexDirection = 'column';
  }
  if (containerProps.marginTop === undefined) {
    containerProps.marginTop = 1;
  }

  if (!containerProps.backgroundColor && planColors.bg) {
    containerProps.backgroundColor = planColors.bg;
  }

  return h(Box, containerProps, children) as React.ReactElement;
}

export default Plan;
