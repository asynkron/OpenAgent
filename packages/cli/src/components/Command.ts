import React from 'react';
import { Box, Text } from 'ink';

import {
  buildCommandRenderData,
  type Command as CommandPayload,
  type CommandExecution,
  type CommandPreview,
  type CommandRenderData,
  type CommandResult,
  type SummaryLine as SummaryLineValue,
} from './commandUtils.js';
import theme from '../theme.js';
import { renderMarkdownMessage } from '../render.js';

const h = React.createElement;
const { command } = theme;
const commandProps = command.props as Record<string, any>;
const commandColors = command.colors;
const commandContainerProps = (commandProps.container ?? {}) as Record<string, unknown>;
const commandHeadingProps = (commandProps.heading ?? {}) as Record<string, unknown>;
const commandHeadingBadgeProps = (commandProps.headingBadge ?? {}) as Record<string, unknown>;
const commandHeadingDetailProps = (commandProps.headingDetail ?? {}) as Record<string, unknown>;
const commandSummaryLineProps = (commandProps.summaryLine ?? {}) as Record<string, any>;
const commandRunContainerProps = (commandProps.runContainer ?? {}) as Record<string, unknown>;

const BEGIN_PATCH_MARKER = '*** Begin Patch';
const END_PATCH_MARKER = '*** End Patch';

type RunSegment =
  | {
      type: 'text';
      content: string;
    }
  | {
      type: 'diff';
      content: string;
    };

type CommandProps = {
  command: CommandPayload | null | undefined;
  result?: CommandResult | null;
  preview?: CommandPreview | null;
  execution?: CommandExecution | null;
};

function splitRunSegments(runValue: string | null | undefined): RunSegment[] | null {
  if (typeof runValue !== 'string' || !runValue.includes(BEGIN_PATCH_MARKER)) {
    return null;
  }

  const segments: RunSegment[] = [];
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

function renderPlainRunLines(content: string | null, baseKey: string): React.ReactElement[] {
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
      return h(
        Text,
        { key: `${baseKey}-${index}`, dimColor: true },
        displayText,
      ) as React.ReactElement;
    })
    .filter((node): node is React.ReactElement => Boolean(node));
}

function renderDiffSegment(content: string, key: string): React.ReactElement {
  const normalized = typeof content === 'string' ? content.trimEnd() : '';
  const markdown = `\`\`\`diff\n${normalized}\n\`\`\``;
  const rendered = renderMarkdownMessage(markdown);
  return h(Text, { key }, rendered) as React.ReactElement;
}

function SummaryLine({
  line,
  index,
}: {
  line: SummaryLineValue;
  index: number;
}): React.ReactElement {
  const baseProps: Record<string, unknown> = {
    key: index,
    ...(commandSummaryLineProps.base ?? {}),
  };
  const baseColor = baseProps.color ?? commandColors.fg;

  const buildProps = (styleKey: keyof typeof commandSummaryLineProps, fallbackColor?: string) => {
    const style = commandSummaryLineProps[styleKey] ?? {};
    const merged: Record<string, unknown> = { ...baseProps, ...style };
    if (!merged.color) {
      merged.color = fallbackColor ?? baseColor;
    }
    return merged;
  };

  const text = `   ${line.text}`;

  switch (line.kind) {
    case 'error-arrow':
    case 'error-indent':
      return h(Text, buildProps('error', 'red'), text) as React.ReactElement;
    case 'indent':
      return h(Text, buildProps('indent'), text) as React.ReactElement;
    case 'exit-code': {
      const statusKey = line.status === 'success' ? 'success' : 'error';
      const fallbackColor = line.status === 'success' ? 'green' : 'red';
      return h(Text, buildProps(statusKey, fallbackColor), text) as React.ReactElement;
    }
    case 'arrow':
      return h(Text, buildProps('arrow'), text) as React.ReactElement;
    default:
      return h(Text, buildProps('default'), text) as React.ReactElement;
  }
}

function extractRunValue(
  commandData: CommandPayload | null | undefined,
  execution: CommandExecution | null | undefined,
): string | null {
  if (execution?.command && typeof execution.command.run === 'string') {
    return execution.command.run;
  }
  if (commandData && typeof commandData.run === 'string') {
    return commandData.run;
  }
  return null;
}

/**
 * Displays command execution details, mirroring the textual summaries.
 */
export function Command({
  command: commandData,
  result,
  preview = {},
  execution = {},
}: CommandProps): React.ReactElement | null {
  const data: CommandRenderData | null = buildCommandRenderData(
    commandData ?? undefined,
    result ?? undefined,
    preview ?? undefined,
    execution ?? undefined,
  );

  if (!data) {
    return null;
  }

  const { type, detail, summaryLines } = data;
  const children: React.ReactElement[] = [];

  const headingProps: Record<string, unknown> = { key: 'heading', ...commandHeadingProps };
  if (headingProps.color === undefined) {
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
    ) as React.ReactElement,
  );

  const runValue = extractRunValue(commandData ?? undefined, execution ?? undefined);
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
      const runContainerProps: Record<string, unknown> = Object.assign(
        {
          key: 'command-run',
          flexDirection: 'column',
          marginTop: 1,
        },
        commandRunContainerProps,
      );
      if (!runContainerProps.flexDirection) {
        runContainerProps.flexDirection = 'column';
      }

      children.push(h(Box, runContainerProps, runElements) as React.ReactElement);
    }
  }

  summaryLines.forEach((line, index) => {
    children.push(SummaryLine({ line, index }));
  });

  const containerProps: Record<string, unknown> = Object.assign(
    {
      flexDirection: 'column',
      marginTop: 1,
      paddingX: 1,
      paddingY: 1,
      width: '100%',
      alignSelf: 'stretch',
      flexGrow: 1,
      borderStyle: 'round',
    },
    commandContainerProps,
  );

  if (!containerProps.color) {
    containerProps.color = commandColors.fg;
  }

  return h(Box, containerProps, children) as React.ReactElement;
}

export default Command;
