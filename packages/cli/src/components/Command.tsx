import { memo, type ReactElement, useEffect, useState } from 'react';
import { Box, Text } from 'ink';

import {
  buildCommandRenderData,
  type Command as CommandPayload,
  type CommandExecution,
  type CommandPreview,
  type CommandRenderData,
  type CommandResult,
} from './commandUtils.js';
import { buildRunPreview, extractRunValue } from './command/runPreview.js';
import { buildPlanStepHeading } from './command/planHeading.js';
import {
  createCommandTheme,
  type BoxStyleProps,
  type TextStyleProps,
} from './command/theme.js';
import { toBoxProps, toTextProps } from '../styleTypes.js';
import type { PlanStep } from './planUtils.js';

function normalizeStatus(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

const { colors: commandColors, container, heading, headingDetail, runContainer } = createCommandTheme();

const commandContainerProps: BoxStyleProps = { ...container };
const commandHeadingProps: TextStyleProps = { ...heading };
const commandHeadingDetailProps: TextStyleProps = { ...headingDetail };
const commandRunContainerProps: BoxStyleProps = { ...runContainer };

export type CommandProps = {
  command: CommandPayload | null | undefined;
  result?: CommandResult | null;
  preview?: CommandPreview | null;
  execution?: CommandExecution | null;
  planStep?: PlanStep | null;
  observation?: string | null;
  maxRunCharacters?: number;
  // external control to expand/collapse this command (from Timeline hotkeys)
  expandAll?: boolean;
};

const DEFAULT_MAX_RUN_CHARACTERS = 270;

function computeStatusEmoji(
  execution: CommandExecution | null | undefined,
  planStep: PlanStep | null | undefined,
  result: CommandResult | null | undefined,
): string {
  const status = normalizeStatus(planStep && (planStep as { status?: unknown }).status);
  if (status === 'failed' || status === 'abandoned' || status === 'cancelled') {
    return '❌';
  }
  if (status === 'completed' || status === 'succeeded') {
    return '✅';
  }

  if (result && typeof result.exit_code === 'number') {
    return result.exit_code === 0 ? '✅' : '❌';
  }
  if (result && result.killed === true) {
    return '❌';
  }

  const waitingIds = (planStep && Array.isArray(planStep.waitingForId) ? planStep.waitingForId : []) as ReadonlyArray<string | null | undefined>;
  const waiting = waitingIds.some((id) => typeof id === 'string' && id.trim().length > 0);

  const exec = execution ?? null;
  const execStatus = normalizeStatus(exec && (exec as { status?: unknown }).status);
  if (execStatus === 'completed' || execStatus === 'succeeded') {
    return '✅';
  }
  if (execStatus === 'failed') {
    return '❌';
  }

  const done = Boolean((exec as { done?: boolean } | null)?.done);
  if (done) {
    return '✅';
  }

  const started = Boolean(
    (exec as { started?: boolean } | null)?.started ||
      (exec as { running?: boolean } | null)?.running ||
      (exec as { in_progress?: boolean } | null)?.in_progress,
  );

  if (started) {
    return waiting ? '⏳' : '▶️';
  }

  return waiting ? '⏳' : '💤';
}

function Command({
  command: commandData,
  result,
  preview = {},
  execution = {},
  planStep = null,
  observation = null,
  maxRunCharacters = DEFAULT_MAX_RUN_CHARACTERS,
  expandAll,
}: CommandProps): ReactElement | null {
  const [expanded, setExpanded] = useState<boolean>(Boolean(expandAll));
  useEffect(() => {
    if (typeof expandAll === 'boolean') setExpanded(expandAll);
  }, [expandAll]);

  const data: CommandRenderData | null = buildCommandRenderData(
    commandData ?? undefined,
    result ?? undefined,
    preview ?? undefined,
    execution ?? undefined,
  );

  if (!data) {
    return null;
  }

  const { detail } = data;

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

  const hasExecution = execution !== null && execution !== undefined;
  const hasResult = result !== null && result !== undefined;
  const shouldTailTruncateRun = !hasResult && !hasExecution;

  const { block: runElements } = buildRunPreview({
    runValue,
    limit: runCharacterLimit,
    allowInline: !detail,
    truncateDirection: shouldTailTruncateRun ? 'end' : 'start',
  });

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
  // Border styling lives on the outer wrapper so the header and body share the same frame.
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

  const horizontalPadding = typeof containerStyle.paddingX === 'number' ? containerStyle.paddingX : 1;

  const planHeaderProps: BoxStyleProps = {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingX: horizontalPadding,
    paddingY: 0,
    backgroundColor: '#1f1f1f',
  };

  const planHeadingColor = typeof headingStyle.color === 'string' ? headingStyle.color : commandColors.fg;

  const headingDetailProps = toTextProps(headingDetailStyle);
  const containerProps = toBoxProps(containerStyle);
  const runContainerProps = toBoxProps(runContainerStyle);
  const rootBoxProps = toBoxProps(rootProps);
  const planHeaderBoxProps = toBoxProps(planHeaderProps);

  const statusEmoji = computeStatusEmoji(execution, planStep, result ?? null);

  return (
    <Box {...rootBoxProps}>
      <Box {...planHeaderBoxProps}>
        <Text>{statusEmoji}</Text>
        {planStepHeading ? <Text color={planHeadingColor}>{`  ${planStepHeading}`}</Text> : null}
      </Box>
      <Box {...containerProps}>
        {expanded ? (
          <>
            {/* Run preview (no shell prompt) */}
            {runElements ? <Box {...runContainerProps}>{runElements}</Box> : null}
            {/* Output details */}
            {typeof observation === 'string' && observation.length > 0 ? (
              <Text {...headingDetailProps}>{String(observation)}</Text>
            ) : null}
            {result !== null && result !== undefined ? (
              <Text>{JSON.stringify(result)}</Text>
            ) : null}
          </>
        ) : null}
      </Box>
    </Box>
  );
}

export default memo(Command);
