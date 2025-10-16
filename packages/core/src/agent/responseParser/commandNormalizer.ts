import { DEFAULT_COMMAND_MAX_BYTES } from '../../constants.js';
import type { AssistantCommand, AssistantPayload, JsonLikeObject } from './parserTypes.js';
import { isPlainObject, firstNonEmptyString } from './parserTypes.js';

const normalizeFlatCommand = (command: AssistantCommand): AssistantCommand => {
  const runString = firstNonEmptyString(command.run, command.cmd, command.command_line);
  const shellString = firstNonEmptyString(command.shell);

  if (runString) {
    const {
      run: _ignoredRun,
      cmd: _ignoredCmd,
      command_line: _ignoredCommandLine,
      shell: _ignoredShell,
      ...rest
    } = command;
    const normalized: AssistantCommand = { ...rest, run: runString };
    if (shellString) {
      normalized.shell = shellString;
    }
    return normalized;
  }

  if (shellString) {
    const {
      shell: _ignoredShell,
      cmd: _ignoredCmd,
      command_line: _ignoredCommandLine,
      ...rest
    } = command;
    return { ...rest, run: shellString };
  }

  const { cmd: _ignoredCmd, command_line: _ignoredCommandLine, ...rest } = command;
  return { ...rest };
};

const normalizeNestedRunCommand = (command: AssistantCommand): AssistantCommand => {
  const nested = command.run;
  if (!isPlainObject(nested)) {
    return normalizeFlatCommand(command);
  }

  const {
    run: nestedRun,
    command: nestedCommand,
    cmd: nestedCmd,
    command_line: nestedCommandLine,
    shell: nestedShell,
    ...nestedRest
  } = nested as JsonLikeObject & AssistantCommand;
  const {
    run: _ignoredRun,
    cmd: topLevelCmd,
    command_line: topLevelCommandLine,
    shell: topLevelShell,
    ...rest
  } = command;

  const merged: AssistantCommand = { ...rest, ...nestedRest };
  const runString = firstNonEmptyString(
    nestedCommand,
    nestedRun,
    nestedCmd,
    nestedCommandLine,
    topLevelCmd,
    topLevelCommandLine,
  );
  const shellString = firstNonEmptyString(nestedShell, topLevelShell);

  if (runString) {
    merged.run = runString;
  } else if (shellString) {
    merged.run = shellString;
  }

  if (shellString && merged.run && shellString !== merged.run) {
    merged.shell = shellString;
  }

  return merged;
};

const normalizeNestedShellCommand = (command: AssistantCommand): AssistantCommand => {
  const nested = command.shell;
  if (!isPlainObject(nested)) {
    return normalizeFlatCommand(command);
  }

  const {
    command: nestedCommand,
    run: nestedRun,
    cmd: nestedCmd,
    command_line: nestedCommandLine,
    shell: nestedShell,
    ...nestedRest
  } = nested as JsonLikeObject & AssistantCommand;
  const {
    shell: _ignoredShell,
    cmd: topLevelCmd,
    command_line: topLevelCommandLine,
    ...rest
  } = command;

  const merged: AssistantCommand = { ...nestedRest, ...rest };
  const runString = firstNonEmptyString(
    rest.run,
    nestedCommand,
    nestedRun,
    nestedCmd,
    nestedCommandLine,
    topLevelCmd,
    topLevelCommandLine,
  );
  const shellString = firstNonEmptyString(nestedShell);

  if (runString) {
    merged.run = runString;
  }

  if (shellString && shellString !== merged.run) {
    merged.shell = shellString;
  }

  return merged;
};

const applyCommandDefaults = (command: AssistantCommand): AssistantCommand => {
  if (!isPlainObject(command)) {
    return command;
  }

  const normalized = { ...command };
  const candidate = normalized.max_bytes;
  if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < 1) {
    normalized.max_bytes = DEFAULT_COMMAND_MAX_BYTES;
  }

  return normalized;
};

export const normalizeCommandPayload = (
  command: AssistantPayload['command'],
): AssistantCommand | AssistantPayload['command'] => {
  if (typeof command === 'string') {
    const trimmed = command.trim();
    if (!trimmed) {
      return applyCommandDefaults({});
    }
    return applyCommandDefaults({ run: trimmed });
  }

  if (Array.isArray(command)) {
    const parts = command
      .map((part) => {
        if (typeof part === 'string') {
          return part.trim();
        }
        if (part === null || part === undefined) {
          return '';
        }
        return String(part).trim();
      })
      .filter((part) => part);

    if (parts.length === 0) {
      return applyCommandDefaults({});
    }

    return applyCommandDefaults({ run: parts.join(' ') });
  }

  if (!isPlainObject(command)) {
    return command;
  }

  let normalizedCommand: AssistantCommand;

  if (isPlainObject((command as AssistantCommand).run)) {
    normalizedCommand = normalizeNestedRunCommand(command as AssistantCommand);
  } else if (isPlainObject((command as AssistantCommand).shell)) {
    normalizedCommand = normalizeNestedShellCommand(command as AssistantCommand);
  } else {
    normalizedCommand = normalizeFlatCommand(command as AssistantCommand);
  }

  return applyCommandDefaults(normalizedCommand);
};
