import type {
  CommandDefinition,
  CommandEditSpecification,
  CommandExecutionEnvelope,
  CommandReplaceSpecification,
  CommandRenderType,
} from './commandTypes.js';

function pluralize(word: string, count: number): string {
  return `${word}${count === 1 ? '' : 's'}`;
}

function buildEditDetail(spec: CommandEditSpecification): string {
  const parts: string[] = [];
  if (typeof spec.path === 'string' && spec.path.trim() !== '') {
    parts.push(spec.path.trim());
  }
  if (typeof spec.encoding === 'string' && spec.encoding.trim() !== '') {
    parts.push(spec.encoding.trim());
  }

  const edits = Array.isArray(spec.edits) ? spec.edits.filter(Boolean) : [];
  const editCount = edits.length;
  parts.push(`${editCount} ${pluralize('edit', editCount)}`);
  return parts.length > 0 ? `(${parts.join(', ')})` : '';
}

function buildReplaceDetail(spec: CommandReplaceSpecification): string {
  const parts: string[] = [];
  if (typeof spec.pattern === 'string' && spec.pattern.trim() !== '') {
    parts.push(`pattern: ${JSON.stringify(spec.pattern.trim())}`);
  }
  if (typeof spec.replacement === 'string' && spec.replacement.trim() !== '') {
    parts.push(`replacement: ${JSON.stringify(spec.replacement.trim())}`);
  }
  const files = Array.isArray(spec.files) ? spec.files.filter((value): value is string => typeof value === 'string') : [];
  if (files.length > 0) {
    parts.push(`[${files.join(', ')}]`);
  }
  if (spec.dry_run || spec.dryRun) {
    parts.push('dry-run');
  }
  return parts.length > 0 ? `(${parts.join(', ')})` : '';
}

function resolveEditSpecification(
  execution: CommandExecutionEnvelope | null | undefined,
  command: CommandDefinition | null | undefined,
): CommandEditSpecification {
  if (execution?.spec && typeof execution.spec === 'object') {
    return execution.spec as CommandEditSpecification;
  }
  if (command?.edit && typeof command.edit === 'object') {
    return command.edit;
  }
  return {};
}

function resolveReplaceSpecification(
  execution: CommandExecutionEnvelope | null | undefined,
  command: CommandDefinition | null | undefined,
): CommandReplaceSpecification {
  if (execution?.spec && typeof execution.spec === 'object') {
    return execution.spec as CommandReplaceSpecification;
  }
  if (command?.replace && typeof command.replace === 'object') {
    return command.replace;
  }
  return {};
}

export function buildHeadingDetail(
  type: CommandRenderType,
  execution: CommandExecutionEnvelope | null | undefined,
  command: CommandDefinition | null | undefined,
): string {
  switch (type) {
    case 'EDIT': {
      const specification = resolveEditSpecification(execution, command);
      return buildEditDetail(specification);
    }
    case 'REPLACE': {
      const specification = resolveReplaceSpecification(execution, command);
      return buildReplaceDetail(specification);
    }
    case 'EXECUTE':
    default:
      return '';
  }
}
