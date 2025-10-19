/* eslint-env jest */
import { jest } from '@jest/globals';
import { createStructuredResponseEventEmitter } from '../structuredResponseEventEmitter.js';
import type { PlanResponse } from '../../contracts/index.js';
import type { PlanResponseStreamPartial } from '../../openai/responses.js';

describe('StructuredResponseEventEmitter', () => {
  test('does not emit a duplicate assistant message when the final response matches the last streamed partial', () => {
    const emitEvent = jest.fn();
    const emitter = createStructuredResponseEventEmitter({ emitEvent });

    const partial: PlanResponseStreamPartial = { message: 'Hello world' };
    emitter.handleStreamPartial(partial);

    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(emitEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'assistant-message',
        payload: { message: 'Hello world' },
      }),
      expect.objectContaining({ final: false }),
    );

    const finalResponse: PlanResponse = {
      message: 'Hello world',
      plan: [],
    };
    const summary = emitter.handleFinalResponse(finalResponse);

    expect(emitEvent).toHaveBeenCalledTimes(2);
    expect(emitEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'assistant-message',
        payload: { message: 'Hello world' },
      }),
      expect.objectContaining({ final: true }),
    );
    expect(summary.messageEmitted).toBe(true);
  });

  test('reports no assistant emission when neither streaming nor the final response include a message', () => {
    const emitEvent = jest.fn();
    const emitter = createStructuredResponseEventEmitter({ emitEvent });

    const partial: PlanResponseStreamPartial = { plan: null };
    const partialSummary = emitter.handleStreamPartial(partial);
    expect(partialSummary.messageEmitted).toBe(false);

    const finalResponse: PlanResponse = {
      message: '   ',
      plan: [],
    };
    const finalSummary = emitter.handleFinalResponse(finalResponse);

    expect(emitEvent).not.toHaveBeenCalled();
    expect(finalSummary.messageEmitted).toBe(false);
  });

  test('emits plan snapshots during streaming and final response handling', () => {
    const emitEvent = jest.fn();
    const emitter = createStructuredResponseEventEmitter({ emitEvent });

    const streamSummary = emitter.handleStreamPartial({
      plan: [
        {
          id: 'step-1',
          title: 'Prep workspace',
          status: 'in_progress',
          command: { run: 'ls' },
        },
      ],
    });

    expect(streamSummary.planEmitted).toBe(true);
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'plan',
        payload: {
          plan: [
            expect.objectContaining({
              id: 'step-1',
              status: 'in_progress',
              command: expect.objectContaining({ run: 'ls' }),
            }),
          ],
        },
      }),
      expect.objectContaining({ final: false }),
    );

    emitEvent.mockClear();

    const finalSummary = emitter.handleFinalResponse({
      message: 'done',
      plan: [
        {
          id: 'step-1',
          title: 'Prep workspace',
          status: 'complete',
          command: { run: 'ls' },
          observation: null,
        },
      ],
    });

    expect(finalSummary.planEmitted).toBe(true);
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'plan',
        payload: {
          plan: [
            expect.objectContaining({
              id: 'step-1',
              status: 'complete',
              observation: null,
            }),
          ],
        },
      }),
      expect.objectContaining({ final: true }),
    );
  });
});
