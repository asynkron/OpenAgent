import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, jest } from '@jest/globals';

const thisFilePath = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFilePath);
const originalUnstableMockModule = jest.unstable_mockModule.bind(jest);
const shouldMockOpenAI = process.env.OPENAGENT_LIVE_OPENAI !== '1';
const mockingEnabled = shouldMockOpenAI;

// Allow test files to continue using relative specifiers when mocking alongside this setup file.
function resolveCallerPath() {
  const error = new Error();
  const stackLines = typeof error.stack === 'string' ? error.stack.split('\n').slice(2) : [];

  for (const line of stackLines) {
    const match =
      line.match(/\((.*?):\d+:\d+\)/) ??
      line.match(/at ([^\s]+:\d+:\d+)/) ??
      line.match(/at ([^\s]+)/);

    if (!match) continue;
    let candidate = match[1];

    if (candidate.startsWith('file://')) {
      candidate = fileURLToPath(candidate);
    }

    if (candidate === thisFilePath) continue;
    if (candidate.endsWith('tests/mockOpenAI.ts')) continue;
    if (candidate.includes('node_modules/jest')) continue;

    return candidate;
  }

  return null;
}

jest.unstable_mockModule = (specifier, factory, options) => {
  if (typeof specifier === 'string' && specifier.startsWith('.')) {
    const callerPath = resolveCallerPath();

    if (callerPath) {
      const targetPath = path.resolve(path.dirname(callerPath), specifier);
      let rewrittenSpecifier = path.relative(thisDir, targetPath).replace(/\\/g, '/');

      if (!rewrittenSpecifier.startsWith('.')) {
        rewrittenSpecifier = `./${rewrittenSpecifier}`;
      }

      if (rewrittenSpecifier.endsWith('.js')) {
        const jsExists = fs.existsSync(targetPath);
        if (!jsExists) {
          const replacementExt = ['.ts', '.tsx', '.jsx'].find((extension) =>
            fs.existsSync(targetPath.replace(/\.js$/, extension)),
          );

          if (replacementExt) {
            // Tests mock against the TypeScript/TSX sources; rewrite specifiers when the
            // compiled JavaScript sibling is absent so Babel can resolve the module.
            rewrittenSpecifier = rewrittenSpecifier.replace(/\.js$/, replacementExt);
          }
        }
      }

      return originalUnstableMockModule(rewrittenSpecifier, factory, options);
    }
  }

  return originalUnstableMockModule(specifier, factory, options);
};

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}

function buildResponsePayload(payload, callId) {
  const normalized = sanitizePayload(payload);
  return {
    output: [
      {
        type: 'function_call',
        name: 'open-agent',
        call_id: callId ?? null,
        arguments: JSON.stringify(normalized),
      },
    ],
  };
}

function OpenAIMock() {
  let callCount = 0;

  return {
    responses: {
      create: async () => {
        callCount += 1;

        const callId = `mock-call-${callCount}`;

        if (callCount === 1) {
          return buildResponsePayload(
            {
              message: 'Handshake ready',
              plan: [],
            },
            callId,
          );
        }

        return buildResponsePayload(
          {
            message: 'Mocked response',
            plan: [],
            command: {
              shell: 'bash',
              run: 'echo "MOCKED_OK"',
              cwd: '.',
              timeout_sec: 5,
            },
          },
          callId,
        );
      },
    },
  };
}

// Default stub used by suites that do not override the OpenAI client explicitly.
const registerOpenAIMock = () => {
  if (!mockingEnabled) {
    return;
  }
  jest.unstable_mockModule('openai', () => ({
    default: OpenAIMock,
    OpenAI: OpenAIMock,
  }));
};

const originalResetModules =
  typeof jest.resetModules === 'function' ? jest.resetModules.bind(jest) : null;

if (originalResetModules) {
  jest.resetModules = (...args) => {
    const result = originalResetModules(...args);
    registerOpenAIMock();
    return result;
  };
}

if (mockingEnabled) {
  registerOpenAIMock();
}

beforeEach(() => {
  registerOpenAIMock();
});
