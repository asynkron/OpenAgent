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
  const priorityLabel = Number.isFinite(node.priority) ? node.priority : '∞';
  const statusLabel = node.status || 'pending';
  const readinessLabel = node.canExecute
    ? 'ready to run'
    : node.hasMissingDependencies
    ? `waiting on ${node.waitingLabel ? `${node.waitingLabel} (missing)` : 'missing tasks'}`
    : node.waitingForId?.length
    ? `waiting on ${node.waitingLabel || node.waitingForId.join(', ')}`
    : 'waiting';

  const metadataParts = [`status ${statusLabel}`, `priority ${priorityLabel}`, `age ${age}`];
  if (node.id) {
    metadataParts.push(`id ${node.id}`);
  }
  if (readinessLabel) {
    metadataParts.push(readinessLabel);
  }

  return h(
    Box,
    { flexDirection: 'column' },
    h(
      Text,
      null,
      h(Text, { color: node.color }, `${node.symbol} `),
      node.title ? h(Text, null, node.title) : h(Text, { dimColor: true }, '(untitled task)'),
      h(Text, { color: 'gray' }, ` (${metadataParts.join(', ')})`),
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
