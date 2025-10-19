import { type ReactElement } from 'react';
import { Box, Text } from 'ink';
import ContextUsage from './ContextUsage.js';
import InkTextArea from './InkTextArea.js';
import {
  defaultAskHumanViewProps,
  type AskHumanViewProps,
} from './askHumanViewProps.js';
import { HUMAN_SLASH_COMMANDS } from './askHumanCommands.js';
import type { ContextUsage as ContextUsageValue } from '../status.js';

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
