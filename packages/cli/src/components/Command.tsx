import type { ReactElement } from 'react';
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
import type { PlanStep } from './planUtils.js';

const { command } = theme;
type TextStyleProps = Record<string, unknown>;
type BoxStyleProps = Record<string, unknown>;
type SummaryLineStyleMap = Record<string, TextStyleProps> & { base?: TextStyleProps };

type CommandThemeProps = {
  container?: BoxStyleProps;
  heading?: TextStyleProps;
  headingBadge?: TextStyleProps;
  headingDetail?: TextStyleProps;
  summaryLine?: SummaryLineStyleMap;
  runContainer?: BoxStyleProps;
};

const commandThemeProps = (command.props ?? {}) as CommandThemeProps;
const commandColors = command.colors;
const commandContainerProps: BoxStyleProps = { ...(commandThemeProps.container ?? {}) };
const commandHeadingProps: TextStyleProps = { ...(commandThemeProps.heading ?? {}) };
const commandHeadingBadgeProps: TextStyleProps = { ...(commandThemeProps.headingBadge ?? {}) };
const commandHeadingDetailProps: TextStyleProps = { ...(commandThemeProps.headingDetail ?? {}) };
const commandSummaryLineProps: SummaryLineStyleMap = commandThemeProps.summaryLine ?? {};
const commandRunContainerProps: BoxStyleProps = { ...(commandThemeProps.runContainer ?? {}) };

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
  planStep?: PlanStep | null;
};

function buildPlanStepHeading(planStep: PlanStep | null | undefined): string | null {
  if (!planStep || typeof planStep !== 'object') {
    return null;
  }

  const idValue = planStep.id;
  const titleValue = planStep.title;

  const idText =
    typeof idValue === 'string' || typeof idValue === 'number' ? String(idValue).trim() : '';
  const titleText = typeof titleValue === 'string' ? titleValue.trim() : '';

  if (idText && titleText) {
    return `#${idText} — ${titleText}`;
  }
  if (idText) {
    return `#${idText}`;
  }
  if (titleText) {
    return titleText;
  }

  return null;
}

function formatPlanStepSummary(planStep: PlanStep | null | undefined): string | null {
  if (!planStep || typeof planStep !== 'object') {
    return null;
  }

  const statusValue = planStep.status;
  const statusText = typeof statusValue === 'string' ? statusValue.trim() : '';

  if (!statusText) {
    return null;
  }

  return `Plan step status: ${statusText}`;
}

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

function renderPlainRunLines(content: string | null, baseKey: string): ReactElement[] {
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
      return (
        <Text key={`${baseKey}-${index}`} dimColor>
          {displayText}
        </Text>
      );
    })
    .filter((node): node is ReactElement => Boolean(node));
}

function renderDiffSegment(content: string, key: string): ReactElement {
  const normalized = typeof content === 'string' ? content.trimEnd() : '';
  const markdown = `\`\`\`diff\n${normalized}\n\`\`\``;
  const rendered = renderMarkdownMessage(markdown);
  return <Text key={key}>{rendered}</Text>;
}

