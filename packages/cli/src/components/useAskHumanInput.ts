import { useCallback, useEffect, useRef, useState } from 'react';

export type SubmitHandler = (submission: string) => void | Promise<void>;

interface AskHumanInputOptions {
  onSubmit?: SubmitHandler;
  disabled: boolean;
}

interface AskHumanInputState {
  value: string;
  updateValue: (nextValue: string) => void;
  submit: (rawValue: string) => void;
  interactive: boolean;
  isLocked: boolean;
}

/**
 * Centralizes locking/submission rules so the AskHuman component can stay lean.
 */
export const useAskHumanInput = ({
  onSubmit,
  disabled,
}: AskHumanInputOptions): AskHumanInputState => {
  const [value, setValue] = useState('');
  const [isLocked, setLocked] = useState(false);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const interactive = !isLocked && !disabled;

  const submit = useCallback(
    (rawValue: string) => {
      if (!interactive) {
        return;
      }

      const submission = rawValue.trim();
      setLocked(true);

      Promise.resolve(onSubmit?.(submission)).finally(() => {
        if (!mountedRef.current) {
          return;
        }
        setValue('');
        setLocked(false);
      });
    },
    [interactive, onSubmit],
  );

  return {
    value,
    updateValue: setValue,
    submit,
    interactive,
    isLocked,
  };
};
