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

  return h(
    Box,
    {
      flexDirection: 'column',
      marginTop: 1,
      paddingX: 1,
      paddingY: 1,
      backgroundColor: '#1f1f1f',
      width: '100%',
      alignSelf: 'stretch',
      flexGrow: 1,
    },
    h(Text, null, prepared),
  );
}

export default HumanMessage;
