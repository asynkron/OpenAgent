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

  const age = typeof node.age === 'number' && Number.isFinite(node.age) ? node.age : 0;
  const hasCommandPreview = typeof node.commandPreview === 'string' && node.commandPreview.length > 0;

  return h(
    Box,
    { marginLeft: node.depth * 2, flexDirection: 'column' },
    h(
      Text,
      null,
      h(Text, { color: node.color }, `${node.symbol} `),
      h(Text, { color: 'cyan' }, node.label),
      h(Text, { color: 'gray' }, '.'),
      node.title ? h(Text, null, ` ${node.title}`) : null,
      h(Text, { color: 'gray' }, ` (age ${age})`),
    ),
    hasCommandPreview
      ? h(
          Text,
          { color: 'gray' },
          '  ↳ ',
          h(Text, { color: 'white' }, node.commandPreview),
        )
      : null,
  );
}

export default PlanDetail;
