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

import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';

const LEGACY_CHAT_COMPLETION_MODELS = [/^gpt-3\.5-turbo/, /^text-davinci/i];

const MISSING_API_KEY_SUMMARY =
  'No API key found. Action required: copy .env.example to packages/cli/.env and set AGENT_API_KEY=<your key> (or OPENAI_API_KEY for OpenAI) before re-running OpenAgent.';

const MISSING_API_KEY_GUIDANCE = [
  'How to fix it:',
  '1. Copy the template env file: cp packages/cli/.env.example packages/cli/.env',
  '2. Open packages/cli/.env and set AGENT_API_KEY (or OPENAI_API_KEY).',
  '3. Save the file and restart OpenAgent (`npm start` or `npx openagent`).',
  'OpenAI users: https://platform.openai.com/api-keys',
].join('\n');

interface ResolvedConfiguration {
  model: string;
  baseURL: string | null;
  timeout: number | undefined;
  maxRetries: number | undefined;
}

let memoizedClient: OpenAIProvider | null = null;
let resolvedConfig: ResolvedConfiguration = resolveConfiguration();

export let MODEL: string = resolvedConfig.model;

export function getOpenAIClient(): OpenAIProvider {
  if (!memoizedClient) {
    const apiKey = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        [MISSING_API_KEY_SUMMARY, '', MISSING_API_KEY_GUIDANCE].join('\n'),
      );
    }

    const clientOptions = {
      apiKey,
      baseURL: resolvedConfig.baseURL || undefined,
    } satisfies Parameters<typeof createOpenAI>[0];

    memoizedClient = createOpenAI(clientOptions);
  }
  return memoizedClient;
}

export function resetOpenAIClient(): void {
  memoizedClient = null;
  resolvedConfig = resolveConfiguration();
  MODEL = resolvedConfig.model;
}

function resolveConfiguration(): ResolvedConfiguration {
  const { model, baseURL } = validateModelConfiguration();

  return {
    model,
    baseURL,
    timeout: parseTimeout(process.env.OPENAI_TIMEOUT_MS),
    maxRetries: parseMaxRetries(process.env.OPENAI_MAX_RETRIES),
  };
}

function validateModelConfiguration(): { model: string; baseURL: string | null } {
  const configuredModel = process.env.AGENT_MODEL ?? process.env.OPENAI_MODEL;
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

  const baseURL = process.env.AGENT_BASE_URL || process.env.OPENAI_BASE_URL || null;

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

function parseTimeout(rawValue: string | undefined): number | undefined {
  if (typeof rawValue === 'undefined') {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('OPENAI_TIMEOUT_MS must be a positive integer when provided.');
  }

  return parsed;
}

function parseMaxRetries(rawValue: string | undefined): number | undefined {
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

export interface OpenAIRequestSettings {
  timeoutMs: number | null;
  maxRetries: number | null;
}

export function getOpenAIRequestSettings(): OpenAIRequestSettings {
  return {
    timeoutMs: resolvedConfig.timeout ?? null,
    maxRetries: resolvedConfig.maxRetries ?? null,
  };
}
