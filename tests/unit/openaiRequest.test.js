import { jest } from '@jest/globals';

describe('requestModelCompletion', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('returns success when OpenAI responds normally', async () => {
    const registerMock = jest.fn(() => ({ cancel: jest.fn(), unregister: jest.fn() }));
    const cleanupMock = jest.fn();
    const createEscWaiterMock = jest.fn(() => ({ promise: null, cleanup: cleanupMock }));
    const resetEscStateMock = jest.fn();

    jest.unstable_mockModule('../../src/utils/cancellation.js', () => ({
      register: registerMock,
      default: { register: registerMock },
    }));

    jest.unstable_mockModule('../../src/agent/escState.js', () => ({
      createEscWaiter: createEscWaiterMock,
      resetEscState: resetEscStateMock,
      default: { createEscWaiter: createEscWaiterMock, resetEscState: resetEscStateMock },
    }));

    const { requestModelCompletion } = await import('../../src/agent/openaiRequest.js');

    const completionValue = { data: 'ok' };
    const openai = { responses: { create: jest.fn().mockResolvedValue(completionValue) } };
    const observationBuilder = { buildCancellationObservation: jest.fn() };
    const escState = { waiters: new Set(), triggered: false, payload: null };
    const startThinkingFn = jest.fn();
    const stopThinkingFn = jest.fn();
    const setNoHumanFlag = jest.fn();
    const history = [];

    const result = await requestModelCompletion({
      openai,
      model: 'gpt-test',
      history,
      observationBuilder,
      escState,
      startThinkingFn,
      stopThinkingFn,
      setNoHumanFlag,
    });

    expect(result).toEqual({ status: 'success', completion: completionValue });
    expect(startThinkingFn).toHaveBeenCalledTimes(1);
    expect(stopThinkingFn).toHaveBeenCalledTimes(1);
    expect(createEscWaiterMock).toHaveBeenCalledWith(escState);
    expect(cleanupMock).toHaveBeenCalledTimes(1);
    expect(resetEscStateMock).toHaveBeenCalledWith(escState);
    expect(history).toHaveLength(0);
  });

  test('returns canceled when ESC is triggered', async () => {
    let cancelCallback = null;
    const cancellationHandle = {
      cancel: jest.fn(() => {
        if (cancelCallback) cancelCallback();
      }),
      unregister: jest.fn(),
    };
    const registerMock = jest.fn(({ onCancel }) => {
      cancelCallback = onCancel;
      return cancellationHandle;
    });

    const cleanupMock = jest.fn();
    const createEscWaiterMock = jest.fn(() => ({
      promise: Promise.resolve('payload'),
      cleanup: cleanupMock,
    }));
    const resetEscStateMock = jest.fn();

    jest.unstable_mockModule('../../src/utils/cancellation.js', () => ({
      register: registerMock,
      default: { register: registerMock },
    }));

    jest.unstable_mockModule('../../src/agent/escState.js', () => ({
      createEscWaiter: createEscWaiterMock,
      resetEscState: resetEscStateMock,
      default: { createEscWaiter: createEscWaiterMock, resetEscState: resetEscStateMock },
    }));

    const { requestModelCompletion } = await import('../../src/agent/openaiRequest.js');

    let requestReject;
    const responsesCreate = jest.fn(
      () =>
        new Promise((_, reject) => {
          requestReject = reject;
        }),
    );
    const openai = { responses: { create: responsesCreate } };
    const observation = { foo: 'bar' };
    const observationBuilder = {
      buildCancellationObservation: jest.fn(() => observation),
    };
    const escState = { waiters: new Set(), triggered: false, payload: null };
    const startThinkingFn = jest.fn();
    const stopThinkingFn = jest.fn();
    const setNoHumanFlag = jest.fn();
    const history = [];

    const requestPromise = requestModelCompletion({
      openai,
      model: 'gpt-test',
      history,
      observationBuilder,
      escState,
      startThinkingFn,
      stopThinkingFn,
      setNoHumanFlag,
    });

    // Simulate OpenAI promise rejecting after cancellation
    cancelCallback && cancelCallback();
    requestReject && requestReject({ name: 'APIUserAbortError' });

    const result = await requestPromise;

    expect(result).toEqual({ status: 'canceled' });
    expect(cancellationHandle.cancel).toHaveBeenCalledWith('ui-cancel');
    expect(cancellationHandle.unregister).toHaveBeenCalledTimes(1);
    expect(observationBuilder.buildCancellationObservation).toHaveBeenCalledWith({
      reason: 'escape_key',
      message: 'Human canceled the in-flight request.',
      metadata: { esc_payload: 'payload' },
    });
    expect(history).toHaveLength(1);
    expect(JSON.parse(history[0].content)).toEqual(observation);
    expect(setNoHumanFlag).toHaveBeenCalledWith(false);
    expect(stopThinkingFn).toHaveBeenCalledTimes(1);
    expect(resetEscStateMock).toHaveBeenCalledWith(escState);
  });

  test('returns canceled when OpenAI aborts request', async () => {
    const registerMock = jest.fn(() => ({ cancel: jest.fn(), unregister: jest.fn() }));
    const cleanupMock = jest.fn();
    const createEscWaiterMock = jest.fn(() => ({ promise: null, cleanup: cleanupMock }));
    const resetEscStateMock = jest.fn();

    jest.unstable_mockModule('../../src/utils/cancellation.js', () => ({
      register: registerMock,
      default: { register: registerMock },
    }));

    jest.unstable_mockModule('../../src/agent/escState.js', () => ({
      createEscWaiter: createEscWaiterMock,
      resetEscState: resetEscStateMock,
      default: { createEscWaiter: createEscWaiterMock, resetEscState: resetEscStateMock },
    }));

    const { requestModelCompletion } = await import('../../src/agent/openaiRequest.js');

    const error = new Error('aborted');
    error.name = 'APIUserAbortError';

    const responsesCreate = jest.fn(() => Promise.reject(error));
    const openai = { responses: { create: responsesCreate } };
    const observation = { reason: 'abort' };
    const observationBuilder = {
      buildCancellationObservation: jest.fn(() => observation),
    };
    const escState = { waiters: new Set(), triggered: false, payload: null };
    const startThinkingFn = jest.fn();
    const stopThinkingFn = jest.fn();
    const setNoHumanFlag = jest.fn();
    const history = [];

    const result = await requestModelCompletion({
      openai,
      model: 'gpt-test',
      history,
      observationBuilder,
      escState,
      startThinkingFn,
      stopThinkingFn,
      setNoHumanFlag,
    });

    expect(result).toEqual({ status: 'canceled' });
    expect(observationBuilder.buildCancellationObservation).toHaveBeenCalledWith({
      reason: 'abort',
      message: 'The in-flight request was aborted before completion.',
    });
    expect(history).toHaveLength(1);
    expect(JSON.parse(history[0].content)).toEqual(observation);
    expect(setNoHumanFlag).toHaveBeenCalledWith(false);
    expect(stopThinkingFn).toHaveBeenCalledTimes(1);
    expect(resetEscStateMock).toHaveBeenCalledWith(escState);
  });
});
