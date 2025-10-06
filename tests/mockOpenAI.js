import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, jest } from '@jest/globals';

const thisFilePath = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFilePath);
const originalUnstableMockModule = jest.unstable_mockModule.bind(jest);

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
    if (candidate.endsWith('tests/mockOpenAI.js')) continue;
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

      return originalUnstableMockModule(rewrittenSpecifier, factory, options);
    }
  }

  return originalUnstableMockModule(specifier, factory, options);
};

function createMockResponse() {
  return {
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              message: 'Mocked response',
              plan: [],
              command: {
                shell: 'bash',
                run: 'echo "MOCKED_OK"',
                cwd: '.',
                timeout_sec: 5,
              },
            }),
          },
        ],
      },
    ],
  };
}

function OpenAIMock() {
  return {
    responses: {
      create: async () => createMockResponse(),
    },
  };
}

// Default stub used by suites that do not override the OpenAI client explicitly.
const registerOpenAIMock = () => {
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

registerOpenAIMock();

beforeEach(() => {
  registerOpenAIMock();
});
