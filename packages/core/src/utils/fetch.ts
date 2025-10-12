import * as http from 'node:http';
import * as https from 'node:https';

export const DEFAULT_TIMEOUT_MS = 60_000;

type FetchImplementation = (
  input: string | URL,
  init?: {
    method?: string;
    redirect?: string;
    headers?: Record<string, string>;
    signal?: unknown;
  },
) => Promise<{
  text(): Promise<string>;
  status?: number;
  statusText?: string;
  ok?: boolean;
}>;

type AbortControllerLike = {
  readonly signal: unknown;
  abort(reason?: unknown): void;
};

type AbortControllerConstructor = new () => AbortControllerLike;

export type HttpClientRequestOptions = {
  timeoutSec?: number;
  timeoutMs?: number;
  method?: string;
  headers?: Record<string, string>;
};

export type HttpResponse = {
  body: string;
  status: number;
  statusText: string;
  ok: boolean;
};

export type HttpClientDependencies = {
  fetchImpl?: FetchImplementation | null;
  AbortControllerImpl?: AbortControllerConstructor | null;
  httpModule?: typeof http;
  httpsModule?: typeof https;
};

export type HttpClientInterface = {
  fetch: (url: string, options?: HttpClientRequestOptions) => Promise<HttpResponse>;
  isAbortLike?: (error: unknown) => boolean;
};

type InternalRequestOptions = {
  timeoutMs: number;
  method: string;
  headers?: Record<string, string>;
};

type TimeoutError = Error & { aborted: true };

/**
 * Provides fetch-like semantics backed by either the global Fetch API or Node's http/https modules.
 * Implements the {@link HttpClientInterface} contract for dependency injection and testing.
 */
export class HttpClient implements HttpClientInterface {
  private readonly fetchImpl: FetchImplementation | null;

  private readonly AbortControllerImpl: AbortControllerConstructor | null;

  private readonly httpModule: typeof http;

  private readonly httpsModule: typeof https;

  constructor(deps: HttpClientDependencies = {}) {
    this.fetchImpl = typeof deps.fetchImpl === 'function' ? deps.fetchImpl : null;
    this.AbortControllerImpl =
      typeof deps.AbortControllerImpl === 'function' ? deps.AbortControllerImpl : null;
    this.httpModule = deps.httpModule ?? http;
    this.httpsModule = deps.httpsModule ?? https;
  }

  private resolveTimeoutMs(timeoutSec?: number, timeoutMs?: number): number {
    if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs >= 0) {
      return Math.floor(timeoutMs);
    }
    if (typeof timeoutSec === 'number' && Number.isFinite(timeoutSec) && timeoutSec >= 0) {
      return Math.floor(timeoutSec * 1000);
    }
    return DEFAULT_TIMEOUT_MS;
  }

  private createTimeoutError(message = 'Request timed out'): TimeoutError {
    const error = new Error(message) as TimeoutError;
    error.name = 'TimeoutError';
    error.aborted = true;
    return error;
  }

  isAbortLike(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === 'object' &&
        ((typeof (error as { aborted?: unknown }).aborted === 'boolean' &&
          (error as { aborted?: unknown }).aborted === true) ||
          (error as { name?: unknown }).name === 'TimeoutError' ||
          (error as { name?: unknown }).name === 'AbortError'),
    );
  }

  async fetch(url: string, options: HttpClientRequestOptions = {}): Promise<HttpResponse> {
    const method = options.method ?? 'GET';
    const headers = options.headers;
    const timeoutMs = this.resolveTimeoutMs(options.timeoutSec, options.timeoutMs);
    const effectiveOptions: InternalRequestOptions = { method, headers, timeoutMs };

    const abortControllerImpl =
      this.AbortControllerImpl ??
      (globalThis.AbortController as AbortControllerConstructor | undefined) ??
      null;

    if (this.fetchImpl) {
      return this.fetchWithGlobal(url, effectiveOptions, this.fetchImpl, abortControllerImpl);
    }

    const globalFetch = globalThis.fetch as FetchImplementation | undefined;
    if (typeof globalFetch === 'function') {
      return this.fetchWithGlobal(url, effectiveOptions, globalFetch, abortControllerImpl);
    }

    return this.fetchWithNode(url, effectiveOptions);
  }

  private async fetchWithGlobal(
    url: string,
    { timeoutMs, method, headers }: InternalRequestOptions,
    fetchImpl: FetchImplementation,
    AbortControllerImpl: AbortControllerConstructor | null,
  ): Promise<HttpResponse> {
    const controller = AbortControllerImpl ? new AbortControllerImpl() : null;

    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    const options: {
      method: string;
      redirect: 'follow';
      signal?: unknown;
      headers?: Record<string, string>;
    } = {
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
            // Ignore abort failures; we'll fall back to rejecting below.
            void error;
          }
        }, timeoutMs);
      }

      const response = await fetchImpl(url, options);
      const body = await response.text();

      return {
        body,
        status: response.status ?? 0,
        statusText: response.statusText ?? '',
        ok: response.ok ?? (response.status !== undefined
          ? response.status >= 200 && response.status < 300
          : false),
      };
    } catch (error) {
      if (timedOut && (error as { name?: string }).name === 'AbortError') {
        throw this.createTimeoutError();
      }
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private fetchWithNode(url: string, { timeoutMs, method, headers }: InternalRequestOptions): Promise<HttpResponse> {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? this.httpsModule : this.httpModule;

    return new Promise<HttpResponse>((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | undefined;

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
          const chunks: Buffer[] = [];

          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            clearTimer();
            const status = res.statusCode ?? 0;
            resolve({
              body: Buffer.concat(chunks).toString('utf8'),
              status,
              statusText: res.statusMessage ?? '',
              ok: status >= 200 && status < 300,
            });
          });
        },
      );

      req.on('error', (error) => {
        clearTimer();
        if ((error as Error)?.message === 'Request timed out') {
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