function SummaryLine({ line }: { line: SummaryLineValue }): ReactElement {
  const baseProps: TextStyleProps = {
    ...(commandSummaryLineProps.base ?? {}),
  };
  const baseColor = baseProps.color ?? commandColors.fg;

  const buildProps = (
    styleKey: keyof SummaryLineStyleMap,
    fallbackColor?: string,
  ): TextStyleProps => {
    const style = commandSummaryLineProps[styleKey] ?? {};
    const merged: TextStyleProps = { ...baseProps, ...style };
    if (!merged.color) {
      merged.color = fallbackColor ?? baseColor;
    }
    return merged;
  };

  const text = `   ${line.text}`;

  switch (line.kind) {
    case 'error-arrow':
    case 'error-indent':
      return <Text {...(buildProps('error', 'red') as Record<string, unknown>)}>{text}</Text>;
    case 'indent':
      return <Text {...(buildProps('indent') as Record<string, unknown>)}>{text}</Text>;
    case 'exit-code': {
      const statusKey = line.status === 'success' ? 'success' : 'error';
      const fallbackColor = line.status === 'success' ? 'green' : 'red';
      return (
        <Text {...(buildProps(statusKey, fallbackColor) as Record<string, unknown>)}>{text}</Text>
      );
    }
    case 'arrow':
      return <Text {...(buildProps('arrow') as Record<string, unknown>)}>{text}</Text>;
    default:
      return <Text {...(buildProps('default') as Record<string, unknown>)}>{text}</Text>;
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
  planStep = null,
}: CommandProps): ReactElement | null {
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

  const headingProps: TextStyleProps = { ...commandHeadingProps };
  if (headingProps.color === undefined) {
    headingProps.color = commandColors.fg;
  }

  const headingBadgeProps: TextStyleProps = { ...commandHeadingBadgeProps };
  if (!headingBadgeProps.backgroundColor) {
    headingBadgeProps.backgroundColor = commandColors.headerBg;
  }
  if (!headingBadgeProps.color) {
    headingBadgeProps.color = commandColors.fg;
  }
  if (headingBadgeProps.bold === undefined) {
    headingBadgeProps.bold = true;
  }

  const headingDetailProps: TextStyleProps = { ...commandHeadingDetailProps };

  const planStepHeading = buildPlanStepHeading(planStep);
  const planStepSummary = formatPlanStepSummary(planStep);
  const planStepDetailProps: TextStyleProps = { ...headingDetailProps };
  if (!planStepDetailProps.color && headingDetailProps.color) {
    planStepDetailProps.color = headingDetailProps.color;
  }
  if (planStepDetailProps.dimColor === undefined) {
    planStepDetailProps.dimColor = true;
  }

  const runValue = extractRunValue(commandData ?? undefined, execution ?? undefined);
  const runSegments = splitRunSegments(runValue);

  let runElements: ReactElement[] | null = null;
  if (runSegments) {
    const segments = runSegments.flatMap((segment, index) => {
      if (!segment.content) {
        return [] as ReactElement[];
      }
      if (segment.type === 'diff') {
        return [renderDiffSegment(segment.content, `run-diff-${index}`)];
      }
      return renderPlainRunLines(segment.content, `run-text-${index}`);
    });

    if (segments.length > 0) {
      runElements = segments;
    }
  }

  const containerProps: BoxStyleProps = {
    flexDirection: 'column',
    paddingX: 1,
    paddingY: 1,
    width: '100%',
    alignSelf: 'stretch',
    flexGrow: 1,
    ...commandContainerProps,
  };

  const rootProps: BoxStyleProps = {
    flexDirection: 'column',
    width: '100%',
    alignSelf: containerProps.alignSelf ?? 'stretch',
    flexGrow: containerProps.flexGrow ?? 1,
    marginTop: containerProps.marginTop ?? 1,
  };

  delete containerProps.alignSelf;
  delete containerProps.flexGrow;
  delete containerProps.marginTop;
  delete containerProps.borderStyle;
  delete containerProps.borderColor;

  if (!containerProps.color) {
    containerProps.color = commandColors.fg;
  }
  if (!containerProps.backgroundColor) {
    containerProps.backgroundColor = 'black';
  }

  const runContainerProps: BoxStyleProps = {
    flexDirection: 'column',
    marginTop: 1,
    ...commandRunContainerProps,
  };
  if (!runContainerProps.flexDirection) {
    runContainerProps.flexDirection = 'column';
  }

  const horizontalPadding =
    typeof containerProps.paddingX === 'number' ? containerProps.paddingX : 1;

  const planHeaderProps: BoxStyleProps = {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingX: horizontalPadding,
    paddingY: 0,
    backgroundColor: '#1f1f1f',
  };

  const planHeadingColor =
    typeof headingProps.color === 'string' ? (headingProps.color as string) : commandColors.fg;

  return (
    <Box {...(rootProps as Record<string, unknown>)}>
      <Box {...(planHeaderProps as Record<string, unknown>)}>
        <Text color="#ff5f56">●</Text>
        <Text> </Text>
        <Text color="#ffbd2e">●</Text>
        <Text> </Text>
        <Text color="#28c840">●</Text>
        {planStepHeading ? <Text color={planHeadingColor}>{`  ${planStepHeading}`}</Text> : null}
      </Box>
      <Box {...(containerProps as Record<string, unknown>)}>
        <Text {...(headingProps as Record<string, unknown>)}>
          <Text {...(headingBadgeProps as Record<string, unknown>)}>{` ${type} `}</Text>
          <Text {...(headingDetailProps as Record<string, unknown>)}>{` ${detail}`}</Text>
          {planStepSummary ? (
            <Text
              {...(planStepDetailProps as Record<string, unknown>)}
            >{` • ${planStepSummary}`}</Text>
          ) : null}
        </Text>
        {runElements ? (
          <Box {...(runContainerProps as Record<string, unknown>)}>{runElements}</Box>
        ) : null}
        {summaryLines.map((line, index) => (
          <SummaryLine key={index} line={line} />
        ))}
      </Box>
    </Box>
  );
}

export default Command;
