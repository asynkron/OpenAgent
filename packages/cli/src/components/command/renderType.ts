import type {
  CommandDefinition,
  CommandExecutionEnvelope,
  CommandExecutionSpec,
  CommandRenderType,
} from './commandTypes.js';

function normalizeExecutionSpec(spec: CommandExecutionSpec | null | undefined): CommandExecutionSpec {
  if (!spec || typeof spec !== 'object') {
    return undefined;
  }
  return spec;
}

export function normalizeExecution(
  execution: CommandExecutionEnvelope | null | undefined,
  previewExecution: CommandExecutionEnvelope | null | undefined,
): CommandExecutionEnvelope {
  if (execution && typeof execution === 'object') {
    return { ...execution, spec: normalizeExecutionSpec(execution.spec) };
  }

  if (previewExecution && typeof previewExecution === 'object') {
    return { ...previewExecution, spec: normalizeExecutionSpec(previewExecution.spec) };
  }

  return { spec: undefined };
}

export function inferCommandType(
  command: CommandDefinition | null | undefined,
  execution: CommandExecutionEnvelope | null | undefined,
): CommandRenderType {
  if (!command || typeof command !== 'object') {
    return 'EXECUTE';
  }

  const executionType = execution?.type;
  if (typeof executionType === 'string' && executionType.trim() !== '') {
    return executionType.trim().toUpperCase() as CommandRenderType;
  }

  if (command.edit) {
    return 'EDIT';
  }
  if (command.replace) {
    return 'REPLACE';
  }

  return 'EXECUTE';
}
