import { useCallback, useMemo } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Key } from 'ink';

import {
  clamp,
  type CaretPosition,
  type TextRow,
} from './layout.js';
import { createMovementHandler } from './keyEvents.js';

interface CaretNavigationConfig {
  caretPosition: CaretPosition;
  rows: ReadonlyArray<TextRow>;
  valueLength: number;
  setCaretIndex: Dispatch<SetStateAction<number>>;
  desiredColumnRef: MutableRefObject<number | null>;
}

interface CaretNavigationResult {
  handleMovementKey: (key: Key) => boolean;
  resetDesiredColumn: () => void;
}

// Consolidates caret navigation logic so InkTextArea.tsx can focus on rendering and buffer updates.
function useCaretNavigation({
  caretPosition,
  rows,
  valueLength,
  setCaretIndex,
  desiredColumnRef,
}: CaretNavigationConfig): CaretNavigationResult {
  const resetDesiredColumn = useCallback(() => {
    desiredColumnRef.current = null;
  }, [desiredColumnRef]);

  const resolveDesiredColumn = useCallback(() => {
    const existing = desiredColumnRef.current;
    if (existing !== null) {
      return existing;
    }
    const currentColumn = caretPosition.column;
    desiredColumnRef.current = currentColumn;
    return currentColumn;
  }, [caretPosition.column, desiredColumnRef]);

  const moveToRow = useCallback(
    (targetRowIndex: number) => {
      const targetRow = rows[targetRowIndex];
      if (!targetRow) {
        return;
      }
      const desiredColumn = resolveDesiredColumn();
      const boundedColumn = Math.min(desiredColumn, targetRow.text.length);
      const nextIndex = targetRow.startIndex + boundedColumn;
      setCaretIndex(nextIndex);
    },
    [resolveDesiredColumn, rows, setCaretIndex],
  );

  const handleArrowUp = useCallback(() => {
    if (caretPosition.rowIndex === 0) {
      return;
    }
    moveToRow(caretPosition.rowIndex - 1);
  }, [caretPosition.rowIndex, moveToRow]);

  const handleArrowDown = useCallback(() => {
    if (caretPosition.rowIndex >= rows.length - 1) {
      return;
    }
    moveToRow(caretPosition.rowIndex + 1);
  }, [caretPosition.rowIndex, moveToRow, rows.length]);

  const handleArrowLeft = useCallback(() => {
    resetDesiredColumn();
    setCaretIndex((previous) => Math.max(0, previous - 1));
  }, [resetDesiredColumn, setCaretIndex]);

  const handleArrowRight = useCallback(() => {
    resetDesiredColumn();
    setCaretIndex((previous) => Math.min(valueLength, previous + 1));
  }, [resetDesiredColumn, setCaretIndex, valueLength]);

  const handleHome = useCallback(() => {
    resetDesiredColumn();
    const rowStart = caretPosition.row.startIndex;
    const nextIndex = clamp(rowStart, 0, valueLength);
    setCaretIndex(nextIndex);
  }, [caretPosition.row, resetDesiredColumn, setCaretIndex, valueLength]);

  const handleEnd = useCallback(() => {
    resetDesiredColumn();
    const rowStart = caretPosition.row.startIndex;
    const rowEnd = clamp(rowStart + caretPosition.row.text.length, 0, valueLength);
    const nextIndex = Math.max(rowStart, rowEnd);
    setCaretIndex(nextIndex);
  }, [caretPosition.row, resetDesiredColumn, setCaretIndex, valueLength]);

  const handleMovementKey = useMemo(
    () =>
      createMovementHandler({
        onUp: handleArrowUp,
        onDown: handleArrowDown,
        onLeft: handleArrowLeft,
        onRight: handleArrowRight,
        onHome: handleHome,
        onEnd: handleEnd,
      }),
    [handleArrowDown, handleArrowLeft, handleArrowRight, handleArrowUp, handleEnd, handleHome],
  );

  return { handleMovementKey, resetDesiredColumn };
}

export { useCaretNavigation };
export type { CaretNavigationConfig, CaretNavigationResult };
