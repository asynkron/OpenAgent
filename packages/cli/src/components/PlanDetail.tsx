import type { ReactElement } from 'react';
import { Box, Text } from 'ink';

import type { PlanNode } from './planUtils.js';

type PlanDetailProps = {
  node?: PlanNode | null;
};

/**
 * Displays a single plan entry with indentation that mirrors the hierarchy.
 */
export function PlanDetail({ node }: PlanDetailProps): ReactElement | null {
  if (!node) {
    return null;
  }

  const age = typeof node.age === 'number' && Number.isFinite(node.age) ? node.age : 0;
  const hasCommandPreview =
    typeof node.commandPreview === 'string' && node.commandPreview.length > 0;
  const metaParts: string[] = [];
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

  return (
    <Box marginLeft={node.depth * 2} flexDirection="column">
      <Text>
        <Text color={node.color}>{`${node.symbol} `}</Text>
        <Text color="cyan">{node.label}</Text>
        <Text color="gray">.</Text>
        {node.title ? <Text>{` ${node.title}`}</Text> : null}
        {metaSuffix ? <Text color="gray">{metaSuffix}</Text> : null}
      </Text>
      {hasCommandPreview ? (
        <Text color="gray">
          {'  ↳ '}
          <Text color="white">{node.commandPreview}</Text>
        </Text>
      ) : null}
    </Box>
  );
}

export default PlanDetail;
