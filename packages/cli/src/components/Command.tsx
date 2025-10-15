import type { ReactElement } from 'react';
import { Box, Text } from 'ink';

import {
  buildCommandRenderData,
  type Command as CommandPayload,
  type CommandExecution,
  type CommandPreview,
  type CommandRenderData,
  type CommandResult,
} from './commandUtils.js';
import { SummaryLine } from './command/SummaryLine.js';
import { buildRunPreview, extractRunValue } from './command/runPreview.js';
import { buildPlanStepHeading } from './command/planHeading.js';
import {
  createCommandTheme,
  type BoxStyleProps,
  type SummaryLineStyleMap,
  type TextStyleProps,
} from './command/theme.js';
import type { PlanStep } from './planUtils.js';

const { colors: commandColors, container, heading, headingDetail, summaryLine, runContainer } =
  createCommandTheme();
const commandContainerProps: BoxStyleProps = { ...container };
const commandHeadingProps: TextStyleProps = { ...heading };
const commandHeadingDetailProps: TextStyleProps = { ...headingDetail };
const commandSummaryLineProps: SummaryLineStyleMap = summaryLine;
const commandRunContainerProps: BoxStyleProps = { ...runContainer };

type CommandProps = {
  command: CommandPayload | null | undefined;
  result?: CommandResult | null;
  preview?: CommandPreview | null;
  execution?: CommandExecution | null;
  planStep?: PlanStep | null;
  maxRunCharacters?: number;
};

const DEFAULT_MAX_RUN_CHARACTERS = 270;


/**
 * Displays command execution details, mirroring the textual summaries.
 */
export function Command({
  command: commandData,
  result,
  preview = {},
  execution = {},
  planStep = null,
  maxRunCharacters = DEFAULT_MAX_RUN_CHARACTERS,
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

  const { detail, summaryLines } = data;

  const headingProps: TextStyleProps = { ...commandHeadingProps };
  if (headingProps.color === undefined) {
    headingProps.color = commandColors.fg;
  }

  const headingDetailProps: TextStyleProps = { ...commandHeadingDetailProps };

  const planStepHeading = buildPlanStepHeading(planStep);

  const runValue = extractRunValue(commandData ?? undefined, execution ?? undefined);
  const runCharacterLimit = Number.isFinite(maxRunCharacters)
    ? Math.max(0, Math.floor(maxRunCharacters))
    : DEFAULT_MAX_RUN_CHARACTERS;

  const { block: runElements, inline: inlineRunPreview } = buildRunPreview({
    runValue,
    limit: runCharacterLimit,
    allowInline: !detail,
  });

  const headingDetailText = detail;
  const baseSummaryColorValue = commandSummaryLineProps.base?.color;
  const summaryFallbackColor =
    typeof baseSummaryColorValue === 'string' ? baseSummaryColorValue : commandColors.fg;

  const containerProps: BoxStyleProps = {
    flexDirection: 'column',
    paddingX: 1,
    paddingY: 1,
    width: '100%',
    alignSelf: 'stretch',
    flexGrow: 1,
    ...commandContainerProps,
  };

  const derivedBorderStyle =
    typeof containerProps.borderStyle === 'string' && containerProps.borderStyle
      ? containerProps.borderStyle
      : 'round';
  const derivedBorderColor =
    typeof containerProps.borderColor === 'string' && containerProps.borderColor.trim() !== ''
      ? containerProps.borderColor
      : '#ffffff';

  const rootProps: BoxStyleProps = {
    flexDirection: 'column',
    width: '100%',
    alignSelf: containerProps.alignSelf ?? 'stretch',
    flexGrow: containerProps.flexGrow ?? 1,
    marginTop: containerProps.marginTop ?? 1,
    borderStyle: derivedBorderStyle,
    borderColor: derivedBorderColor,
  };

  delete containerProps.alignSelf;
  delete containerProps.flexGrow;
  delete containerProps.marginTop;
  // Border styling lives on the outer wrapper so the plan header and body share the same frame.
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

  const headingDetailNode = inlineRunPreview
    ? // Avoid overriding the ANSI color codes produced by the markdown renderer.
      (
        <Text>{inlineRunPreview}</Text>
      )
    : headingDetailText
      ? (
          <Text {...(headingDetailProps as Record<string, unknown>)}>{headingDetailText}</Text>
        )
      : null;

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
          <Text color="green">❯</Text>
          <Text> </Text>
          {headingDetailNode}
        </Text>
        {runElements ? (
          <Box {...(runContainerProps as Record<string, unknown>)}>{runElements}</Box>
        ) : null}
        {summaryLines.map((line, index) => (
          <SummaryLine
            key={index}
            line={line}
            styles={commandSummaryLineProps}
            fallbackColor={summaryFallbackColor}
          />
        ))}
      </Box>
    </Box>
  );
}

export default Command;
