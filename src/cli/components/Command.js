import React from 'react';
import { Box, Text } from 'ink';

import { buildCommandRenderData } from './commandUtils.js';
import theme from '../theme.js';

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
  const lines = [];

  lines.push(
    h(
      Text,
      { key: 'heading', color: theme.command.fg },
      h(Text, { color: 'blueBright', bold: true }, type),
      h(Text, null, ` ${detail}`),
    ),
  );

  summaryLines.forEach((line, index) => {
    lines.push(h(SummaryLine, { line, index, key: `summary-${index}` }));
  });

  const header = h(
    Box,
    {
      key: 'window-header',
      width: '100%',
      paddingX: 1,
      paddingY: 0,
      height: 1,
      backgroundColor: theme.command.headerBg ?? theme.command.bg,
      alignItems: 'center',
      gap: 1,
    },
    h(Text, { color: '#ff5f56' }, '●'),
    h(Text, { color: '#ffbd2e' }, '●'),
    h(Text, { color: '#27c93f' }, '●'),
  );

  const content = h(
    Box,
    {
      key: 'command-body',
      flexDirection: 'column',
      paddingX: 1,
      paddingY: 1,
      backgroundColor: theme.command.bg,
      width: '100%',
      alignSelf: 'stretch',
      flexGrow: 1,
    },
    ...lines,
  );

  return h(
    Box,
    {
      flexDirection: 'column',
      marginTop: 1,
      width: '100%',
      alignSelf: 'stretch',
      flexGrow: 1,
    },
    header,
    content,
  );
}

export default Command;
