import React from 'react';
import { Box, Text } from 'ink';

import { createPlanNodes } from './planUtils.js';
import PlanDetail from './PlanDetail.js';

const h = React.createElement;

/**
 * High-level plan renderer that lists every step using `PlanDetail` rows.
 */
export function Plan({ plan }) {
  const nodes = createPlanNodes(plan);

  if (nodes.length === 0) {
    return null;
  }

  const children = [h(Text, { color: 'blueBright', bold: true, key: 'heading' }, 'Plan')];
  for (const node of nodes) {
    children.push(h(PlanDetail, { key: node.id, node }));
  }

  return h(Box, { flexDirection: 'column', marginTop: 1 }, children);
}

export default Plan;
