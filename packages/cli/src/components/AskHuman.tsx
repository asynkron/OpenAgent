import { type ReactElement } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import ContextUsage from './ContextUsage.js';
import InkTextArea from './InkTextArea.js';
import {
  defaultAskHumanViewProps,
  type AskHumanViewProps,
} from './askHumanViewProps.js';
import {
  useAskHumanInput,
  type SubmitHandler,
} from './useAskHumanInput.js';
import type { ContextUsage as ContextUsageValue } from '../status.js';
import { HUMAN_SLASH_COMMANDS } from './askHumanCommands.js';

export { HUMAN_SLASH_COMMANDS } from './askHumanCommands.js';

type AskHumanProps = {
  onSubmit?: SubmitHandler;
  thinking?: boolean;
  contextUsage?: ContextUsageValue | null;
  passCounter?: number;
};

const askHumanViewProps: AskHumanViewProps = defaultAskHumanViewProps;

const normalizePassCounter = (passCounter: number): number => {
  if (!Number.isFinite(passCounter)) {
    return 0;
  }
  const normalizedValue = Math.floor(passCounter);
  return normalizedValue > 0 ? normalizedValue : 0;
};

const formatHintMessage = (thinking: boolean, passCounter: number): string => {
  const normalizedPassCounter = normalizePassCounter(passCounter);
  const passPrefix = normalizedPassCounter > 0 ? `Pass #${normalizedPassCounter} • ` : '';

  if (thinking) {
    return `${passPrefix}Waiting for the AI to finish thinking…`;
  }

  return `${passPrefix}Press Enter to submit • Shift+Enter for newline • Esc to cancel`;
};

/**
 * Collects free-form user input while keeping the prompt visible inside the Ink
 * layout.
 */
function AskHuman({
  onSubmit,
  thinking = false,
  contextUsage = null,
  passCounter = 0,
}: AskHumanProps): ReactElement {
  const { value, updateValue, submit, interactive, isLocked } = useAskHumanInput({
    onSubmit,
    disabled: thinking,
  });

  const hintMessage = formatHintMessage(thinking, passCounter);

  const inputDisplay = thinking ? (
    <Text {...askHumanViewProps.spinnerTextProps}>
      <Spinner type="dots" key="spinner-icon" /> Thinking…
    </Text>
  ) : (
    <InkTextArea
      {...askHumanViewProps.textAreaStyle}
      value={value}
      onChange={updateValue}
      onSubmit={submit}
      slashMenuItems={HUMAN_SLASH_COMMANDS}
      isActive={interactive}
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
}

export default AskHuman;
