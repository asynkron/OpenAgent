import * as http from 'node:http';
import * as https from 'node:https';

export const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * @typedef {Object} HttpClientRequestOptions
 * @property {number} [timeoutSec]
 * @property {number} [timeoutMs]
 * @property {string} [method]
 * @property {Record<string, string>} [headers]
 */

/**
 * @typedef {Object} HttpResponse
 * @property {string} body
 * @property {number} status
 * @property {string} statusText
 * @property {boolean} ok
 */

/**
 * @typedef {Object} HttpClientDependencies
 * @property {typeof fetch} [fetchImpl]
 * @property {typeof AbortController} [AbortControllerImpl]
 * @property {typeof http} [httpModule]
 * @property {typeof https} [httpsModule]
 */

/**
 * @typedef {Object} HttpClientInterface
 * @property {(url: string, options?: HttpClientRequestOptions) => Promise<HttpResponse>} fetch
 * @property {(error: unknown) => boolean} [isAbortLike]
 */

/**
 * Provides fetch-like semantics backed by either the global Fetch API or Node's http/https modules.
 * Implements the {@link HttpClientInterface} contract for dependency injection and testing.
 */
export class HttpClient {
  /**
   * @param {HttpClientDependencies} [deps]
   */
  constructor(deps = {}) {
    this.fetchImpl = typeof deps.fetchImpl === 'function' ? deps.fetchImpl : null;
    this.AbortControllerImpl =
      typeof deps.AbortControllerImpl === 'function' ? deps.AbortControllerImpl : null;
    this.httpModule = deps.httpModule || http;
    this.httpsModule = deps.httpsModule || https;
  }

  /**
   * @param {number|undefined} timeoutSec
   * @param {number|undefined} timeoutMs
   * @returns {number}
   */
  resolveTimeoutMs(timeoutSec, timeoutMs) {
    if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs >= 0) {
      return Math.floor(timeoutMs);
    }
    if (typeof timeoutSec === 'number' && Number.isFinite(timeoutSec) && timeoutSec >= 0) {
      return Math.floor(timeoutSec * 1000);
    }
    return DEFAULT_TIMEOUT_MS;
  }

  /**
   * @param {string} [message]
   * @returns {Error & { aborted: boolean }}
   */
  createTimeoutError(message = 'Request timed out') {
    const error = new Error(message);
    error.name = 'TimeoutError';
    error.aborted = true;
    return error;
  }

  /**
   * @param {unknown} error
   * @returns {boolean}
   */
  isAbortLike(error) {
    return Boolean(
      error &&
        typeof error === 'object' &&
        ((error.aborted && error.aborted === true) ||
          error.name === 'TimeoutError' ||
          error.name === 'AbortError'),
    );
  }

  /**
   * @param {string} url
   * @param {HttpClientRequestOptions} [options]
   * @returns {Promise<HttpResponse>}
   */
  async fetch(url, options = {}) {
    const fetchImpl = typeof this.fetchImpl === 'function' ? this.fetchImpl : globalThis.fetch;
    const abortControllerImpl =
      typeof this.AbortControllerImpl === 'function'
        ? this.AbortControllerImpl
        : globalThis.AbortController;

    const method = options.method || 'GET';
    const headers = options.headers;
    const timeoutMs = this.resolveTimeoutMs(options.timeoutSec, options.timeoutMs);
    const effectiveOptions = { method, headers, timeoutMs };

    if (typeof fetchImpl === 'function') {
      return this.fetchWithGlobal(url, effectiveOptions, fetchImpl, abortControllerImpl);
    }

    return this.fetchWithNode(url, effectiveOptions);
  }

  /**
   * @private
   */
  async fetchWithGlobal(url, { timeoutMs, method, headers }, fetchImpl, AbortControllerImpl) {
    const controller = AbortControllerImpl ? new AbortControllerImpl() : null;

    let timedOut = false;
    let timeoutHandle;

    const options = {
      method,
      redirect: 'follow',
      signal: controller?.signal,
    };

    if (headers && typeof headers === 'object') {
      options.headers = headers;
    }

    try {
      if (controller && timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          try {
            controller.abort();
          } catch (error) {
            void error;
          }
        }, timeoutMs);
      }

      const response = await fetchImpl(url, options);
      const body = await response.text();

      return {
        body,
        status: response.status ?? 0,
        statusText: response.statusText || '',
        ok: response.ok ?? (response.status >= 200 && response.status < 300),
      };
    } catch (error) {
      if (timedOut && error && error.name === 'AbortError') {
        throw this.createTimeoutError();
      }
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * @private
   */
  fetchWithNode(url, { timeoutMs, method, headers }) {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? this.httpsModule : this.httpModule;

    return new Promise((resolve, reject) => {
      let timeoutHandle;

      const clearTimer = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = undefined;
        }
      };

      const req = lib.request(
        {
          method,
          hostname: parsed.hostname,
          port: parsed.port,
          path: `${parsed.pathname}${parsed.search}`,
          headers: headers && typeof headers === 'object' ? headers : {},
        },
        (res) => {
          const chunks = [];

          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            clearTimer();
            const status = res.statusCode ?? 0;
            resolve({
              body: Buffer.concat(chunks).toString('utf8'),
              status,
              statusText: res.statusMessage || '',
              ok: status >= 200 && status < 300,
            });
          });
        },
      );

      req.on('error', (error) => {
        clearTimer();
        if (error && error.message === 'Request timed out') {
          reject(this.createTimeoutError());
        } else {
          reject(error);
        }
      });

      if (timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          req.destroy(new Error('Request timed out'));
        }, timeoutMs);
      }

      req.end();
    });
  }
}
