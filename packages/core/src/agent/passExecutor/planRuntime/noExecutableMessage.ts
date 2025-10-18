import { normalizeAssistantMessage } from '../planStepStatus.js';
import { createSetNoHumanFlagEffect, type HandleNoExecutableResult } from './effects.js';

export interface MessageAnalysis {
  readonly normalized: string;
  readonly doneSignal: boolean;
}

// Keeps message normalization logic in one place so refusal and flag checks agree.
export const analyzeMessage = (message: string): MessageAnalysis => {
  const trimmed = message.trim();
  const normalized = normalizeAssistantMessage(trimmed);
  const normalizedLower = normalizeAssistantMessage(trimmed.toLowerCase());
  const doneSignal = normalizedLower.replace(/[.!]+$/, '') === 'done';

  return { normalized, doneSignal } satisfies MessageAnalysis;
};

export const applyNoHumanFlagReset = ({
  analysis,
  getNoHumanFlag,
  setNoHumanFlag,
  effects,
}: {
  readonly analysis: MessageAnalysis;
  readonly getNoHumanFlag?: () => boolean;
  readonly setNoHumanFlag?: (value: boolean) => void;
  readonly effects: HandleNoExecutableResult['effects'];
}): void => {
  if (typeof getNoHumanFlag !== 'function' || typeof setNoHumanFlag !== 'function') {
    return;
  }
  if (!getNoHumanFlag() || !analysis.doneSignal) {
    return;
  }

  effects.push(createSetNoHumanFlagEffect(false));
};
