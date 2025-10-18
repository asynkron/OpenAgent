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

  private createAbortController(
    Impl: AbortControllerConstructor | null,
  ): AbortControllerLike | null {
    if (!Impl) {
      return null;
    }

    try {
      return new Impl();
    } catch (error) {
      // If the constructor throws (e.g., running on an unsupported platform), fall back gracefully.
      void error;
      return null;
    }
  }

  private getAbortControllerImpl(): AbortControllerConstructor | null {
    if (this.AbortControllerImpl) {
      return this.AbortControllerImpl;
    }

    const globalImpl = globalThis.AbortController as AbortControllerConstructor | undefined;
    return typeof globalImpl === 'function' ? globalImpl : null;
  }

  private configureTimeout(
    controller: AbortControllerLike | null,
    timeoutMs: number,
  ): { clear(): void; didTimeout(): boolean } {
    if (!controller || timeoutMs <= 0) {
      return { clear: () => void 0, didTimeout: () => false };
    }

    let timedOut = false;
    const handle = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort();
      } catch (error) {
        // Avoid surfacing abort errors; callers will receive a timeout via the guard below.
        void error;
      }
    }, timeoutMs);

    return {
      clear: () => clearTimeout(handle),
      didTimeout: () => timedOut,
    };
  }

  // Coerce arbitrary header maps into a clean `Record<string, string>` for both fetch variants.
  private normalizeHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
    if (!headers || typeof headers !== 'object') {
      return undefined;
    }

    const entries = Object.entries(headers).filter((entry): entry is [string, string] => {
      return typeof entry[0] === 'string' && typeof entry[1] === 'string';
    });

    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  private toHttpResponse(
    body: string,
    response: {
      status?: number;
      statusText?: string;
      ok?: boolean;
    },
  ): HttpResponse {
    const status = response.status ?? 0;
    const statusText = response.statusText ?? '';
    const ok = typeof response.ok === 'boolean' ? response.ok : status >= 200 && status < 300;

    return { body, status, statusText, ok };
  }

  isAbortLike(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as { aborted?: unknown; name?: unknown };
    if (candidate.aborted === true) {
      return true;
    }

    return candidate.name === 'TimeoutError' || candidate.name === 'AbortError';
  }

  async fetch(url: string, options: HttpClientRequestOptions = {}): Promise<HttpResponse> {
    const method = options.method ?? 'GET';
    const headers = options.headers;
    const timeoutMs = this.resolveTimeoutMs(options.timeoutSec, options.timeoutMs);
    const effectiveOptions: InternalRequestOptions = { method, headers, timeoutMs };

    const abortControllerImpl = this.getAbortControllerImpl();

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
    abortControllerCtor: AbortControllerConstructor | null,
  ): Promise<HttpResponse> {
    const controller = this.createAbortController(abortControllerCtor);
    const timeout = this.configureTimeout(controller, timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method,
        redirect: 'follow',
        signal: controller?.signal,
        headers: this.normalizeHeaders(headers),
      });

      const body = await response.text();
      return this.toHttpResponse(body, response);
    } catch (error) {
      if (timeout.didTimeout() && (error as { name?: string }).name === 'AbortError') {
        throw this.createTimeoutError();
      }
      throw error;
    } finally {
      timeout.clear();
    }
  }

  private createNodeRequestOptions(
    parsed: URL,
    method: string,
    headers?: Record<string, string>,
  ): http.RequestOptions {
    return {
      method,
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      headers: this.normalizeHeaders(headers) ?? {},
    };
  }

  // Stream the response body into a Buffer before normalizing it for consumers.
  private collectNodeResponse(res: http.IncomingMessage): Promise<HttpResponse> {
    return new Promise<HttpResponse>((resolve, reject) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        resolve({
          body: Buffer.concat(chunks).toString('utf8'),
          status,
          statusText: res.statusMessage ?? '',
          ok: status >= 200 && status < 300,
        });
      });

      res.on('error', reject);
    });
  }

  // Mirror the fetch timeout behaviour for the Node http/https code path.
  private attachNodeTimeout(req: http.ClientRequest, timeoutMs: number): () => void {
    if (timeoutMs <= 0) {
      return () => void 0;
    }

    const handle = setTimeout(() => {
      req.destroy(new Error('Request timed out'));
    }, timeoutMs);

    return () => clearTimeout(handle);
  }

  private fetchWithNode(
    url: string,
    { timeoutMs, method, headers }: InternalRequestOptions,
  ): Promise<HttpResponse> {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? this.httpsModule : this.httpModule;

    return new Promise<HttpResponse>((resolve, reject) => {
      const requestOptions = this.createNodeRequestOptions(parsed, method, headers);
      let clearTimeoutHandle: () => void = () => void 0;

      const req = lib.request(requestOptions, (res) => {
        this.collectNodeResponse(res)
          .then((response) => {
            clearTimeoutHandle();
            resolve(response);
          })
          .catch((error) => {
            clearTimeoutHandle();
            reject(error);
          });
      });

      clearTimeoutHandle = this.attachNodeTimeout(req, timeoutMs);

      req.on('error', (error) => {
        clearTimeoutHandle();
        if ((error as Error)?.message === 'Request timed out') {
          reject(this.createTimeoutError());
          return;
        }
        reject(error);
      });

      req.on('close', clearTimeoutHandle);

      req.end();
    });
  }
}
