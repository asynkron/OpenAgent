/* eslint-env jest */
import { describe, expect, test, jest } from '@jest/globals';

import { RuntimeEventType } from '../../contracts/events.js';
import type { ResponsesClient } from '../../openai/responses.js';
import { createChatMessageEntry } from '../historyEntry.js';
import type { PassExecutionBaseOptions } from '../loopSupport.js';
import { createVirtualCommandExecutor } from '../virtualCommandExecutor.js';

const createBaseOptions = (): PassExecutionBaseOptions => {
  const options: PassExecutionBaseOptions = {
    openai: {} as ResponsesClient,
    model: 'test-model',
    history: [],
    emitEvent: jest.fn(),
    onDebug: jest.fn(),
    runCommandFn: jest.fn(),
    applyFilterFn: jest.fn(),
    tailLinesFn: jest.fn(),
    getNoHumanFlag: () => false,
    setNoHumanFlag: () => undefined,
    planReminderMessage: 'Virtual reminder.',
    startThinkingFn: jest.fn(),
    stopThinkingFn: jest.fn(),
    escState: null,
    approvalManager: null,
    historyCompactor: null,
    planManager: null,
    planAutoResponseTracker: null,
    emitAutoApproveStatus: false,
    requestModelCompletionFn: jest.fn(),
    executeAgentCommandFn: jest.fn(),
    virtualCommandExecutor: null,
    createObservationBuilderFn: jest.fn(),
    combineStdStreamsFn: jest.fn(),
    buildPreviewFn: jest.fn(),
    parseAssistantResponseFn: jest.fn(),
    validateAssistantResponseSchemaFn: jest.fn(),
    validateAssistantResponseFn: jest.fn(),
    createChatMessageEntryFn: createChatMessageEntry,
    extractOpenAgentToolCallFn: jest.fn(),
    summarizeContextUsageFn: jest.fn(),
    incrementCommandCountFn: jest.fn(),
    guardRequestPayloadSizeFn: null,
    recordRequestPayloadSizeFn: null,
  };
  return options;
};

describe('createVirtualCommandExecutor', () => {
  test('executes a virtual command and returns assistant output', async () => {
    const baseOptions = createBaseOptions();
    const emitEvent = jest.fn();
    const emitDebug = jest.fn();

    const passExecutor = jest.fn(async (options) => {
      options.history.push(
        createChatMessageEntry({
          role: 'assistant',
          content: 'virtual result summary',
          pass: options.passIndex,
        }),
      );
      return false;
    });

    const executor = createVirtualCommandExecutor({
      systemPrompt: 'system prompt',
      baseOptions,
      passExecutor,
      createChatMessageEntryFn: createChatMessageEntry,
      emitEvent,
      emitDebug,
    });

    const outcome = await executor({
      command: { shell: 'openagent', run: 'virtual-agent research demo' },
      descriptor: { action: 'research', argument: 'Explain the module.' },
    });

    expect(passExecutor).toHaveBeenCalledTimes(1);
    expect(outcome.result.exit_code).toBe(0);
    expect(outcome.result.stdout).toContain('virtual result summary');
    expect(outcome.executionDetails.type).toBe('VIRTUAL');
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: RuntimeEventType.Status }),
    );
    expect(baseOptions.history).toHaveLength(0);
    const [, finishedDebugCall] = emitDebug.mock.calls;
    expect(Array.isArray(finishedDebugCall)).toBe(true);
    if (Array.isArray(finishedDebugCall)) {
      expect(finishedDebugCall[0]).toMatchObject({
        stage: 'command-execution',
        result: expect.objectContaining({ exit_code: 0 }),
        execution: expect.objectContaining({ type: 'VIRTUAL' }),
      });
    }
  });

  test('limits the number of passes when configured via JSON argument', async () => {
    const baseOptions = createBaseOptions();
    const emitEvent = jest.fn();
    const emitDebug = jest.fn();

    const passExecutor = jest.fn(async () => true);

    const executor = createVirtualCommandExecutor({
      systemPrompt: 'system prompt',
      baseOptions,
      passExecutor,
      createChatMessageEntryFn: createChatMessageEntry,
      emitEvent,
      emitDebug,
    });

    const outcome = await executor({
      command: { shell: 'openagent', run: 'virtual-agent explore {}' },
      descriptor: {
        action: 'explore',
        argument: '{"prompt":"Test","maxPasses":1}',
      },
    });

    expect(passExecutor).toHaveBeenCalledTimes(1);
    expect(outcome.result.exit_code).toBe(1);
    expect(outcome.result.stderr).toContain('maximum of 1 passes');
    const lastDebugEntry = emitDebug.mock.calls[emitDebug.mock.calls.length - 1];
    expect(Array.isArray(lastDebugEntry)).toBe(true);
    if (Array.isArray(lastDebugEntry)) {
      expect(lastDebugEntry[0]).toMatchObject({
        stage: 'command-execution',
        result: expect.objectContaining({ exit_code: 1 }),
        execution: expect.objectContaining({ type: 'VIRTUAL' }),
      });
    }
  });

  test('propagates executor failures as command errors', async () => {
    const baseOptions = createBaseOptions();
    const emitEvent = jest.fn();
    const emitDebug = jest.fn();

    const passExecutor = jest.fn(async () => {
      throw new Error('virtual agent failed');
    });

    const executor = createVirtualCommandExecutor({
      systemPrompt: 'system prompt',
      baseOptions,
      passExecutor,
      createChatMessageEntryFn: createChatMessageEntry,
      emitEvent,
      emitDebug,
    });

    const outcome = await executor({
      command: { shell: 'openagent', run: 'virtual-agent explore issue' },
      descriptor: { action: 'explore', argument: 'Investigate failure.' },
    });

    expect(passExecutor).toHaveBeenCalledTimes(1);
    expect(outcome.result.exit_code).toBe(1);
    expect(outcome.result.stderr).toContain('virtual agent failed');
    expect(outcome.executionDetails.error?.message).toContain('virtual agent failed');
  });
});

