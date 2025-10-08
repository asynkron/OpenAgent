import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import ContextUsage from './ContextUsage.js';

const h = React.createElement;

/**
 * Collects free-form user input while keeping the prompt visible inside the Ink
 * layout.
 */
export function AskHuman({ prompt = '▷', onSubmit, thinking = false, contextUsage = null }) {
  const [value, setValue] = useState('');
  const [locked, setLocked] = useState(false);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const normalizedPrompt = useMemo(() => {
    if (typeof prompt !== 'string') {
      return '▷';
    }
    const trimmed = prompt.trim();
    return trimmed.length > 0 ? trimmed : '▷';
  }, [prompt]);

  const placeholder = useMemo(() => `${normalizedPrompt} human writes here`, [normalizedPrompt]);

  useInput(
    (input, key) => {
      if (locked || thinking) {
        return;
      }
      if (key.return) {
        const submission = value.trim();
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
        return;
      }
      if (key.backspace || key.delete) {
        setValue((prev) => prev.slice(0, -1));
        return;
      }
      if (key.ctrl || key.meta) {
        return;
      }
      if (input) {
        setValue((prev) => prev + input);
      }
    },
    { isActive: true },
  );

  const inputDisplay = thinking
    ? h(Text, { color: 'white', key: 'spinner', marginLeft: 1 }, [
        h(Spinner, { type: 'dots', key: 'spinner-icon' }),
        ' Thinking…',
      ])
    : h(Text, {
        color: 'white',
        key: 'value',
        marginLeft: 1,
        dimColor: value.length === 0,
      }, value.length > 0 ? value : placeholder);

  const hintMessage = thinking
    ? 'Waiting for the AI to finish thinking…'
    : 'Press Enter to submit • Esc to cancel';

  const footerChildren = [
    h(Text, { dimColor: true, color: 'white', key: 'hint' }, hintMessage),
  ];

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
      backgroundColor: '#0b1c33',
    },
    [
      h(Box, { flexDirection: 'row', key: 'inputRow', paddingX: 1, paddingY: 1 }, [inputDisplay]),
      h(Box, { flexDirection: 'column', key: 'footer', paddingX: 1, paddingBottom: 1 }, footerChildren),
    ],
  );
}

export default AskHuman;
