import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import ContextUsage from './ContextUsage.js';
import InkTextArea from './InkTextArea.js';

const h = React.createElement;
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
    ? h(Text, { color: 'white', key: 'spinner', marginLeft: 1 }, [
        h(Spinner, { type: 'dots', key: 'spinner-icon' }),
        ' Thinking…',
      ])
    : h(InkTextArea, {
        key: 'value',
        value,
        onChange: setValue,
        onSubmit: handleSubmit,

        isActive: interactive,
        isDisabled: locked,
        marginLeft: 1,
      });

  const hintMessage = thinking
    ? 'Waiting for the AI to finish thinking…'
    : 'Press Enter to submit • Shift+Enter for newline • Esc to cancel';

  const footerChildren = [h(Text, { dimColor: true, color: 'white', key: 'hint' }, hintMessage)];

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
      h(
        Box,
        { flexDirection: 'column', key: 'footer', paddingX: 1, paddingBottom: 1 },
        footerChildren,
      ),
    ],
  );
}

export default AskHuman;
