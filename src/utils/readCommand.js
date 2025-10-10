import { shellSplit } from './text.js';

const READ_SCRIPT = 'scripts/read.mjs';
const READ_SCRIPT_COMMAND = 'node';

function encodeReadSpec(spec) {
  return Buffer.from(JSON.stringify(spec ?? {}), 'utf8').toString('base64');
}

function decodeReadSpec(encoded) {
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

export function buildReadCommand(spec) {
  const encoded = encodeReadSpec(spec);
  return `${READ_SCRIPT_COMMAND} ${READ_SCRIPT} --spec-base64 ${encoded}`;
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
      return decodeReadSpec(next ?? '');
    }
    if (token.startsWith('--spec-base64=')) {
      return decodeReadSpec(token.slice('--spec-base64='.length));
    }
  }

  return null;
}

export { READ_SCRIPT, READ_SCRIPT_COMMAND };

export default {
  READ_SCRIPT,
  READ_SCRIPT_COMMAND,
  buildReadCommand,
  extractReadSpecFromCommand,
};
