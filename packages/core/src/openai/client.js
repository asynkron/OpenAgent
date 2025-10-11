/**
 * OpenAI client factory shared across the CLI runtime.
 *
 * Responsibilities:
 * - Lazily instantiate and memoize the OpenAI SDK client using environment variables.
 * - Expose the current model identifier consumed by the agent loop.
 *
 * Consumers:
 * - `src/agent/loop.js` obtains the memoized client through `getOpenAIClient()`.
 * - Unit tests call `resetOpenAIClient()` via the root `index.js` re-export when they need a clean slate.
 */

import OpenAI from 'openai';

const LEGACY_CHAT_COMPLETION_MODELS = [/^gpt-3\.5-turbo/, /^text-davinci/i];

let memoizedClient = null;
let resolvedConfig = resolveConfiguration();

export let MODEL = resolvedConfig.model;

export function getOpenAIClient() {
  if (!memoizedClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        [
          'OPENAI_API_KEY is missing.',
          'Action required: copy .env.example to packages/cli/.env and set OPENAI_API_KEY=<your key> before re-running OpenAgent.',
        ].join(' '),
      );
    }

    const clientOptions = {
      apiKey,
      baseURL: resolvedConfig.baseURL || undefined,
    };

    if (typeof resolvedConfig.timeout === 'number') {
      clientOptions.timeout = resolvedConfig.timeout;
    }

    if (typeof resolvedConfig.maxRetries === 'number') {
      clientOptions.maxRetries = resolvedConfig.maxRetries;
    }

    memoizedClient = new OpenAI(clientOptions);
  }
  return memoizedClient;
}

export function resetOpenAIClient() {
  memoizedClient = null;
  resolvedConfig = resolveConfiguration();
  MODEL = resolvedConfig.model;
}

function resolveConfiguration() {
  const { model, baseURL } = validateModelConfiguration();

  return {
    model,
    baseURL,
    timeout: parseTimeout(process.env.OPENAI_TIMEOUT_MS),
    maxRetries: parseMaxRetries(process.env.OPENAI_MAX_RETRIES),
  };
}

function validateModelConfiguration() {
  const configuredModel = process.env.OPENAI_MODEL;
  const legacyChatModel = process.env.OPENAI_CHAT_MODEL;

  if (configuredModel && legacyChatModel && configuredModel !== legacyChatModel) {
    throw new Error(
      'OPENAI_MODEL and OPENAI_CHAT_MODEL are both set but contain different values. Configure a single responses-compatible model.',
    );
  }

  if (legacyChatModel && !configuredModel) {
    console.warn(
      'OPENAI_CHAT_MODEL is deprecated; prefer OPENAI_MODEL. Using the chat model value for responses compatibility checks.',
    );
  }

  const selectedModel = configuredModel || legacyChatModel || 'gpt-5-codex';

  if (LEGACY_CHAT_COMPLETION_MODELS.some((pattern) => pattern.test(selectedModel))) {
    throw new Error(
      `Configured model "${selectedModel}" targets the legacy Chat Completions API. Configure a model that supports the Responses API (for example gpt-4.1 or gpt-4o).`,
    );
  }

  const baseURL = process.env.OPENAI_BASE_URL || null;

  if (baseURL) {
    let parsed;
    try {
      parsed = new URL(baseURL);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OPENAI_BASE_URL must be a valid URL: ${message}`);
    }

    if (/\/v1\/(chat\/completions|completions)$/.test(parsed.pathname)) {
      throw new Error(
        'OPENAI_BASE_URL should reference the API root (e.g., https://api.openai.com/v1) rather than a specific completions endpoint.',
      );
    }
  }

  return { model: selectedModel, baseURL };
}

function parseTimeout(rawValue) {
  if (typeof rawValue === 'undefined') {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('OPENAI_TIMEOUT_MS must be a positive integer when provided.');
  }

  return parsed;
}

function parseMaxRetries(rawValue) {
  if (typeof rawValue === 'undefined') {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('OPENAI_MAX_RETRIES must be a non-negative integer when provided.');
  }

  return parsed;
}

export default {
  getOpenAIClient,
  resetOpenAIClient,
  MODEL,
};
