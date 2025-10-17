import type { ReactElement } from 'react';
import { Box, Text } from 'ink';

import { createPlanNodes, type PlanNode, type PlanStep } from './planUtils.js';
import PlanDetail from './PlanDetail.js';
import theme, { type Theme } from '../theme.js';
import { toBoxProps, toTextProps, type BoxStyleProps, type TextStyleProps } from '../styleTypes.js';

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

  const headingStyle: TextStyleProps = { ...(planProps.heading ?? {}) };

  if (headingStyle.color === undefined) {
    headingStyle.color = planColors.heading ?? planColors.fg ?? 'blueBright';
  }
  if (headingStyle.bold === undefined) {
    headingStyle.bold = true;
  }

  const containerStyle: BoxStyleProps = { ...(planProps.container ?? {}) };

  if (containerStyle.flexDirection === undefined) {
    containerStyle.flexDirection = 'column';
  }
  if (containerStyle.marginTop === undefined) {
    containerStyle.marginTop = 1;
  }

  if (!containerStyle.backgroundColor && planColors.bg) {
    containerStyle.backgroundColor = planColors.bg;
  }

  const headingProps = toTextProps(headingStyle);
  const containerProps = toBoxProps(containerStyle);

  return (
    <Box {...containerProps}>
      <Text {...headingProps}>Plan</Text>
      {hasSteps ? (
        nodes.map((node) => <PlanDetail key={node.id} node={node} />)
      ) : (
        <Text dimColor>No plan yet.</Text>
      )}
    </Box>
  );
}

export default Plan;
