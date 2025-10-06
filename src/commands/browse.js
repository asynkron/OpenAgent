import { HttpClient } from '../utils/fetch.js';

const defaultHttpClient = new HttpClient();

function formatStatusMessage(status, statusText = '') {
  if (!status) {
    return statusText || 'HTTP error';
  }
  const trimmed = statusText.trim();
  return trimmed ? `HTTP ${status} ${trimmed}` : `HTTP ${status}`;
}

export async function runBrowse(url, timeoutSec, client = defaultHttpClient) {
  const startTime = Date.now();
  const httpClient = client ?? defaultHttpClient;
  let stdout = '';
  let stderr = '';
  let exit_code = 0;
  let killed = false;

  try {
    const response = await httpClient.fetch(url, {
      timeoutSec,
      method: 'GET',
    });

    stdout = response.body;

    if (!response.ok) {
      exit_code = response.status || 1;
      stderr = formatStatusMessage(response.status, response.statusText);
    }
  } catch (error) {
    exit_code = 1;
    stdout = '';

    let message = '';
    if (error && typeof error.message === 'string') {
      const trimmed = error.message.trim();
      if (trimmed) {
        message = trimmed;
      }
    }

    if (!message && typeof error === 'string' && error.trim()) {
      message = error.trim();
    }

    if (!message && error) {
      const stringified = String(error ?? '').trim();
      if (stringified && stringified !== 'Error') {
        message = stringified;
      }
    }

    if (!message) {
      message = 'Unknown browse error';
    }

    stderr = message;

    const isAbort =
      typeof httpClient.isAbortLike === 'function' && httpClient.isAbortLike(error);
    if (isAbort) {
      killed = true;
      if (
        error?.name === 'AbortError' &&
        !error.aborted &&
        stderr === 'The operation was aborted.'
      ) {
        stderr = 'Request aborted';
      }
    }
  }

  return {
    stdout,
    stderr: stderr.trim(),
    exit_code,
    killed,
    runtime_ms: Date.now() - startTime,
  };
}

export default { runBrowse };