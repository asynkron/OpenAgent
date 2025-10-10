import { parseReadSpecTokens } from './readSpec.js';
import { shellSplit } from '../utils/text.js';

const READ_SCRIPT = 'scripts/read.mjs';
const READ_SCRIPT_COMMAND = 'node';

function encodeSpec(spec) {
  return Buffer.from(JSON.stringify(spec ?? {}), 'utf8').toString('base64');
}

function decodeSpec(encoded) {
  if (!encoded) {
    return null;
  }

  try {
    const json = Buffer.from(encoded, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

export function normalizeReadCommand(runValue, tokens) {
  if (typeof runValue !== 'string') {
    return { command: runValue, spec: null };
  }

  const trimmed = runValue.trim();
  if (!trimmed) {
    return { command: runValue, spec: null };
  }

  const effectiveTokens = Array.isArray(tokens) && tokens.length > 0 ? tokens : shellSplit(trimmed);
  if (!effectiveTokens.length) {
    return { command: trimmed, spec: null };
  }

  const keyword = effectiveTokens[0]?.toLowerCase();
  if (keyword !== 'read') {
    return { command: trimmed, spec: null };
  }

  const spec = parseReadSpecTokens(effectiveTokens.slice(1));
  const encoded = encodeSpec(spec);
  const normalized = `${READ_SCRIPT_COMMAND} ${READ_SCRIPT} --spec-base64 ${encoded}`;
  return { command: normalized, spec };
}

export function extractReadSpecFromCommand(runValue) {
  if (typeof runValue !== 'string') {
    return null;
  }

  const trimmed = runValue.trim();
  if (!trimmed) {
    return null;
  }

  const tokens = shellSplit(trimmed);
  if (tokens.length < 2) {
    return null;
  }

  const [firstToken, secondToken] = tokens;
  const scriptMatches =
    firstToken === READ_SCRIPT_COMMAND && (secondToken === READ_SCRIPT || secondToken.endsWith(`/${READ_SCRIPT}`));

  if (!scriptMatches) {
    return null;
  }

  for (let i = 2; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '--spec-base64') {
      const next = tokens[i + 1];
      return decodeSpec(next ?? '');
    }
    if (token.startsWith('--spec-base64=')) {
      return decodeSpec(token.slice('--spec-base64='.length));
    }
  }

  return null;
}

export default {
  normalizeReadCommand,
  extractReadSpecFromCommand,
};
