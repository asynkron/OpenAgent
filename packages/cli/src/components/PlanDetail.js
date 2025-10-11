import React from 'react';
import { Box, Text } from 'ink';

const h = React.createElement;

/**
 * Displays a single plan entry with indentation that mirrors the hierarchy.
 */
export function PlanDetail({ node }) {
  if (!node) {
    return null;
  }

  return h(
    Box,
    { marginLeft: node.depth * 2 },
    h(
      Text,
      null,
      h(Text, { color: node.color }, `${node.symbol} `),
      h(Text, { color: 'cyan' }, node.label),
      h(Text, { color: 'gray' }, '.'),
      node.title ? h(Text, null, ` ${node.title}`) : null,
    ),
  );
}

export default PlanDetail;
