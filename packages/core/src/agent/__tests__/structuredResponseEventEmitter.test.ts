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
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'assistant-message',
        payload: { message: 'Hello world' },
      }),
    );

    const finalResponse: PlanResponse = {
      message: 'Hello world',
      plan: [],
    };
    const summary = emitter.handleFinalResponse(finalResponse);

    expect(emitEvent).toHaveBeenCalledTimes(1);
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

  test('emits planning indicator during streaming and final plan snapshot on completion', () => {
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
        type: 'planning',
        payload: {
          state: 'start',
        },
      }),
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
    const emittedEvents = emitEvent.mock.calls.map((call) => call[0] as { type?: string });
    expect(emittedEvents).toEqual(
      expect.arrayContaining([
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
        expect.objectContaining({
          type: 'planning',
          payload: {
            state: 'finish',
          },
        }),
      ]),
    );
  });
});
