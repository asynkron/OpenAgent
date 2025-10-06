import { parseReadSpecTokens, mergeReadSpecs } from '../commands/readSpec.js';
import { shellSplit } from '../utils/text.js';

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
  let result;
  let executionDetails = { type: 'EXECUTE', command };

  if (command?.edit) {
    result = await runEditFn(command.edit, command.cwd || '.');
    executionDetails = { type: 'EDIT', spec: command.edit };
  }

  if (typeof result === 'undefined' && command?.read) {
    result = await runReadFn(command.read, command.cwd || '.');
    executionDetails = { type: 'READ', spec: command.read };
  }

  if (typeof result === 'undefined' && command?.escape_string) {
    result = await runEscapeStringFn(command.escape_string, command.cwd || '.');
    executionDetails = { type: 'ESCAPE_STRING', spec: command.escape_string };
  }

  if (typeof result === 'undefined' && command?.unescape_string) {
    result = await runUnescapeStringFn(command.unescape_string, command.cwd || '.');
    executionDetails = { type: 'UNESCAPE_STRING', spec: command.unescape_string };
  }

  if (typeof result === 'undefined' && command?.replace) {
    result = await runReplaceFn(command.replace, command.cwd || '.');
    executionDetails = { type: 'REPLACE', spec: command.replace };
  }

  if (typeof result === 'undefined') {
    const runStrRaw = typeof command?.run === 'string' ? command.run : '';
    const runStr = runStrRaw.trim();

    if (runStr) {
      const tokens = shellSplit(runStr);
      const commandKeyword = tokens[0] ? tokens[0].toLowerCase() : '';

      if (commandKeyword === 'browse') {
        const target = tokens.slice(1).join(' ').trim();
        if (target) {
          result = await runBrowseFn(target, command.timeout_sec ?? 60);
          executionDetails = { type: 'BROWSE', target };
        }
      } else if (commandKeyword === 'read') {
        const readTokens = tokens.slice(1);
        const specFromTokens = parseReadSpecTokens(readTokens);
        const mergedSpec = mergeReadSpecs(command.read || {}, specFromTokens);

        if (mergedSpec.path) {
          result = await runReadFn(mergedSpec, command.cwd || '.');
          executionDetails = { type: 'READ', spec: mergedSpec };
        } else {
          result = {
            stdout: '',
            stderr: 'read command requires a path argument',
            exit_code: 1,
            killed: false,
            runtime_ms: 0,
          };
        }
      }
    }

    if (typeof result === 'undefined') {
      result = await runCommandFn(
        command?.run,
        command?.cwd || '.',
        command?.timeout_sec ?? 60,
        command?.shell,
      );
      executionDetails = { type: 'EXECUTE', command };
    }
  }

  return { result, executionDetails };
}
