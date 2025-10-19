import { memo, type ReactElement } from 'react';
import { Box, Text } from 'ink';

import {
  type Command as CommandPayload,
  type CommandExecution,
  type CommandPreview,
  type CommandResult,
} from './commandUtils.js';
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

const { colors: commandColors, container, heading } = createCommandTheme();

const commandHeadingProps: TextStyleProps = { ...heading };

export interface CommandProps {
  command: CommandPayload | null | undefined;
  result?: CommandResult | null;
  preview?: CommandPreview | null;
  execution?: CommandExecution | null;
  planStep?: PlanStep | null;
  observation?: string | null;
  maxRunCharacters?: number;
  expandAll?: boolean;
}

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

  const waitingIds = (planStep && Array.isArray(planStep.waitingForId) ? planStep.waitingForId : []) as ReadonlyArray<
    string | null | undefined
  >;
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
  execution = {},
  planStep = null,
}: CommandProps): ReactElement | null {
  if (!commandData && !planStep) {
    return null;
  }

  const headingStyle: TextStyleProps = { ...commandHeadingProps };
  if (headingStyle.color === undefined) {
    headingStyle.color = commandColors.fg;
  }

  const planStepHeading = buildPlanStepHeading(planStep);

  const containerStyle: BoxStyleProps = {
    flexDirection: 'column',
    paddingX: 1,
    paddingY: 1,
    width: '100%',
    alignSelf: 'stretch',
    flexGrow: 1,
    ...container,
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
  delete containerStyle.borderStyle;
  delete containerStyle.borderColor;

  if (!containerStyle.backgroundColor) {
    containerStyle.backgroundColor = 'black';
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

  const planHeadingColor =
    typeof headingStyle.color === 'string' ? headingStyle.color : commandColors.fg;

  const rootBoxProps = toBoxProps(rootProps);
  const planHeaderBoxProps = toBoxProps(planHeaderProps);
  const headerTextProps = toTextProps(headingStyle);

  const statusEmoji = computeStatusEmoji(execution, planStep, result ?? null);

  return (
    <Box {...rootBoxProps}>
      <Box {...planHeaderBoxProps}>
        <Text>{statusEmoji}</Text>
        <Text {...headerTextProps}>
          {`  Task${planStepHeading ? ` ${planStepHeading}` : ''}`}
        </Text>
      </Box>
    </Box>
  );
}

export default memo(Command);
