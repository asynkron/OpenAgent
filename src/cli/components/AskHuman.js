import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';

const h = React.createElement;

/**
 * Collects free-form user input while keeping the prompt visible inside the Ink
 * layout.
 */
export function AskHuman({ prompt = '▷', onSubmit }) {
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

  useInput(
    (input, key) => {
      if (locked) {
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

  return h(Box, { flexDirection: 'column', marginTop: 1 }, [
    h(Text, { color: 'blueBright', bold: true, key: 'prompt' }, normalizedPrompt),
    h(Text, { key: 'value' }, value || ' '),
    h(Text, { dimColor: true, key: 'hint' }, 'Press Enter to submit • Esc to cancel'),
  ]);
}

export default AskHuman;
