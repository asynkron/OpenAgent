// @ts-nocheck
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
  const hasCommandPreview =
    typeof node.commandPreview === 'string' && node.commandPreview.length > 0;
  const metaParts = [];
  if (node.status) {
    metaParts.push(node.status);
  }
  if (Number.isFinite(node.priority)) {
    metaParts.push(`priority ${node.priority}`);
  }
  if (node.blocked && Array.isArray(node.waitingFor) && node.waitingFor.length > 0) {
    metaParts.push(`waiting for ${node.waitingFor.join(', ')}`);
  }
  metaParts.push(`age ${age}`);
  const metaSuffix = metaParts.length > 0 ? ` -  ${metaParts.join(' • ')}` : '';

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
      metaSuffix ? h(Text, { color: 'gray' }, metaSuffix) : null,
    ),
    hasCommandPreview
      ? h(Text, { color: 'gray' }, '  ↳ ', h(Text, { color: 'white' }, node.commandPreview))
      : null,
  );
}

export default PlanDetail;
