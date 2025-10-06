const VALID_REASONING_EFFORTS = new Set(['low', 'medium', 'high']);

function normalizeReasoningEffort(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return VALID_REASONING_EFFORTS.has(normalized) ? normalized : null;
}

const ENV_REASONING_EFFORT = normalizeReasoningEffort(process.env.OPENAI_REASONING_EFFORT);

if (process.env.OPENAI_REASONING_EFFORT && !ENV_REASONING_EFFORT) {
  console.warn(
    'OPENAI_REASONING_EFFORT is set but must be one of: low, medium, high. Ignoring invalid value.',
  );
}

export function getConfiguredReasoningEffort() {
  return ENV_REASONING_EFFORT;
}

export function createResponse({ openai, model, input, text, options, reasoningEffort }) {
  if (!openai || !openai.responses || typeof openai.responses.create !== 'function') {
    throw new Error('Invalid OpenAI client instance provided.');
  }

  const payload = {
    model,
    input,
  };

  if (typeof text !== 'undefined') {
    payload.text = text;
  }

  const effort = normalizeReasoningEffort(reasoningEffort) ?? ENV_REASONING_EFFORT;
  if (effort) {
    payload.reasoning = { effort };
  }

  return openai.responses.create(payload, options);
}

export default {
  createResponse,
  getConfiguredReasoningEffort,
};
