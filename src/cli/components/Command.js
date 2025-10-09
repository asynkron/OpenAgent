import React from 'react';
import { Box, Text } from 'ink';

import { buildCommandRenderData } from './commandUtils.js';
import theme from '../theme.js';

const h = React.createElement;
const { command } = theme;

function SummaryLine({ line, index }) {
  const baseProps = { key: index, color: command.fg };

  switch (line.kind) {
    case 'error-arrow':
      return h(Text, { ...baseProps, color: 'red' }, `└ ${line.text}`);
    case 'error-indent':
      return h(Text, { ...baseProps, color: 'red' }, `   ${line.text}`);
    case 'indent':
      return h(Text, { ...baseProps, dimColor: true }, `   ${line.text}`);
    case 'exit-code':
      return h(
        Text,
        { ...baseProps, color: line.status === 'success' ? 'green' : 'red' },
        `   ${line.text}`,
      );
    case 'arrow':
    default:
      return h(Text, { ...baseProps, dimColor: true }, `└ ${line.text}`);
  }
}

/**
 * Displays command execution details, mirroring the textual summaries.
 */
export function Command({ command: commandData, result, preview = {}, execution = {} }) {
  const data = buildCommandRenderData(commandData, result, preview, execution);

  if (!data) {
    return null;
  }

  const { type, detail, summaryLines } = data;
  const children = [];

  children.push(
    h(
      Text,
      { key: 'heading', color: command.fg },
      h(Text, { backgroundColor: command.headerBg, color: command.fg, bold: true }, ` ${type} `),
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
      backgroundColor: command.bg,
      width: '100%',
      alignSelf: 'stretch',
      flexGrow: 1,
    },
    children,
  );
}

export default Command;
