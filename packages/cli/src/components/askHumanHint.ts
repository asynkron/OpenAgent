const WAITING_HINT_MESSAGE = 'Waiting for the AI to finish thinking…';
const INPUT_HINT_MESSAGE = 'Press Enter to submit • Shift+Enter for newline • Esc to cancel';

const sanitizePassCounter = (rawPassCounter: number): number => {
  if (!Number.isFinite(rawPassCounter)) {
    return 0;
  }

  const truncatedValue = Math.floor(rawPassCounter);
  return truncatedValue > 0 ? truncatedValue : 0;
};

const buildPassPrefix = (rawPassCounter: number): string => {
  const passCounter = sanitizePassCounter(rawPassCounter);
  if (passCounter === 0) {
    return '';
  }

  return `Pass #${passCounter} • `;
};

/**
 * Produces the hint shown beneath the AskHuman input, including the optional
 * pass counter prefix when the agent is iterating.
 */
export const formatAskHumanHint = (
  thinking: boolean,
  passCounter: number,
): string => {
  const passPrefix = buildPassPrefix(passCounter);
  const baseMessage = thinking ? WAITING_HINT_MESSAGE : INPUT_HINT_MESSAGE;

  return `${passPrefix}${baseMessage}`;
};
