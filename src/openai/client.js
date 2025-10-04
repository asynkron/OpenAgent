"use strict";

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

const OpenAI = require('openai');

let memoizedClient = null;

function getOpenAIClient() {
  if (!memoizedClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not found in environment variables.');
    }
    memoizedClient = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }
  return memoizedClient;
}

function resetOpenAIClient() {
  memoizedClient = null;
}

const MODEL = process.env.OPENAI_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-5-codex';

module.exports = {
  getOpenAIClient,
  resetOpenAIClient,
  MODEL,
};
