import React from 'react';
import { Box, Text } from 'ink';

import { buildCommandRenderData } from './commandUtils.js';

const h = React.createElement;

function SummaryLine({ line, index }) {
  switch (line.kind) {
    case 'error-arrow':
      return h(Text, { key: index, color: 'red' }, `└ ${line.text}`);
    case 'error-indent':
      return h(Text, { key: index, color: 'red' }, `   ${line.text}`);
    case 'indent':
      return h(Text, { key: index, dimColor: true }, `   ${line.text}`);
    case 'exit-code':
      return h(
        Text,
        { key: index, color: line.status === 'success' ? 'green' : 'red' },
        `   ${line.text}`,
      );
    case 'arrow':
    default:
      return h(Text, { key: index, dimColor: true }, `└ ${line.text}`);
  }
}

/**
 * Displays command execution details, mirroring the textual summaries.
 */
export function Command({ command, result, preview = {}, execution = {} }) {
  const data = buildCommandRenderData(command, result, preview, execution);

  if (!data) {
    return null;
  }

  const { type, detail, summaryLines } = data;
  const children = [];

  children.push(
    h(
      Text,
      { key: 'heading' },
      h(Text, { color: 'blueBright', bold: true }, type),
      h(Text, null, ` ${detail}`),
    ),
  );

  summaryLines.forEach((line, index) => {
    children.push(h(SummaryLine, { line, index, key: `summary-${index}` }));
  });

  return h(
    Box,
    {
      flexDirection: 'column',
      marginTop: 1,
      paddingX: 1,
      paddingY: 1,
      backgroundColor: 'black',
      width: '100%',
      alignSelf: 'stretch',
      flexGrow: 1,
    },
    children,
  );
}

export default Command;
