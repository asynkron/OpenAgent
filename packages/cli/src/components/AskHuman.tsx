import { type ReactElement } from 'react';
import {
  useAskHumanInput,
  type SubmitHandler,
} from './useAskHumanInput.js';
import type { ContextUsage as ContextUsageValue } from '../status.js';
import { formatAskHumanHint } from './askHumanHint.js';
import AskHumanLayout from './AskHumanLayout.js';

export { HUMAN_SLASH_COMMANDS } from './askHumanCommands.js';

type AskHumanProps = {
  onSubmit?: SubmitHandler;
  thinking?: boolean;
  contextUsage?: ContextUsageValue | null;
  passCounter?: number;
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

  const hintMessage = formatAskHumanHint(thinking, passCounter);

  return (
    <AskHumanLayout
      value={value}
      onChange={updateValue}
      onSubmit={submit}
      isInteractive={interactive}
      isLocked={isLocked}
      thinking={thinking}
      hintMessage={hintMessage}
      contextUsage={contextUsage}
    />
  );
}

export default AskHuman;
