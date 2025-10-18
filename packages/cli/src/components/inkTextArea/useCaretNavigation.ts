import { useCallback, useMemo } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Key } from 'ink';

import { clamp, type CaretPosition, type TextRow } from './layout.js';
import { createMovementHandler } from './keyEvents.js';

type MovementKeyHandler = (key: Key) => boolean;

export interface CaretNavigationOptions {
  caretPosition: CaretPosition;
  rows: ReadonlyArray<TextRow>;
  valueLength: number;
  desiredColumnRef: MutableRefObject<number | null>;
  setCaretIndex: Dispatch<SetStateAction<number>>;
}

export const useCaretNavigation = ({
  caretPosition,
  rows,
  valueLength,
  desiredColumnRef,
  setCaretIndex,
}: CaretNavigationOptions): MovementKeyHandler => {
  const handleArrowUp = useCallback(() => {
    const currentRowIndex = caretPosition.rowIndex;
    if (currentRowIndex === 0) {
      return;
    }

    const targetRow = rows[currentRowIndex - 1];
    const desiredColumn = desiredColumnRef.current ?? caretPosition.column;
    desiredColumnRef.current = desiredColumn;

    const nextColumn = Math.min(desiredColumn, targetRow.text.length);
    const nextIndex = targetRow.startIndex + nextColumn;
    setCaretIndex(nextIndex);
  }, [caretPosition, desiredColumnRef, rows, setCaretIndex]);

  const handleArrowDown = useCallback(() => {
    const currentRowIndex = caretPosition.rowIndex;
    if (currentRowIndex >= rows.length - 1) {
      return;
    }

    const targetRow = rows[currentRowIndex + 1];
    const desiredColumn = desiredColumnRef.current ?? caretPosition.column;
    desiredColumnRef.current = desiredColumn;

    const nextColumn = Math.min(desiredColumn, targetRow.text.length);
    const nextIndex = targetRow.startIndex + nextColumn;
    setCaretIndex(nextIndex);
  }, [caretPosition, desiredColumnRef, rows, setCaretIndex]);

  const handleArrowLeft = useCallback(() => {
    desiredColumnRef.current = null;
    setCaretIndex((previous) => Math.max(0, previous - 1));
  }, [desiredColumnRef, setCaretIndex]);

  const handleArrowRight = useCallback(() => {
    desiredColumnRef.current = null;
    setCaretIndex((previous) => Math.min(valueLength, previous + 1));
  }, [desiredColumnRef, setCaretIndex, valueLength]);

  const handleHome = useCallback(() => {
    const rowStart = caretPosition.row.startIndex;
    const nextIndex = clamp(rowStart, 0, valueLength);
    setCaretIndex(nextIndex);
  }, [caretPosition, setCaretIndex, valueLength]);

  const handleEnd = useCallback(() => {
    const rowStart = caretPosition.row.startIndex;
    const rowEnd = clamp(rowStart + caretPosition.row.text.length, 0, valueLength);
    const nextIndex = Math.max(rowStart, rowEnd);
    setCaretIndex(nextIndex);
  }, [caretPosition, setCaretIndex, valueLength]);

  return useMemo(
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
};
