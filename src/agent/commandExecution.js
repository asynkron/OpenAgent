import { parseReadSpecTokens, mergeReadSpecs } from '../commands/readSpec.js';
import { shellSplit } from '../utils/text.js';

const DEFAULT_TIMEOUT_SEC = 60;

function buildReadResult({ result, spec }) {
  return {
    result,
    executionDetails: { type: 'READ', spec },
  };
}

function buildErrorResult(message) {
  return {
    stdout: '',
    stderr: message,
    exit_code: 1,
    killed: false,
    runtime_ms: 0,
  };
}

async function runRead({
  baseSpec = {},
  tokenSpec = {},
  cwd,
  runReadFn,
}) {
  const mergedSpec = mergeReadSpecs(baseSpec, tokenSpec);

  if (!mergedSpec.path) {
    return buildReadResult({
      result: buildErrorResult('read command requires a path argument'),
      spec: mergedSpec,
    });
  }

  const result = await runReadFn(mergedSpec, cwd);
  return buildReadResult({ result, spec: mergedSpec });
}

export async function executeAgentCommand({
  command,
  runCommandFn,
  runBrowseFn,
  runEditFn,
  runReadFn,
  runReplaceFn,
  runEscapeStringFn,
  runUnescapeStringFn,
}) {
  const normalizedCommand = command || {};
  const cwd = normalizedCommand.cwd || '.';
  const timeout =
    typeof normalizedCommand.timeout_sec === 'number'
      ? normalizedCommand.timeout_sec
      : DEFAULT_TIMEOUT_SEC;

  if (normalizedCommand.edit) {
    const result = await runEditFn(normalizedCommand.edit, cwd);
    return { result, executionDetails: { type: 'EDIT', spec: normalizedCommand.edit } };
  }

  if (normalizedCommand.escape_string) {
    const result = await runEscapeStringFn(normalizedCommand.escape_string, cwd);
    return {
      result,
      executionDetails: { type: 'ESCAPE_STRING', spec: normalizedCommand.escape_string },
    };
  }

  if (normalizedCommand.unescape_string) {
    const result = await runUnescapeStringFn(normalizedCommand.unescape_string, cwd);
    return {
      result,
      executionDetails: { type: 'UNESCAPE_STRING', spec: normalizedCommand.unescape_string },
    };
  }

  if (normalizedCommand.replace) {
    const result = await runReplaceFn(normalizedCommand.replace, cwd);
    return { result, executionDetails: { type: 'REPLACE', spec: normalizedCommand.replace } };
  }

  const runValue =
    typeof normalizedCommand.run === 'string' ? normalizedCommand.run.trim() : '';

  if (runValue) {
    const tokens = shellSplit(runValue);
    const keyword = tokens[0]?.toLowerCase() || '';

    if (keyword === 'browse') {
      const target = tokens.slice(1).join(' ').trim();

      if (!target) {
        const result = buildErrorResult('browse command requires a URL argument');
        return { result, executionDetails: { type: 'BROWSE', target: '' } };
      }

      const result = await runBrowseFn(target, timeout);
      return { result, executionDetails: { type: 'BROWSE', target } };
    }

    if (keyword === 'read') {
      const tokenSpec = parseReadSpecTokens(tokens.slice(1));
      const baseSpec =
        normalizedCommand.read && typeof normalizedCommand.read === 'object'
          ? normalizedCommand.read
          : {};

      const readResult = await runRead({
        baseSpec,
        tokenSpec,
        cwd,
        runReadFn,
      });

      return readResult;
    }
  }

  if (normalizedCommand.read) {
    const baseSpec =
      typeof normalizedCommand.read === 'object' ? normalizedCommand.read : {};
    const readResult = await runRead({ baseSpec, tokenSpec: {}, cwd, runReadFn });
    return readResult;
  }

  const result = await runCommandFn(
    normalizedCommand.run,
    cwd,
    timeout,
    normalizedCommand.shell,
  );

  return { result, executionDetails: { type: 'EXECUTE', command: normalizedCommand } };
}

export default {
  executeAgentCommand,
};
