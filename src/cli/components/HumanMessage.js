import React from 'react';
import { Box, Text } from 'ink';

import { wrapStructuredContent } from '../render.js';

const h = React.createElement;

/**
 * Renders human-provided inputs within the timeline so conversations stay paired.
 */
export function HumanMessage({ message }) {
  const prepared = wrapStructuredContent(message);

  if (!prepared) {
    return null;
  }

  return h(Box, { flexDirection: 'column', marginTop: 1 }, [
    h(Text, { color: 'greenBright', bold: true, key: 'heading' }, 'You'),
    h(Box, { marginLeft: 2, key: 'body' }, h(Text, null, prepared)),
  ]);
}

export default HumanMessage;
