import { generateText, type CallSettings } from 'ai';

import { getOpenAIRequestSettings } from '../client.js';

export type ReasoningEffort = 'low' | 'medium' | 'high';

const VALID_REASONING_EFFORTS = new Set<ReasoningEffort>(['low', 'medium', 'high']);

function normalizeReasoningEffort(value: string | null | undefined): ReasoningEffort | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase() as ReasoningEffort;
  return VALID_REASONING_EFFORTS.has(normalized) ? normalized : null;
}

const RAW_REASONING = process.env.AGENT_REASONING_EFFORT ?? process.env.OPENAI_REASONING_EFFORT;
const ENV_REASONING_EFFORT = normalizeReasoningEffort(RAW_REASONING);

if (RAW_REASONING && !ENV_REASONING_EFFORT) {
  console.warn('Reasoning effort env must be one of: low, medium, high. Ignoring invalid value.');
}

export function getConfiguredReasoningEffort(): ReasoningEffort | null {
  return ENV_REASONING_EFFORT;
}

export interface ResponseCallOptions {
  signal?: AbortSignal;
  maxRetries?: number;
}

export type ResponseCallSettings = Partial<Pick<CallSettings, 'abortSignal' | 'maxRetries'>>;

export type ProviderOptions = Parameters<typeof generateText>[0]['providerOptions'];

export function buildCallSettings(options: ResponseCallOptions | undefined): ResponseCallSettings {
  const { maxRetries } = getOpenAIRequestSettings();

  const settings: ResponseCallSettings = {};

  if (options?.signal) {
    settings.abortSignal = options.signal;
  }

  if (typeof options?.maxRetries === 'number') {
    settings.maxRetries = options.maxRetries;
  }

  if (typeof settings.maxRetries === 'undefined' && typeof maxRetries === 'number') {
    settings.maxRetries = maxRetries;
  }

  return settings;
}

export function buildProviderOptions(_reasoningEffort?: ReasoningEffort): ProviderOptions {
  return { openai: { strictJsonSchema: true } } as ProviderOptions;
}
