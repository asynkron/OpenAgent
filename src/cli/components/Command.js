import React from 'react';
import { Box, Text } from 'ink';

import { buildCommandRenderData } from './commandUtils.js';
import theme from '../theme.js';
import { renderMarkdownMessage } from '../render.js';

const h = React.createElement;
const { command } = theme;
const { colors: commandColors, props: commandProps } = command;
const commandContainerProps = commandProps?.container ?? {};
const commandHeadingProps = commandProps?.heading ?? {};
const commandHeadingBadgeProps = commandProps?.headingBadge ?? {};
const commandHeadingDetailProps = commandProps?.headingDetail ?? {};
const commandSummaryLineProps = commandProps?.summaryLine ?? {};
const commandRunContainerProps = commandProps?.runContainer ?? {};

const BEGIN_PATCH_MARKER = '*** Begin Patch';
const END_PATCH_MARKER = '*** End Patch';

function splitRunSegments(runValue) {
  if (typeof runValue !== 'string' || !runValue.includes(BEGIN_PATCH_MARKER)) {
    return null;
  }

  const segments = [];
  let cursor = 0;

  while (cursor < runValue.length) {
    const begin = runValue.indexOf(BEGIN_PATCH_MARKER, cursor);
    if (begin === -1) {
      const remaining = runValue.slice(cursor);
      if (remaining) {
        segments.push({ type: 'text', content: remaining });
      }
      break;
    }

    if (begin > cursor) {
      segments.push({ type: 'text', content: runValue.slice(cursor, begin) });
    }

    const endIndex = runValue.indexOf(END_PATCH_MARKER, begin);
    if (endIndex === -1) {
      segments.push({ type: 'text', content: runValue.slice(begin) });
      break;
    }

    let afterEnd = endIndex + END_PATCH_MARKER.length;
    if (runValue[afterEnd] === '\r' && runValue[afterEnd + 1] === '\n') {
      afterEnd += 2;
    } else if (runValue[afterEnd] === '\n') {
      afterEnd += 1;
    }

    const diffContent = runValue.slice(begin, afterEnd);
    segments.push({ type: 'diff', content: diffContent });
    cursor = afterEnd;
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.some((segment) => segment.type === 'diff') ? segments : null;
}

function renderPlainRunLines(content, baseKey) {
  if (!content) {
    return [];
  }

  return content
    .split('\n')
    .map((line, index, lines) => {
      if (index === lines.length - 1 && line === '') {
        return null;
      }
      const displayText = line === '' ? ' ' : line;
      return h(Text, { key: `${baseKey}-${index}`, dimColor: true }, displayText);
    })
    .filter(Boolean);
}

function renderDiffSegment(content, key) {
  const normalized = typeof content === 'string' ? content.trimEnd() : '';
  const markdown = `\`\`\`diff\n${normalized}\n\`\`\``;
  const rendered = renderMarkdownMessage(markdown);
  return h(Text, { key }, rendered);
}

function SummaryLine({ line, index }) {
  const baseProps = { key: index, ...(commandSummaryLineProps.base ?? {}) };
  const baseColor = baseProps.color ?? commandColors.fg;

  const buildProps = (styleKey, fallbackColor) => {
    const style = commandSummaryLineProps[styleKey] ?? {};
    const merged = { ...baseProps, ...style };
    if (!merged.color) {
      merged.color = fallbackColor ?? baseColor;
    }
    return merged;
  };

  const text = `   ${line.text}`;

  switch (line.kind) {
    case 'error-arrow':
    case 'error-indent':
      return h(Text, buildProps('error', 'red'), text);
    case 'indent':
      return h(Text, buildProps('indent'), text);
    case 'exit-code': {
      const statusKey = line.status === 'success' ? 'success' : 'error';
      const fallbackColor = line.status === 'success' ? 'green' : 'red';
      return h(Text, buildProps(statusKey, fallbackColor), text);
    }
    case 'arrow':
      return h(Text, buildProps('arrow'), text);
    default:
      return h(Text, buildProps('default'), text);
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

  const headingProps = { key: 'heading', ...commandHeadingProps };
  if (!headingProps.color) {
    headingProps.color = commandColors.fg;
  }

  const headingBadgeProps = { ...commandHeadingBadgeProps };
  if (!headingBadgeProps.backgroundColor) {
    headingBadgeProps.backgroundColor = commandColors.headerBg;
  }
  if (!headingBadgeProps.color) {
    headingBadgeProps.color = commandColors.fg;
  }
  if (headingBadgeProps.bold === undefined) {
    headingBadgeProps.bold = true;
  }

  const headingDetailProps = { ...commandHeadingDetailProps };

  children.push(
    h(
      Text,
      headingProps,
      h(Text, headingBadgeProps, ` ${type} `),
      h(Text, headingDetailProps, ` ${detail}`),
    ),
  );

  const runValue =
    (execution?.command && typeof execution.command.run === 'string'
      ? execution.command.run
      : typeof commandData?.run === 'string'
        ? commandData.run
        : null) || null;
  const runSegments = splitRunSegments(runValue);

  if (runSegments) {
    const runElements = runSegments.flatMap((segment, index) => {
      if (!segment.content) {
        return [];
      }
      if (segment.type === 'diff') {
        return [renderDiffSegment(segment.content, `run-diff-${index}`)];
      }
      return renderPlainRunLines(segment.content, `run-text-${index}`);
    });

    if (runElements.length > 0) {
      const runContainerProps = {
        key: 'command-run',
        flexDirection: 'column',
        marginTop: 1,
        ...commandRunContainerProps,
      };
      if (!runContainerProps.flexDirection) {
        runContainerProps.flexDirection = 'column';
      }

      children.push(h(Box, runContainerProps, runElements));
    }
  }

  summaryLines.forEach((line, index) => {
    children.push(h(SummaryLine, { line, index, key: `summary-${index}` }));
  });

  const containerProps = {
    borderStyle: 'round',
    flexDirection: 'column',
    marginTop: 1,
    paddingX: 1,
    paddingY: 1,
    backgroundColor: commandColors.bg,
    width: '100%',
    alignSelf: 'stretch',
    flexGrow: 1,
    ...commandContainerProps,
  };

  if (!containerProps.backgroundColor) {
    containerProps.backgroundColor = commandColors.bg;
  }

  return h(Box, containerProps, children);
}

export default Command;
