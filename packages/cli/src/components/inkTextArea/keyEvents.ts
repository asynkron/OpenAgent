import type { Key } from 'ink';

import { extractSpecialKeys } from './layout.js';

// Shared key-event helpers keep InkTextArea.tsx focused on rendering concerns.

export interface PreviousKeySnapshot {
  printableInput: string;
  wasReturnKey: boolean;
  shiftModifierActive: boolean;
}

export interface KeyEventEvaluation {
  printableInput: string;
  specialKeys: string[];
  shiftModifierActive: boolean;
  shouldInsertNewline: boolean;
}

export interface MovementCallbacks {
  onUp: () => void;
  onDown: () => void;
  onLeft: () => void;
  onRight: () => void;
  onHome: () => void;
  onEnd: () => void;
}

export interface DeletionCallbacks {
  onBackwardDelete: () => void;
  onDelete: () => void;
}

type AugmentedKey = Key & {
  isShiftPressed?: boolean;
  home?: boolean;
  end?: boolean;
  code?: string;
};

export const evaluateKeyEvent = (
  input: string,
  key: Key,
  previous: PreviousKeySnapshot | undefined,
): KeyEventEvaluation => {
  const augmentedKey = key as AugmentedKey;
  const printableInput = input && input !== '\u0000' ? input : '';
  const specialKeys = extractSpecialKeys(key);
  const shiftModifierActive = Boolean(
    key?.shift || augmentedKey.isShiftPressed || specialKeys.includes('shift'),
  );
  const isLineFeedInput = printableInput === '\n';
  const isCarriageReturnInput = printableInput === '\r';
  const isShiftOnlySequence =
    shiftModifierActive &&
    !key?.return &&
    printableInput.length === 0 &&
    !key?.tab &&
    !key?.escape &&
    !key?.upArrow &&
    !key?.downArrow &&
    !key?.leftArrow &&
    !key?.rightArrow &&
    !key?.pageUp &&
    !key?.pageDown &&
    !key?.delete &&
    !key?.backspace;

  const isShiftEnter =
    isLineFeedInput ||
    (key?.return && shiftModifierActive) ||
    (isCarriageReturnInput && shiftModifierActive) ||
    isShiftOnlySequence;

  const isPlainReturnFollowedByLineFeed =
    isLineFeedInput &&
    !shiftModifierActive &&
    !key?.return &&
    previous?.wasReturnKey &&
    !previous?.shiftModifierActive;

  const shouldInsertNewline = isShiftEnter && !isPlainReturnFollowedByLineFeed;

  return { printableInput, specialKeys, shiftModifierActive, shouldInsertNewline };
};

export const createMovementHandler = ({
  onUp,
  onDown,
  onLeft,
  onRight,
  onHome,
  onEnd,
}: MovementCallbacks) => {
  return (key: Key) => {
    const augmentedKey = key as AugmentedKey;
    if (key.upArrow) {
      onUp();
      return true;
    }

    if (key.downArrow) {
      onDown();
      return true;
    }

    if (key.leftArrow) {
      onLeft();
      return true;
    }

    if (key.rightArrow) {
      onRight();
      return true;
    }

    if (augmentedKey.home) {
      onHome();
      return true;
    }

    if (augmentedKey.end) {
      onEnd();
      return true;
    }

    return false;
  };
};

export const createDeletionHandler = ({ onBackwardDelete, onDelete }: DeletionCallbacks) => {
  return (key: Key) => {
    const augmentedKey = key as AugmentedKey;
    const isBackwardDelete = key.backspace || (key.delete && !augmentedKey.code);
    if (isBackwardDelete) {
      onBackwardDelete();
      return true;
    }

    if (key.delete) {
      onDelete();
      return true;
    }

    return false;
  };
};
