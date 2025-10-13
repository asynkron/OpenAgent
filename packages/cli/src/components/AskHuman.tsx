// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import ContextUsage from './ContextUsage.js';
import InkTextArea from './InkTextArea.js';
import theme from '../theme.js';

// Predefined slash-menu shortcuts surfaced in the AskHuman input.
export const HUMAN_SLASH_COMMANDS = [
  {
    id: 'model',
    label: 'model',
    description: 'Switch the active language model (e.g. /model gpt-4o)',
    keywords: ['llm', 'switch', 'gpt', 'model'],
    insertValue: '/model ',
  },
  {
    id: 'model-gpt-4o',
    label: 'model gpt-4o',
    description: 'Switch to the flagship GPT-4o model',
    keywords: ['gpt-4o', 'llm', 'model'],
    insertValue: '/model gpt-4o',
  },
  {
    id: 'model-gpt-4o-mini',
    label: 'model gpt-4o-mini',
    description: 'Use the faster GPT-4o mini variant',
    keywords: ['gpt-4o-mini', 'model', 'fast'],
    insertValue: '/model gpt-4o-mini',
  },
  {
    id: 'reasoning-medium',
    label: 'reasoning medium',
    description: 'Request medium reasoning effort from the model',
    keywords: ['reasoning', 'effort', 'medium'],
    insertValue: '/reasoning medium',
  },
  {
    id: 'reasoning-high',
    label: 'reasoning high',
    description: 'Request high reasoning effort for tougher problems',
    keywords: ['reasoning', 'effort', 'high'],
    insertValue: '/reasoning high',
  },
  {
    id: 'help',
    label: 'help',
    description: 'Ask for available commands and usage hints',
    keywords: ['docs', 'support', 'commands'],
    insertValue: '/help',
  },
  {
    id: 'history',
    label: 'history',
    description: 'Export the current session history to a JSON file',
    keywords: ['history', 'export', 'log'],
    insertValue: '/history ',
  },
  {
    id: 'command-inspector',
    label: 'command',
    description: 'Inspect recent command payloads (e.g. /command 3)',
    keywords: ['command', 'debug', 'payload'],
    insertValue: '/command ',
  },
];

const { human } = theme;
const { colors: humanColors, props: humanProps } = human;
const askHumanProps = humanProps?.askHuman ?? {};

/**
 * Collects free-form user input while keeping the prompt visible inside the Ink
 * layout.
 */
export function AskHuman({ onSubmit, thinking = false, contextUsage = null, passCounter = 0 }) {
  const [value, setValue] = useState('');
  const [locked, setLocked] = useState(false);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const interactive = !locked && !thinking;

  const handleSubmit = useCallback(
    (rawValue) => {
      if (!interactive) {
        return;
      }

      const submission = rawValue.trim();
      setLocked(true);

      Promise.resolve()
        .then(() => onSubmit?.(submission))
        .finally(() => {
          if (!mountedRef.current) {
            return;
          }
          setValue('');
          setLocked(false);
        });
    },
    [interactive, onSubmit],
  );

  const spinnerProps = {
    marginLeft: 1,
    ...(askHumanProps.spinnerText ?? {}),
  };
  const spinnerColor = spinnerProps.color ?? humanColors.fg;

  const textAreaProps = {
    marginLeft: 1,
    ...(askHumanProps.textArea ?? {}),
  };

  const inputDisplay = thinking ? (
    <Text {...spinnerProps} color={spinnerColor}>
      <Spinner type="dots" key="spinner-icon" /> Thinking…
    </Text>
  ) : (
    <InkTextArea
      {...textAreaProps}
      value={value}
      onChange={setValue}
      onSubmit={handleSubmit}
      slashMenuItems={HUMAN_SLASH_COMMANDS}
      isActive={interactive}
      isDisabled={locked}
    />
  );

  const normalizedPassCounter = Number.isFinite(passCounter)
    ? Math.max(0, Math.floor(passCounter))
    : 0;
  const passPrefix = normalizedPassCounter > 0 ? `Pass #${normalizedPassCounter} • ` : '';
  const hintMessage = thinking
    ? `${passPrefix}Waiting for the AI to finish thinking…`
    : `${passPrefix}Press Enter to submit • Shift+Enter for newline • Esc to cancel`;

  const footerHintProps = {
    dimColor: true,
    ...(askHumanProps.footerHint ?? {}),
  };
  const footerHintColor = footerHintProps.color ?? humanColors.fg;
  const footerHintDimColor = footerHintProps.dimColor ?? true;

  const containerProps = {
    flexDirection: 'column',
    marginTop: 1,
    paddingX: 1,
    paddingY: 0,
    backgroundColor: humanColors.bg,
    ...(askHumanProps.container ?? {}),
  };

  if (!containerProps.backgroundColor) {
    containerProps.backgroundColor = humanColors.bg;
  }

  const inputRowProps = {
    flexDirection: 'row',
    paddingX: 1,
    paddingY: 1,
    ...(askHumanProps.inputRow ?? {}),
  };

  const footerProps = {
    flexDirection: 'column',
    paddingX: 1,
    paddingBottom: 1,
    ...(askHumanProps.footer ?? {}),
  };

  return (
    <Box {...containerProps}>
      <Box {...inputRowProps}>{inputDisplay}</Box>
      <Box {...footerProps}>
        <Text {...footerHintProps} dimColor={footerHintDimColor} color={footerHintColor}>
          {hintMessage}
        </Text>
        {contextUsage ? <ContextUsage usage={contextUsage} /> : null}
      </Box>
    </Box>
  );
}

export default AskHuman;
