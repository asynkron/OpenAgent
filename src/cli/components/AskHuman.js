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

  const inputDisplay = thinking
    ? h(Text, { color: human.fg, key: 'spinner', marginLeft: 1 }, [
        h(Spinner, { type: 'dots', key: 'spinner-icon' }),
        ' Thinking…',
      ])
    : h(InkTextArea, {
        key: 'value',
        value,
        onChange: setValue,
        onSubmit: handleSubmit,
        slashMenuItems: HUMAN_SLASH_COMMANDS,

        isActive: interactive,
        isDisabled: locked,
        marginLeft: 1,
      });

  const hintMessage = thinking
    ? 'Waiting for the AI to finish thinking…'
    : 'Press Enter to submit • Shift+Enter for newline • Esc to cancel';

  const footerChildren = [h(Text, { dimColor: true, color: human.fg, key: 'hint' }, hintMessage)];

  if (contextUsage) {
    footerChildren.push(h(ContextUsage, { usage: contextUsage, key: 'context-usage' }));
  }

  return h(
    Box,
    {
      flexDirection: 'column',
      marginTop: 1,
      paddingX: 1,
      paddingY: 0,
      backgroundColor: human.bg,
    },
    [
      h(Box, { flexDirection: 'row', key: 'inputRow', paddingX: 1, paddingY: 1 }, [inputDisplay]),
      h(
        Box,
        { flexDirection: 'column', key: 'footer', paddingX: 1, paddingBottom: 1 },
        footerChildren,
      ),
    ],
  );
}

export default AskHuman;
