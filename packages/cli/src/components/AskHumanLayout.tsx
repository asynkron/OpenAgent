import { type ReactElement } from 'react';
import { Box, Text } from 'ink';
import type { BoxProps } from 'ink';
import Spinner from 'ink-spinner';
import ContextUsage from './ContextUsage.js';
import InkTextArea from './InkTextArea.js';
import {
  defaultAskHumanViewProps,
  type AskHumanViewProps,
} from './askHumanViewProps.js';
import { HUMAN_SLASH_COMMANDS } from './askHumanCommands.js';
import type { ContextUsage as ContextUsageValue } from '../status.js';

const toNonNegativeInteger = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
};

const resolveHorizontalBoxSpacing = (props: BoxProps | undefined): number => {
  if (!props) {
    return 0;
  }
  const basePadding = toNonNegativeInteger(props.padding);
  const horizontalPadding =
    props.paddingX !== undefined ? toNonNegativeInteger(props.paddingX) : basePadding;
  const paddingLeft =
    props.paddingLeft !== undefined ? toNonNegativeInteger(props.paddingLeft) : horizontalPadding;
  const paddingRight =
    props.paddingRight !== undefined ? toNonNegativeInteger(props.paddingRight) : horizontalPadding;

  const baseMargin = toNonNegativeInteger(props.margin);
  const horizontalMargin =
    props.marginX !== undefined ? toNonNegativeInteger(props.marginX) : baseMargin;
  const marginLeft =
    props.marginLeft !== undefined ? toNonNegativeInteger(props.marginLeft) : horizontalMargin;
  const marginRight =
    props.marginRight !== undefined ? toNonNegativeInteger(props.marginRight) : horizontalMargin;

  return paddingLeft + paddingRight + marginLeft + marginRight;
};

const resolveTextAreaHorizontalMargin = (style: AskHumanViewProps['textAreaStyle'] | undefined): number => {
  if (!style) {
    return 0;
  }

  const baseMargin = toNonNegativeInteger(style.margin);
  const horizontalMargin =
    style.marginX !== undefined ? toNonNegativeInteger(style.marginX) : baseMargin;
  const marginLeft =
    style.marginLeft !== undefined ? toNonNegativeInteger(style.marginLeft) : horizontalMargin;
  const marginRight =
    style.marginRight !== undefined ? toNonNegativeInteger(style.marginRight) : horizontalMargin;

  return marginLeft + marginRight;
};

export type AskHumanLayoutProps = {
  value: string;
  onChange: (nextValue: string) => void;
  onSubmit: (submission: string) => void;
  isInteractive: boolean;
  isLocked: boolean;
  thinking: boolean;
  hintMessage: string;
  contextUsage: ContextUsageValue | null;
};

const askHumanViewProps: AskHumanViewProps = defaultAskHumanViewProps;
const textAreaWidthOffset =
  resolveHorizontalBoxSpacing(askHumanViewProps.containerProps) +
  resolveHorizontalBoxSpacing(askHumanViewProps.inputRowProps) +
  resolveTextAreaHorizontalMargin(askHumanViewProps.textAreaStyle);

/**
 * Presents the AskHuman input area using the shared theme and slash commands.
 */
const AskHumanLayout = ({
  value,
  onChange,
  onSubmit,
  isInteractive,
  isLocked,
  thinking,
  hintMessage,
  contextUsage,
}: AskHumanLayoutProps): ReactElement => {
  const inputDisplay = thinking ? (
    <Text {...askHumanViewProps.spinnerTextProps}>
      ⏳ Thinking…
    </Text>
  ) : (
    <InkTextArea
      {...askHumanViewProps.textAreaStyle}
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      widthOffset={textAreaWidthOffset}
      slashMenuItems={HUMAN_SLASH_COMMANDS}
      isActive={isInteractive}
      isDisabled={isLocked}
    />
  );

  return (
    <Box {...askHumanViewProps.containerProps}>
      <Box {...askHumanViewProps.inputRowProps}>{inputDisplay}</Box>
      <Box {...askHumanViewProps.footerProps}>
        <Text {...askHumanViewProps.footerHintProps}>{hintMessage}</Text>
        {contextUsage ? <ContextUsage usage={contextUsage} /> : null}
      </Box>
    </Box>
  );
};

export default AskHumanLayout;
