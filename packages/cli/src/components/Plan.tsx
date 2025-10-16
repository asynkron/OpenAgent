import type { ReactElement } from 'react';
import { Box, Text } from 'ink';

import { createPlanNodes, type PlanNode, type PlanStep } from './planUtils.js';
import PlanDetail from './PlanDetail.js';
import theme, { type Theme } from '../theme.js';

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
function Plan({ plan }: PlanProps): ReactElement {
  const nodes: PlanNode[] = createPlanNodes(plan ?? []);
  const hasSteps = nodes.length > 0;

  const headingProps: Record<string, unknown> = {
    ...(planProps.heading ?? {}),
  };

  if (headingProps.color === undefined) {
    headingProps.color = planColors.heading ?? planColors.fg ?? 'blueBright';
  }
  if (headingProps.bold === undefined) {
    headingProps.bold = true;
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

  return (
    <Box {...(containerProps as Record<string, unknown>)}>
      <Text {...(headingProps as Record<string, unknown>)}>Plan</Text>
      {hasSteps ? (
        nodes.map((node) => <PlanDetail key={node.id} node={node} />)
      ) : (
        <Text dimColor>No plan yet.</Text>
      )}
    </Box>
  );
}

export default Plan;
