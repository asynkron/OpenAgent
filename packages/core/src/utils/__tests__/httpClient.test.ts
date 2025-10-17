/* eslint-env jest */
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';

import { HttpClient, DEFAULT_TIMEOUT_MS } from '../fetch.js';

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('HttpClient (fetch utilities)', () => {
  test('fetchWithGlobal uses provided fetch implementation', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 201,
      statusText: 'Created',
      ok: true,
      text: () => Promise.resolve('payload'),
    });

    const client = new HttpClient({ fetchImpl });

    const result = await client.fetch('https://example.com/resource', {
      method: 'POST',
      headers: { 'X-Test': '1' },
      timeoutSec: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, options] = fetchImpl.mock.calls[0];
    expect(options).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-Test': '1' },
        redirect: 'follow',
      }),
    );
    expect(options.signal).toBeDefined();

    expect(result).toEqual({
      body: 'payload',
      status: 201,
      statusText: 'Created',
      ok: true,
    });
  });

  test('fetchWithGlobal aborts and throws TimeoutError when request exceeds timeout', async () => {
    jest.useFakeTimers();

    const fetchImpl = jest.fn((url, options = {}) => {
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener?.('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    class MockAbortController {
      constructor() {
        this.signal = {
          aborted: false,
          listeners: [],
          addEventListener: (event, handler) => {
            if (event === 'abort') {
              this.signal.listeners.push(handler);
            }
          },
        };
      }

      abort() {
        this.signal.aborted = true;
        for (const handler of this.signal.listeners) {
          handler();
        }
      }
    }

    const client = new HttpClient({ fetchImpl, AbortControllerImpl: MockAbortController });

    const promise = client.fetch('https://example.com/slow', { timeoutMs: 50 });

    jest.advanceTimersByTime(50);
    await expect(promise).rejects.toMatchObject({
      name: 'TimeoutError',
      aborted: true,
      message: 'Request timed out',
    });
  });

  test('fetchWithNode streams response when global fetch is unavailable', async () => {
    const originalFetch = global.fetch;
    global.fetch = undefined;

    try {
      const requestSpy = jest.fn((options, callback) => {
        const response = new EventEmitter();
        response.statusCode = 200;
        response.statusMessage = 'OK';

        const request = new EventEmitter();
        request.end = () => {
          callback(response);
          response.emit('data', Buffer.from('hello'));
          response.emit('end');
        };
        request.destroy = jest.fn();

        return request;
      });

      const httpModule = { request: requestSpy };
      const client = new HttpClient({
        fetchImpl: undefined,
        httpModule,
        httpsModule: httpModule,
      });

      const result = await client.fetch('http://example.com/test', {
        headers: { Accept: 'text/plain' },
        timeoutSec: 0,
      });

      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          hostname: 'example.com',
          method: 'GET',
          headers: { Accept: 'text/plain' },
        }),
      );

      expect(result).toEqual({
        body: 'hello',
        status: 200,
        statusText: 'OK',
        ok: true,
      });
    } finally {
      if (originalFetch === undefined) {
        delete global.fetch;
      } else {
        global.fetch = originalFetch;
      }
    }
  });

  test('fetchWithNode rejects with TimeoutError when request never responds', async () => {
    const originalFetch = global.fetch;
    global.fetch = undefined;

    jest.useFakeTimers();

    try {
      const request = new EventEmitter();
      request.end = jest.fn();
      request.destroy = jest.fn((error) => {
        request.emit('error', error);
      });

      const requestSpy = jest.fn(() => request);
      const httpModule = { request: requestSpy };
      const client = new HttpClient({
        fetchImpl: undefined,
        httpModule,
        httpsModule: httpModule,
      });

      const promise = client.fetch('http://example.com/slow', { timeoutMs: 25 });
      jest.advanceTimersByTime(25);

      await expect(promise).rejects.toMatchObject({
        name: 'TimeoutError',
        aborted: true,
        message: 'Request timed out',
      });
      expect(request.destroy).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
      if (originalFetch === undefined) {
        delete global.fetch;
      } else {
        global.fetch = originalFetch;
      }
    }
  });

  test('resolveTimeoutMs falls back to default when invalid values supplied', () => {
    const client = new HttpClient();

    expect(client.resolveTimeoutMs(undefined, undefined)).toBe(DEFAULT_TIMEOUT_MS);
    expect(client.resolveTimeoutMs(-1, undefined)).toBe(DEFAULT_TIMEOUT_MS);
    expect(client.resolveTimeoutMs(2, undefined)).toBe(2000);
    expect(client.resolveTimeoutMs(undefined, 1500)).toBe(1500);
  });
});
