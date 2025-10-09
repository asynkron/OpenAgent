import React, { useCallback, useEffect, useRef, useState } from 'react';
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
];

const h = React.createElement;
const { human } = theme;
const {
  colors: humanColors,
  props: humanProps,
} = human;
const askHumanProps = humanProps?.askHuman ?? {};

/**
 * Collects free-form user input while keeping the prompt visible inside the Ink
 * layout.
 */
export function AskHuman({ onSubmit, thinking = false, contextUsage = null }) {
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

  const inputDisplay = thinking
    ? h(
        Text,
        { key: 'spinner', ...spinnerProps, color: spinnerColor },
        [
          h(Spinner, { type: 'dots', key: 'spinner-icon' }),
          ' Thinking…',
        ],
      )
    : h(InkTextArea, {
        key: 'value',
        ...textAreaProps,
        value,
        onChange: setValue,
        onSubmit: handleSubmit,
        slashMenuItems: HUMAN_SLASH_COMMANDS,

        isActive: interactive,
        isDisabled: locked,
      });

  const hintMessage = thinking
    ? 'Waiting for the AI to finish thinking…'
    : 'Press Enter to submit • Shift+Enter for newline • Esc to cancel';

  const footerHintProps = {
    dimColor: true,
    ...(askHumanProps.footerHint ?? {}),
  };
  const footerHintColor = footerHintProps.color ?? humanColors.fg;
  const footerHintDimColor = footerHintProps.dimColor ?? true;

  const footerChildren = [
    h(
      Text,
      {
        key: 'hint',
        ...footerHintProps,
        dimColor: footerHintDimColor,
        color: footerHintColor,
      },
      hintMessage,
    ),
  ];

  if (contextUsage) {
    footerChildren.push(h(ContextUsage, { usage: contextUsage, key: 'context-usage' }));
  }

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

  return h(
    Box,
    containerProps,
    [
      h(Box, { key: 'inputRow', ...inputRowProps }, [inputDisplay]),
      h(Box, { key: 'footer', ...footerProps }, footerChildren),
    ],
  );
}

export default AskHuman;
