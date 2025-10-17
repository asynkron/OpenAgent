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
import { toBoxProps, toTextProps } from '../styleTypes.js';
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
function Command({
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

  const headingStyle: TextStyleProps = { ...commandHeadingProps };
  if (headingStyle.color === undefined) {
    headingStyle.color = commandColors.fg;
  }

  const headingDetailStyle: TextStyleProps = { ...commandHeadingDetailProps };

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

  const containerStyle: BoxStyleProps = {
    flexDirection: 'column',
    paddingX: 1,
    paddingY: 1,
    width: '100%',
    alignSelf: 'stretch',
    flexGrow: 1,
    ...commandContainerProps,
  };

  const derivedBorderStyle =
    typeof containerStyle.borderStyle === 'string' && containerStyle.borderStyle
      ? containerStyle.borderStyle
      : 'round';
  const derivedBorderColor =
    typeof containerStyle.borderColor === 'string' && containerStyle.borderColor.trim() !== ''
      ? containerStyle.borderColor
      : '#ffffff';

  const rootProps: BoxStyleProps = {
    flexDirection: 'column',
    width: '100%',
    alignSelf: containerStyle.alignSelf ?? 'stretch',
    flexGrow: containerStyle.flexGrow ?? 1,
    marginTop: containerStyle.marginTop ?? 1,
    borderStyle: derivedBorderStyle,
    borderColor: derivedBorderColor,
  };

  delete containerStyle.alignSelf;
  delete containerStyle.flexGrow;
  delete containerStyle.marginTop;
  // Border styling lives on the outer wrapper so the plan header and body share the same frame.
  delete containerStyle.borderStyle;
  delete containerStyle.borderColor;

  if (!containerStyle.backgroundColor) {
    containerStyle.backgroundColor = 'black';
  }

  const runContainerStyle: BoxStyleProps = {
    flexDirection: 'column',
    marginTop: 1,
    ...commandRunContainerProps,
  };
  if (!runContainerStyle.flexDirection) {
    runContainerStyle.flexDirection = 'column';
  }

  const horizontalPadding =
    typeof containerStyle.paddingX === 'number' ? containerStyle.paddingX : 1;

  const planHeaderProps: BoxStyleProps = {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingX: horizontalPadding,
    paddingY: 0,
    backgroundColor: '#1f1f1f',
  };

  const planHeadingColor =
    typeof headingStyle.color === 'string' ? headingStyle.color : commandColors.fg;

  const headingProps = toTextProps(headingStyle);
  const headingDetailProps = toTextProps(headingDetailStyle);
  const containerProps = toBoxProps(containerStyle);
  const runContainerProps = toBoxProps(runContainerStyle);
  const rootBoxProps = toBoxProps(rootProps);
  const planHeaderBoxProps = toBoxProps(planHeaderProps);

  const headingDetailNode = inlineRunPreview
    ? // Avoid overriding the ANSI color codes produced by the markdown renderer.
      (
        <Text>{inlineRunPreview}</Text>
      )
    : headingDetailText
      ? (
          <Text {...headingDetailProps}>{headingDetailText}</Text>
        )
      : null;

  return (
    <Box {...rootBoxProps}>
      <Box {...planHeaderBoxProps}>
        <Text color="#ff5f56">●</Text>
        <Text> </Text>
        <Text color="#ffbd2e">●</Text>
        <Text> </Text>
        <Text color="#28c840">●</Text>
        {planStepHeading ? <Text color={planHeadingColor}>{`  ${planStepHeading}`}</Text> : null}
      </Box>
      <Box {...containerProps}>
        <Text {...headingProps}>
          <Text color="green">❯</Text>
          <Text> </Text>
          {headingDetailNode}
        </Text>
        {runElements ? (
          <Box {...runContainerProps}>{runElements}</Box>
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
