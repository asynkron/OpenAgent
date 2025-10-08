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
      return h(Text, { key: index, color: line.status === 'success' ? 'green' : 'red' }, `   ${line.text}`);
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

  const { type, detail, description, summaryLines } = data;
  const children = [];

  if (description) {
    children.push(
      h(
        Text,
        { key: 'description' },
        h(Text, { color: 'blueBright', bold: true }, 'DESCRIPTION'),
        h(Text, null, ` ${description}`),
      ),
    );
  }

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

  return h(Box, { flexDirection: 'column', marginTop: 1 }, children);
}

export default Command;
