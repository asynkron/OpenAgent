/* eslint-env jest */
import { describe, expect, jest, test } from '@jest/globals';
import {
  guardRequestPayloadSize,
  emitContextUsageSummary,
  requestAssistantCompletion,
} from '../prePassTasks.js';
import type { EmitEvent, AgentRuntimeEvent } from '../types.js';
import type { DebugEmitter } from '../debugEmitter.js';

const createEmitEventMock = (): jest.MockedFunction<EmitEvent> =>
  jest.fn<ReturnType<EmitEvent>, Parameters<EmitEvent>>();

const createEmitDebugMock = (): jest.MockedFunction<DebugEmitter['emit']> =>
  jest.fn<ReturnType<DebugEmitter['emit']>, Parameters<DebugEmitter['emit']>>();

describe('prePassTasks helpers', () => {
  test('guardRequestPayloadSize emits warn event when guard fails', async () => {
    const emitEvent = createEmitEventMock();
    const guardEvent = {
      type: 'status',
      level: 'warn',
      message: '[failsafe] Unable to evaluate request payload size before history compaction.',
      details: 'boom',
    } as const satisfies AgentRuntimeEvent;

    await guardRequestPayloadSize({
      guardRequestPayloadSizeFn: async () => {
        throw new Error('boom');
      },
      history: [],
      model: 'gpt-5-codex',
      passIndex: 1,
      emitEvent,
    });

    expect(emitEvent).toHaveBeenCalledWith(guardEvent);
  });

  test('emitContextUsageSummary emits context usage event', () => {
    const emitEvent = createEmitEventMock();
    const summary = { total: 100, used: 10, remaining: 90, percentRemaining: 90 } as const;
    const expectedEvent = { type: 'context-usage', usage: summary } as const satisfies AgentRuntimeEvent;

    emitContextUsageSummary({
      summarizeContextUsageFn: () => summary,
      history: [],
      model: 'gpt-5-codex',
      emitEvent,
    });

    expect(emitEvent).toHaveBeenCalledWith(expectedEvent);
  });

  test('requestAssistantCompletion emits error when response content missing', async () => {
    const emitEvent = createEmitEventMock();
    const emitDebug = createEmitDebugMock();
    const requestResult = await requestAssistantCompletion({
      requestModelCompletionFn: async () => ({
        status: 'success' as const,
        completion: {
          output_text: '',
          output: [],
          text: {} as never,
        },
      }),
      extractOpenAgentToolCallFn: () => null,
      createChatMessageEntryFn: jest.fn(),
      emitDebug,
      emitEvent,
      observationBuilder: {
        build: jest.fn(),
        buildCancellationObservation: jest.fn(),
      } as unknown,
      openai: {} as never,
      model: 'gpt-5-codex',
      history: [],
      escState: null,
      startThinkingFn: jest.fn(),
      stopThinkingFn: jest.fn(),
      setNoHumanFlag: undefined,
      passIndex: 0,
    });

    expect(requestResult).toEqual({ status: 'missing-content' });
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: 'OpenAI response did not include text output.' }),
    );
    expect(emitDebug).toHaveBeenCalledWith(expect.any(Function));
  });
});
